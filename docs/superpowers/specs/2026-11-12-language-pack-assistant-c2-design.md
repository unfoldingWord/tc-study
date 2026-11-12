# C2: the assistant without a model — design

Date: 2026-11-12. Phase C2 of the Consumidores tab of "tc-language-packs: contrapropuesta para la próxima versión mayor"
(https://claude.ai/artifact/5Vw6P8Bm3bo51VkTRwsuPA). It builds on C1, `@bt-synergy/language-pack-client`.

Ownership: shared work, in a uW repo. By Abel's rule for format 3, Claude writes all of it; Cursor takes no part.

## Goal

A person types a question in their own words. The library turns it into one of the eight queries of C1, with its
arguments, without a language model, and answers with a card ("la ficha") of cited pieces. Apps (Servos first) show
the card. The product passes its tests with no model installed.

## The gate (from the tab)

Measured per language on a held-out question set:

| Measure | Target |
|---|---|
| Calls correct (the right query and arguments, or a choice that holds the right one) | ≥ 90 % |
| Correct among the calls the chain accepts without asking, and how many it accepts | ≥ 98 % |
| Expected piece among the card's first 3 | ≥ 80 % |
| Card time, question to card, on the desktop (the phone is C3's job) | < 300 ms; median and 95th percentile reported |

## Decisions Abel made on 2026-11-12

1. **Languages.** The gate is measured in es-419 and in English, the two languages staging has packs for. Portuguese
   questions are measured and reported but do not count: there is no Portuguese pack, so the chain has no Portuguese
   names (C0 got 76 %). Portuguese counts once a Portuguese map exists.
2. **Classifier.** A naive Bayes classifier on word and character n-grams, as in C0, in TypeScript. It is trained with Bun
   at build time and saved as a small JSON file per language. It does not use fastText, the `.ftz` format or Python.
3. **Complements.** C2 generates the complement files (classifier and number words per language) and commits them in the
   package; an app loads them from bytes. Delivering complements through the catalog is a separate, later task: a route
   in `serving.md`, the Worker, install in the client, the pipeline and an upload to staging.
4. **Questions.** Claude writes a new, held-out test set of 150 questions per language, with the expected call and the
   expected pieces, and freezes it (a commit) before any rule is tuned. C0's questions become the tuning set. Abel reviews
   the Spanish test set before the gate is measured.

## Decisions Claude makes here (Abel may overrule)

5. **A new package**, `packages/language-pack-assistant` (`@bt-synergy/language-pack-assistant`), on top of the client.
   The client keeps reading and querying; the assistant decides and composes. The client gets two changes only: stems
   and the new fragment kinds in its search index.
6. **The language detector is left out of C2.** `ask` takes the language the app gives. The app knows the person's
   language, and a person who writes in another one is the detector's case, which needs `lid.176.ftz` and a fastText
   reader. That goes with the complements task or C6.
7. **Snowball** stemmers for Spanish, Portuguese and English are vendored from snowballstem.org's JavaScript output
   (BSD-3-Clause). The license file goes with them. Other languages keep exact word matching, as they do today.
   The tab's trigram fallback is left for later.
8. **Number words** come from CLDR's rule-based number format (`spellout-numbering` in `cldr-rbnf`, Unicode License). A
   build script evaluates the rules for 1 to 200 and writes a `numbers` complement per language. Digits work without
   the complement.
9. **Query names stay English in code** (C1, decision 5). The interpretation shown to the person uses the Spanish
   labels of `schemas.json` and adds Portuguese and English ones.

## The parts

### 1. Stems in the search index (client)

- `stem(lang, word)`: picks Snowball by the base language tag (`es-419` → Spanish, `pt-BR` → Portuguese, `en` →
  English). For any other language it returns the folded word unchanged.
- **`sqlIndex`:** a second FTS5 column, `stems`, holds the stems of the body.
  - Each query word matches `body:"word" OR stems:"stem"`.
  - A `meta` table holds the index version. If the version differs, the index drops its tables and rebuilds them, and
    `has(seg)` answers false so the client indexes the book again.
- **`memoryIndex`:** each token keeps its stem, and a word matches either form.
- The tests take the stemmers' published vocabulary samples (a few hundred words per language) and check that
  "gracia" finds "gracias" while the snippet keeps the original word.

### 2. Fragments (client index, assistant view)

- **The index gains two row kinds:**
  - `section`: one row per section of an installed tW or tA article. It carries the article id, the section id and its
    role.
  - `frame`: one row per OBS frame, when OBS is installed.
- **When they are indexed:** articles and OBS are indexed when their units are installed or imported, the same way books
  are. The `search` filters and its schema list the new kinds.
- **The `Fragment` type** (in the assistant) is the one shape of a piece in a card:
  `{ id, kind, title, ref?, concepts[], length, cite, license, link }`.
  - It is built from a query answer or a search hit. It is never stored.
  - Its `id` is stable: `note:<book>/<rowid>`, `question:…`, `section:tw:kt/grace#<sid>`, `verse:<res> tit 2:11`,
    `frame:obs 4:2`.
  - `link` is a typed link the app can open: `ref:`, `concepto:`, `articulo:<id>#<role>`, `pieza:<id>`.

### 3. The lexicon (assistant)

The lexicon is built once per opened reader, from the maps on the device. The language adds no new data.

- **Books:** the 66 names of the map core (name, short name, abbreviation), plus the book codes.
- **Concept names:** the map core's `names` (tW titles split at commas, tA titles, names of topics) and its tA
  `subtitles`, plus the ids the `xmap` aliases point to. A concept the language does not name falls back to the
  English title of `xtopics`, marked as such.
- **Folding and stems:** names are folded (lower case, no accents) and stemmed. Matching is exact on the stems,
  with no edit distance; C0 showed that guessing by spelling gives false hits.
- **Ambiguities:** a book name that is also a person's name ("Juan", "Rut") is listed when the lexicon is built.

### 4. The chain (assistant)

`decide(question, ctx) → Decision`. The steps run in order, and the first step that decides wins.

1. **Rules and dictionaries.** This step recognizes:
   - references (book plus digits, or number words from the `numbers` complement: "Tito dos once");
   - Strong numbers;
   - lexicon names and the fixed phrases of the language.

   Fixed phrases are about 50 per language, in `phrases/<lang>.json`. They are keyword lists per query, like C0's.
2. **Classifier.** It runs on the question with its names masked (`ref`, `tw`, `name`, `ta`, `strong`, `cat`,
   `book`). It is accepted when the top probability leads the second by at least a margin; the margin is set on the
   tuning set and frozen before the test.
   - The classifier is trained from templates. About 100 English templates are written once, marked with their query,
     and translated to Spanish and Portuguese by Claude. They live in `templates/<lang>.json`.
   - The trained models are in `models/<lang>.classifier.json`. A test checks that training again gives the same bytes.
   - With no classifier for the language, step 2 is skipped.
3. **When in doubt,** the chain offers two or three options.
4. **Otherwise** it sends the original question to `search`.

`Decision` is one of these:
- `{ kind: 'call', query, args, via: 'rule' | 'classifier' | 'search', interpretation }`;
- `{ kind: 'choose', options: Call[], interpretation }`.

`interpretation` is short, in the person's language, built from the labels. The app shows it and lets the person correct
it.

### 5. The card (assistant)

`ask(reader, question, { lang, complements }) → Card`. It runs `decide`, calls the reader's query and composes the card.

- **What a card holds:**
  - the decision and its interpretation;
  - `pieces`, ranked fragments (8 by default);
  - `missing`, from `notInstalled`, with the book, unit and bytes;
  - `coverage`, so "no matches" is not confused with "resources missing to know";
  - `elapsed` in milliseconds.
- **Ranking, per query:**
  - `passage`: the verse text first, then the notes in verse order, the questions, then the word links.
  - `concept` and `article`: the default section first (the definition), then the article's other sections, then where
    the concept is used.
  - `renderings`: the renderings by count.
  - `books`: the books by count.
  - `topics`: the topics.
  - `search`: the hits by score, mixed kinds.
- **What a card never holds:** text that is not in a segment, or an id or link that the answer did not give.
- `choose`: the card has no pieces, only the options, each with its interpretation.

### 6. The gate harness (assistant, `eval/`)

- **The question sets:**
  - `eval/questions/<lang>-tune.jsonl`: C0's questions, rewritten to the English query names.
  - `eval/questions/<lang>-test.jsonl`: the new held-out set, 150 questions for each of es, en and pt. One line is
    `{ q, expect: { call } | { choose: [...] } | { search: true }, pieces: [ids] }`.
  - The sets include questions with no answer and ambiguous questions.
- **Freezing:** the test set is committed before any tuning commit. Its commit is named in the results, and a change to
  it after the freeze needs a new freeze commit that says why.
- **The packs:** the runner downloads es-419 and en from staging with GET requests only, into a cache folder outside the
  repo. It verifies the signatures with the staging key and installs every book staging has.
- **The runner:** `bun eval/run.ts --lang es-419 --set test` writes `eval/results/<lang>-<set>.json` (every question,
  its decision and the top 3 pieces) and a summary row. A report in `eval/RESULTS.md` gives the gate table per language.
- **What the suite checks:** the harness itself is tested on fixtures in CI. The staging run is opt-in, as in C1.

## Errors and edges

- An empty question, or one with only punctuation, gives `search` with no hits. It is not an error.
- A query whose unit is not installed gives a card with no pieces, with what is missing and its size. It is not an
  error.
- Missing complements (no classifier, no numbers) make the chain skip the step that needs them; the rest works.
- A complement whose `for` names another version of the queries is refused with `E_COMPLEMENT`, and the chain runs
  without it.

## Testing

- The unit tests cover:
  - stems: the vocabulary samples, and the SQL and memory indexes;
  - the fragment kinds;
  - the lexicon on the spec fixtures;
  - each rule;
  - classifier training, which must be deterministic;
  - the card ranking.
- The client's existing suites stay green. The index version change gets a test that an old index is rebuilt.
- The gate run on staging packs is the acceptance test. It is not part of CI.

## Out of scope

- Delivering complements through the catalog: the route, the Worker, the client install and the upload.
- The language detector.
- Any model (C6, C7).
- The `context` budget for a model.
- Servos wiring: a screen for the assistant, the `choose` UI, correcting the interpretation, and a `SqlDriver` that
  creates the `stems` column. That is a later Servos step. The plan's last task writes down what Servos needs.
- The Worker's word search (open decision 5 of the tab).
- The trigram search for languages without Snowball.
- A Portuguese map.
