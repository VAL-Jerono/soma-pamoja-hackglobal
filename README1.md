# SP: Soma Pamoja ("Read Together")

**Track 2: Multimodal and Accessibility.** A voice-first Swahili reading tutor for children whose school has closed.

> The school may close. The learning should not have to.

HackGlobal 2026 submission. Built locally on Docker, deployed on Vultr.

---

## 0. How to use this document

This README is the single source of truth for how SP is built and how to debug it. Every part of the system is a numbered **stage** (S1 to S8) with one input contract, one output contract, one owner folder and one test. When something is wrong, find the first stage whose output is wrong. That stage owns the bug.

Status words used throughout:

- **Built**: exists in the starter code today.
- **Next**: designed here, to be built during the hackathon.
- **Roadmap**: designed, not part of the hackathon build.
- **Simulated**: demonstrated with a sandbox or mock, not live.

---

## 1. What SP is, and what it claims

SP lets a community facilitator run a reading session for children. A child reads a passage aloud. The system transcribes it, scores it against the expected text, decides whether it is confident enough to judge, gives short feedback tied to a cited source, and records the outcome. When the system is unsure, a human decides.

**Claim boundaries (do not exceed these in the submission):**

- Passages are "aligned to the UNESCO Global Proficiency Framework and Kenya Grade 1 to 3 Kiswahili expectations, pending native-speaker validation". They are **not** "curriculum-approved" or "validated" until a named reviewer signs them off.
- The 20 test recordings are adult proxy data. They show the pipeline works. They do not show how accurate it is for children.
- Numeric fluency benchmarks are not claimed unless taken directly from a Kenyan source.
- Dashboard figures are demo data.

---

## 2. The governing principle: three kinds of truth

Every piece of data in SP belongs to exactly one of three kinds. They are stored in separate fields and must never overwrite each other.

| Truth | Meaning | Source | Where stored |
|---|---|---|---|
| **Instructional** | What the approved content is and what the learner should do | Reading Bank, human validators | `passages` |
| **Observational** | What the child actually said or did | Human-labelled recordings, facilitator confirmation | `human_*` columns, `eval_samples.human_*` |
| **Computational** | What the machine understood or predicted | STT, scoring, gate | `machine_*` columns |

Two rules follow:

1. Computational output never silently replaces observational truth. A facilitator confirmation is stored beside the machine verdict, not on top of it.
2. Generated text never becomes instructional truth. Gemini may phrase feedback. It may not add content.

---

## 3. The end-to-end flow

```
 S1 SELECT      S2 CAPTURE     S3 SENSE        S4 SCORE        S5 DECIDE
 Reading Bank   Browser        Speech to       Align and       Confidence
 -> passage     records audio  text            score words     gate
                -> blob        -> transcript   -> word errors  -> verdict
     |              |              |               |               |
     +--------------+--------------+---------------+---------------+
                                    |
              each stage writes one entry to the attempt's stage_log
                                    |
                                    v
 S6 RESPOND      S7 RECORD            S8 REPORT and RENDER
 Cited feedback  Attempt row +        Dashboard, SMS/USSD, radio, print
 (constrained)   facilitator confirm  (all read the one Reading Bank)
```

**Fixed order, no skipping.** Audio exists only inside S2 and S3 and is discarded at the end of S3. Everything after S3 works from text and numbers, which is why S4 to S6 can be replayed without audio.

**Deferral path.** S5 can send an attempt to the facilitator. The child is never marked wrong by a low-confidence machine result.

---

## 4. Module map (one stage, one folder, one contract)

| Stage | Name | Folder | Input | Output | Status |
|---|---|---|---|---|---|
| S1 | Select | `api/app/select/` | `learner_code` | passage record (app-facing) | Built (basic), Next (validated-only filter) |
| S2 | Capture | `api/app/static/` | microphone | audio blob (client side only) | Built |
| S3 | Sense | `api/app/speech/` | audio blob | transcript, confidence, engine | Built (Groq, local Whisper) |
| S4 | Score | `api/app/scoring/` | expected text, transcript | word alignment, error counts, accuracy | Built (crude ratio), Next (word alignment) |
| S5 | Decide | `api/app/decide/` | confidence, alignment | verdict and reason | Built (threshold only), Next (rule set in 6.5) |
| S6 | Respond | `api/app/respond/` | passage, verdict | feedback text, source | Built (Gemini or template) |
| S7 | Record | `api/app/record/` | everything above | database rows | Built (basic), Next (stage_log, separate truths) |
| S8 | Report and render | `api/app/channels/` | database, Reading Bank | dashboard, SMS, MP3, PDF | Built (dashboard), Next (MP3, PDF), Simulated (SMS/USSD) |

A stage may import only from the stage directly before it and from `contracts.py`. No stage reads another stage's database table directly. This is what keeps debugging linear.

---

## 5. Data model

Five collections are designed. **Three are built for the hackathon. Two are documented only**, because 36 hours does not allow more.

| # | Collection | Purpose | Hackathon status |
|---|---|---|---|
| 1 | Reading Bank | Approved content and its metadata | Built (starter), Next (full schema) |
| 2 | Speech Evaluation | Tests the machine against human labels | Next |
| 3 | Learner Interaction | What happens when the tool is used | Built (attempts table) |
| 4 | Learning Assessment | Whether children are actually learning (baseline, endline) | Roadmap (protocol documented only) |
| 5 | Governance | Rights, consent, validation, retention | Next as CSV and docs, Roadmap as database |

### 5.1 Reading Bank

Two forms, one source:

- **Authoring form:** `data/bank/bank.csv`. Rich, human-edited, never served directly.
- **App form:** `data/bank/bank.json`. Small, generated by `tools/build_bank_json.py`, contains only passages with `status = validated`.

Core fields (full dictionary in `docs/data_dictionary.md`):

| Group | Fields |
|---|---|
| Identity | `id` (for example `SW-A-001`), `level` (A, B, C), `content_version` |
| Content | `title`, `text`, `text_normalized`, `word_count`, `sentence_count`, `topic`, `genre`, `image_id`, `questions` |
| Instruction | `target_skill`, `introduced_graphemes`, `syllable_patterns`, `decodability_status`, `difficult_words`, `agglutinated_forms` |
| Provenance | `source_type` (original, adapted_open, licensed), `author_or_creator`, `license_name`, `license_verified`, `adaptation_permission`, `audio_recording_permission`, `public_repo_permission` |
| Validation | `validator_role`, `validator_code`, `validation_date`, `language_review`, `cultural_review`, `child_safety_review`, `image_review`, `status` (draft, review, validated, retired) |

**Normalization rule (single definition, used everywhere):** lowercase, strip punctuation except the apostrophe, collapse whitespace, Unicode NFC. Scoring, the validator script and the evaluation all call the same function in `api/app/scoring/normalize.py`.

**Character check:** the validator script rejects any passage containing non-Latin letters (for example a Cyrillic "a" that looks identical to a Latin one). This is a real failure mode when text is copied between tools, and it silently breaks scoring.

### 5.2 Bands and scope

| Band | Skill focus | Words | Sentence length | Target count |
|---|---|---|---|---|
| A | Syllable blending, familiar words, short sentences | 20 to 45 | 3 to 7 | 8 to 10 |
| B | Accurate connected text, explicit retrieval | 45 to 90 | 5 to 10 | 10 to 12 |
| C (optional) | Sustained reading, simple inference | 90 to 150 | 7 to 12 | 4 to 8 |

These limits are engineering proposals, not published Kiswahili benchmarks. Ship **18 validated passages rather than 30 unreviewed ones**. If fewer are validated by the deadline, ship fewer and say so.

### 5.3 Speech Evaluation dataset

A separate table and a separate folder. It is not the Reading Bank.

`eval_samples`: `sample_id`, `passage_id`, `reader_id` (pseudonym), `reader_type` (adult_proxy, teacher, child), `reading_condition` (fluent, hesitant, self_correction, omission, substitution, noisy), `expected_text`, `human_transcript`, `human_verdict` (correct, acceptable_minor_slip, incorrect, uncertain), `device_type`, `room_condition`, `consent_status`, `retention_expiry`.

`eval_runs`: `run_id`, `sample_id`, `engine`, `model_version`, `stt_transcript`, `confidence`, `machine_verdict`, `latency_ms`, `run_date`.

Starter set of 20: 8 fluent correct, 4 hesitant correct, 3 self-correction or repetition, 3 known omissions or substitutions, 2 noisy. At least 3 readers, quiet and moderate-noise rooms. `uncertain` is never converted to `incorrect`.

Audio files live in `data/eval_audio/` which is **git-ignored**. Only `audio_manifest.csv` (no audio) is committed.

### 5.4 Attempts (Learner Interaction)

One row per attempt. Machine and human truth are separate columns.

| Column | Truth | Meaning |
|---|---|---|
| `trace_id` | | UUID, follows the attempt through every stage |
| `learner_code` | | pseudonymous code only |
| `passage_id`, `content_version`, `assessment_version` | Instructional | exactly what was served and which scoring rules applied |
| `stt_transcript`, `stt_confidence`, `stt_engine`, `stt_model` | Computational | what S3 returned |
| `alignment` (JSON), `accuracy` | Computational | what S4 returned |
| `machine_verdict`, `gate_reason` | Computational | what S5 returned |
| `feedback_text` | Computational | what S6 returned |
| `human_verdict`, `human_accuracy`, `confirmed_by`, `confirmed_at` | Observational | facilitator decision, never overwrites machine columns |
| `stage_log` (JSON) | | one entry per stage, see section 9 |
| `created_at` | | |

**Known gap in the starter:** the `confirm` endpoint currently overwrites `accuracy`. Fixing this to write `human_*` columns is the first Next item in S7.

### 5.5 Collections 4 and 5 (documented, not built)

- **Learning Assessment:** baseline, periodic and endline checks of letter-sound knowledge, decoding, oral reading accuracy, fluency and comprehension, administered by a person independently of the tool. It is the only data that can show children are learning. The speech dataset shows whether the machine works. These are different questions.
- **Governance:** content licences, validation records, consent and assent records, access permissions, retention and deletion log. In the hackathon this is `docs/data_governance.md` plus the provenance columns in `bank.csv`.

---

## 6. Stage contracts

All contracts are defined once in `api/app/contracts.py` and mirrored here.

### 6.1 S1 Select

```json
{ "in":  { "learner_code": "L-001" },
  "out": { "passage": { "id": "SW-A-001", "level": "A", "title": "...", "text": "...",
                        "text_normalized": "...", "image_id": "...", "source": "original",
                        "validator_status": "validated", "content_version": 1 } } }
```
Rules: serve only `status = validated`. Choose level from the learner's last three confirmed or high-confidence attempts. Prefer unseen passages. If no validated passage exists, return an explicit `empty_bank` error. Do not fall back silently.

**Dev mode:** `ALLOW_DRAFT=1` serves draft passages and the UI shows a visible "DRAFT CONTENT" banner. It must be off in the submitted demo unless the submission states the bank is draft.

### 6.2 S3 Sense

```json
{ "in":  { "audio": "<blob>", "language": "sw" },
  "out": { "transcript": "mtoto anasoma kitabu", "confidence": 0.82,
           "engine": "groq-whisper", "model": "whisper-large-v3", "latency_ms": 1100 } }
```
Rules: try Groq first, then local faster-whisper, then return empty transcript with confidence 0. The audio variable is deleted at the end of the function. Nothing in this stage writes audio to disk or the database.

### 6.3 S4 Score

```json
{ "in":  { "expected": "mtoto anasoma kitabu", "heard": "mtoto anasoma" },
  "out": { "alignment": [["mtoto","mtoto","ok"],["anasoma","anasoma","ok"],["kitabu",null,"omit"]],
           "errors": { "omit": 1, "sub": 0, "ins": 0 }, "wer": 0.33, "accuracy": 0.67 } }
```
Rules: word-level alignment using edit distance, so omissions, substitutions and insertions are reported separately. Pure function: same input, same output, no network, no database. The starter uses a crude sequence ratio. Replace it with this.

### 6.4 S5 Decide (the confidence gate)

```json
{ "in":  { "confidence": 0.82, "accuracy": 0.67, "transcript": "mtoto anasoma" },
  "out": { "verdict": "auto_practice", "reason": "R4" } }
```

### 6.5 Gate rules (evaluated in order, first match wins)

| Rule | Condition | Verdict |
|---|---|---|
| R1 | Transcript empty | `defer` |
| R2 | `confidence < CONF_MIN` | `defer` |
| R3 | `accuracy >= 0.8` and `confidence >= CONF_MIN` | `auto_ok` |
| R4 | `accuracy < 0.8` and `confidence >= CONF_HIGH` | `auto_practice` |
| R5 | otherwise | `defer` |

`CONF_MIN` and `CONF_HIGH` are set from the evaluation set, not guessed. Two invariants govern the gate: low confidence never yields `auto_practice`, and every `defer` carries a reason code.

**Why the gate needs two error types, not one.** The false-wrong rate (child read correctly, machine says wrong) protects children's trust. Speech models also tend to "correct" what they hear towards fluent text, so a child who omits or substitutes a word may be transcribed as reading it correctly. That is the **false-correct rate**, and it hides real reading errors. Google's Read Along team chose to accept more false positives to keep children encouraged. SP chooses to defer to a human instead. We must measure both rates to show that this choice works.

### 6.6 S6 Respond

```json
{ "in":  { "passage": {...}, "verdict": "auto_practice", "errors": {"omit": 1} },
  "out": { "feedback_text": "...", "source_ref": "SW-A-001" } }
```
Rules: one short sentence. Mentions only words present in the passage. If Gemini is unavailable or returns anything off-contract, use the template. Feedback for a `defer` is addressed to the facilitator, not the child.

### 6.7 S7 Record and S8 Report

S7 writes one `attempts` row per attempt with the full `stage_log`. S8 only reads. The dashboard shows: attempts, learners, average accuracy, deferral rate, facilitator-confirmed rate, share of activities with a visible source, and the false-wrong and false-correct rates from the latest evaluation run. All figures carry a "demo data" label until real data exists.

---

## 7. Invariants (a broken invariant outranks every other bug)

| ID | Invariant | Enforced in | Automated test |
|---|---|---|---|
| I1 | The AI never adds lesson content. Every activity maps to a Reading Bank ID. | S1, S6 | `test_feedback_only_uses_passage_words` |
| I2 | A low-confidence result never produces a negative verdict for the child. | S5 | `test_low_conf_never_practice` |
| I3 | Audio is never persisted. | S3 | `test_no_audio_written` |
| I4 | Only pseudonymous learner codes enter the database. | API, schema | `test_reject_non_code_ids` |
| I5 | Every served response carries source and validator status. | S1, S6 | `test_response_has_provenance` |
| I6 | All channels render from the one Reading Bank. | S8 | `test_channels_share_bank` |
| I7 | Every external call has a working fallback. | S3, S6 | `test_stt_fallback_chain` |
| I8 | Machine columns are never overwritten by human confirmation. | S7 | `test_confirm_keeps_machine_fields` |
| I9 | Only `validated` passages are served unless `ALLOW_DRAFT=1`. | S1 | `test_draft_not_served` |
| I10 | Bank text contains only Latin letters, normalized, with matching word_count. | tools | `validate_bank.py` |

---

## 8. Repository layout (repo name: `SP`)

```
SP/
├── README.md                  this file
├── docker-compose.yml         services: sp-db, sp-api, sp-proxy
├── Caddyfile
├── Makefile                   up, down, logs, test, validate, eval, psql, replay
├── .env.example
├── docs/
│   ├── learning_framework.md  bands, framework alignment, theory of change
│   ├── data_dictionary.md     every field: meaning, source, rule, where stored
│   ├── data_governance.md     rights, consent, retention
│   ├── literature_review.md   precedents and gaps (business understanding)
│   └── decisions.md           decision log (section 15)
├── data/
│   ├── bank/                  bank.csv (authoring), bank.json (generated)
│   ├── eval/                  audio_manifest.csv, eval_samples.csv, results/
│   └── eval_audio/            GIT-IGNORED. Recordings never leave the machine.
├── api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py            routes only, no logic
│       ├── contracts.py       all stage input and output types
│       ├── select/            S1
│       ├── speech/            S3
│       ├── scoring/           S4 (normalize.py, align.py)
│       ├── decide/            S5 (gate.py)
│       ├── respond/           S6
│       ├── record/            S7 (db.py, stage_log.py)
│       ├── channels/          S8 (dashboard, sms_ussd, radio, print)
│       └── static/            S2 (PWA)
├── tools/
│   ├── validate_bank.py       enforces I10 and the acceptance gate
│   ├── build_bank_json.py     bank.csv -> bank.json (validated only)
│   ├── run_eval.py            runs STT on eval set, writes metrics
│   └── replay.py              re-runs S4 to S6 from a stored trace
└── tests/                     one test file per stage, plus invariants
```

`.gitignore` must contain: `.env`, `data/eval_audio/`, `*.wav`, `*.webm`, `*.mp3`, `__pycache__/`.

---

## 9. Debugging

### 9.1 Rule of first wrong output

Every attempt has a `trace_id` and a `stage_log`. Each stage appends one entry:

```json
{ "stage": "S4", "ok": true, "ms": 3, "in_summary": "expected 3 words, heard 2",
  "out_summary": "omit=1 wer=0.33", "version": "assessment_v1" }
```

To debug: fetch the attempt by `trace_id`, read the stage_log top to bottom, and stop at the first entry whose output is wrong. Fix that stage only. Later stages were fed bad input.

### 9.2 Replaying without audio

Audio is discarded, but the transcript is stored. `make replay TRACE=<id>` re-runs S4, S5 and S6 from the stored transcript with current code. If the replay result changes after a fix, the bug was in those stages. If it does not, the bug is upstream in S3 or in the data.

### 9.3 Symptom table

| Symptom | First stage to check | First thing to check |
|---|---|---|
| "No passage available" | S1 | `bank.json` empty, or all passages `draft` and `ALLOW_DRAFT=0` |
| Same passage repeats | S1 | seen-list logic, level progression |
| Correct reading scores low | S3, then S4 | print the raw transcript, then the alignment |
| Score is 0 with a good transcript | S4 | normalization, stray non-Latin characters, apostrophes |
| Everything defers | S5 | `CONF_MIN` too high, or S3 returning confidence 0 |
| Child omitted a word but got `auto_ok` | S3 | model "corrected" the speech (false-correct). Inspect word timestamps and eval set |
| Feedback mentions unknown words | S6 | prompt constraint, fallback to template (violates I1) |
| Dashboard empty or stale | S7 | rows exist, `machine_verdict` populated |
| Facilitator confirm changes machine score | S7 | violates I8, check the update statement |
| Mic works locally, fails on Vultr | S2 | HTTPS required for microphone, Caddy domain and ports 80 and 443 |
| Works locally, fails on Vultr | Infra | `.env` present, API keys set, `docker compose logs sp-api` |
| Groq works, local Whisper fails | S3 | image built with `WITH_LOCAL_STT=1`, ffmpeg present |

### 9.4 Health checks

`GET /health` returns service status. `GET /health/deps` reports for each of: database reachable, bank loaded (count by status), Groq key present, Gemini key present, local Whisper available. Run it first whenever behaviour is unexpected.

---

## 10. Running locally on Docker

Prerequisites: Docker Desktop with Compose.

```bash
git clone <your repo> SP && cd SP
cp .env.example .env          # all keys optional
make up                       # docker compose up --build
open http://localhost
```

Optional: set `GROQ_API_KEY` and `GEMINI_API_KEY` in `.env`. For local Whisper: `WITH_LOCAL_STT=1 make up`.

| Variable | Default | Meaning |
|---|---|---|
| `GROQ_API_KEY` | empty | enables primary STT |
| `GEMINI_API_KEY` | empty | enables model-written feedback |
| `GEMINI_MODEL` | `gemini-2.0-flash` | verify against your key, names change |
| `CONF_MIN` | `0.6` | defer below this, tune on eval set |
| `CONF_HIGH` | `0.8` | needed for an automatic practice verdict |
| `ALLOW_DRAFT` | `1` in `.env.example` (development) | serve draft passages with a visible banner. Set `0` for the submitted demo once passages are validated |

With no keys set, SP still runs: speech returns empty, the gate defers, and the facilitator confirms. The typed-reading box in the UI exercises S4 to S8 without a microphone.

---

## 11. Evaluation (CRISP-DM mapped to this repo)

| Phase | What we do | Output | Lives in |
|---|---|---|---|
| 1. Business understanding | Problem, precedents, gaps, success measures | literature review, claim boundaries | `docs/literature_review.md` |
| 2. Data understanding | Inspect passages and audio samples | notebook findings | `notebooks/` |
| 3. Data preparation | Build and validate bank and eval set | `bank.json`, `eval_samples.csv` | `data/`, `tools/` |
| 4. Modelling | STT, alignment, gate, level progression | working S3 to S5 | `api/app/` |
| 5. Evaluation | Run `tools/run_eval.py` | results table below | `data/eval/results/` |
| 6. Deployment | Vultr, public URL, demo video | live system | `deployment` section 13 |

**Results table to fill (the submission's strongest slide):**

| Engine | WER | False-wrong rate | False-correct rate | Deferral rate | Samples |
|---|---|---|---|---|---|
| Groq Whisper | | | | | 20 |
| Local faster-whisper | | | | | 20 |

Definitions: false-wrong = human verdict correct, machine auto-negative. False-correct = human verdict incorrect, machine auto_ok. Both are computed only on samples with a human verdict other than `uncertain`. With 20 adult samples these numbers are indicative, not generalisable, and must be reported that way.

---

## 12. Reading Bank governance

A passage moves to `validated` only when all are true:

1. A named Kiswahili reviewer checked text and orthography.
2. Band assignment has a written reason tied to a framework or curriculum criterion.
3. Word count, sentence count and difficult-word fields are complete.
4. Decodability and morphology reviewed for the band.
5. Language, cultural and child-safety reviews all `pass`.
6. Source, licence, adaptation, audio and public-repo rights recorded and verified.
7. `text_normalized` matches the canonical text after the normalization rule.
8. Any image or comprehension question separately reviewed.
9. A second person checked the passage-to-metadata link.

`tools/validate_bank.py` checks what a script can check (items 3, 6 and 7, plus I10). Humans check the rest.

**Hackathon reality:** if full validation cannot be completed by the deadline, every passage stays `draft` or `review`, the demo runs with `ALLOW_DRAFT=1` and a visible banner, and the submission says so plainly. A smaller honest bank is stronger than a larger one that cannot be defended.

Content to avoid in learner-facing text: graphic violence, loss, hunger or displacement detail, political, ethnic or religious stereotyping, brands, identifiable real children, and prompts asking a child to disclose personal experience.

---

## 13. Deploying on Vultr

The same compose file runs everywhere.

1. Create a Cloud Compute instance (Ubuntu) and install Docker.
2. `git clone` the repo, `cp .env.example .env`, add keys.
3. Edit `Caddyfile`: replace `:80` with your domain or `<server-ip>.sslip.io`. Caddy then issues HTTPS automatically. HTTPS is required for the microphone.
4. `docker compose up -d --build`.
5. Test the public URL in a private browser window, including the microphone.

What runs on Vultr: proxy, API, database, local Whisper fallback, retrieval, scoring and gate, generated assets, dashboard. Record the Vultr console and a live request in the demo video.

---

## 14. Privacy and safeguarding

- Audio is processed in memory and discarded (I3). It is never written to the database or repository.
- Learners are pseudonymous codes only (I4). No names, phone numbers, schools, locations or dates of birth.
- Stored transcripts are pseudonymous, retained only as long as the retention policy states, and deletable by learner code.
- Evaluation recordings are adult proxies unless ethical approval, guardian consent and child assent are documented. They are stored outside the repository with a stated deletion date.
- The code-to-child key, if any, is held by the facilitator or partner, not by SP.
- The Convention on the Rights of the Child (best interests, privacy) is the baseline reference. Local research and safeguarding rules apply on top.

---

## 15. Channels and status

| Channel | Source | Status |
|---|---|---|
| Smartphone PWA with microphone | Reading Bank | Built |
| Offline cache (service worker) | Reading Bank | Next |
| Printable activity card (PDF) | Reading Bank | Next |
| Radio audio lesson (MP3) | Reading Bank plus pre-generated TTS | Next |
| SMS and USSD coordination | Reading Bank | Simulated (Africa's Talking sandbox) |
| Languages other than Kiswahili, live carrier integration, field pilot | | Roadmap |

Every channel reads the one Reading Bank (I6). A lesson validated once reaches every channel.

---

## 16. Open decisions (record answers in `docs/decisions.md`)

| # | Decision | Needed by | Answer |
|---|---|---|---|
| D1 | Target population: Kenya Grade 1 to 2, or 1 to 3 | before writing passages | |
| D2 | Language profile: Kiswahili L1, L2 or mixed | before writing passages | |
| D3 | First assessment: oral reading only, plus decoding, plus comprehension | before schema freeze | |
| D4 | Named Kiswahili validator and review date | before bank freeze | |
| D5 | Passage source and licence policy | before writing passages | |
| D6 | Bank size: 10, 18, 24 or 30 | before bank freeze | |
| D7 | Evaluation readers: adult proxy only, or approved child recordings | before recording | |

Until D1 to D5 are answered, passage writing is a draft activity.

---

## 17. Build order

1. Run the starter in Docker and confirm the loop works end to end.
2. Move the code into the stage folders in section 8, with `contracts.py`.
3. Fix S7 (separate machine and human columns, add `trace_id` and `stage_log`).
4. Replace S4 with word-level alignment. Replace S5 with the rule set in 6.5.
5. Add `validate_bank.py` and the bank schema. Load the bank from `bank.json`.
6. Write the invariant tests (section 7).
7. Record the 20-sample evaluation set, run `run_eval.py`, fill the results table.
8. Add print card, radio MP3 and the SMS/USSD simulation.
9. Deploy to Vultr as soon as credits arrive. Do not wait for the bank to be final.
10. Demo video, screenshots, diagram, submission. Submit at least an hour before the deadline (09:30 EAT on Sunday 15 November, which is 12:00 IST).

---

## 18. References

- UNESCO Institute for Statistics, Global Proficiency Framework for Reading, Grades 1 to 9.
- Kenya Institute of Curriculum Development, Lower Primary curriculum designs (Kiswahili).
- RTI International, Early Grade Reading Assessment (EGRA) Toolkit, Second Edition.
- Research on nonword decoding and listening comprehension in Kiswahili among beginning readers (ScienceDirect, 2021).
- UN Convention on the Rights of the Child.
- Google Read Along design notes on false positives and false negatives (Android Developers Blog, 2020).

URLs are recorded in `docs/literature_review.md` and must be re-checked before they are quoted in the submission.

## 19. Credits

FastAPI, PostgreSQL, Caddy, Docker, Groq Whisper, faster-whisper, Gemini, Hugging Face, Africa's Talking, Vultr. Add every library and API you use here, as the HackGlobal rules require.
