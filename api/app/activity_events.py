"""Activity event storage and modality progress helpers.

This module is intentionally additive. The existing v3 application must wire its
facilitator authentication dependency to the marking routes before enabling them.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.activity import load_activities
from app.contracts import valid_learner_code

try:
    from app.auth import require_facilitator
except ImportError:  # pragma: no cover - only for the pre-hardening development tree
    def require_facilitator():
        raise HTTPException(503, "facilitator authentication is not available")

router = APIRouter(prefix="/api/activity", tags=["activity-events"])


class ActivityResponse(BaseModel):
    learner: str
    activity_id: str
    response: str = Field(default="", max_length=4000)
    machine_result: str = Field(default="deferred", max_length=80)
    session_id: str | None = Field(default=None, max_length=100)


class ActivityMark(BaseModel):
    event_id: str
    teacher_result: str = Field(max_length=80)


VALID_RESULTS = {"auto_correct", "auto_practice", "deferred", "not_attempted"}
VALID_TEACHER_RESULTS = {"correct", "with_help", "not_yet", "not_sure"}


def _conn():
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


def ensure_table() -> None:
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS sp_activity_events(
          event_id UUID PRIMARY KEY,
          learner_code TEXT NOT NULL,
          activity_id TEXT NOT NULL,
          modality TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          response_text TEXT NOT NULL DEFAULT '',
          machine_result TEXT NOT NULL,
          teacher_result TEXT NULL,
          final_result TEXT NULL,
          marked_by TEXT NULL,
          session_id TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          marked_at TIMESTAMPTZ NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS sp_activity_events_learner_idx ON sp_activity_events(learner_code, created_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS sp_activity_events_queue_idx ON sp_activity_events(teacher_result, created_at DESC)")


def _activity(activity_id: str) -> dict:
    item = next((x for x in load_activities() if x.get("activity_id") == activity_id), None)
    if not item:
        raise HTTPException(404, "activity not found")
    if item.get("status") != "validated" and os.environ.get("ALLOW_DRAFT", "0") != "1":
        raise HTTPException(404, "activity not served")
    return item


def _public(row) -> dict:
    return {
        "event_id": str(row[0]), "learner": row[1], "activity_id": row[2],
        "modality": row[3], "content_hash": row[4], "machine_result": row[5],
        "teacher_result": row[6], "final_result": row[7], "marked_by": row[8],
        "session_id": row[9], "created_at": row[10].isoformat() if row[10] else None,
        "marked_at": row[11].isoformat() if row[11] else None,
    }


@router.post("/respond")
def respond(payload: ActivityResponse):
    if not valid_learner_code(payload.learner):
        raise HTTPException(400, "Learner code must look like L-001")
    if payload.machine_result not in VALID_RESULTS:
        raise HTTPException(400, "bad machine_result")
    item = _activity(payload.activity_id)
    ensure_table()
    event_id = str(uuid.uuid4())
    with _conn() as c:
        c.execute("""INSERT INTO sp_activity_events(
          event_id, learner_code, activity_id, modality, content_hash,
          response_text, machine_result, session_id)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""", (
            event_id, payload.learner, payload.activity_id, item["modality"],
            item["content_hash"], payload.response, payload.machine_result,
            payload.session_id))
    return {"event_id": event_id, "activity_id": payload.activity_id,
            "machine_result": payload.machine_result, "teacher_result": None,
            "final_result": None}


def mark_event(payload: ActivityMark, marked_by: str = "facilitator_token") -> dict:
    """Storage helper. Caller must enforce v3 facilitator authentication."""
    if payload.teacher_result not in VALID_TEACHER_RESULTS:
        raise HTTPException(400, "bad teacher_result")
    try:
        uuid.UUID(payload.event_id)
    except ValueError as exc:
        raise HTTPException(400, "bad event_id") from exc
    ensure_table()
    with _conn() as c:
        row = c.execute("""UPDATE sp_activity_events
          SET teacher_result=%s, final_result=%s, marked_by=%s, marked_at=now()
          WHERE event_id=%s
          RETURNING event_id, learner_code, activity_id, modality, content_hash,
                    machine_result, teacher_result, final_result, marked_by,
                    session_id, created_at, marked_at""", (
            payload.teacher_result, payload.teacher_result, marked_by,
            payload.event_id)).fetchone()
    if not row:
        raise HTTPException(404, "activity event not found")
    return _public(row)


def queue_events() -> list[dict]:
    ensure_table()
    with _conn() as c:
        rows = c.execute("""SELECT event_id, learner_code, activity_id, modality, content_hash,
          machine_result, teacher_result, final_result, marked_by, session_id, created_at, marked_at
          FROM sp_activity_events WHERE teacher_result IS NULL
          ORDER BY created_at ASC LIMIT 100""").fetchall()
    return [_public(row) for row in rows]


def progress(learner: str) -> dict:
    if not valid_learner_code(learner):
        raise HTTPException(400, "Learner code must look like L-001")
    ensure_table()
    with _conn() as c:
        rows = c.execute("""SELECT modality, count(*)::int,
          count(*) FILTER (WHERE final_result IS NOT NULL)::int
          FROM sp_activity_events WHERE learner_code=%s GROUP BY modality ORDER BY modality""", (learner,)).fetchall()
    return {"learner": learner, "by_modality": [
        {"modality": row[0], "events": row[1], "marked": row[2]} for row in rows
    ]}


@router.get("/progress")
def get_progress(learner: str):
    return progress(learner)


@router.get("/queue", dependencies=[Depends(require_facilitator)])
def get_queue():
    return {"events": queue_events()}


@router.post("/mark", dependencies=[Depends(require_facilitator)])
def mark(payload: ActivityMark):
    return mark_event(payload)
