"""Validate the teacher-only RAG pack before it is mounted into the API."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "data/rag/source_register.csv"
CHUNKS = ROOT / "data/rag/chunks.jsonl"
QUESTIONS = ROOT / "data/rag/retrieval_questions.jsonl"


def jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main():
    with REGISTER.open(encoding="utf-8", newline="") as handle:
        sources = list(csv.DictReader(handle))
    chunks = jsonl(CHUNKS)
    questions = jsonl(QUESTIONS)
    source_ids = {row["source_id"] for row in sources}
    assert len(sources) == 6
    assert len(chunks) == 12
    assert len(questions) == 15
    assert all(row["source_id"] in source_ids for row in chunks)
    assert all(row["text"] and row["url"] and row["location"] for row in chunks)
    assert all(row["rights_decision"] in {"include", "include-citation-only"} for row in sources)
    print(f"rag pack: {len(sources)} sources, {len(chunks)} chunks, {len(questions)} questions")


if __name__ == "__main__":
    main()
