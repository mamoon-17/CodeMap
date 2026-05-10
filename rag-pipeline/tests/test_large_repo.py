"""
Large-repo integration tests for ingest + retrieval.

Validates that a 500-file, ~200-line-per-file synthetic project can be
indexed and queried without exceeding the timeout budgets configured
in app.py / config.py. Skipped by default because it actually loads the
embedding model and writes to the local Chroma DB.

To run locally:

    pytest tests/test_large_repo.py -m "" --no-header -s

The two tests run in file order; the query test reuses the project
populated by the ingest test.
"""
import time

import pytest

from models.schemas import FileInput
from services.embedder import ingest_and_embed, retrieve_similar_chunks


pytestmark = pytest.mark.skip(reason="slow integration test")


@pytest.fixture(scope="module")
def large_project_id() -> str:
    """Project id shared between the ingest and query tests in this module."""
    return "test-large-repo"


def _generate_dummy_python(seed: int, line_count: int = 200) -> str:
    """Build ~line_count lines of plausible, parseable Python code.

    Each function is 4 lines (signature, docstring, body, blank line), so
    50 functions yields 200 lines.
    """
    funcs_needed = max(1, line_count // 4)
    lines: list[str] = []
    for i in range(funcs_needed):
        lines.append(f"def func_{seed}_{i}(x: int) -> int:")
        lines.append(f"    \"\"\"Process input value {i} for file {seed}.\"\"\"")
        lines.append(f"    return x + {i}")
        lines.append("")
    return "\n".join(lines[:line_count])


def test_large_ingest_does_not_timeout(large_project_id: str):
    """Ingesting 500 synthetic files (~100K lines) should finish in
    under 120 seconds and index a non-zero number of chunks."""
    files = [
        FileInput(
            file_path=f"src/module_{i:04d}.py",
            content=_generate_dummy_python(seed=i, line_count=200),
        )
        for i in range(500)
    ]

    t0 = time.perf_counter()
    result = ingest_and_embed(
        files=files,
        project_id=large_project_id,
        replace_project=True,
    )
    elapsed = time.perf_counter() - t0

    assert isinstance(result, dict)
    assert result.get("indexed", 0) > 0, f"expected indexed > 0, got {result}"
    assert elapsed < 120.0, (
        f"ingest exceeded 120s budget: took {elapsed:.2f}s (indexed={result.get('indexed')})"
    )


def test_query_on_large_project(large_project_id: str):
    """Querying the populated project should return results in under 5s."""
    t0 = time.perf_counter()
    results = retrieve_similar_chunks(
        query_text="process input value",
        top_k=5,
        project_id=large_project_id,
    )
    elapsed = time.perf_counter() - t0

    assert len(results) > 0, "expected at least one match for a query that hits docstrings"
    assert elapsed < 5.0, f"query exceeded 5s budget: took {elapsed:.3f}s"
