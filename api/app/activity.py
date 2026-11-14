"""Activity projection delivery for the multimodal draft slice."""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.contracts import valid_learner_code

router = APIRouter(prefix="/api", tags=["activities"])
ACTIVITY_PATH = Path(os.environ.get("ACTIVITY_PATH", "/srv/data/activities/activities.json"))


def load_activities() -> list[dict]:
    try:
        payload = json.loads(ACTIVITY_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    return payload.get("activities", [])


def served(activity: dict, allow_draft: bool) -> bool:
    return allow_draft or activity.get("status") == "validated"


def public_activity(activity: dict) -> dict:
    """Return child-safe delivery fields. Answer keys stay facilitator-only."""
    return {
        key: activity.get(key)
        for key in (
            "activity_id", "micro_item_id", "learning_area", "topic", "concept", "band",
            "modality", "target_skill", "prompt_text", "prompt_audio_file", "picture",
            "options", "expected_response", "marking_method", "content_version", "source_id",
            "status", "validator_status", "content_hash", "parent_text", "parent_en",
        )
    }


@router.get("/activities")
def list_activities(
    learner: str = Query(...),
    modality: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
):
    if not valid_learner_code(learner):
        raise HTTPException(400, "Learner code must look like L-001")
    if modality and modality not in {"reading", "listening", "speaking", "writing"}:
        raise HTTPException(400, "bad modality")
    allow_draft = os.environ.get("ALLOW_DRAFT", "0") == "1"
    rows = [a for a in load_activities() if served(a, allow_draft) and (not modality or a.get("modality") == modality)]
    return {"learner": learner, "activities": [public_activity(a) for a in rows[:limit]], "draft": any(a.get("status") != "validated" for a in rows[:limit])}


@router.get("/activities/{activity_id}")
def get_activity(activity_id: str, learner: str = Query(...)):
    if not valid_learner_code(learner):
        raise HTTPException(400, "Learner code must look like L-001")
    allow_draft = os.environ.get("ALLOW_DRAFT", "0") == "1"
    activity = next((a for a in load_activities() if a.get("activity_id") == activity_id), None)
    if not activity or not served(activity, allow_draft):
        raise HTTPException(404, "activity not served")
    return {"learner": learner, "activity": public_activity(activity), "draft": activity.get("status") != "validated"}
