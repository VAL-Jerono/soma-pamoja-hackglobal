import os, time, importlib.util, uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, Form, File, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.contracts import valid_learner_code, ASSESSMENT_VERSION
from app.select.pick import load_bank, pick, public_item
from app.speech.stt import sense
from app.scoring.normalize import normalize
from app.scoring.align import align
from app.decide.gate import decide
from app.respond.feedback import respond
from app.record import db
from app.auth import check_pin, require_facilitator
import json
from app.activity import router as activity_router


# Import Activity router and include it
from app.activity import router as activity_router
from app.activity_events import router as activity_events_router
from app.rag import router as rag_router


HERE = Path(__file__).parent
BANK_PATH = os.environ.get("BANK_PATH", "/srv/data/bank/bank.json")
ALLOW_DRAFT = os.environ.get("ALLOW_DRAFT", "0") == "1"
CONF_MIN = float(os.environ.get("CONF_MIN", "0.6")); CONF_HIGH = float(os.environ.get("CONF_HIGH", "0.8"))
app = FastAPI(title="SP Soma Pamoja")
# Exact origins only (comma separated). Empty means no cross-origin browser access.
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"], max_age=600)
MAX_AUDIO_BYTES = 5 * 1024 * 1024
EVAL_SUMMARY_PATH = os.environ.get("EVAL_SUMMARY_PATH", "/srv/data/eval/results/latest.json")

@app.on_event("startup")
def startup(): db.init()

def bank(): return load_bank(BANK_PATH, ALLOW_DRAFT)

def stage(log, name, fn, summarize):
    t = time.time(); out = fn()
    log.append({"stage": name, "ok": True, "ms": int((time.time() - t) * 1000), "out": summarize(out)})
    return out

@app.get("/health")
def health(): return {"ok": True}

@app.get("/health/deps", dependencies=[Depends(require_facilitator)])
def deps():
    try: db.conn().close(); dbok = True
    except Exception: dbok = False
    counts = {}
    try:
        for p in load_bank(BANK_PATH, True): counts[p["validator_status"]] = counts.get(p["validator_status"], 0) + 1
    except Exception: counts = {"error": "bank.json missing"}
    return {"database": dbok, "bank_by_status": counts, "allow_draft": ALLOW_DRAFT,
            "groq_key": bool(os.environ.get("GROQ_API_KEY")), "gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
            "local_whisper": importlib.util.find_spec("faster_whisper") is not None}

@app.post("/api/facilitator/login")
def facilitator_login(request: Request, pin: str = Form()):
    return {"token": check_pin(pin, request), "expires_in": int(os.environ.get("FACILITATOR_TOKEN_TTL", "3600"))}

@app.get("/api/facilitator/answer-key", dependencies=[Depends(require_facilitator)])
def answer_key(question_id: str):
    for item in bank():
        for q in item.get("questions", []):
            if q.get("question_id") == question_id:
                return {"question_id": question_id, "answer_key": q["answer_key"]}
    raise HTTPException(404, "question not served")

@app.get("/api/eval/summary", dependencies=[Depends(require_facilitator)])
def eval_summary():
    try:
        with open(EVAL_SUMMARY_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        raise HTTPException(404, "no_evaluation_run")
    data.pop("rows", None)  # row detail stays out of the public client
    data["indicative"] = True
    return data

@app.get("/api/next")
def nxt(learner: str):
    if not valid_learner_code(learner): raise HTTPException(400, "Learner code must look like L-001")
    lv = {p["id"]: p["level"] for p in load_bank(BANK_PATH, True)}
    hist = [(lv.get(r[0], "A"), 1.0 if r[3] == "correct" else 0.4 if r[3] == "incorrect" else r[1], r[0])
            for r in db.history(learner) if r[2] != "defer" or r[3]]
    p, lvl = pick(bank(), hist)
    if not p: raise HTTPException(404, "empty_bank: no validated passages (set ALLOW_DRAFT=1 for development)")
    return {"passage": public_item(p), "level": lvl, "draft": p["validator_status"] != "validated"}

@app.post("/api/attempt")
async def attempt(learner: str = Form(), passage: str = Form(), typed: str = Form(""),
                  audio: UploadFile | None = File(None), authorization: str | None = Header(default=None)):
    if not valid_learner_code(learner): raise HTTPException(400, "Learner code must look like L-001")
    p = next((x for x in bank() if x["id"] == passage), None)
    if not p: raise HTTPException(404, "passage not served")
    log = []
    if audio is None:
        require_facilitator(authorization)  # typed demo is a facilitator-only rule test
        typed = typed[:500]
    if audio is not None:
        raw = await audio.read(MAX_AUDIO_BYTES + 1)
        if len(raw) > MAX_AUDIO_BYTES: raise HTTPException(413, "audio too large")
        s = stage(log, "S3", lambda: sense(raw, audio.filename), lambda o: f"{o['engine']} conf={o['confidence']}")
        session_type = "speech"
        del raw
    else:
        s = {"transcript": typed, "confidence": 1.0, "engine": "typed-demo", "model": "", "latency_ms": 0}
        session_type = "typed_demo"
        log.append({"stage": "S3", "ok": True, "ms": 0, "out": "typed-demo"})
    sc = stage(log, "S4", lambda: align(p["text_normalized"], normalize(s["transcript"])),
               lambda o: f"errors={o['errors']} wer={o['wer']}")
    verdict, reason = stage(log, "S5", lambda: decide(s["confidence"], sc["accuracy"], s["transcript"], CONF_MIN, CONF_HIGH,
                                                        sc["errors"], p.get("content_type", "passage")),
                            lambda o: f"{o[0]} {o[1]}")
    fb = stage(log, "S6", lambda: respond(p, verdict, sc["errors"]), lambda o: o["by"])
    tid = db.insert({"learner": learner, "passage_id": p["id"], "content_version": p["content_version"],
        "assessment_version": ASSESSMENT_VERSION, "transcript": s["transcript"], "confidence": s["confidence"],
        "engine": s["engine"], "model": s["model"], "alignment": sc["alignment"], "accuracy": sc["accuracy"],
        "verdict": verdict, "reason": reason, "feedback": fb["feedback_text"], "stage_log": log,
        "session_type": session_type})
    return {"id": tid, "trace_id": tid, "heard": s["transcript"], "accuracy": sc["accuracy"], "confidence": s["confidence"],
            "alignment": sc["alignment"], "errors": sc["errors"],
            "deferred": verdict == "defer", "verdict": verdict, "reason": reason, "feedback": fb["feedback_text"],
            "source": p["source"], "validator": p["validator_status"], "engine": s["engine"],
            "session_type": session_type}

@app.post("/api/confirm", dependencies=[Depends(require_facilitator)])
def confirm(id: str = Form(), verdict: str = Form()):
    if verdict not in ("correct", "acceptable_minor_slip", "incorrect", "uncertain"): raise HTTPException(400, "bad verdict")
    db.confirm(id, verdict); return {"ok": True}

@app.post("/api/comprehension", dependencies=[Depends(require_facilitator)])
def comprehension(learner: str = Form(), question_id: str = Form(), verdict: str = Form(),
                  mode: str = Form("read_aloud"), attempt_id: str = Form(""), passage: str = Form("")):
    if not valid_learner_code(learner): raise HTTPException(400, "Learner code must look like L-001")
    if verdict not in ("understood", "with_help", "not_yet", "not_sure"):
        raise HTTPException(400, "bad comprehension verdict")
    if mode not in ("read_aloud", "facilitator_read", "listen"):
        raise HTTPException(400, "bad comprehension mode")
    if attempt_id:
        try:
            uuid.UUID(attempt_id)
        except ValueError:
            raise HTTPException(400, "attempt_id must be the UUID returned by /api/attempt, or be omitted")
    question = None
    item = None
    for candidate in bank():
        for q in candidate.get("questions", []):
            if q.get("question_id") == question_id:
                question, item = q, candidate
                break
        if question:
            break
    if not question: raise HTTPException(404, "question not served")
    if passage and passage != item["id"]:
        raise HTTPException(400, "question does not belong to passage")
    if attempt_id and not db.attempt_matches(attempt_id, learner, item["id"]):
        raise HTTPException(400, "attempt_id does not belong to this learner and passage")
    event_id = db.record_comprehension({"learner": learner, "question_id": question_id,
        "passage_id": item["id"],
        "question_text": question["question_text"], "question_lang": question["question_lang"],
        "answer_key": question["answer_key"], "mode": mode, "verdict": verdict,
        "attempt_id": attempt_id, "content_hash": item["content_hash"],
        "question_version": question["question_version"]})
    return {"event_id": event_id, "question_id": question_id, "verdict": verdict, "mode": mode}

@app.get("/api/dashboard", dependencies=[Depends(require_facilitator)])
def dash(): return db.dashboard()

@app.get("/")
def index(): return FileResponse(HERE / "static" / "index.html")
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")

app.include_router(activity_router)
app.include_router(activity_events_router)
app.include_router(rag_router)
