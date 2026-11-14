# Data governance

## Ownership and release

The authoring dataset is maintained by the project team. A passage is not production content merely because it is syntactically valid. Structural checks, instructional review, language review, rights review, cultural review, and child-safety review are separate controls.

Reviews may happen in parallel. The release decision is derived from their results, but the system never turns a draft into `validated` automatically. Only a named human reviewer can set `status=validated`, and the author must not be the sole validator.

Each learner-facing item requires two independent human reviews: a language review and an early-literacy review. Neither reviewer may have authored the item. Reviews are completed independently before comments are shared. A failed review blocks release. A revision creates a new content version and hash, so previous sign-offs no longer apply. Each sign-off records the exact content hash and version. Reviewer names and credentials remain in a private register; public data contains reviewer codes only.

AI-assisted authorship is disclosed to reviewers through `author_type`. Reviewers specifically check for unnatural register, English calques, and agreement errors. This is a review risk, not a claimed error rate.

If a facilitator flags a released item, its status becomes `under_review`. It is excluded from new production selection until both reviewers complete a new review against the current hash.

## Source and licence

Every item points to `data/sources/source_register.csv` through `source_id`. The register records publisher, creator, licence, source version, publication date, access date, adaptation rights, audio rights, public-repository rights, and notes. Original content must identify its creator. Open adaptations must preserve the licence and attribution requirements.

Unresolved rights exclude an item from release. Tusome or other externally published materials are not ingested until reuse and redistribution rights are confirmed.

## Language and curriculum

Language is an attribute of the learner and of the content item. A learner may have a home language different from the instructional language and different from the facilitator interface language. The initial content tag is `sw-KE`, but the schema must remain language-neutral.

Curriculum alignment records the named curriculum document and edition. Framework alignment is descriptor-level unless a framework edition exists for the target language. Numeric fluency benchmarks are not claimed without a pinned source and definition.

## Learner privacy

Only pseudonymous learner codes enter the application database. Do not store names, phone numbers, schools, precise locations, or dates of birth in the project database. A partner may retain a separate code key, but that key is outside the application database and repository.

Treat transcripts as potentially personal data even where the learner code is pseudonymous. Store only what is required for replay, evaluation, safeguarding, and reporting. Define a retention period before collecting live learner data. Deletion must be possible by learner code and must include attempts, transcripts, confirmations, and derived aggregates where the program policy requires it.

## Audio

Product audio is processed in memory and discarded. No code path may write it to disk, database, logs, or repository. Evaluation recordings are a separate controlled dataset. The initial evaluation uses adult proxy readers with documented consent. Child recordings require prior approval, guardian consent, and child assent where applicable.

Evaluation audio belongs in a controlled local or secured storage location, never in Git. The repository may contain an audio manifest without audio bytes. Each sample must have a retention expiry and deletion owner.

## Secrets and local operation

`.env` is local-only and must never be committed or placed in a ZIP deliverable. API keys are runtime configuration, not content data. Logs must not print keys, raw audio, or unredacted personal data.

## Incident rule

If a draft is served in production, a secret is committed, audio is persisted, an unapproved child record is collected, or a source right is uncertain, stop the affected flow. Record the incident, isolate the data, and correct the owning stage before continuing.
