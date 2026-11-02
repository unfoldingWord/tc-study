# Language packs format 3, phase 2 (the maps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the common map (`xmap`) and the language map (`map`) of format 3 from the sources phase 1 already reads, read them with both readers, and answer the fixed queries from the maps alone.

**Architecture:** One count codec (`counts`, `verse-lists`, `coverage`) shared by both classes. Builders split in three layers: tallies (pure functions over models and rows: what to count), segment writers (a model to a `Segment`) and wiring (`buildCommon` builds `xmap` beside the `orig` segments; `buildLanguage` builds `map` and so resolves `needs: "map"`). Views (`xmapView`, `mapView`) are the inverse of the writers, so every writer is tested by a round trip. A small query module answers the fixed queries over the views, with the four states of `counts.md`.

**Tech Stack:** TypeScript on Bun (`bun test`, `tsc --noEmit`), pako 2.1.0, the hand-written CBOR codec of phase 1; Python 3.11 with pytest for the independent reader (`spec/reader-py/lp3read.py`).

**Spec:** `packages/language-pack-v3/spec/` (README, `counts.md`, `catalog.md`, `ids.md`, `cddl/map.cddl`, `cddl/xmap.cddl`, `cddl/common.cddl`, `tests/README.md`). Design: the proposal document, tabs Paquetes ("Lo que el mapa contesta", "El mapa de conceptos y sus fuentes") and Plan ("Fase 2"). Phase 1 rulings: `.superpowers/sdd/2026-11-01-language-pack-v3-phase1/progress.md` and "Deviations from this plan" at the end of `docs/superpowers/plans/2026-11-01-language-pack-v3-phase1.md`.

## Scope: part A now, part B behind a gate

The design's phase 2 has two halves with different inputs:

- **Part A (this plan, Tasks 1–20)** uses only what phase 1 reads and the phase 0 sample holds: the originals of all 66 books, the English notes and word links of 59 books, tW and tA of each language, and the language's own books and OBS. It builds the Strong counts, the concepts of `tw:` and `ta:` (and `obs:` story ids when a language has OBS), Academy usage, the word-link counts, the key-term candidates, coverage, book names, concept names and subtitles, both readers, conformance cases 5 (map half), 6, 11 and 12, the fixed queries, invalidation and the size gate.
- **Part B (after Abel approves `spec/fuentes.md`)** adds the sources outside unfoldingWord and the topics: TIPNR (`per:`, `lug:`), Theographic (`ev:`), English OBS story ranges, outline sections (`sec:`), the `topics` tables of both maps, relations and the queries `per:abraham` and `ev:plagas-egipto`. Its files must be downloaded, and two licenses need Abel's review, so its tasks are written in an addendum once he has approved the sources and the files are on disk. Task 1 writes `spec/fuentes.md`, which is what he approves.
- **Not in phase 2:** verse equivalences (`map` `numbering`) stay reserved; MACULA referents in the counts; OpenBible cross references (they do not fit in 2 MB). The spec's open items say so (Task 20).

Until part B lands, the fixed query on Abraham uses `tw:names/abraham` (the word-link concept, as phase 0 measured), and the query on the plagues is not run.

## Global Constraints

Everything in the phase 1 Global Constraints still holds (`.superpowers/sdd/2026-11-01-language-pack-v3-phase1/global-constraints.md`, with the phase 1 deviations: nesting ≤ 64, integers −(2^53 − 1) .. 2^53 − 1, the trailer below). In addition:

- Branch `feat/language-pack-v3-phase2`, created from `feat/language-pack-v3-spec` at `7fcc7f2`. Commits stay local; no push, PR, merge or publish without Abel's yes.
- Commits: English, a short title and a body that says why, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (implementers) or the controller's own model line.
- Tests run from `packages/language-pack-v3`: `bun test <file>` and, once before each commit, `bun test` and `bun run type-check`, output to a file (`.claude/lp3-controller.md`).
- Python: `C:\Users\LENOVO\Git\Github\wt\lp3-venv\Scripts\python.exe -X utf8` (cbor2 and pytest). `LP3_PYTHON` points at it for `compare.ts` and the conformance test.
- Real-data checks read the phase 0 sample through `LP3_SAMPLE=C:\Users\LENOVO\Git\Github\wt\fase0-paquetes\muestra` (`en/list.json`, `es-419/list.json`, `originals/list.json`, `parts/`). A test that needs it is skipped with a message when `LP3_SAMPLE` is not set. Nothing from it is committed except the fixtures Task 9 copies.
- Builders and readers under `src/` import no Node module; Node-only code goes in `src/node/` or the CLI.
- Count semantics are `counts.md`, verbatim: a Strong three times in one verse is 3 occurrences and 1 verse; a note on 1:2-4 is 1 note and 3 verses; two notes on one verse are 2 notes and 1 verse; an introduction covers its own id (verse 0); a row whose reference cannot be read covers no verse and still counts.
- English notes (`xmap` `notes`) and a language's notes (`map` `usage`) are never added together.
- Book numbers and verse ids: `ids.md` (`tit` is 56; verse id `LLCCCVVV`). Strong keys: `strongKey` of `src/ids.ts` (Hebrew after the last `:`, with its letter suffix; Greek as published, `G54850`). A lookup of `G5485` also tries `G54850`.
- Keys of every map table and every `names`, `subtitles`, `aliases` and `strongs` map are sorted by code point (`compareCodePoints`).
- Size gate: the common map (core and 66 parts) plus the es-419 map (core and parts) ≤ 2 MB compressed (2 097 152 bytes), measured on the sample.

## Review Focus

1. **A range across chapters and a range that ends in a verse the original lacks.** `1:12-2:3` covers every verse the original has from 1:12 to 2:3; a range whose end the original lacks still covers the verses it has. Test in Task 6 (`expandRange`).
2. **Strong keys with a letter suffix and the Greek padding.** `H7462b` is its own key, not `H7462`; a query for `G5485` finds `G54850`. Tests in Tasks 6 and 15.
3. **Zero, no source and partial for the same key.** Titus (a count), Jonah (zero: the source covers it whole and has no row), Isaiah (no source), a bridged pack's book (partial: the answer says "at least"). Tests in Tasks 15 and 16.
4. **A map part that changes only when its own verses change.** A new release stamp of a resource, or a note on another book, leaves a book's part with the same id. Parts carry no release stamps (Task 1). Test in Task 19.
5. **Article ids with capitals and unreadable references.** A SupportReference `rc://*/ta/man/translate/figs-orderHeb` counts under `ta:translate/figs-orderheb`; a row with an unreadable reference counts 1 and covers no verse, with one report line. Test in Task 7.

---

## Before Task 1 (controller)

- Ledger: `.superpowers/sdd/2026-11-02-language-pack-v3-phase2/progress.md`, started with the header of the phase 1 ledger (plan path, spec, worktree, branch, start HEAD, Python, trailer). Copy the Global Constraints above to `global-constraints.md` beside it. Carry the phase 1 rulings that still bind (`rulings-so-far.md`) by reference, not by copy.
- `.claude/agents/lp3-implementer.md` names the phase 2 branch (done while writing this plan).
- Dispatch order: Tasks 1–20 in order. Tasks 6, 7 and 8 do not depend on each other and may run in parallel only if their files do not overlap (they do not); everything else is sequential. Hand off after every 3 or 4 tasks (`.claude/lp3-controller.md`).
- Codex (read-only, recipe in the Servos memory `codex-cli-windows.md`) reviews Task 1 (the spec) and Task 2 (the count codec), together with the Sonnet reviewer. If Codex refuses or has no tokens, an Opus reviewer takes its place.

---

### Task 1: The specification of the maps

**Files:**
- Modify: `packages/language-pack-v3/spec/cddl/map.cddl`, `spec/cddl/xmap.cddl`, `spec/cddl/common.cddl`
- Modify: `packages/language-pack-v3/spec/tests/README.md` (section "`map`, `xmap` (phase 2)", the phase 1 reader paragraph, "Checks of the tables")
- Modify: `packages/language-pack-v3/spec/catalog.md`, `spec/ids.md` ("Sections of articles"), `spec/container.md` (only if the row limit needs a line there)
- Create: `packages/language-pack-v3/spec/fuentes.md`, `spec/tests/queries/README.md`

**Interfaces:**
- Produces: the text every later task implements. No code.

- [ ] **Step 1: Self-contained parts.** In `common.cddl` replace `verse-lists = uvarints` with
  `verse-lists = { "keys": strtab, "verses": uvarints }`: the keys this book has, sorted by code point; `verses` holds, per key in that order, the number of distinct verses `n ≥ 1`, then `n` values, each verse id mod 1 000 000 minus the previous value of the same key (the first minus 0). The book is the header's `book`. Why, in a comment: a part numbered against the core's key table would change in all 66 books whenever one key is added anywhere.
- [ ] **Step 2: No release stamps in parts.** `map.cddl` and `xmap.cddl`: a part's header has `res: []` (`xmap-header` `res` becomes `[* [tstr, tstr]]`, with the comment "every source in the core; empty in a part"). The release of each source is in the core and in the catalog. Why: a new release of English tN must not change the 59 parts whose verses did not change.
- [ ] **Step 3: New xmap table.** `? "strongs": { * concept-id => [+ tstr] }`, optional, v1: for each `tw:` concept, the Strong keys of the original words its English word links quote, sorted by code point. It is what the key-term candidates of a book are found with.
- [ ] **Step 4: Counts rules.** In `common.cddl` beside `counts`: a key lists at least one book; book numbers strictly increase within a key (the first delta ≥ 1, the others ≥ 1); `1 ≤ count`, `0 ≤ verses ≤ count`. The `unit` of each table is fixed: `xmap` `strong` "occurrences", `links` "links", `notes` "notes"; `map` `usage` "notes".
- [ ] **Step 5: Reader output of `map` and `xmap`.** Replace the phase 2 sketch in `tests/README.md` with full tables, in the style of the other classes:
  - `xmap` core: `coverage` `{source: {"whole": [books], "partial": [books]}}` (`partial` absent when the file has none; books as codes in canonical order); `strong`, `links`, `notes` as `{"unit": text, "rows": {key: {book: [count, verses]}}}`; `concepts` as `{id: {"kind": k, "tw": t, "source": res key}}` with `k` in `none person place event topic story` and `t` in `none kt names other`; `relations` as a list of `{"from", "to", "type", "source", "confidence"}` (ids and res key as text); `aliases` and `strongs` as the file has them; `topics` as the file has it (bytes in hex).
  - `xmap` part: `strong`, `links`, `notes` as `{key: [verse ids]}`, full `LLCCCVVV` ids.
  - `map` core: `books` as a list of 66 `[name, short, abbreviation, source]`; `names`, `subtitles` as the file has them; `coverage` as in `xmap`; `usage` as a counts table; `obs` as a list of `[story, title]`; `topics`, `numbering` as the file has them.
  - `map` part: `usage` as `{key: [verse ids]}`.
  - "What a phase 2 reader knows": `map`: `books names subtitles coverage usage obs` at v1; `xmap`: `coverage strong concepts links notes relations aliases strongs` at v1. `topics` and `numbering` are not known yet (optional, skipped). `gen` stays `E_TABLE`.
- [ ] **Step 6: `E_BODY` checks of the maps,** added to "Checks of the tables": keys not sorted or repeated; a counts column cut short, with numbers left over, a book number outside 1..66 or not increasing, `count = 0` or `verses > count`, a key with no book; a wrong `unit`; a verse list with `n = 0`, a value whose verse id is not increasing within its key, or a column cut short or with numbers left over; `concepts` columns of different lengths, `kind > 5`, `tw > 3`, `source` outside `h.res`; `relations` that name a concept outside `concepts`, a type outside `types`, a source outside `h.res`, confidence above 100; `books` not 66 or a `source` outside `text list none`; a part whose `book` is not its `part`, a core with a `book`; a core table in a part or a part table shape in a core. The header needs `part` (both) and `lang` (`map`).
- [ ] **Step 7: The phase 2 open items of `spec/README.md` get their answer in the spec text** (Task 20 updates the README table):
  - OBS `frame`: a help row whose story is outside 1–50 or whose frame is outside 0–99 is `E_BODY` (`tests/README.md`, `obs`).
  - Row counts: a table whose declared row count `n` is larger than the segment's `ulen` is `E_BODY` (a reader allocates no more rows than the body has bytes).
  - Equal headings: `ids.md` "Sections of articles": when two sections of one article would get the same sid, the later one (in the order of the article) gets `-2`, the next `-3`, unless the registry already gave it a sid.
  - A bridged article starts with an empty registry: its section ids are those of a first build, local to the device, and a later published catalog replaces them. A map never names a section, so the maps do not depend on them.
  - A bridged book names the original's stamp; its unit needs `orig:<book>` as any book does, so a device without that original does not activate it (`catalog.md`, Activation).
- [ ] **Step 8: `catalog.md`.** The `map` unit holds the language map core and its parts, and needs nothing; the `xmap` unit, in the common catalog, holds the common map core and its parts, and needs nothing. A book's `needs: "map"` is now satisfied by its own catalog. The table "What changes when an input changes" stays as written; add the row "A new release stamp of a resource, with the same rows: the segments that list it in `res`, the cores, the catalog; no map part".
- [ ] **Step 9: `spec/fuentes.md`.** One row per source, with its version or release, its license, what it gives, which map it goes in, and its status: "in the sample" (UHB, UGNT, MACULA, English tN and tWL of 59 books, tW, tA, es-419 resources) or "needs Abel's approval and a download" (STEPBible TIPNR, CC BY 4.0; Theographic Bible Metadata, CC BY-SA 4.0; English OBS; Nave's Topical Bible, public domain). Take versions and licenses from the lists in the sample (`metadata`) and from the Paquetes tab; write "to confirm" where the source does not say.
- [ ] **Step 10: `spec/tests/queries/README.md`.** A fixed query is a file `<name>.json` `{"query": {"kind": ..., ...}, "expected": ...}`. Kinds: `strong` `{key}`, `concept` `{id}`, `usage` `{concept, source}`, `book` `{book}`, `keyterms` `{book}`, `revision` `{concept, book}`. The answer of each kind is written as JSON in the same canonical text as reader output, with the state names `count`, `zero`, `none`, `partial`. Answers are computed by `answers.py` from the raw parts, not from the builders (Task 17); the TypeScript query module (Task 15) must give them (Task 18).
- [ ] **Step 11: Commit** `spec: the maps of format 3 (parts on their own, no stamps in parts, strongs, reader output, open items)`, body with the two reasons of Steps 1 and 2.

### Task 2: The count codec

**Files:**
- Create: `packages/language-pack-v3/src/codec/counts.ts`
- Test: `packages/language-pack-v3/src/codec/counts.test.ts`

**Interfaces:**
- Consumes: `encodeUvarints`, `decodeUvarints`, `compareCodePoints`, `ColumnError` (`src/codec/columns.ts`); `BOOKS`, `bookNumber`, `bookSet` (`src/ids.ts`).
- Produces:
  - `export type CountUnit = 'occurrences' | 'links' | 'notes'`
  - `export type CountRows = Map<string, Map<string, [count: number, verses: number]>>` (key → book code → pair; books iterate in canonical order)
  - `export type VerseLists = Map<string, number[]>` (key → full verse ids, ascending, distinct)
  - `export type Coverage = Map<string, { whole: string[]; partial: string[] }>` (source key → book codes in canonical order)
  - `encodeCounts(unit: CountUnit, rows: CountRows): { unit: CountUnit; keys: string[]; counts: Uint8Array }`
  - `decodeCounts(t: unknown, unit: CountUnit): CountRows` (throws `ColumnError` for every counts rule of Task 1 Step 4 and Step 6, and for another `unit`)
  - `encodeVerseLists(book: string, lists: VerseLists): { keys: string[]; verses: Uint8Array }`
  - `decodeVerseLists(book: string, t: unknown): VerseLists`
  - `encodeCoverage(c: Coverage): Record<string, Uint8Array[]>` (partial left out when empty)
  - `decodeCoverage(t: unknown): Coverage`

- [ ] **Step 1: Write the failing tests** in `counts.test.ts`:
  - `encodeCounts('occurrences', new Map([['G54850', new Map([['rom', [3, 2]], ['tit', [2, 1]]])]]))` gives `keys` `['G54850']` and `counts` equal to `encodeUvarints([2, 45, 3, 2, 11, 2, 1])`; `decodeCounts` of it gives the same map.
  - Keys are written by code point: `['\uFFFF', '\u{1D538}']` in that order whatever the insertion order.
  - `decodeCounts` throws `ColumnError` for: a book delta of 0 after the first book; a book number 67; `count` 0; `verses` 3 with `count` 2; a key with `b = 0`; numbers left over; a column cut short; unit `'links'` when `'occurrences'` was asked.
  - `encodeVerseLists('tit', new Map([['G54850', [56001001, 56001004, 56002011]]]))` gives `keys` `['G54850']`, `verses` = `encodeUvarints([3, 1001, 3, 1007])`; the round trip gives the same ids; book intro id `56000000` round-trips (value 0).
  - `decodeVerseLists` throws for `n = 0`, a repeated verse (delta 0 after the first), unsorted keys, leftovers.
  - `encodeCoverage(new Map([['unfoldingWord/en/tn', { whole: ['tit'], partial: [] }]]))` gives `{ 'unfoldingWord/en/tn': [bookSet(['tit'])] }`; with `partial: ['rut']` the list has two book sets; round trips.
- [ ] **Step 2: Run** `bun test src/codec/counts.test.ts > "$REPORT_DIR/test.log" 2>&1; tail -n 15 "$REPORT_DIR/test.log"`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the six functions in `src/codec/counts.ts`, arithmetic only (no 32-bit bit operations).
- [ ] **Step 4: Run** the test, then `bun test` and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `codec: counts, verse lists and coverage of the maps`.

### Task 3: The xmap model, writer and view

**Files:**
- Modify: `packages/language-pack-v3/src/model.ts` (add the xmap types)
- Create: `packages/language-pack-v3/src/build/xmap/segment.ts`, `packages/language-pack-v3/src/read/xmap.ts`
- Test: `packages/language-pack-v3/src/read/xmap.test.ts`

**Interfaces:**
- Consumes: Task 2; `Segment`, `LogicalHeader` (`src/codec/container.ts`); `stringTable` pattern of `src/build/book.ts`.
- Produces (in `model.ts`):
  - `export const CONCEPT_KINDS = ['none', 'person', 'place', 'event', 'topic', 'story'] as const`, `export const TW_CATEGORIES = ['none', 'kt', 'names', 'other'] as const`
  - `export type Concept = { kind: (typeof CONCEPT_KINDS)[number]; tw: (typeof TW_CATEGORIES)[number]; source: string }` (source is a res key)
  - `export type Relation = { from: string; to: string; type: string; source: string; confidence: number }`
  - `export type CountTable = { unit: CountUnit; rows: CountRows }`
  - `export type XmapCore = { part: 'core'; res: [string, string][]; coverage: Coverage; strong: CountTable; concepts: Map<string, Concept>; links?: CountTable; notes?: CountTable; relations?: Relation[]; aliases?: Record<string, string>; strongs?: Record<string, string[]> }`
  - `export type XmapPart = { part: string; strong: VerseLists; links?: VerseLists; notes?: VerseLists }`
  - `export const XMAP_TABLES: Record<string, number[]>` (in `read/xmap.ts`): the known tables and versions of Task 1 Step 5.
  - `xmapSegment(m: XmapCore | XmapPart): Segment` (header `class: 'xmap'`, `v: 1`, `part`, `book` = `part` in a part, `res: []` in a part; required flags as `xmap.cddl`)
  - `xmapView(seg: Segment): XmapCore | XmapPart` (throws `ColumnError`/`FormatError('E_BODY')` as phase 1 views do)

- [ ] **Step 1: Write the failing tests** in `read/xmap.test.ts`: a core with two sources, a `strong` table of two keys, three concepts (`tw:kt/grace` kt from res 1, `ta:translate/figs-metaphor` none, `obs:10` story), `links`, `notes`, one relation, `aliases` `{'tw:other/x': 'tw:kt/x'}` and `strongs` `{'tw:kt/grace': ['G54850']}` round-trips through `xmapView(xmapSegment(m))` deep-equal; a part `tit` with `strong` and `notes` round-trips and its header has `res: []` and `book: 'tit'`; the concept ids table is sorted by code point; each Task 1 Step 6 defect that belongs to `xmap` (concept columns of different lengths, `kind` 6, `tw` 4, `source` outside `res`, a relation to concept 99, confidence 101, a part whose `book` differs from `part`, a core with `book`) throws.
- [ ] **Step 2: Run** `bun test src/read/xmap.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, `xmapSegment` and `xmapView`. `concepts` is written as `ids` (strtab sorted by code point) and the three `uvarints` columns; `relations` with `types` as a strtab in first-use order.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `xmap: model, segment writer and view`.

### Task 4: The map model, writer and view

**Files:**
- Modify: `packages/language-pack-v3/src/model.ts` (add the map types)
- Create: `packages/language-pack-v3/src/build/map/segment.ts`, `packages/language-pack-v3/src/read/map.ts`
- Test: `packages/language-pack-v3/src/read/map.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3 (`CountTable`, `Coverage`).
- Produces:
  - `export type BookName = [name: string, short: string, abbreviation: string, source: 'text' | 'list' | 'none']`
  - `export type MapCore = { lang: string; part: 'core'; res: [string, string][]; books: BookName[]; names: Record<string, string[]>; subtitles?: Record<string, string>; coverage: Coverage; usage?: CountTable; obs?: [number, string][] }`
  - `export type MapPart = { lang: string; part: string; usage?: VerseLists }`
  - `export const MAP_TABLES: Record<string, number[]>` (in `read/map.ts`)
  - `mapSegment(m: MapCore | MapPart): Segment`, `mapView(seg: Segment): MapCore | MapPart`

- [ ] **Step 1: Write the failing tests** in `read/map.test.ts`: a core for `es-419` with 66 books (Titus `['La carta de Pablo a Tito', 'Tito', 'Tit', 'text']`, the rest `['', '', '', 'none']`), `names` `{'tw:kt/grace': ['gracia', 'amable'], 'ta:translate/figs-metaphor': ['Metáfora']}`, a subtitle, coverage of `es-419_gl/es-419/tn` whole `['tit']`, `usage` with unit `notes`, `obs` `[[10, 'Las plagas']]` round-trips; a part `tit` with `usage` round-trips with `res: []`; a part with no notes (`usage` absent) round-trips; defects throw: 65 books, a `source` `'web'`, `usage` with unit `occurrences`, a part table shape in the core.
- [ ] **Step 2: Run** `bun test src/read/map.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, `mapSegment` and `mapView`.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `map: model, segment writer and view`.

### Task 5: Reader output of the maps

**Files:**
- Modify: `packages/language-pack-v3/src/read/output.ts` (`KNOWN.map`, `KNOWN.xmap`, the output of both classes)
- Test: `packages/language-pack-v3/src/read/output.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4 (`XMAP_TABLES`, `MAP_TABLES`, the views).
- Produces: `readerOutput` gives the `map` and `xmap` outputs of Task 1 Step 5; `KNOWN.map = MAP_TABLES`, `KNOWN.xmap = XMAP_TABLES`, `KNOWN.gen` stays `{}`.

- [ ] **Step 1: Write the failing tests:** the output of an xmap core written by `xmapSegment` has `coverage.<src>.whole` as book codes, `strong.rows.G54850.tit` equal to `[2, 1]`, `concepts['tw:kt/grace']` equal to `{kind: 'none', tw: 'kt', source: 'unfoldingWord/en/tw'}`; a part's `strong.G54850` is a list of full verse ids; a map core's `books[55]` is the Titus quadruple; an xmap segment with an extra optional table `topics` gives the output without `topics` and lists it in `h.tables`; the phase 1 test that expects `E_TABLE` for a `map` segment is changed to expect the decoded output, and a `gen` segment still gives `E_TABLE`.
- [ ] **Step 2: Run** `bun test src/read/output.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the two outputs in `output.ts`.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS (`spec/tests/build-cases.ts --check` still finds the frozen cases unchanged; case 9 is about `future-*` tables, not maps).
- [ ] **Step 5: Commit** `read: reader output of map and xmap`.

### Task 6: Tallies, verse ranges and the Strong counts

**Files:**
- Create: `packages/language-pack-v3/src/build/maps/tally.ts`, `src/build/maps/verses.ts`, `src/build/xmap/strong.ts`
- Test: `packages/language-pack-v3/src/build/maps/tally.test.ts`, `src/build/xmap/strong.test.ts`

**Interfaces:**
- Consumes: Task 2 types; `OrigModel` (`src/model.ts`); `strongKey`, `verseId`, `bookNumber` (`src/ids.ts`); `extractOrig` and the test data of phase 1 (`spec/tests/data`, UGNT Titus).
- Produces:
  - `export class Tally { constructor(unit: CountUnit); add(key: string, book: string, verses: readonly number[]): void; table(): CountTable; verseLists(book: string): VerseLists; books(): string[] }` — `add` is one occurrence, link or note covering `verses` (which may be empty); distinct verses are the union.
  - `export function versesOf(orig: OrigModel): number[]` — every verse id of the original, in order, including verse 0 of the book and of each chapter that has text before its first verse.
  - `export function expandRange(verses: readonly number[], from: number, to: number): number[]` — the ids of `verses` with `from ≤ v ≤ to`; for `from === to` with verse number 0, `[from]`.
  - `export function strongTally(orig: OrigModel): Tally` — unit `occurrences`, one `add` per word with a non-empty `strong`, key `strongKey(word.strong)`, verse = the verse the word is in.

- [ ] **Step 1: Write the failing tests:**
  - `tally.test.ts`: three `add('G1', 'tit', [56001001])` give `[3, 1]` (case 6 semantics); one `add('ta:x', 'tit', [56001002, 56001003, 56001004])` gives `[1, 3]`; two adds on one verse give `[2, 1]`; an `add` with `[]` gives `[1, 0]` and no verse list entry for that key in that book; `verseLists('tit')` is sorted and distinct.
  - `expandRange` on the verses of Titus: `56001012..56002003` gives every id from 1:12 to 1:16 and 2:1 to 2:3 (Titus 1 has 16 verses); a range whose end is `56003099` stops at the last verse of chapter 3; `56000000` alone gives `[56000000]`.
  - `strong.test.ts`: on UGNT Titus (`extractOrig` over the phase 1 data), the total of all counts equals the number of words with a Strong, every key starts with `G`, and the key of Titus 1:1's first word is `strongKey` of its published Strong; a synthetic `OrigModel` whose one verse has the same Strong three times gives `[3, 1]`; a Hebrew Strong `b:H7462b` gives the key `H7462b`.
- [ ] **Step 2: Run** `bun test src/build/maps/tally.test.ts src/build/xmap/strong.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `versesOf` walks `events`: a `chapter` event sets the chapter, a `verse` event adds `verseId(book, chapter, n)`; words before the first verse of a chapter belong to verse 0 of that chapter.
- [ ] **Step 4: Run** the tests, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `maps: tallies, verse ranges and the Strong counts`.

### Task 7: Concepts of help rows and coverage

**Files:**
- Create: `packages/language-pack-v3/src/build/maps/conceptRefs.ts`, `src/build/maps/coverage.ts`
- Test: `packages/language-pack-v3/src/build/maps/conceptRefs.test.ts`

**Interfaces:**
- Consumes: `sourceRows`, `HelpsKind` (`src/build/bookHelps.ts`); `parseRef`, `conceptOfSupportReference`, `conceptOfTwLink` (`src/ids.ts`); `Row`, `ResourceRef` (`src/source/rows.ts`); Task 6 (`expandRange`, `Tally`).
- Produces:
  - `export type ConceptRef = { concept: string; from?: number; to?: number }` (no `from`/`to`: the reference could not be read)
  - `export function conceptRefs(rows: Row[], book: string, res: string, kind: 'notes' | 'links', issues: string[] = []): ConceptRef[]` — one per row that has a concept, in row order; the concept as phase 1 derives it (lowercased); a row with no concept is skipped; a list reference (`1:1,3`) gives the lowest and highest verse named, as `extractHelps` does; an unreadable reference gives no range and one `issues` line.
  - `export function tallyRefs(tally: Tally, book: string, refs: ConceptRef[], verses: readonly number[]): void` — `add(concept, book, from === undefined ? [] : expandRange(verses, from, to))`.
  - `export function coverageOf(refs: ResourceRef[], partial: boolean): Coverage` — per resource key, its `books` as `whole` (or as `partial` when `partial` is true: a bridged pack).

- [ ] **Step 1: Write the failing tests** with es-419 Titus tN and tWL rows of the phase 1 data: the number of `ConceptRef` of tN equals the number of tN rows with a SupportReference; the metaphor concept is `ta:translate/figs-metaphor`; a synthetic row with SupportReference `rc://*/ta/man/translate/figs-orderHeb` gives `ta:translate/figs-orderheb`; a synthetic row with Reference `x:y` gives a ref without range and one `issues` line, and after `tallyRefs` the concept has `[1, 0]` in that book; a note on `1:2-4` adds 3 verses; `coverageOf` of the es-419 resources gives `es-419_gl/es-419/tn` whole `['tit']` (with the phase 1 data list), and with `partial: true` the same books under `partial`.
- [ ] **Step 2: Run** `bun test src/build/maps/conceptRefs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. Do not re-implement reference parsing: reuse what `extractHelps` uses (move a private helper of `bookHelps.ts` to an export if needed, without changing its behavior; that is the one allowed edit of `bookHelps.ts`).
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `maps: concepts of help rows and coverage`.

### Task 8: Strong keys of the word-link concepts

**Files:**
- Create: `packages/language-pack-v3/src/build/xmap/strongs.ts`
- Test: `packages/language-pack-v3/src/build/xmap/strongs.test.ts`

**Interfaces:**
- Consumes: `HelpTable` (from `extractHelps`, `src/build/bookHelps.ts`); `OrigModel`; `strongKey`.
- Produces: `export function strongsOfLinks(links: HelpTable, orig: OrigModel, into: Map<string, Set<string>>): void` — for every link row with a `tw:` concept, the Strong keys of the original words its `quote` positions point to (positions `-1` skipped) are added to `into.get(concept)`. And `export function strongsRecord(m: Map<string, Set<string>>): Record<string, string[]>` (keys and values sorted by code point, concepts with no key left out).

- [ ] **Step 1: Write the failing tests** with es-419 Titus tWL (`extractHelps` over the phase 1 data, `OrigIndex` of UGNT Titus): `tw:kt/grace` gets `G54850`; every value set is non-empty and every key starts with `G`; a synthetic link whose quote is all `-1` adds nothing.
- [ ] **Step 2: Run** `bun test src/build/xmap/strongs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `strongs.ts`.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `xmap: Strong keys of the word-link concepts`.

### Task 9: English fixtures and `buildXmap`

**Files:**
- Create: `packages/language-pack-v3/spec/tests/data/en/list.json` (trimmed), the English parts of Titus under `spec/tests/data/parts/` (tN book, tWL book, tW titles, tA titles), rows in `spec/tests/data/README.md`
- Create: `packages/language-pack-v3/src/build/xmap/build.ts`
- Test: `packages/language-pack-v3/src/build/xmap/build.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 6, 7, 8; `RowSource` (`src/source/rows.ts`); `extractHelps`, `OrigIndex`.
- Produces:
  - `export type XmapBuild = { core: XmapCore; parts: XmapPart[]; report: string[] }`
  - `export async function buildXmap(o: { source: RowSource; origs: OrigModel[]; lang: string /* "en" */ }): Promise<XmapBuild>` — sources: the originals (`strong`), the language's tN (`notes`), tWL (`links`, `strongs`), tW (`tw` category of each concept), tA (Academy concepts). `res` of the core: every source with its release tag, the originals first then by key. A concept's `source`: tW for `tw:`, tA for `ta:`. Coverage: the originals whole for their books; tN and tWL whole for their books. One part per book of `origs`, in canonical order; a book whose original has no Strong still gets a part only if some table has a verse list for it.

- [ ] **Step 1: Copy the fixtures.** From `$LP3_SAMPLE`, the four English parts the list names for Titus (tn book tit, twl book tit, tw titles, ta titles), under their own sha256 names; `en/list.json` trimmed like `es-419/list.json` (keep `resources` that have a part here, every other field as the source has it); README rows with bytes and sha256, and the CC BY-SA 4.0 line already there covers them.
- [ ] **Step 2: Write the failing tests:** `buildXmap` over the phase 1 data plus the English fixture, with `origs` = UGNT Titus, gives a core whose `strong` rows sum to the Titus words with a Strong; `notes.rows['ta:translate/figs-metaphor'].tit` equals `[22, 21]` (phase 0's English Titus count; if the builder gives another number, the implementer reports which rows differ and the controller rules); `coverage['unfoldingWord/en/tn'].whole` is `['tit']`; `concepts['tw:kt/grace'].tw` is `'kt'`; `strongs['tw:kt/grace']` contains `G54850`; one part `tit` whose `strong` verse lists cover every verse of Titus that has a word with a Strong; building twice gives deep-equal results.
- [ ] **Step 3: Run** `bun test src/build/xmap/build.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `build.ts`.
- [ ] **Step 5: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 6: Commit** `xmap: English fixtures of Titus and buildXmap`.

### Task 10: The xmap unit of the common catalog

**Files:**
- Modify: `packages/language-pack-v3/src/build/language.ts` (`buildCommon`)
- Test: `packages/language-pack-v3/src/build/language.test.ts`

**Interfaces:**
- Consumes: Task 9 (`buildXmap`), Task 3 (`xmapSegment`); `builtSegment`, `inputsOf`, `buildCatalog`.
- Produces: `buildCommon(o: { source; books?; about; mapLang?: string })` — with `mapLang` (the language whose helps make the common map, `"en"`), it also builds the `xmap` core and parts and the unit `xmap`; without it, phase 1 behavior. The return type gains `report: string[]`. `inputs` of the core: every row the map read plus every stamp; of a part: the rows of that book plus the stamps of the sources it lists (none in `res`, but the fingerprint still names them, so `inputs` changes with a release while the id does not).

- [ ] **Step 1: Write the failing tests:** with `mapLang: 'en'` over the data, the common catalog lists a unit `xmap` whose segments are the core and the `tit` part, with no `needs`; the orig unit is unchanged; without `mapLang` the segments and catalog are byte-equal to today's (phase 1 determinism test still passes); building twice gives the same catalog id.
- [ ] **Step 2: Run** `bun test src/build/language.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `buildCommon`: keep each `OrigModel` the loop already extracts and call `buildXmap` after the loop.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `common: the xmap unit`.

### Task 11: Names in the language map

**Files:**
- Create: `packages/language-pack-v3/src/build/map/names.ts`
- Test: `packages/language-pack-v3/src/build/map/names.test.ts`

**Interfaces:**
- Consumes: `TextModel`, `ArticleModel`, `BookModel`, `ObsModel` (`src/model.ts`); `BOOKS`.
- Produces:
  - `export function tocOfText(text: TextModel): [string, string, string] | null` — the joined pieces inside the nodes opened by the events `open para:toc1`, `para:toc2`, `para:toc3`; `""` for a missing one; `null` when there is no `toc1`.
  - `export function bookNames(books: BookModel[], list?: Record<string, [string, string, string]>): BookName[]` — 66 entries in canonical order: the `toc` of the first text (in `texts` order) of the language's book that has one, source `text`; else `list[book]`, source `list`; else `['', '', '', 'none']`.
  - `export function conceptNames(articles: ArticleModel[]): Record<string, string[]>` — tW: the title split at commas, each part without the spaces around it, empty parts dropped; tA: `[title]`; keys sorted by code point.
  - `export function subtitlesOf(articles: ArticleModel[]): Record<string, string>` — tA articles with a `subtitle`.
  - `export function obsTitles(obs: ObsModel | null): [number, string][] | undefined`

- [ ] **Step 1: Write the failing tests:** the es-419 Titus book model of the phase 1 data gives Titus `['La carta de Pablo a Tito', 'Tito', 'Tit', 'text']` (GLT is the first text; GST has the same toc); with `list` `{rut: ['Rut', 'Rut', 'Rt']}` Ruth is `['Rut', 'Rut', 'Rt', 'list']`; Genesis is `['', '', '', 'none']`; a tW article titled `gracia, amable` gives `['gracia', 'amable']`; a tW title with no comma gives one name; a tA article gives its title and, when it has one, a subtitle; `obsTitles(null)` is `undefined`.
- [ ] **Step 2: Run** `bun test src/build/map/names.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `names.ts`.
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `map: book names, concept names, subtitles and OBS titles`.

### Task 12: `buildMap` and the map unit of a language

**Files:**
- Create: `packages/language-pack-v3/src/build/map/build.ts`
- Modify: `packages/language-pack-v3/src/build/language.ts` (`buildLanguage`)
- Test: `packages/language-pack-v3/src/build/map/build.test.ts`, `src/build/language.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 11; the `BookModel`s, articles and `ObsModel` `buildLanguage` already extracts; `versesOf` of each book's `OrigModel`.
- Produces:
  - `export type MapBuild = { core: MapCore; parts: MapPart[]; report: string[] }`
  - `export function buildMap(o: { lang: string; refs: ResourceRef[]; books: { model: BookModel; verses: number[] }[]; articles: ArticleModel[]; obs: ObsModel | null; bookNames?: Record<string, [string, string, string]>; partial?: boolean }): MapBuild` — `usage` counts the language's notes by concept (`notes` rows of each book model, `from`/`to` expanded with `verses`); one part per book that has notes; coverage of every resource of the language (`partial` for a bridged pack).
  - `buildLanguage(o)` gains `bookNames?` and builds the `map` unit (core and parts); a book's `needs` keeps `"map"`, now satisfied. `bridgeZip` passes `partial: true` (its map covers what the old pack had).

- [ ] **Step 1: Write the failing tests:** `buildMap` over es-419 Titus gives `usage.rows['ta:translate/figs-metaphor'].tit` equal to the number of es-419 Titus notes with that SupportReference and their distinct verses (phase 0: Metáfora 15 notes in Titus; the implementer prints the verses count and the test pins both); the part `tit` lists the same verses; coverage of `es-419_gl/es-419/tn` is whole `['tit']`; `names['tw:kt/grace']` is not empty; a language with no notes builds a core with no `usage` and no parts. In `language.test.ts`: the es-419 catalog lists a unit `map`, and every `needs` of every unit names a unit of the language catalog or of the common catalog (`orig:*`); the bridge's local catalog has a `map` unit whose coverage is `partial`.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** `build.ts` and the wiring.
- [ ] **Step 4: Run** the tests, `bun test`, `bun run type-check`. Expected: PASS. Case 13 (`paquete-viejo`) changes: its local catalog now lists the `map` segments. The implementer runs `bun spec/tests/build-cases.ts --check`, reports the difference, and does not refreeze; the controller rules on refreezing case 13 (expected: yes, in its own commit with the reason "the bridge now builds the map unit").
- [ ] **Step 5: Commit** `map: buildMap and the map unit of a language`.

### Task 13: The Python reader of the maps

Agent: `lp3-pyreader`, from the specification alone.

**Files:**
- Modify: `packages/language-pack-v3/spec/reader-py/lp3read.py`
- Test: `packages/language-pack-v3/spec/reader-py/test_lp3read.py`

**Interfaces:**
- Consumes: the spec as Task 1 left it: `cddl/map.cddl`, `cddl/xmap.cddl`, `cddl/common.cddl`, `tests/README.md` (map and xmap output, the new `E_BODY` checks, the OBS frame check, the row count check).
- Produces: `lp3read.py` prints the map and xmap outputs; `KNOWN_TABLES` for `map` and `xmap`; OBS frame outside 1–50 / 0–99 is `E_BODY`; a table with `n` above `ulen` is `E_BODY`.

- [ ] **Step 1: Write failing pytest cases** built with cbor2 in the test (as the phase 1 tests do): an xmap core and part, a map core and part, each defect of Task 1 Step 6, an OBS help with frame 5101, a `book` notes table that declares `n` larger than `ulen`.
- [ ] **Step 2: Run** `"$PY" -m pytest spec/reader-py -q > "$REPORT_DIR/py.log" 2>&1; tail -n 5 "$REPORT_DIR/py.log"`. Expected: FAIL.
- [ ] **Step 3: Implement** the decoders.
- [ ] **Step 4: Run** pytest again, then `bun spec/tests/compare.ts` (the frozen cases, which hold no map yet). Expected: pytest PASS; compare 0 mismatches. The maps are compared between the two readers in Task 16.
- [ ] **Step 5: Commit** `reader-py: map and xmap, OBS frame range, row counts`.

### Task 14: TypeScript reader limits

**Files:**
- Modify: `packages/language-pack-v3/src/read/obs.ts`, and the one helper where the views read a table's `n` (the implementer finds it; if each view reads `n` itself, add `checkRows(n: number, ulen: number): void` to `src/read/book.ts` and call it from each view)
- Test: `packages/language-pack-v3/src/read/obs.test.ts`, `src/read/book.test.ts`

**Interfaces:**
- Consumes: Task 1 Step 7.
- Produces: `obsView` rejects a story outside 1–50 or a frame outside 0–99 in a help row (`E_BODY`); every view rejects `n > ulen` (`E_BODY`). The views get `ulen` from the segment (`readSegment` already knows it; pass it through `Segment` as an optional `ulen` if it is not there).

- [ ] **Step 1: Write the failing tests:** an OBS help with `frame` 5101 is `E_BODY` in `readerOutput`; with 1003 it reads as today; a book notes table that declares `n` = `ulen + 1` is `E_BODY`.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `bun test`, `bun run type-check`, `bun spec/tests/compare.ts`. Expected: PASS, 0 mismatches.
- [ ] **Step 5: Commit** `read: OBS frame range and row counts`.

### Task 15: The query module

**Files:**
- Create: `packages/language-pack-v3/src/query/maps.ts`
- Test: `packages/language-pack-v3/src/query/maps.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4 (`XmapCore`, `XmapPart`, `MapCore`, `MapPart`).
- Produces:
  - `export type State = 'count' | 'zero' | 'none' | 'partial'`
  - `export type BookAnswer = { book: string; state: State; count?: number; verses?: number }` (`count` and `verses` only for `count` and `partial`)
  - `export type MapSet = { xmap?: { core: XmapCore; parts: Map<string, XmapPart> }; map?: { core: MapCore; parts: Map<string, MapPart> }; revision: number; installed?: Map<string, BookModel> }` (`installed`: the book segments on the device, by book code, whatever their revision)
  - `export function strongWhere(m: MapSet, key: string): { key: string; books: BookAnswer[]; count: number; verses: number }` (tries the 5-digit Greek form; `books` only those with a count)
  - `export function conceptWhere(m: MapSet, id: string): { id: string; links: BookAnswer[]; notes: BookAnswer[] }`
  - `export function usage(m: MapSet, concept: string, source: 'xmap' | 'map'): { source: string; revision: number; books: BookAnswer[] }` — 66 answers: `count` when the source covers the book whole and has a row; `zero` when it covers it whole and has none; `partial` when it covers it in part (with the count, 0 included); `none` when it does not cover it.
  - `export function bookCoverage(m: MapSet, book: string): Record<string, State>` (per source key: `count` when it covers whole, `partial`, `none`)
  - `export function keyTerms(m: MapSet, book: string): { concept: string; links: [number, number]; candidates: number; otherBooks: string[] }[]` — the `tw:kt/` concepts with links in the book (sorted by links count, then id), the number of distinct verses of the book where one of the concept's `strongs` occurs (from the xmap part) and the other books where the concept has links.
  - `export function revisionAnswer(m: MapSet, concept: string, book: string): { fromMap: number; revision: number; installed?: number }` — the count of the language map (`usage`), the revision it describes, and the notes with that concept in the installed book segment (absent when the book is not installed).
  - `export function answer(m: MapSet, query: { kind: string; [k: string]: unknown }): unknown` — dispatches the kinds of `spec/tests/queries/README.md` (`revision` goes to `revisionAnswer`).

- [ ] **Step 1: Write the failing tests** over hand-made models: coverage of tN whole `['tit', 'jon']`; metaphor rows only in Titus `[22, 21]` → Titus `count` 22/21, Jonah `zero`, Isaiah `none`; with coverage `partial: ['rut']` and a Ruth row `[3, 3]` → Ruth `partial` 3; `strongWhere(m, 'G5485')` finds rows stored under `G54850`; `usage` names `revision`.
- [ ] **Step 2: Run** `bun test src/query/maps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `query: answers from the maps with their state and revision`.

### Task 16: Conformance cases 5, 6, 11 and 12

**Files:**
- Modify: `packages/language-pack-v3/spec/tests/build-cases.ts`, `spec/tests/compare.ts` (`--built` also builds the xmap of Titus from the English fixture and the es-419 map, and compares them), `src/conformance.test.ts`, `spec/tests/README.md` (the table: the phase 2 cases are built; the sentence "Cases 6, 11 and 12, and the map half of case 5, need the maps" goes)
- Create: folders `spec/tests/nota-varios-versiculos/` (add `map-core.seg`, `map-tit.seg`), `strong-repetido/`, `revisiones-mixtas/`, `idioma-parcial/`, each `.seg` with its `.expected.json`

**Interfaces:**
- Consumes: Tasks 3–5, 12, 15 (`mapSegment`, `xmapSegment`, `buildMap`, `answer`).
- Produces: the frozen bytes of the four cases; the conformance test checks the numbers of the table with `answer`.

- [ ] **Step 1: Build the inputs in `build-cases.ts`** (no clock, every value fixed in the script):
  - Case 5, map half: `buildMap` over the case 5 book model → `map-core.seg`, `map-tit.seg`. Expected: usage of `ta:translate/figs-metaphor` in Titus `[1, 3]`.
  - Case 6 `strong-repetido`: a synthetic Titus original whose verse 1:1 has `G54850` three times; `buildXmap`'s Strong table → `xmap-core.seg`, `xmap-tit.seg`. Expected: `G54850` in Titus `[3, 1]`, verse list `[56001001]`.
  - Case 11 `revisiones-mixtas`: an es-419 map of revision 4 and a catalog of revision 4 (`catalog.seg`, `map-core.seg`) where Ruth has `N` notes on metaphor, and Ruth's book segment of revision 3 (`book-rut.seg`) with `N − 1`. Ruth is synthetic, made from the Titus notes relabeled to Ruth verses (the data has no es-419 Ruth). The design text says 15 and 14; the script uses `N = 15`.
  - Case 12 `idioma-parcial`: an es-419 map core whose tN coverage is whole `['tit', 'rut', '3jn', 'jon']` with metaphor rows only in Titus.
- [ ] **Step 2: Write the failing tests** in `conformance.test.ts`: case 6 `answer({kind: 'strong', key: 'G5485'})` gives Titus count 3, verses 1; case 11 `answer({kind: 'revision', concept: 'ta:translate/figs-metaphor', book: 'rut'})` gives `{fromMap: 15, revision: 4, installed: 14}` (installed = the notes with that concept in `book-rut.seg`); case 12 `usage` gives Titus `count`, Jonah `zero`, Isaiah `none`; case 5 gives `[1, 3]`.
- [ ] **Step 3: Run** `bun spec/tests/build-cases.ts` (first build writes the new folders), then `bun spec/tests/build-cases.ts --check` (writes nothing, finds everything), then `bun test src/conformance.test.ts` with `LP3_PYTHON` set, then `bun spec/tests/compare.ts --built`. Expected: PASS; 0 mismatches over all files, the new cases and the built maps included.
- [ ] **Step 4: Commit** `spec: conformance cases 5 (map half), 6, 11 and 12`.

### Task 17: Independent answers of the fixed queries

**Files:**
- Create: `packages/language-pack-v3/spec/tests/queries/answers.py`, the query files `g5485.json`, `abraham-links.json`, `metaphor-by-book.json`, `isaiah.json`, `ruth-keyterms.json`

**Interfaces:**
- Consumes: the phase 0 sample (`$LP3_SAMPLE`), `spec/tests/queries/README.md`, `counts.md`, `ids.md`. Not the TypeScript builders, not `lp3read.py`.
- Produces: each query file with its `expected`, computed by `answers.py`.

- [ ] **Step 1: Write `answers.py`** (Python, stdlib only: gzip and json over the part files of the lists in the sample). It may read the phase 0 prototype `C:\Users\LENOVO\Git\Github\wt\fase0-paquetes\scripts\armar_mapa.py` for how the parts are laid out; it follows the count rules of `counts.md` (an introduction covers verse 0; a range expands over the original's verses; an unreadable reference counts with no verse).
- [ ] **Step 2: Run** `"$PY" -I spec/tests/queries/answers.py "$LP3_SAMPLE" spec/tests/queries` and check against phase 0's numbers: G5485 156 occurrences in 148 verses of 23 books; `tw:names/abraham` 291 links in 259 verses of 21 books (Genesis 190); metaphor (English notes) Psalms 1 175 notes in 949 verses, Titus 22 in 21; Numbers, 1 and 2 Chronicles, Ecclesiastes, Isaiah, Jeremiah and Ezekiel `none`; Isaiah: the originals `count`, English tN and tWL `none`; Ruth: 22 key terms, the first redeem (23), Yahweh (18), good (6), bless (5). A difference goes in the report with the rows that cause it; the controller rules whether the script or phase 0 was right.
- [ ] **Step 3: Commit** `spec: fixed queries of the maps with independent answers`.

### Task 18: Command line and the gate on the sample

**Files:**
- Modify: `packages/resource-pipeline/cli/build-v3.ts` (and its test `cli/build-v3.test.ts`)
- Create: `packages/language-pack-v3/spec/tests/queries/run.ts`

**Interfaces:**
- Consumes: Tasks 10, 12, 15, 17.
- Produces: `build-v3.ts` gains `--map-lang <lang>` (passed to `buildCommon`, default `en`) and `--book-names <file>` (JSON `{book: [name, short, abbreviation]}` passed to `buildLanguage`); it prints the map sizes. `run.ts <out dir>`: reads the built xmap and map segments, answers every query file with `answer`, prints one line per query (`ok` or the first difference) and exits 1 on a difference.

- [ ] **Step 1: Test first** in `build-v3.test.ts`: on the phase 1 data, `--map-lang en` writes an `xmap` core and a `tit` part and the es-419 `map` core.
- [ ] **Step 2: Implement** the two flags and `run.ts`.
- [ ] **Step 3: Gate on the sample** (outputs to files, only the summary read): build English and es-419 with every book of the sample into a scratch folder outside the repo, then `bun spec/tests/queries/run.ts <out>`. Expected: every query `ok`; xmap core + parts + es-419 map core + parts ≤ 2 097 152 bytes (report each). If the size is over, stop and report: the controller brings it to Abel.
- [ ] **Step 4: Commit** `cli: the maps in build-v3 and the fixed queries on a build`.

### Task 19: Invalidation

**Files:**
- Create: `packages/language-pack-v3/src/build/invalidation.test.ts`

**Interfaces:**
- Consumes: `buildCommon`, `buildLanguage` (Tasks 10 and 12); a `RowSource` wrapper that replaces some rows (write it in the test file).

- [ ] **Step 1: Write the tests** (they should pass if Tasks 1–12 hold; a failure is a bug to fix in the builder, in this task, with a test of its own):
  - Changing the wording of one es-419 Titus note: only `book:tit` and the es-419 catalog change id.
  - Changing the SupportReference of that note: `book:tit`, the `map` core, the `map` part `tit` and the catalog change; every other segment keeps its id.
  - Changing the release stamp of es-419 tN, same rows: the book segment, the map core and the catalog change; the map part `tit` keeps its id.
  - Changing the SupportReference of one English Titus note: the `xmap` core, its `tit` part and the common catalog change; no es-419 segment changes.
- [ ] **Step 2: Run** `bun test src/build/invalidation.test.ts`, `bun test`, `bun run type-check`. Expected: PASS.
- [ ] **Step 3: Commit** `build: invalidation of the maps`.

### Task 20: Section ids of equal headings, and the spec status

**Files:**
- Modify: `packages/language-pack-v3/src/build/sections.ts`
- Test: `packages/language-pack-v3/src/build/sections.test.ts`
- Modify: `packages/language-pack-v3/spec/README.md` (status and open items), `README.md` of the package if it lists classes

**Interfaces:**
- Consumes: Task 1 Step 7 (the tie-break rule).

- [ ] **Step 1: Write the failing test:** an article with two `## Ejemplos` sections and no registry gets `examples` and `examples-2`; built again with the registry, both keep their sids; with a section inserted before them, they still keep them.
- [ ] **Step 2: Run** `bun test src/build/sections.test.ts`. Expected: FAIL (or PASS if `assignSids` already does this; then the test pins it and the report says so).
- [ ] **Step 3: Implement** the rule in `assignSids`; check that no frozen case changes (`bun spec/tests/build-cases.ts --check`).
- [ ] **Step 4: Spec status.** `spec/README.md`: phase 2 part A implemented; the open items answered by Task 1 Step 7 are removed or marked done; new rows: part B (topics, people, places, events, relations: after Abel approves `fuentes.md`), `numbering` (later version), the transfer extension (unchanged).
- [ ] **Step 5: Run** `bun test`, `bun run type-check`, `bun spec/tests/compare.ts` with `LP3_PYTHON`. Expected: PASS, 0 mismatches.
- [ ] **Step 6: Commit** `sections: equal headings get -2, -3; spec status after phase 2 part A`.

---

## After Task 20 (controller)

- Final review: three Opus reviewers in parallel, one per area, each with its part of the diff (`7fcc7f2..HEAD`), the ledger's deferred items and the rulings:
  1. **Format and readers:** the spec changes, `codec/counts.ts`, `read/map.ts`, `read/xmap.ts`, `read/output.ts`, the reader limits.
  2. **Builders:** `build/maps/`, `build/xmap/`, `build/map/`, the wiring in `language.ts`, the bridge, sections, invalidation.
  3. **Python, cases, queries and command line:** `lp3read.py`, the four cases, `answers.py`, the query module, `run.ts`, `build-v3.ts`, the fixtures and their README.
- One fix wave, one scoped re-review, as in phase 1.
- Append "Deviations from this plan" at the end of this file from the ledger's rulings.
- Report to the supervisor: commits, gate numbers (sizes, queries), open items. The supervisor asks Abel whether to push.

## Part B (outline, detailed after Abel approves `spec/fuentes.md`)

Each becomes one or two tasks of an addendum to this plan, written once the files are downloaded and their shapes are known:

- B1 Source readers for TIPNR and Theographic (string parsers under `src/source/`, Node-free) and fixture subsets with their licenses.
- B2 People and places (`per:`, `lug:`) and events (`ev:`) as concepts of the xmap, with `kind`; relations with type, source and confidence, never merged (`same-as` between `tw:names/abraham` and `per:abraham` only from a declared source, else in a review list).
- B3 Topics: the schema of `topics` in both maps (spec commit first), from English OBS story ranges (`obs:` with refs; the phase 1 deferral of OBS `refs`), outline sections `sec:` from the English tN introductions, events from Theographic; the five categories navigable.
- B4 Language topics (`{lang}:tema/…`) from the language's own outlines, and topic names in `map` `names`.
- B5 Python reader of `topics` and `relations`; the fixed queries `per:abraham` and `ev:plagas-egipto`; the size gate again.
