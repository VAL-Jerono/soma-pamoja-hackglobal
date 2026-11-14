# Learning framework

## Scope

The first release targets early-grade literacy, initially Grades 1 to 2. The architecture is language-neutral. Content language, learner home language, instructional language, and facilitator interface language are separate fields.

The initial content item is Kenyan standard Kiswahili tagged `sw-KE`, but this is a content decision, not an architecture restriction. Future language packs must define their own orthography, grapheme sequence, syllable or word structure, curriculum reference, and accepted variants.

## Content types

### Full reading passages

Full passages support connected-text reading and optional comprehension. The provisional engineering limits are:

| Band | Words | Purpose |
|---|---:|---|
| A | 20 to 45 | Word and sentence entry |
| B | 45 to 90 | Short connected text |
| C | 90 to 150 | Developing fluency and comprehension |

These are operational limits, not universal language benchmarks. Level assignment also considers decoding, vocabulary, morphology, syntax, punctuation, comprehension demand, and curriculum alignment.

### Micro-reading items

Micro-items support letter-sound recognition, syllables, familiar words, nonwords, and sentence reading. Their length is not forced into the passage bands. Each micro-item carries an explicit `item_skill` and its own review status.

### Technical fixtures

Fixtures are synthetic or minimal examples used to test normalization, alignment, gates, and invariants. They are never served to learners unless separately authored as micro-items.

## Validation rationale

A content item can be technically valid but instructionally unsuitable. Structural validity checks fields, IDs, normalization, character policy, and derived counts. Instructional validation checks the intended skill and difficulty. Human language, rights, cultural, and safety reviews determine whether the item can be released.

The GPF is used as a descriptor-level alignment reference. It is not treated as a Kiswahili-specific edition. A curriculum reference must identify its edition or year. A passage is not automatically assigned a level from word count alone.

## Assessment scope

The planned assessment family includes oral reading, decoding items, and facilitator-read listening comprehension. The initial runtime may expose only the components for which content and validation are complete. Correct words per minute may be computed from duration, but no benchmark claim is made without a pinned source and definition.
