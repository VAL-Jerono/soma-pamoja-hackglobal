def decide(confidence: float, accuracy: float, transcript: str,
           conf_min: float = 0.6, conf_high: float = 0.8,
           errors: dict | None = None, content_type: str = "passage"):
    """S5 gate. Micro-items auto-confirm only on an exact alignment match."""
    if not transcript.strip():
        return "defer", "R1"
    if confidence < conf_min:
        return "defer", "R2"
    errors = errors or {}
    has_error = any(errors.get(kind, 0) > 0 for kind in ("omit", "sub", "ins"))
    if content_type == "micro_item":
        if not has_error and accuracy == 1.0:
            return "auto_ok", "R3"
        return "defer", "R6"
    if accuracy >= 0.8:
        return "auto_ok", "R3"
    if confidence >= conf_high:
        return "auto_practice", "R4"
    return "defer", "R5"
