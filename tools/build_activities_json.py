"""Build draft activity projections from the authoritative micro-item CSV."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACTIVITY_CSV = ROOT / "data/activities/activities.csv"
MICRO_CSV = ROOT / "data/micro_reading/micro_items.csv"
OUT = ROOT / "data/activities/activities.json"


def read_rows(path: Path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def truth(value: str) -> bool:
    return value.strip().lower() == "true"


def project(activity: dict, parent: dict) -> dict:
    parent_status = parent.get("status", "draft")
    parent_rights = truth(parent.get("rights_pass", "false")) and truth(parent.get("license_verified", "false"))
    canonical = "|".join([
        activity["activity_id"], activity["micro_item_id"], activity["modality"],
        activity["prompt_text"], activity["content_version"], parent.get("id", ""),
    ])
    status = "validated" if parent_status == "validated" and parent_rights and all(
        truth(activity.get(field, "false")) for field in ("language_pass", "instructional_pass", "rights_pass", "license_verified")
    ) else "draft"
    return {
        "activity_id": activity["activity_id"],
        "micro_item_id": activity["micro_item_id"],
        "learning_area": activity["learning_area"],
        "topic": activity["topic"],
        "concept": activity["concept"],
        "band": activity["band"],
        "modality": activity["modality"],
        "target_skill": activity["target_skill"],
        "prompt_text": activity["prompt_text"],
        "prompt_audio_file": activity.get("prompt_audio_file", ""),
        "picture": activity.get("picture", "") or parent.get("picture", ""),
        "options": [x for x in activity.get("options", "").split("|") if x],
        "answer_key": activity.get("answer_key", ""),
        "expected_response": activity.get("expected_response", ""),
        "marking_method": activity["marking_method"],
        "content_version": activity["content_version"],
        "source_id": parent.get("source_id", activity.get("source_id", "")),
        "author_type": activity.get("author_type", "human"),
        "status": status,
        "validator_status": status,
        "language_pass": truth(parent.get("language_pass", "false")) and truth(activity.get("language_pass", "false")),
        "instructional_pass": truth(parent.get("instructional_pass", "false")) and truth(activity.get("instructional_pass", "false")),
        "rights_pass": parent_rights and truth(activity.get("rights_pass", "false")),
        "license_verified": parent_rights and truth(activity.get("license_verified", "false")),
        "content_hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "parent_text": parent.get("text", ""),
        "parent_en": parent.get("en", ""),
        "parent_picture": parent.get("picture", ""),
    }


def main():
    parents = {row["id"]: row for row in read_rows(MICRO_CSV)}
    activities = []
    errors = []
    for row in read_rows(ACTIVITY_CSV):
        parent = parents.get(row["micro_item_id"])
        if not parent:
            errors.append(f"{row['activity_id']}: missing parent {row['micro_item_id']}")
            continue
        activities.append(project(row, parent))
    if errors:
        raise SystemExit("activity validation failed: " + "; ".join(errors))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"activities": activities}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"activities.json: {len(activities)} items")


if __name__ == "__main__":
    main()
