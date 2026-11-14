# Minimum truthful demo

## Purpose

This phase makes the current repository usable for structured adult training without presenting draft content as validated educational material.

## What is now functional

- The bank builder generates both `data/bank/bank.json` and `data/micro_reading/micro_items.json`.
- The selector loads both projections.
- Draft micro-items are available only when `ALLOW_DRAFT=1`.
- Production loading still excludes every item whose status is not `validated`.
- Micro-items carry `content_type`, `content_version`, `source`, `source_id`, `en`, `picture`, `lang_tag`, and `content_hash`.
- Micro-items with an omission, substitution, or insertion cannot receive `auto_ok` from the short-item gate. Only an exact match may auto-confirm; other results defer to the facilitator.
- Attempts identify `typed_demo` separately from `speech`, and dashboard speech metrics exclude typed-demo attempts.
- Each draft micro-item now carries one draft comprehension question. The answer key is not returned in the public item projection.
- Comprehension is recorded through a separate event with `understood`, `with_help`, `not_yet`, or `not_sure`.
- The UI labels all draft activities as unvalidated by the required human reviewers.

## Local training mode

Use a local development environment with `ALLOW_DRAFT=1`. Train with adult proxy readers only. Do not interpret the results as child speech accuracy or as a validated learning outcome.

Recommended training flow:

1. Select a learner code such as `L-001`.
2. Request the next activity.
3. Read the displayed item aloud or use the typed demo path.
4. Record whether the machine result matches the observed reading. Typed-demo attempts are rule tests, not speech evaluation samples.
5. Record omissions, substitutions, insertions, confidence, and whether the activity should be deferred.
6. Keep reviewer and comprehension decisions separate from the machine result.

To record a comprehension judgment, submit the question ID to `/api/comprehension` after the reading attempt. This records the question version and item content hash with the facilitator verdict. The current questions are drafts and are not validated learning measures.

## Current boundaries

This phase does not claim calibrated speech confidence, validated instructional content, child safety approval, or comprehension measurement. The six current micro-items remain drafts. Production mode correctly serves zero items until human review and rights gates are complete.

The next implementation phase is comprehension capture and invariant coverage. The production evidence track should run in parallel with independent language and early-literacy review.
