"""Small teacher-only BM25 retrieval service with extractive citations."""
import json
import math
import os
import re
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

try:
    from app.auth import require_facilitator
except ImportError:  # pragma: no cover - fail closed before hardened auth is present
    def require_facilitator():
        raise HTTPException(503, "facilitator authentication is not available")

router = APIRouter(prefix="/api/guide", tags=["guide"], dependencies=[Depends(require_facilitator)])
CHUNKS_PATH = Path(os.environ.get("RAG_CHUNKS_PATH", "/srv/data/rag/chunks.jsonl"))
TOKEN_RE = re.compile(r"[\w’']+", re.UNICODE)


def _tokens(text: str) -> list[str]:
    return [token.casefold() for token in TOKEN_RE.findall(text)]


def load_chunks() -> list[dict]:
    if not CHUNKS_PATH.exists():
        return []
    rows = []
    for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def _score(query: list[str], row: dict, documents: list[list[str]]) -> float:
    terms = Counter(documents[row["_index"]])
    avgdl = sum(len(doc) for doc in documents) / max(len(documents), 1)
    dl = len(documents[row["_index"]])
    n = len(documents)
    score = 0.0
    for term in query:
        tf = terms.get(term, 0)
        if not tf:
            continue
        df = sum(1 for doc in documents if term in doc)
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        k1, b = 1.2, 0.75
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / max(avgdl, 1))))
    return score


def search(query: str, limit: int = 3) -> list[dict]:
    chunks = load_chunks()
    documents = [_tokens(row.get("title", "") + " " + row.get("text", "")) for row in chunks]
    q = _tokens(query)
    ranked = []
    for index, row in enumerate(chunks):
        row = dict(row)
        row["_index"] = index
        ranked.append((round(_score(q, row, documents), 4), row))
    ranked.sort(key=lambda item: (-item[0], item[1].get("chunk_id", "")))
    results = []
    for score, row in ranked[:limit]:
        row.pop("_index", None)
        row["score"] = score
        row["citation"] = f"{row['title']}, {row['location']}"
        results.append(row)
    return results


@router.get("/search")
def guide_search(q: str = Query(..., min_length=2, max_length=300), limit: int = Query(default=3, ge=1, le=5)):
    results = search(q, limit)
    if not results or results[0]["score"] <= 0:
        return {
            "query": q,
            "answer": "The current teacher guide corpus does not establish an answer to this question.",
            "citation_status": "not_established",
            "results": results,
        }
    return {
        "query": q,
        "answer": results[0]["text"],
        "citation_status": results[0]["rights_decision"],
        "citation": results[0]["citation"],
        "source_url": results[0]["url"],
        "results": results,
    }
