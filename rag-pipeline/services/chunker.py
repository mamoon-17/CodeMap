from __future__ import annotations

import ast
from typing import Any


def detect_language(file_path: str) -> str:
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    return {
        "py": "python", "js": "javascript", "ts": "typescript",
        "java": "java", "cpp": "cpp", "cc": "cpp", "cxx": "cpp",
        "c": "c", "go": "go", "rs": "rust", "rb": "ruby", "php": "php",
    }.get(ext, "unknown")


def chunk_file(file_path, content, chunk_size=100, overlap=20):
    if not isinstance(chunk_size, int) or chunk_size <= 0:
        raise ValueError(f"chunk_size must be a positive integer, got {chunk_size!r}")
    if not isinstance(overlap, int) or overlap < 0:
        raise ValueError(f"overlap must be a non-negative integer, got {overlap!r}")
    if overlap >= chunk_size:
        raise ValueError(
            f"overlap ({overlap}) must be strictly less than chunk_size ({chunk_size})"
        )

    step = chunk_size - overlap
    lines = content.splitlines(keepends=True)

    def _is_semantic_boundary(line: str) -> bool:
        stripped = line.strip()
        return (
            stripped == ""
            or stripped.startswith("def ")
            or stripped.startswith("async def ")
            or stripped.startswith("class ")
        )

    chunks = []
    start = 0

    while start < len(lines):
        end = min(start + chunk_size, len(lines))
        chunk_text = "".join(lines[start:end])

        if chunk_text.strip():
            chunks.append({
                "text": chunk_text,
                "file_path": file_path,
                "start_line": start + 1,
                "end_line": end,
                "language": detect_language(file_path)
            })

        overlap_start = end - overlap
        next_start = overlap_start

        # Improve overlap quality: instead of always restarting exactly `overlap`
        # lines earlier, scan backward to the nearest blank line or function/class
        # definition so chunk transitions keep semantically related code together.
        for idx in range(min(overlap_start, len(lines) - 1), start - 1, -1):
            if _is_semantic_boundary(lines[idx]):
                next_start = idx
                break

        if next_start <= start:
            next_start = start + step

        start = next_start

    return chunks


def smart_chunk_file(
    file_path: str,
    content: str,
    max_chunk_size: int = 150,
) -> list[dict[str, Any]]:

    # Non-Python files have no AST to leverage, so reuse the existing chunker.
    if not file_path.endswith(".py"):
        return chunk_file(file_path, content)

    # Invalid Python (syntax errors, partial files, templated sources): degrade
    # gracefully to naive chunking instead of dropping the file from the index.
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return chunk_file(file_path, content)

    # Collect top-level function/class spans. Decorators are written above the
    # ``def``/``class`` keyword, so include them in the span when present so a
    # chunk reflects the source as a developer would read it.
    structural_spans: list[tuple[int, int]] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            start_line = node.lineno
            decorators = getattr(node, "decorator_list", None)
            if decorators:
                start_line = min(d.lineno for d in decorators)
            end_line = getattr(node, "end_lineno", start_line)
            structural_spans.append((start_line, end_line))

    # Flat scripts with only module-level statements gain nothing from
    # structural splitting; defer to the naive chunker for them.
    if not structural_spans:
        return chunk_file(file_path, content)

    structural_spans.sort(key=lambda span: span[0])

    lines = content.splitlines(keepends=True)
    total_lines = len(lines)
    chunks: list[dict[str, Any]] = []
    cursor = 1  # 1-indexed line cursor that walks down the file

    def _emit_gap(gap_start: int, gap_end_exclusive: int) -> None:
        # A "gap" is module-level text between two structural blocks (imports,
        # constants, top-level expressions). Emitting it preserves searchable
        # context that would otherwise be dropped between def/class chunks.
        if gap_start >= gap_end_exclusive:
            return
        gap_text = "".join(lines[gap_start - 1:gap_end_exclusive - 1])
        if gap_text.strip():
            chunks.append({
                "text": gap_text,
                "file_path": file_path,
                "start_line": gap_start,
                "end_line": gap_end_exclusive - 1,
            })

    for start_line, end_line in structural_spans:
        _emit_gap(cursor, start_line)

        block_text = "".join(lines[start_line - 1:end_line])
        block_line_count = end_line - start_line + 1

        if block_line_count > max_chunk_size:
            # The function/class is too large for a single chunk. Re-chunk
            # only this block with the line-window strategy and rebase the
            # sub-chunk line numbers so they reference the original file.
            for sub in chunk_file(file_path, block_text):
                chunks.append({
                    "text": sub["text"],
                    "file_path": file_path,
                    "start_line": sub["start_line"] + start_line - 1,
                    "end_line": sub["end_line"] + start_line - 1,
                })
        else:
            chunks.append({
                "text": block_text,
                "file_path": file_path,
                "start_line": start_line,
                "end_line": end_line,
            })

        cursor = end_line + 1

    _emit_gap(cursor, total_lines + 1)

    return chunks