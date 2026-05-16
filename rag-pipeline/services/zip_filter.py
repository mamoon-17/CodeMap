"""ZIP extraction and file filtering.

Mirrors the Node.js filtering logic that was previously in
``project.service.ts`` so FastAPI can accept raw (unfiltered) ZIPs
from Supabase Storage and apply the same rules.
"""
from __future__ import annotations

import io
import logging
import posixpath
import zipfile
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Filtering constants (keep in sync with the old Node.js filters) ──────────

SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({
    ".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".go",
    ".rb", ".php", ".swift", ".kt", ".rs",
    ".html", ".css", ".json", ".xml", ".yaml", ".yml",
})

IGNORED_DIR_SEGMENTS: frozenset[str] = frozenset({
    "node_modules", "bower_components", "jspm_packages", ".pnpm", ".yarn",
    "dist", "build", "out", "coverage", ".nyc_output",
    ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache",
    ".venv", "venv", "env", "env", "site-packages",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".tox", ".nox", ".eggs",
    ".gradle", "target", "bin", "obj",
    ".git", ".svn", ".hg",
})

IGNORED_FILE_NAMES: frozenset[str] = frozenset({
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "pipfile.lock", "composer.lock", "cargo.lock",
})

MAX_FILES_PER_UPLOAD = 500
MAX_FILE_BYTES = 250_000            # 250 KB per individual file
MAX_TOTAL_BYTES = 50 * 1024 * 1024  # 50 MB aggregate


@dataclass
class FilteredFile:
    """A single source file extracted from a ZIP."""
    file_path: str
    content: str


@dataclass
class FilterResult:
    """Outcome of filtering a ZIP archive."""
    files: list[FilteredFile] = field(default_factory=list)
    error: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize_entry_path(entry_name: str) -> str:
    raw = entry_name.replace("\\", "/")
    normalized = posixpath.normpath(raw)
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def _is_unsafe_path(entry_name: str) -> bool:
    if not entry_name:
        return True
    if "\x00" in entry_name:
        return True
    norm = _normalize_entry_path(entry_name)
    if norm in (".", ".."):
        return True
    if norm.startswith("../") or "/../" in norm:
        return True
    if norm.startswith("/"):
        return True
    # Windows drive-letter absolute
    if len(norm) >= 3 and norm[1] == ":" and norm[2] == "/":
        return True
    return False


def _should_ignore(normalized_path: str) -> bool:
    parts = normalized_path.split("/")
    lowered = [p.lower() for p in parts if p]
    filename = lowered[-1] if lowered else ""
    return (
        any(p in IGNORED_DIR_SEGMENTS for p in lowered)
        or filename in IGNORED_FILE_NAMES
    )


def _is_probably_binary(data: bytes) -> bool:
    sample = data[: min(len(data), 4096)]
    if not sample:
        return False
    suspicious = 0
    for b in sample:
        if b == 0:
            return True
        is_allowed = b == 9 or b == 10 or b == 13 or (32 <= b <= 126)
        if not is_allowed:
            suspicious += 1
    return suspicious / len(sample) > 0.2


# ── Public API ───────────────────────────────────────────────────────────────

def filter_zip(zip_bytes: bytes) -> FilterResult:
    """Extract and filter source files from raw ZIP bytes.

    Returns a ``FilterResult`` with the list of accepted files or an
    error message if the archive is invalid / too large.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except (zipfile.BadZipFile, Exception) as exc:
        return FilterResult(error=f"Corrupt or unreadable ZIP archive: {exc}")

    files: list[FilteredFile] = []
    total_bytes = 0

    for info in zf.infolist():
        if info.is_dir():
            continue

        if _is_unsafe_path(info.filename):
            return FilterResult(error="Invalid entry path in ZIP file")

        norm = _normalize_entry_path(info.filename)
        if _should_ignore(norm):
            continue

        ext = posixpath.splitext(norm)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        data = zf.read(info.filename)
        if len(data) > MAX_FILE_BYTES:
            continue
        if _is_probably_binary(data):
            continue

        total_bytes += len(data)
        if total_bytes > MAX_TOTAL_BYTES:
            return FilterResult(
                error="Upload failed: up to 50 MB source files are supported."
            )

        if len(files) >= MAX_FILES_PER_UPLOAD:
            break

        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            continue

        files.append(FilteredFile(file_path=norm, content=content))

    return FilterResult(files=files)
