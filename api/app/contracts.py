"""Shared contracts for stages S1 to S8. Keep in sync with README section 6."""
import re
from typing import TypedDict

LEVELS = "ABC"
ASSESSMENT_VERSION = "assessment_v1"

class Passage(TypedDict):
    id: str; level: str; title: str; text: str; text_normalized: str
    en: str; picture: str; source: str; validator_status: str; content_version: int

class Sensed(TypedDict):
    transcript: str; confidence: float; engine: str; model: str; latency_ms: int

class Scored(TypedDict):
    alignment: list; errors: dict; wer: float; accuracy: float

_CODE = re.compile(r"^L-\d{3,6}$")

def valid_learner_code(code: str) -> bool:
    """I4: only pseudonymous codes such as L-001 are accepted."""
    return bool(_CODE.match(code or ""))
