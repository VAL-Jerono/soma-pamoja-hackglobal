"""Facilitator auth: PIN exchanged for a short-lived signed token.

Fail closed: if FACILITATOR_PIN is not set, login is refused and every protected
route returns 401. DEV_FACILITATOR_OPEN=1 opens protected routes for local work only.
No PIN, token or secret is ever sent to the browser bundle.
"""
import base64, hashlib, hmac, json, os, secrets, time
from fastapi import Header, HTTPException, Request

TOKEN_TTL = int(os.environ.get("FACILITATOR_TOKEN_TTL", "3600"))
_SECRET = (os.environ.get("SECRET_KEY") or secrets.token_hex(32)).encode()
_FAILS: dict[str, list[float]] = {}
MAX_FAILS, WINDOW = 5, 300


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(now: float | None = None) -> str:
    payload = _b64(json.dumps({"exp": int((now or time.time()) + TOKEN_TTL)}).encode())
    sig = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str, now: float | None = None) -> bool:
    try:
        payload, sig = token.split(".", 1)
        good = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return False
        return json.loads(_unb64(payload))["exp"] > (now or time.time())
    except Exception:
        return False


def _client(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def check_pin(pin: str, request: Request, now: float | None = None) -> str:
    """Returns a token or raises 401, 429 or 503."""
    expected = os.environ.get("FACILITATOR_PIN", "")
    if not expected:
        raise HTTPException(503, "facilitator_not_configured")
    who, t = _client(request), (now or time.time())
    recent = [x for x in _FAILS.get(who, []) if t - x < WINDOW]
    if len(recent) >= MAX_FAILS:
        raise HTTPException(429, "too_many_attempts")
    if not hmac.compare_digest(pin.encode(), expected.encode()):
        _FAILS[who] = recent + [t]
        raise HTTPException(401, "bad_pin")
    _FAILS.pop(who, None)
    return make_token(t)


def require_facilitator(authorization: str | None = Header(default=None)):
    if os.environ.get("DEV_FACILITATOR_OPEN") == "1":
        return
    if not authorization or not authorization.startswith("Bearer ") or not verify_token(authorization[7:]):
        raise HTTPException(401, "facilitator_auth_required")
