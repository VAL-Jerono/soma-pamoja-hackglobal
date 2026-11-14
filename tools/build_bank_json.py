"""Build app-facing projections from authoritative authoring CSV files."""
import csv
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "api"))
from app.scoring.normalize import normalize

INCLUDE_DRAFT = "--include-draft" in sys.argv


def project(row: dict, default_type: str) -> dict:
    normalized = normalize(row.get("text", ""))
    canonical = "|".join((row.get("id", ""), row.get("content_version", ""), row.get("text", ""), normalized))
    content_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "id": row["id"],
        "content_type": row.get("content_type", default_type),
        "item_skill": row.get("item_skill", ""),
        "level": row.get("level", "A"),
        "title": row["title"],
        "text": row["text"],
        "text_normalized": normalized,
        "word_count": len(normalized.split()),
        "sentence_count": int(row["sentence_count"]) if row.get("sentence_count") else None,
        "summary_en": row.get("summary_en", row.get("en", "")),
        "en": row.get("summary_en", row.get("en", "")),
        "image_id": row.get("image_id", row.get("picture", "")) or None,
        "picture": row.get("image_id", row.get("picture", "")) or None,
        "source_id": row.get("source_id", ""),
        "source_type": row.get("source_type", ""),
        "source": row.get("source_type", ""),
        "lang_tag": row.get("lang_tag", ""),
        "variety": row.get("variety", ""),
        "orthography_ref": row.get("orthography_ref", ""),
        "author_type": row.get("author_type", ""),
        "language_signoff_hash": row.get("language_signoff_hash", ""),
        "literacy_signoff_hash": row.get("literacy_signoff_hash", ""),
        "validator_status": row.get("status", ""),
        "content_version": row.get("content_version", ""),
        "normalization_version": row.get("normalization_version", "1.0"),
        "content_hash": content_hash,
        "questions": ([{
            "question_id": row.get("question_id", ""),
            "question_text": row.get("question_text", ""),
            "question_lang": row.get("question_lang", row.get("lang_tag", "")),
            "answer_key": row.get("answer_key", ""),
            "question_version": row.get("question_version", "1"),
            "question_status": row.get("question_status", "draft"),
        }] if row.get("question_id") and row.get("question_text") else []),
    }


def read_projection(csv_path: str, default_type: str, include_drafts: bool = INCLUDE_DRAFT) -> list:
    with open(csv_path, encoding="utf-8", newline="") as handle:
        return [
            project(row, default_type)
            for row in csv.DictReader(handle)
            if include_drafts or row.get("status") == "validated"
        ]


passages = read_projection("data/bank/bank.csv", "passage")
micro_items = read_projection("data/micro_reading/micro_items.csv", "micro_item", include_drafts=True)

with open("data/bank/bank.json", "w", encoding="utf-8") as handle:
    json.dump({"passages": passages}, handle, ensure_ascii=False, indent=1)
    handle.write("\n")

with open("data/micro_reading/micro_items.json", "w", encoding="utf-8") as handle:
    json.dump({"items": micro_items}, handle, ensure_ascii=False, indent=1)
    handle.write("\n")

print(f"bank.json: {len(passages)} passages (include_draft={INCLUDE_DRAFT})")
print(f"micro_items.json: {len(micro_items)} items (include_draft={INCLUDE_DRAFT})")
