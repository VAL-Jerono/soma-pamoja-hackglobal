"""Compare human evaluation labels with machine runs.

This tool reports only observed real evaluation rows. It never treats planted fixtures
or typed-demo attempts as speech evidence.
"""
import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path


HUMAN_POSITIVE = {"correct", "acceptable_minor_slip"}
HUMAN_NEGATIVE = {"incorrect"}


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def evaluate(samples, runs):
    runs_by_sample = {}
    for run in runs:
        if run.get("session_type") == "typed_demo" or run.get("engine") == "typed-demo":
            continue
        runs_by_sample.setdefault(run.get("sample_id"), []).append(run)

    compared = []
    excluded_uncertain = 0
    invalid_order = []
    for sample in samples:
        human = sample.get("human_verdict", "")
        if human == "uncertain":
            excluded_uncertain += 1
            continue
        if human not in HUMAN_POSITIVE | HUMAN_NEGATIVE:
            continue
        for run in runs_by_sample.get(sample.get("sample_id"), []):
            human_time = parse_time(sample.get("human_label_recorded_at", ""))
            run_time = parse_time(run.get("run_date", ""))
            if human_time and run_time and human_time > run_time:
                invalid_order.append(sample.get("sample_id"))
                continue
            human_positive = human in HUMAN_POSITIVE
            machine_positive = run.get("machine_verdict") == "auto_ok"
            compared.append({
                "sample_id": sample.get("sample_id"),
                "engine": run.get("engine", ""),
                "human_verdict": human,
                "machine_verdict": run.get("machine_verdict", ""),
                "false_wrong": human_positive and not machine_positive,
                "false_correct": human in HUMAN_NEGATIVE and machine_positive,
            })

    total = len(compared)
    false_wrong = sum(row["false_wrong"] for row in compared)
    false_correct = sum(row["false_correct"] for row in compared)
    result = {
        "status": "ok" if total else "no_comparable_samples",
        "comparable_samples": total,
        "excluded_uncertain_samples": excluded_uncertain,
        "false_wrong_count": false_wrong,
        "false_correct_count": false_correct,
        "false_wrong_rate": round(false_wrong / total, 4) if total else None,
        "false_correct_rate": round(false_correct / total, 4) if total else None,
        "invalid_label_order_samples": sorted(set(invalid_order)),
        "rows": compared,
        "caveat": "Indicative only. Do not generalize without the planned reader, condition, and sample coverage." if total else "No real speech samples have been compared yet.",
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default="data/eval/eval_samples.csv")
    parser.add_argument("--runs", default="data/eval/eval_runs.csv")
    parser.add_argument("--out")
    args = parser.parse_args()
    result = evaluate(read_csv(args.samples), read_csv(args.runs))
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        Path(args.out).write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
