"""Validate authoring content without promoting drafts to production."""
import csv
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "api"))
from app.scoring.normalize import normalize, has_non_latin_letters

BANDS = {"A": (20, 45), "B": (45, 90), "C": (90, 150)}
REVIEWS = ("language_review", "cultural_review", "child_safety_review")
RELEASE_FIELDS = ("structural_pass", "instructional_pass", "language_pass", "rights_pass")


def truth(value):
    return str(value).lower() in ("true", "1", "yes", "pass")


def check_row(r: dict, mode: str = "structural"):
    errs, warns = [], []
    text = r.get("text", "")
    normalized = normalize(text)
    word_count = len(normalized.split())

    if not text.strip():
        errs.append("text is empty")
    if has_non_latin_letters(text):
        errs.append("non-Latin letters in text (I10)")

    content_type = r.get("content_type", "passage")
    if content_type == "passage":
        level = r.get("level", "")
        if level not in BANDS:
            errs.append("level must be A, B or C")
        elif not BANDS[level][0] <= word_count <= BANDS[level][1]:
            message = f"{word_count} words is outside band {level} {BANDS[level]}"
            if r.get("status") == "validated" or mode == "release":
                errs.append(message)
            else:
                warns.append(message)

    status = r.get("status", "")
    if status not in ("draft", "review", "validated", "under_review", "retired"):
        errs.append("bad status")

    stored_count = r.get("word_count")
    if stored_count and str(stored_count) != str(word_count):
        errs.append(f"word_count mismatch: stored {stored_count}, computed {word_count}")

    if status == "validated":
        for field in REVIEWS:
            if r.get(field) != "pass":
                errs.append(f"{field} must be pass")
        if not truth(r.get("license_verified")):
            errs.append("licence not verified")
        for field in ("validator_code", "literacy_reviewer_code", "validation_date",
                      "language_signoff_hash", "literacy_signoff_hash", "content_hash"):
            if not r.get(field):
                errs.append(f"{field} missing")
        if mode == "release":
            for field in RELEASE_FIELDS:
                if not truth(r.get(field)):
                    errs.append(f"{field} must be true for release")
            if not truth(r.get("release_eligible")):
                errs.append("release_eligible must be true")
    elif mode == "release":
        errs.append("only validated records may enter a release")

    return errs, warns


def main():
    mode = "release" if "--mode=release" in sys.argv or "--release" in sys.argv else "structural"
    rows = list(csv.DictReader(open("data/bank/bank.csv", encoding="utf-8")))
    bad = 0
    eligible = 0
    for row in rows:
        errors, warnings = check_row(row, mode)
        for message in errors:
            print(f"ERROR {row.get('id', '<missing-id>')}: {message}")
            bad += 1
        for message in warnings:
            print(f"warn  {row.get('id', '<missing-id>')}: {message}")
        if row.get("status") == "validated" and truth(row.get("release_eligible")) and not errors:
            eligible += 1
    if mode == "release" and eligible == 0:
        print("ERROR release: no release-eligible validated passages")
        bad += 1
    print(f"bank.csv ({mode}):", "FAILED" if bad else "ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
