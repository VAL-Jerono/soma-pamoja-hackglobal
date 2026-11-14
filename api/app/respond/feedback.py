import os, re, httpx

TEMPLATES = {"auto_ok": "Vizuri sana! Umesoma vizuri.", "auto_practice": "Jaribu tena polepole. Unaweza!",
             "defer": "Facilitator: please listen and confirm how the child read this."}

def respond(passage: dict, verdict: str, errors: dict) -> dict:
    """S6: template by default; Gemini only rephrases, and is rejected if off-contract (I1, I7)."""
    text, by = TEMPLATES[verdict], "template"
    key = os.environ.get("GEMINI_API_KEY")
    if key and verdict != "defer":
        try:
            m = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
            p = (f"A child read this approved Swahili sentence: '{passage['text']}'. Reading was "
                 f"{'good' if verdict == 'auto_ok' else 'in need of more practice'}. Write ONE short warm Swahili "
                 "sentence of encouragement. Add no new facts or lesson content.")
            r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent",
                params={"key": key}, json={"contents": [{"parts": [{"text": p}]}]}, timeout=20).json()
            g = r["candidates"][0]["content"]["parts"][0]["text"].strip()
            if len(g.split()) <= 25 and not re.search(r"\d", g): text, by = g, "gemini"
        except Exception: pass
    return {"feedback_text": text, "source_ref": passage["id"], "by": by}
