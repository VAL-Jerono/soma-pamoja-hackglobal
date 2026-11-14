import json
from pathlib import Path
from app.contracts import LEVELS


def _read_items(path: Path, key: str) -> list:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return json.load(handle).get(key, [])


def load_bank(path: str, allow_draft: bool, micro_path: str | None = None) -> list:
    """S1: load generated passages and micro-items, enforcing I9."""
    bank_path = Path(path)
    items = _read_items(bank_path, "passages")
    if micro_path is None:
        micro_path = str(bank_path.parent.parent / "micro_reading" / "micro_items.json")
    items.extend(_read_items(Path(micro_path), "items"))
    return [item for item in items if allow_draft or item["validator_status"] == "validated"]


def public_item(item: dict) -> dict:
    out = dict(item)
    out["questions"] = [{k: v for k, v in q.items() if k != "answer_key"} for q in item.get("questions", [])]
    return out


def pick(bank: list, history: list):
    """history: [(level, effective_accuracy, passage_id)] newest first. Returns (item, level)."""
    if not bank:
        return None, None
    lvl = LEVELS[0]
    if history:
        recent = history[:3]
        avg = sum(h[1] for h in recent) / len(recent)
        lvl = max((h[0] for h in recent), key=LEVELS.index)
        if avg >= 0.8 and LEVELS.index(lvl) < len(LEVELS) - 1:
            lvl = LEVELS[LEVELS.index(lvl) + 1]
    seen = {h[2] for h in history}
    pool = [p for p in bank if LEVELS.index(p["level"]) <= LEVELS.index(lvl)] or bank
    pool.sort(key=lambda p: (p["id"] in seen, -LEVELS.index(p["level"])))
    return pool[0], lvl
