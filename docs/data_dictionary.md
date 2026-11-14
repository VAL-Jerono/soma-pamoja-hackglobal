# Data dictionary

This dictionary defines the data contracts before compute or database migrations. The same concepts apply to every supported language. Language-specific values belong in `lang_tag`, `variety`, `orthography_ref`, and the source register.

## Content item authoring fields

| Field | Type | Required | Meaning and rule |
|---|---|---:|---|
| `id` | string | yes | Stable identifier. Never reuse an ID for different content. |
| `content_type` | enum | yes | `passage`, `micro_item`, or `fixture`. Full passages and micro-items are different instructional objects. Fixtures are never learner content. |
| `level` | enum | yes | A, B, C for passages. Micro-items use their own item-skill progression. |
| `item_skill` | enum | conditional | For micro-items: `letter_sound`, `syllable`, `familiar_word`, `nonword`, or `sentence`. |
| `content_version` | string | yes | Version of the canonical content record. |
| `title` | string | yes | Learner-facing or facilitator-facing title. |
| `text` | string | yes | Canonical text. Human-authored and immutable after release. |
| `text_normalized` | string | computed | Derived by the shared normalization version. Never trusted as hand-entered data. |
| `word_count` | integer | computed | Computed from normalized text. |
| `sentence_count` | integer | computed | Computed from canonical punctuation and reviewed for correctness. |
| `syllable_count` | integer or null | review | Count used for language-specific difficulty analysis. |
| `syllable_pattern` | string or JSON | review | Language-specific pattern summary. |
| `morpheme_count` | integer or null | review | Optional language-specific complexity measure. |
| `topic` | string | yes | Controlled topic vocabulary. |
| `genre` | string | yes | Story, description, dialogue, procedure, or informational. |
| `summary_en` | string | no | Facilitator or audit summary. Not a substitute for the canonical text. |
| `key_vocabulary` | JSON array | review | Words requiring explanation or monitoring. |
| `target_skill` | string | review | Main competency exercised. |
| `questions` | JSON array | conditional | Validated comprehension questions, if the item is used for comprehension. |
| `lang_tag` | string | yes | BCP 47-like language tag, for example `sw-KE`. Architecture is not limited to this value. |
| `variety` | string | yes | Named language variety or standard. |
| `orthography_ref` | string | yes | Spelling authority used by the reviewer. |
| `curriculum_ref` | string | review | Curriculum design, edition or year used for alignment. |
| `introduced_graphemes` | JSON array | review | Cumulative grapheme set allowed at the target instructional stage. |
| `decodability_status` | enum | review | `pass`, `review`, or `fail`. |
| `difficult_words` | JSON array | review | Words expected to be difficult and why. |
| `agglutinated_forms` | JSON array | review | Morphologically complex forms needing attention. |
| `accepted_variants` | JSON array | review | Human-approved variants. Must never silently alter the canonical text. |

## Provenance and review fields

| Field | Type | Required | Meaning and rule |
|---|---|---:|---|
| `source_id` | string | yes | Foreign key into `data/sources/source_register.csv`. |
| `source_type` | enum | yes | `original`, `adapted_open`, or `licensed`. |
| `author_or_creator` | string | yes | Creator or team record. |
| `author_type` | enum | yes | `human` or `ai_assisted`. Reviewers are told when AI assistance was used. |
| `license_name` | string | yes | Licence or rights basis. |
| `license_verified` | boolean | yes | Must be true for release. |
| `adaptation_permission` | boolean | yes | Must be true when adapted. |
| `audio_recording_permission` | boolean | yes | Must be true when audio is created. |
| `public_repo_permission` | boolean | yes | Must be true for public repository content. |
| `validator_role` | string | review | Language reviewer role. |
| `validator_code` | string | review | Pseudonymous reviewer code. |
| `literacy_reviewer_code` | string | review | Independent early-literacy reviewer code. |
| `language_signoff_hash` | string | review | Hash signed by the language reviewer. Must match `content_hash`. |
| `literacy_signoff_hash` | string | review | Hash signed by the early-literacy reviewer. Must match `content_hash`. |
| `validation_date` | date | review | Date of completed human review. |
| `structural_pass` | boolean | computed | Machine-checkable schema and consistency result. |
| `instructional_pass` | boolean | human | Human instructional suitability result. |
| `language_pass` | boolean | human | Language and orthography result. |
| `rights_pass` | boolean | computed/review | Rights and provenance result. |
| `cultural_review` | enum | review | `pass`, `fail`, or `pending`. |
| `child_safety_review` | enum | review | `pass`, `fail`, or `pending`. |
| `image_review` | enum | review | `pass`, `fail`, or `not_applicable`. |
| `validator_notes` | string | review | Review evidence and unresolved points. |
| `status` | enum | yes | `draft`, `review`, `validated`, `under_review`, or `retired`. Only a named human may set `validated`. |
| `release_eligible` | boolean | computed | AND of required structural, instructional, language, rights, safety, and reviewer gates. It does not itself set status. |
| `content_hash` | string | computed | Hash of canonical content and relevant scoring fields. Any text change creates a new hash and voids prior sign-off. |
| `normalization_version` | string | computed | Version of the shared normalization rule. |
| `created_at` | date-time | yes | Authoring timestamp. |
| `updated_at` | date-time | yes | Last metadata update. |
| `retirement_reason` | string | conditional | Required when status is retired. |

## Learner and attempt privacy fields

Learner records contain only a pseudonymous code plus the minimum language and consent references required by the program. `home_language`, `instruction_language`, and `facilitator_ui_language` are learner-level attributes and must not be inferred from content language.

Stored transcripts are treated as potentially personal data even when the learner code is pseudonymous. Audio is never persisted. Consent references point to an external controlled record and do not contain names in the application database. Retention and deletion rules are defined in `docs/data_governance.md`.

## Projection rules

`bank.csv` is the authoring source. `bank.json` is generated. The application projection includes only fields required for selection, scoring, feedback, provenance display, and versioned replay. It must include `content_type`, `content_hash`, `content_version`, `lang_tag`, `source_id`, and validator status.

No field called `validator_status` is authored separately from `status`. The builder maps authoring `status` to the app projection field `validator_status`.

## Comprehension question and event fields

Questions are learner-facing content and follow the same two-reviewer, hash-bound policy as reading items. A question may be served only with its current item version and content hash. The answer key is retained for the facilitator or server-side event writer and is not returned in the public learner item projection.

| Field | Meaning |
|---|---|
| `question_id` | Stable question identifier. |
| `passage_id` | Exact item that owns the question. |
| `question_text` | Literal question shown or read to the learner. |
| `question_lang` | Language of the question. |
| `answer_key` | Facilitator-only expected answer. |
| `question_version` | Version of the question text and answer key. |
| `question_status` | Draft, review, validated, under_review, or retired. |
| `mode` | `read_aloud`, `facilitator_read`, or `listen`. |
| `verdict` | `understood`, `with_help`, `not_yet`, or `not_sure`. |
| `attempt_id` | Optional link to a reading attempt. |
| `content_hash` | Serve-time hash snapshot for reproducibility. |
