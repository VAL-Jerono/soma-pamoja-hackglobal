import re, unicodedata

def normalize(s: str) -> str:
    """Single normalization rule for the whole project (README 5.1)."""
    s = unicodedata.normalize("NFC", s or "").lower()
    s = re.sub(r"[^a-z' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def has_non_latin_letters(s: str) -> bool:
    """I10: catches look-alike letters (for example a Cyrillic 'a')."""
    return any(c.isalpha() and not ("a" <= c.lower() <= "z") for c in s)
