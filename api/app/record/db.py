import os, json, uuid, psycopg


def conn():
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


def init():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS sp_attempts(
          trace_id UUID PRIMARY KEY, learner_code TEXT, passage_id TEXT, content_version INT, assessment_version TEXT,
          stt_transcript TEXT, stt_confidence REAL, stt_engine TEXT, stt_model TEXT,
          alignment JSONB, accuracy REAL, machine_verdict TEXT, gate_reason TEXT, feedback_text TEXT,
          human_verdict TEXT, confirmed_at TIMESTAMPTZ, stage_log JSONB,
          session_type TEXT NOT NULL DEFAULT 'speech', created_at TIMESTAMPTZ DEFAULT now())""")
        c.execute("ALTER TABLE sp_attempts ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'speech'")
        c.execute("UPDATE sp_attempts SET session_type='typed_demo' WHERE stt_engine='typed-demo' AND session_type='speech'")
        c.execute("""CREATE TABLE IF NOT EXISTS sp_comprehension_events(
          event_id UUID PRIMARY KEY, learner_code TEXT NOT NULL, passage_id TEXT NOT NULL, question_id TEXT NOT NULL,
          question_text TEXT NOT NULL, question_lang TEXT NOT NULL, answer_key TEXT NOT NULL,
          mode TEXT NOT NULL, verdict TEXT NOT NULL, attempt_id UUID NULL, content_hash TEXT NOT NULL,
          question_version TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())""")
        c.execute("ALTER TABLE sp_comprehension_events ADD COLUMN IF NOT EXISTS passage_id TEXT")


def insert(a: dict) -> str:
    tid = str(uuid.uuid4())
    with conn() as c:
        c.execute("""INSERT INTO sp_attempts(trace_id,learner_code,passage_id,content_version,assessment_version,
          stt_transcript,stt_confidence,stt_engine,stt_model,alignment,accuracy,machine_verdict,gate_reason,
          feedback_text,stage_log,session_type) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
          (tid, a["learner"], a["passage_id"], a["content_version"], a["assessment_version"], a["transcript"],
           a["confidence"], a["engine"], a["model"], json.dumps(a["alignment"]), a["accuracy"], a["verdict"],
           a["reason"], a["feedback"], json.dumps(a["stage_log"]), a.get("session_type", "speech")))
    return tid


def confirm(trace_id: str, verdict: str):
    """I8: writes only human columns, never machine columns."""
    with conn() as c:
        c.execute("UPDATE sp_attempts SET human_verdict=%s, confirmed_at=now() WHERE trace_id=%s", (verdict, trace_id))


def record_comprehension(event: dict) -> str:
    event_id = str(uuid.uuid4())
    with conn() as c:
        c.execute("""INSERT INTO sp_comprehension_events(event_id,learner_code,passage_id,question_id,question_text,
          question_lang,answer_key,mode,verdict,attempt_id,content_hash,question_version)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
          (event_id, event["learner"], event["passage_id"], event["question_id"], event["question_text"], event["question_lang"],
           event["answer_key"], event["mode"], event["verdict"], event.get("attempt_id") or None,
           event["content_hash"], event["question_version"]))
    return event_id


def attempt_matches(trace_id: str, learner: str, passage_id: str) -> bool:
    with conn() as c:
        row = c.execute("""SELECT 1 FROM sp_attempts
                           WHERE trace_id=%s AND learner_code=%s AND passage_id=%s""",
                        (trace_id, learner, passage_id)).fetchone()
    return row is not None


def history(learner: str):
    with conn() as c:
        return c.execute("""SELECT passage_id, accuracy, machine_verdict, human_verdict FROM sp_attempts
                            WHERE learner_code=%s ORDER BY created_at DESC LIMIT 20""", (learner,)).fetchall()


def dashboard():
    with conn() as c:
        t = c.execute("""SELECT count(*), count(DISTINCT learner_code), coalesce(avg(accuracy),0)::float,
            coalesce(avg((machine_verdict='defer')::int),0)::float, coalesce(avg((human_verdict IS NOT NULL)::int),0)::float
            FROM sp_attempts WHERE session_type='speech'""").fetchone()
        typed = c.execute("SELECT count(*) FROM sp_attempts WHERE session_type='typed_demo'").fetchone()[0]
        per = c.execute("""SELECT learner_code, count(*), round(avg(accuracy)::numeric,2)::float FROM sp_attempts
                           WHERE session_type='speech' GROUP BY 1 ORDER BY 2 DESC LIMIT 20""").fetchall()
    return {"attempts": t[0], "learners": t[1], "avg_accuracy": round(t[2], 2), "deferral_rate": round(t[3], 2),
            "confirmed_rate": round(t[4], 2), "typed_demo_attempts": typed, "citation_rate": 1.0,
            "per_learner": per, "demo_data": True}
