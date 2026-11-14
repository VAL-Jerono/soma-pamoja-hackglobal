# Adult-proxy speech evaluation

## Purpose

This evaluation measures how the speech and decision pipeline behaves on labelled reading samples. It does not validate the Reading Bank and it does not establish child speech performance.

## Data separation

The evaluation dataset is separate from learner attempts and the Reading Bank:

```text
data/eval/eval_samples.csv
    human-labelled samples and consent metadata

data/eval/eval_runs.csv
    machine outputs for those samples

data/eval/audio_manifest.csv
    metadata only, never audio bytes

data/eval_audio/
    controlled local audio, never committed
```

Typed-demo attempts are not evaluation samples. The evaluator excludes `session_type=typed_demo` and `engine=typed-demo`.

## Human-first labelling

A human reviewer records the expected text and human transcript or verdict before inspecting the machine transcript or verdict. The evaluator rejects a row when the recorded human label timestamp is later than the machine run timestamp.

`uncertain` is excluded from false-wrong and false-correct rates. It is reported separately and is never converted to `incorrect`.

## Starter protocol

Use at least three adult proxy readers. The preferred first set is 20 samples:

- 8 fluent correct;
- 4 hesitant correct;
- 3 self-correction or repetition;
- 3 planted omissions or substitutions;
- 2 noisy samples.

The urgent minimum is 10 real samples with at least three readers, but results must be described as indicative. Record device type, room condition, consent status, and retention expiry.

## Evaluation command

After real samples and runs are entered:

```bash
python3 tools/run_eval.py \
  --samples data/eval/eval_samples.csv \
  --runs data/eval/eval_runs.csv \
  --out data/eval/eval_result.json
```

The runner reports:

- comparable sample count;
- excluded uncertain count;
- false-wrong count and rate;
- false-correct count and rate;
- invalid human-label ordering;
- row-level comparisons.

False-wrong means the human verdict is `correct` or `acceptable_minor_slip` while the machine verdict is not `auto_ok`. False-correct means the human verdict is `incorrect` while the machine verdict is `auto_ok`.

## Planted fixtures

`data/fixtures/eval_planted_cases.csv` contains deterministic cases for testing alignment and evaluator plumbing. They are not audio, not speech results, and must never be reported as evaluation findings.

## Current state

The real evaluation CSVs are empty. No speech accuracy, false-wrong rate, or false-correct rate has been established yet.
