import os, sys, pathlib
os.environ["FACILITATOR_PIN"] = "123456"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["BANK_PATH"] = str(pathlib.Path(__file__).resolve().parent.parent / "data" / "bank" / "bank.json")
os.environ["ALLOW_DRAFT"] = "1"
os.environ["CORS_ORIGINS"] = "https://soma-pamoja.vercel.app"
from fastapi.testclient import TestClient
from app import auth
from app.main import app

c = TestClient(app)

def _login(pin="123456"): return c.post("/api/facilitator/login", data={"pin": pin})

def test_health_is_minimal(): assert c.get("/health").json() == {"ok": True}

def test_protected_routes_reject_anonymous():
    assert c.get("/health/deps").status_code == 401
    assert c.get("/api/dashboard").status_code == 401
    assert c.post("/api/confirm", data={"id": "x", "verdict": "correct"}).status_code == 401
    assert c.post("/api/comprehension", data={"learner": "L-001", "question_id": "q", "verdict": "understood"}).status_code == 401
    assert c.get("/api/facilitator/answer-key", params={"question_id": "SW-M-001-Q1"}).status_code == 401

def test_typed_demo_requires_facilitator():
    r = c.post("/api/attempt", data={"learner": "L-001", "passage": "SW-M-001", "typed": "mama anapika"})
    assert r.status_code == 401

def test_bad_pin_then_good_pin():
    auth._FAILS.clear()
    assert _login("000000").status_code == 401
    r = _login(); assert r.status_code == 200 and r.json()["token"]

def test_answer_key_only_with_token_and_not_in_public_item():
    auth._FAILS.clear()
    tok = _login().json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = c.get("/api/facilitator/answer-key", params={"question_id": "SW-M-001-Q1"}, headers=h)
    assert r.status_code == 200 and r.json()["answer_key"]
    assert c.get("/api/facilitator/answer-key", params={"question_id": "nope"}, headers=h).status_code == 404

def test_lockout_after_five_bad_pins():
    auth._FAILS.clear()
    for _ in range(5): assert _login("999999").status_code == 401
    assert _login().status_code == 429
    auth._FAILS.clear()

def test_token_expiry_and_tamper():
    t = auth.make_token(now=1000)
    assert auth.verify_token(t, now=1000 + 10)
    assert not auth.verify_token(t, now=1000 + auth.TOKEN_TTL + 1)
    assert not auth.verify_token(t[:-2] + "xx")
    assert not auth.verify_token("garbage")

def test_cors_exact_origin_only():
    ok = c.options("/api/next", headers={"Origin": "https://soma-pamoja.vercel.app", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://soma-pamoja.vercel.app"
    bad = c.options("/api/next", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers

def test_eval_summary_404_without_run(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "EVAL_SUMMARY_PATH", "/nonexistent.json")
    tok = _login().json()["token"] if auth._FAILS.clear() is None else ""
    assert c.get("/api/eval/summary", headers={"Authorization": f"Bearer {tok}"}).status_code == 404
