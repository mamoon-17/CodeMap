"""
Retrieval quality tests for retrieve_similar_chunks().

These tests assume a project with id "test-project" has already been
indexed in the local Chroma DB. They are skipped by default so CI does
not fail on environments without that fixture data. To run locally:

    pytest tests/test_retrieval_quality.py -k retrieval -m "" --no-header

(or remove/override the module-level skip mark in your runner).

Note on score semantics: retrieve_similar_chunks() filters by raw
similarity (>= MIN_RETURN_SCORE) and then normalizes survivors so the
best match is exactly 1.0 and others are relative. These assertions are
written for that post-normalization view.
"""
import math

import pytest

from services.embedder import retrieve_similar_chunks


pytestmark = pytest.mark.skip(reason="requires indexed test project")


@pytest.fixture
def project_id() -> str:
    """Project id of a pre-indexed corpus used for retrieval-quality checks."""
    return "test-project"


def _is_normalized_top(score: float) -> bool:
    """Top-of-batch score is normalized to 1.0; allow tiny float drift."""
    return math.isclose(score, 1.0, rel_tol=0, abs_tol=1e-9)


def test_exact_function_query(project_id: str):
    """A query naming a known function should pass the MIN_RETURN_SCORE
    filter and produce a properly normalized, descending result list."""
    results = retrieve_similar_chunks(
        query_text="retrieve_similar_chunks function definition",
        top_k=5,
        project_id=project_id,
    )

    assert len(results) > 0, "expected at least one match for an exact function query"

    top = results[0]
    for key in ("id", "score", "metadata", "text"):
        assert key in top, f"result missing '{key}'"

    assert _is_normalized_top(top["score"]), (
        f"top score should be normalized to 1.0, got {top['score']:.6f}"
    )

    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True), (
        f"results not sorted descending by score: {scores}"
    )

    assert all(0.0 <= r["score"] <= 1.0 for r in results), (
        f"score outside [0, 1] range: {scores}"
    )


def test_natural_language_query(project_id: str):
    """A natural-language question should still surface at least one chunk
    that survives the raw-score filter."""
    results = retrieve_similar_chunks(
        query_text="where is authentication handled",
        top_k=5,
        project_id=project_id,
    )

    assert len(results) >= 1, "expected at least one match for a natural-language query"
    assert _is_normalized_top(results[0]["score"]), (
        f"top score should be normalized to 1.0, got {results[0]['score']:.6f}"
    )


def test_irrelevant_query(project_id: str):
    """A clearly off-topic query should be wiped out by the MIN_RETURN_SCORE
    filter, since every raw similarity is expected to be below 0.1."""
    results = retrieve_similar_chunks(
        query_text="recipe for chocolate cake",
        top_k=5,
        project_id=project_id,
    )

    assert results == [], (
        f"expected MIN_RETURN_SCORE filter to drop all matches for an "
        f"irrelevant query, got {len(results)}: "
        f"{[round(r['score'], 3) for r in results]}"
    )
