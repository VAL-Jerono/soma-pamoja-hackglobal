# Decision log

README sections 11, 12 and 16 remain the source of truth for the stage architecture. This log records the current data decisions without treating proposals as completed validation.

| # | Decision | Answer | State | Date |
|---|---|---|---|---|
| D1 | Target population | Early-grade literacy, initially Grades 1 to 2. Pre-primary and Grade 3 are roadmap scope. | Proposed | 2026-11-14 |
| D2 | Language profile | Language is recorded per learner and per content item. Required learner fields are `home_language`, `instruction_language`, and `facilitator_ui_language`. The initial content item is tagged `sw-KE`; this does not make the architecture Swahili-only. | Proposed | 2026-11-14 |
| D3 | First assessment scope | Oral reading, micro-reading decoding items, and facilitator-read listening-comprehension items. The first production release may expose oral reading and micro-items first. Numeric fluency claims require D8. | Proposed | 2026-11-14 |
| D4a | Validator policy | Every learner-facing item requires two independent human reviewers: one language reviewer and one early-literacy reviewer. Neither may have authored the item. Each signs independently. A failure blocks release. A text change creates a new version and invalidates prior sign-off. Sign-off is bound to `content_hash` and `content_version`. Public data uses reviewer codes only. | Decided | 2026-11-14 |
| D4b | Named validators | Language reviewer: unnamed. Early-literacy reviewer: unnamed. Until both are recorded for an item, its status cannot exceed `review`. | Unresolved | 2026-11-14 |
| D5 | Source and licence policy | Original content or documented CC BY adaptations. CC BY-NC content is excluded unless the project's non-commercial status and redistribution rights are confirmed. Every source is recorded in `data/sources/source_register.csv`. | Proposed | 2026-11-14 |
| D6 | Bank size | No fixed release count. Release only items that pass all release gates. The 24-item plan remains a production target, not a requirement to publish incomplete content. | Proposed | 2026-11-14 |
| D7 | Evaluation readers | Adult proxy readers only for the initial evaluation, with documented consent. Child recordings require prior approval, guardian consent, and child assent where applicable. | Proposed | 2026-11-14 |
| D8 | Fluency benchmark policy | No numeric fluency benchmark is claimed without a pinned source, edition or publication date, language, population, and measure definition. | Decided | 2026-11-14 |
| D9 | Orthography policy | Each language declares an `orthography_ref`. The initial `sw-KE` content records Kamusi ya Kiswahili Sanifu, third edition, as the reference to be confirmed by the language reviewer. | Proposed | 2026-11-14 |
| D10 | Content categories | Full passages, micro-reading items, and technical fixtures are separate content types. Existing six short items are draft micro-items and do not count as full passages. | Decided | 2026-11-14 |
| D11 | Authoring source of truth | The authoring CSV is authoritative. App JSON is generated and is never hand-maintained. Derived fields are recomputed from canonical text. | Decided | 2026-11-14 |
| D12 | Release rule | A draft may pass structural checks, but only a named human reviewer can set `validated`. Production output contains validated, release-eligible records only. | Decided | 2026-11-14 |
| D13 | Authorship disclosure | Each learner-facing item records `author_type` as `human` or `ai_assisted`. Reviewers are told when AI assistance was used and check for unnatural register, calques, and agreement errors. | Decided | 2026-11-14 |
| D14 | Post-release flagging | A facilitator can flag a served item. A flagged item moves to `under_review` and is excluded from new production selection until reviewed again. | Decided | 2026-11-14 |

## Evidence states

| State | Meaning | Claim allowed |
|---|---|---|
| `draft` | Authoring or pipeline test content | Draft content for pipeline testing |
| `review` | At least one review may be in progress | Review in progress; not validated |
| `validated` | Both reviewers signed the exact hash and version, rights and release gates pass | Validated by named reviewers |
| `under_review` | Existing content was flagged after release or review found a material concern | Not available for new production selection |
| `retired` | Permanently withdrawn | Not served |

External approval is a separate roadmap state. Soma Pamoja must not claim KICD approval unless a formal external approval process has occurred.

## Open decisions before production release

D4b remains the blocking human decision. The project also needs the exact curriculum edition, language-specific character policy, and final first-release activity menu recorded before a production release is declared.

Until then, the local system may run in development mode with a visible draft state. No draft content should be represented as validated.
