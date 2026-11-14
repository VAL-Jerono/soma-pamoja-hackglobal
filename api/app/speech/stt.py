import os, io, time, httpx

def sense(audio: bytes, filename: str = "a.webm") -> dict:
    """S3: Groq, then local faster-whisper, then empty. Audio is held in memory only (I3)."""
    t = time.time(); key = os.environ.get("GROQ_API_KEY")
    if key:
        try:
            r = httpx.post("https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data={"model": "whisper-large-v3", "language": "sw", "response_format": "verbose_json"},
                files={"file": (filename, audio)}, timeout=30).json()
            segs = r.get("segments", [])
            lp = sum(s["avg_logprob"] for s in segs) / len(segs) if segs else -2
            return {"transcript": r.get("text", ""), "confidence": round(min(1, max(0, 1 + lp)), 2),
                    "engine": "groq-whisper", "model": "whisper-large-v3", "latency_ms": int((time.time()-t)*1000)}
        except Exception: pass
    try:
        from faster_whisper import WhisperModel
        m = getattr(sense, "_m", None) or WhisperModel("small", compute_type="int8"); sense._m = m
        segs = list(m.transcribe(io.BytesIO(audio), language="sw")[0])
        lp = sum(s.avg_logprob for s in segs) / len(segs) if segs else -2
        return {"transcript": " ".join(s.text for s in segs), "confidence": round(min(1, max(0, 1 + lp)), 2),
                "engine": "faster-whisper-local", "model": "small-int8", "latency_ms": int((time.time()-t)*1000)}
    except Exception:
        return {"transcript": "", "confidence": 0.0, "engine": "none", "model": "", "latency_ms": int((time.time()-t)*1000)}
