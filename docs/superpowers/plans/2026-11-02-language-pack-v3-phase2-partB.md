# Language packs format 3, phase 2 part B (the topics module) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add people, places, events, stories and book sections to format 3 as a topics module of their own (common and per language), with the names each language gives them from its alignment, and answer the fixed queries `per:abraham` and `ev:plagues-of-egypt`; then measure the aligned-phrase index over whole languages (B7) and specify the `images` and `basemap` complements.

**Architecture:** Two new segment classes, kept apart from the maps so that a new TIPNR (almost weekly) never changes an id of `xmap` or `map`: `xtopics` (common, one core and one part per book, unit `xtopics` of the common catalog) and `topics` (one language, a core and one part per book, unit `topics` of the language catalog). Source readers under `src/source/` parse the three approved sources from text; builders under `src/build/topics/` turn them into concepts, relations and verse tallies with the `Tally` and count codec of part A; the language side adds names from the alignment and the language's own outline topics.

**Tech Stack:** as part A (TypeScript on Bun, pako 2.1.0, the phase 1 CBOR codec, Python 3.11 reader).

**Spec:** `packages/language-pack-v3/spec/` as part A left it (pushed as `feat/language-pack-v3-phase2`, 81c3b512), in particular `fuentes.md` ("Conditions of use"), `ids.md` ("Concepts"), `counts.md`, `catalog.md`. Part A plan: `docs/superpowers/plans/2026-11-02-language-pack-v3-phase2.md` (its Global Constraints hold here). Abel's approvals of 2026-11-02: the side-session notes `lp3-fase2-fuentes-parte-B.md`, `lp3-fase2-nombres-por-alineacion.md`, `lp3-fase2-modulo-temas.md` and `lp3-complementos-images-basemap.md` in `C:\Users\LENOVO\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_6d53d87b-a4d5-4ba8-8323-c7c686a25917\`.

Map from the part A outline: B0 → P2; B1 → P1, P3, P4; B2 → P8, P9; B3 → P5, P6, P9; B4 → P12; B4b → P11; B5 → P10, P13, P14; B6 → P2, P16; B7 → P15.

## Global Constraints

Every Global Constraint of the part A plan holds, including the four source conditions (no TIPNR file committed or shipped, only extracted data and small fixtures; no TIPNR `@Brief`, `@Short`, `@Article`, and no use of its translated-name column for shown names; no Easton text and no dates or chronology from Theographic; no unfoldingWord® mark on derived work). In addition:

- Branch `feat/language-pack-v3-phase2`, continuing from 81c3b512 (already on origin; no new push without Abel's yes).
- Source files live outside the repository in `C:\Users\LENOVO\Git\Github\wt\fase2b-fuentes\` (`LP3_SOURCES`): `tipnr/`, `theographic/`, `en_obs/`, `aligned/`. A test that needs them is skipped with a message when `LP3_SOURCES` is not set. Fixtures committed under `spec/tests/data/topics/` are subsets of at most 20 records per source, with the source's credit line in `spec/tests/data/README.md`.
- Pinned versions: TIPNR at the STEPBible-Data commit of 2026-10-24 (message "24-Oct-2026"); Theographic at the last commit of master on or before 2026-10-23; `unfoldingWord/en_obs` release v9. The hashes go into `spec/fuentes.md` in Task P1.
- The map core and parts never depend on the topics module: no `xmap` or `map` table, header or `needs` names a topics segment, and building with or without topics gives byte-equal `xmap` and `map` segments.
- Concepts are never merged (`ids.md`): two ids for one thing are joined by a typed relation with source and confidence.
- Size gate: `xmap` + es-419 `map` + `xtopics` + es-419 `topics`, all compressed, ≤ 2 097 152 bytes on the sample. Over it: stop and bring it to Abel.

## Decisions this plan takes (for Abel's review)

1. **Two classes, two units.** `xtopics` (common catalog, unit `xtopics`) and `topics` (language catalog, unit `topics`), added to the class list of `container.md`, `common.cddl`, `CLASS_NAMES` and the Python `CLASSES`. They need nothing and nothing needs them. A phase 2A reader that meets them gives `E_HEADER` (unknown class); the format is not published yet, so the minor version stays `3.0`.
2. **Ids of people and places.** `per:{slug}` / `lug:{slug}` from the TIPNR unified name before `@` (lowercase, spaces and `'` to `-`, other characters outside `[a-z0-9-]` dropped). When two TIPNR records of one kind give the same slug, every one of them takes `-{book}-{chapter}-{verse}` of the reference after `@` (`per:zechariah-2ki-14-29`). The TIPNR `uStrong` is kept beside the id, so an id can be re-derived.
3. **Ids of events.** `ev:{slug}` of the Theographic title, `-2`, `-3` on a clash in the order of `eventID`; the `eventID` is kept beside it. Events Theographic lacks come from a short list the builder owns (`src/build/topics/events.ts`, source `builder`, confidence 100): it starts with one entry, `ev:plagues-of-egypt`, Exodus 7:14–12:36, which the fixed query needs.
4. **Sections and stories.** `sec:{book}/{range}` from the outline of the English tN introduction (`sec:exo/7-12`); `obs:{n}` from English OBS v9, with the verse ranges of its closing line. A language's outline entry whose range matches an English `sec:` gives that section a name in the language; one that matches none becomes `{lang}:tema/{slug}`.
5. **Names from the alignment.** For each TIPNR name line (its dStrong and its references, with the `a`/`b` occurrence letters), the gateway words aligned to that original word in that verse. One-to-many rule: the name is the maximal run of consecutive word pieces (only `" "` between them) that contains the first word aligned to that original word; other aligned words of that verse are not part of the name and are counted in the report. Names are NFC as published (no lowercasing), every variant kept with its count and books, most frequent first.
6. **"Not installed" is not a state of `counts.md`.** A topics answer carries `installed: false` when the module is not on the device, and then no state; with the module, the four states as always.

## Review Focus

1. **Two people with one name** (the Zechariahs): two ids, each with its own verses; neither answer mixes the other's. Test in Task P3.
2. **TIPNR references in English versification** (`Psa.3.0`, Malachi 4, verse letters `a`/`b`): converted to the original's numbering with `fromHebrewNumbering`, the ones that cannot be converted listed in the report, never dropped silently. Test in Task P3.
3. **A proper-noun Strong used as a common noun** (a place name that is also a word): a name is taken from the alignment only in the verses TIPNR lists for that person or place. Test in Task P11.
4. **Maps unchanged by topics.** Building with and without the topics sources gives the same `xmap` and `map` ids. Test in Task P9.
5. **Module not on the device.** A query for `per:abraham` with no `xtopics` answers `installed: false`, never "none" or zero. Test in Task P13.

---

## Before Task P1 (controller)

- Ledger `.superpowers/sdd/2026-11-02-language-pack-v3-phase2b/progress.md`, same header as part A's, with the Global Constraints above in `global-constraints.md`. Part A's rulings bind by reference (`.superpowers/sdd/2026-11-02-language-pack-v3-phase2/progress.md`).
- Every reviewer dispatch starts with the project exception: for format 3 only, Abel approved on 2026-11-01 that Claude writes and reviews all the code, in uW repos too; Cursor does not take part.
- Codex reviews Tasks P2 and P7 (spec and the topics writer/view) read-only, with the Sonnet reviewer; Opus if Codex is unavailable.
- Order: P1 → P2 → P3–P6 (sources; may run two at a time on separate files) → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16, handoffs every 3 or 4 tasks.

### Task P1: Download the sources and pin their versions

**Files:**
- Modify: `packages/language-pack-v3/spec/fuentes.md` (the hashes and dates)
- Outside the repo: `C:\Users\LENOVO\Git\Github\wt\fase2b-fuentes\`

- [ ] **Step 1:** Into `LP3_SOURCES`, with `git clone --filter=blob:none` and a checkout of the pinned commit (or the GitHub archive of it): `STEPBible/STEPBible-Data` (only `Proper Nouns/TIPNR … CC BY.txt` is used), `robertrouse/theographic-bible-metadata` (`json/events.json`, `people.json`, `places.json`, `verses.json`), and the v9 release of `unfoldingWord/en_obs` (`content/01.md` … `50.md`). Write each commit hash, its date and the sha256 of each file used into `fuentes.md`.
- [ ] **Step 2:** Check by hand that the 50 OBS files each end with a line starting `_A Bible story from` and that `verses.json` has an OSIS id per record; write the counts in the ledger.
- [ ] **Step 3: Commit** `spec: pin the part B sources` (only `fuentes.md`).

### Task P2: The specification of the topics module and of the complements

**Files:**
- Create: `spec/cddl/xtopics.cddl`, `spec/cddl/topics.cddl`
- Modify: `spec/cddl/common.cddl` (`class-name`), `spec/container.md` (class list), `spec/ids.md` ("Concepts": the id rules of Decisions 2–4), `spec/catalog.md` (units `xtopics`, `topics`; complement kinds `images`, `basemap`), `spec/cddl/catalog.cddl` (`complement.kind`), `spec/tests/README.md` (reader output and `E_BODY` checks of both classes), `spec/README.md` (open items: the images/basemap row becomes "specified, built later"; new row "`ev:` concepts get no name from the alignment")

- [ ] **Step 1: `xtopics.cddl`.** Header as `xmap` (`part`, optional `book` equal to it, `res` every source with its release in the core and `[]` in a part). Core tables: `coverage` (required), `topics` (required): `{ "ids": strtab, "kind": uvarints (person 1, place 2, event 3, topic 4, story 5, section 6), "source": uvarints, "ref": strtab-index uvarints (the source's own key: TIPNR unique name, Theographic `eventID` as text, OBS story number, outline range) }`; `relations` (optional, the shape of `xmap` `relations`, from/to index `topics.ids`, and may name a part A concept by id through a second strtab `external`); `strongs` (optional, `{ topic-id => [+ strong key] }`, from TIPNR dStrongs); `occurrences` (required, a counts table, unit `"verses"`, one per verse the topic is referenced in); `ranges` (optional, `{ topic-id => [* [verse-id, verse-id]] }` for stories and sections). Part tables: `occurrences` as `verse-lists`. Add the unit `"verses"` to `count-unit`.
- [ ] **Step 2: `topics.cddl`.** Header `lang`, `part`, optional `book`, `res`. Core: `names` (required): `{ topic-id => [+ [name, source: "alignment" / "outline" / "obs" / "list", count, books: book-set]] }`, most frequent first; `local` (optional): the `local-topics` shape of `map.cddl` for `{lang}:tema/…`; `coverage` (required). Part: `names` verse lists (optional): `{ topic-id => verse-lists }` of the verses each alignment name came from.
- [ ] **Step 3: Reader output, checks, ids, catalog, complements** as listed under Files, in the style of the map sections (part A Task 1). The query answer of a topics query states `installed` (Decision 6).
- [ ] **Step 4: Commit** `spec: the topics module (xtopics, topics) and the images and basemap complements`.

### Task P3: TIPNR reader

**Files:** Create `src/source/tipnr.ts`, test `src/source/tipnr.test.ts`; fixture `spec/tests/data/topics/tipnr-subset.txt` (Abraham, Sarah, Isaac, two Zechariahs, Jerusalem, Bethlehem, Ur, Egypt, a record with an `a`/`b` reference, at most 20 records, with the TIPNR header lines kept for the license).

**Interfaces:**
- Produces: `export type TipnrName = { name: string; dStrong: string; refs: { verse: number; letter?: string }[] }`, `export type TipnrRecord = { kind: 'person' | 'place'; unique: string; uStrong: string; id: string; names: TipnrName[]; relations: { type: 'parent' | 'sibling' | 'partner' | 'child' | 'tribe' | 'founder' | 'inhabitant'; unique: string }[] }`, `export function parseTipnr(text: string, issues: string[]): TipnrRecord[]` (ids per Decision 2; `@Brief`, `@Short`, `@Article` and the translated-name column are never read into the result; references converted to original verse ids, unconvertible ones listed in `issues`).

- [ ] **Step 1: Tests:** Abraham gives `per:abraham`, uStrong `H0085`, names with dStrongs `H0085`, `H0087`, `G0011`, Genesis 17:23 twice (letters `a`, `b`); the two Zechariahs give two different ids of the form `per:zechariah-{book}-{c}-{v}`; a place gives `lug:`; `Psa.3.0` converts to the Hebrew numbering or lands in `issues`; no field of the result contains `@Brief` text (assert on a known `@Brief` phrase of the fixture).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS), `bun test`, `bun run type-check`.
- [ ] **Step 5: Commit** `source: TIPNR reader`.

### Task P4: Theographic reader (events only)

**Files:** Create `src/source/theographic.ts`, test; fixture `spec/tests/data/topics/theographic-subset/` (events 1, 73, 125 and their `partOf`/`predecessor` neighbors, the verses they name, the people and places they name, at most 20 records each, every Easton and date field removed from the fixture).

**Interfaces:** `export type TheoEvent = { eventID: number; id: string; title: string; verses: number[]; partOf: number[]; predecessor: number[]; participants: { name: string; verses: number[] }[]; places: { name: string; verses: number[] }[] }`, `export function parseTheographic(files: { events: string; verses: string; people: string; places: string }, issues: string[]): TheoEvent[]` — ids per Decision 3; verses from `verses.json` OSIS converted from KJV versification; `startDate`, `duration`, `lag*`, `dictText`, `dictionaryText`, `birthYear`, `deathYear` never read.

- [ ] Tests: event 125 "Exodus from Egypt" gives `ev:exodus-from-egypt` with its verse ids in the original's numbering; `partOf` and `predecessor` resolve to event numbers; participants carry the names and verses Theographic gives (resolving them to TIPNR ids is Task P8); the result's JSON has no key or text from the forbidden fields. Run, implement, run, commit `source: Theographic events reader`.

### Task P5: OBS story references

**Files:** Create `src/source/obsRefs.ts`, test; fixture: the closing lines only of stories 1, 10 and 50 in `spec/tests/data/topics/obs-refs.txt` (with the OBS attribution line).

**Interfaces:** `export function parseObsRefs(stories: Map<number, string>, issues: string[]): Map<number, [number, number][]>` — the ranges of the `_A Bible story from: …_` line (English book names to codes, `;`-separated lists, chapter ranges), as verse id pairs.

- [ ] Tests: story 10 gives ranges in Exodus; story 50's several references all parse; an unparsable piece lands in `issues`. Run, implement, run, commit `source: OBS story references`.

### Task P6: Outlines and the builder's events

**Files:** Create `src/build/topics/outline.ts`, `src/build/topics/events.ts`, tests.

**Interfaces:**
- `export function outlineOf(introMarkdown: string, book: string, issues: string[]): { title: string; from: number; to: number }[]` — the entries of the "Outline" section of a tN `front:intro` that carry a chapter/verse range (as the English tN writes them, `(1:1–4:31)` and `(chapters 7–12)`).
- `export const BUILDER_EVENTS: readonly { id: string; title: string; ranges: [number, number][] }[]` — one entry: `ev:plagues-of-egypt`, `Plagues of Egypt`, Exodus 7:14–12:36.
- `export function sectionId(book: string, from: number, to: number): string` — `sec:{book}/{c}-{c}` when the range is whole chapters, else `sec:{book}/{c}.{v}-{c}.{v}`.

- [ ] Tests with the English Titus intro of part A's fixture (`spec/tests/data`) and one Exodus-like synthetic intro: every outline entry with a range is found; `sectionId('exo', 2007001, 2012051)` is `sec:exo/7-12` (with the original's last verse of chapter 12); the builder event has its range. Commit `topics: outlines and the builder's events`.

### Task P7: The topics model, writers and views

**Files:** Modify `src/model.ts`; create `src/build/topics/segment.ts`, `src/read/topics.ts`; test `src/read/topics.test.ts`. Modify `src/codec/container.ts` (`CLASS_NAMES` gets `xtopics`, `topics`).

**Interfaces:** `XtopicsCore`, `XtopicsPart`, `TopicsCore`, `TopicsPart` types mirroring Task P2; `xtopicsSegment`, `xtopicsView`, `topicsSegment`, `topicsView`; `XTOPICS_TABLES`, `TOPICS_TABLES`.

- [ ] Tests: round trips of a core and a part of each class; each `E_BODY` check of Task P2 throws; `CLASS_NAMES` lists the two classes after `map`; part A's frozen cases are unchanged (`build-cases.ts --check`). Commit `topics: model, writers and views`.

### Task P8: Reader output and catalog units

**Files:** Modify `src/read/output.ts` (`KNOWN.xtopics`, `KNOWN.topics`, their outputs), `src/build/catalog.ts` (`unitIdOf`: `xtopics`, `topics`; their segment order after `map`); tests in `output.test.ts`, `catalog.test.ts`.

- [ ] Tests: the outputs of Task P2; a catalog with an `xtopics` core and parts lists one unit `xtopics` with no `needs`; two `topics` cores are an error like two map cores. Commit `read: reader output of the topics module; catalog units`.

### Task P9: `buildXtopics` and the common catalog

**Files:** Create `src/build/topics/xtopics.ts`; modify `src/build/language.ts` (`buildCommon` gains `topics?: { tipnr: string; theographic: {…}; obs: Map<number, string> }`); tests.

**Interfaces:** `export function buildXtopics(o: { tipnr: TipnrRecord[]; events: TheoEvent[]; obs: Map<number, [number, number][]>; outlines: Map<string, { title: string; from: number; to: number }[]>; origs: OrigModel[]; res: [string, string][] }): { core: XtopicsCore; parts: XtopicsPart[]; report: string[] }`.

- Relations: TIPNR family (`parent-of`, `sibling-of`, `partner-of`, `tribe`, `founder-of`, `inhabitant-of`), confidence 100, source TIPNR; Theographic `part-of`, `follows`, confidence 100; Theographic participants and places to `per:`/`lug:` only when the name and at least one verse match exactly one TIPNR record (confidence 80), else a report line in the review list; `occurs-in` from a story or section to the events whose verses lie inside its ranges (confidence 60); `same-as` from `tw:names/{x}` to a `per:`/`lug:` only when TIPNR's dStrongs and the tW link's `strongs` (part A) share a key and the verses overlap (confidence 70), else the review list.
- Occurrences: one `Tally` add per TIPNR reference, per event verse, per story/section range verse.

- [ ] Tests: on the fixtures, `per:abraham` has its Genesis verses and a `parent-of` from `per:terah`; `ev:plagues-of-egypt` has Exodus 7:14–12:36; `obs:10` relates `occurs-in` to it; `buildCommon` with topics lists unit `xtopics`, and its `xmap` and `orig` segments are byte-equal to a build without topics (Review Focus 4). Commit `topics: buildXtopics and the xtopics unit`.

### Task P10: The Python reader of the topics module

Agent `lp3-pyreader`, from Task P2's spec alone: decode `xtopics` and `topics`, their `E_BODY` checks, the two classes in `CLASSES`. `compare.ts --built` adds the topics of the fixtures. Commit `reader-py: xtopics and topics`.

### Task P11: Names from the alignment

**Files:** Create `src/build/topics/alignedNames.ts`, test.

**Interfaces:** `export function alignedNames(o: { records: TipnrRecord[]; books: BookModel[]; origs: Map<string, OrigModel>; lang: string }, issues: string[]): Map<string, { name: string; count: number; books: string[]; verses: number[] }[]>` — Decision 5; for each name line, only its own references (Review Focus 3).

- [ ] Tests on es-419 Titus and Ruth (part A fixtures and sample): a person of Titus 1 (`per:titus`) gets the es-419 name the GLT/GST align to it, with its count; a Strong that TIPNR lists for a place but that occurs in a verse TIPNR does not list adds nothing; a one-to-many alignment takes the run with the first aligned word and adds an `issues` line for the rest. Commit `topics: names from the alignment`.

### Task P12: `buildTopics` for a language and the language catalog

**Files:** Create `src/build/topics/topics.ts`; modify `src/build/language.ts` (`buildLanguage` gains `topics?` input: the `xtopics` core it was built against and the TIPNR records); tests.

- `names`: alignment names (Task P11), outline names for `sec:` (a language outline entry whose range equals an English section's), OBS titles of the language for `obs:`; `local`: the language's outline entries that match no English section, as `{lang}:tema/{slug}`; unit `topics`, no `needs`. The `map` segments are byte-equal with and without topics.
- [ ] Tests on es-419: the catalog lists unit `topics`; `per:titus` has a name with source `alignment`; Review Focus 4 for `map`. Commit `topics: buildTopics and the topics unit of a language`.

### Task P13: Queries of the topics module

**Files:** Modify `src/query/maps.ts` (or create `src/query/topics.ts` if `maps.ts` passes 300 lines), `spec/tests/queries/README.md` (kinds `topic` `{id}`, `category` `{kind}`), `spec/tests/queries/answers.py` (independent answers from the source files in `LP3_SOURCES`, not from the builders); query files `per-abraham.json`, `ev-plagues-of-egypt.json`; `run.ts` reads the topics segments when present.

- [ ] Tests: `per:abraham` gives its books, verses, OBS stories (`occurs-in` from `obs:`) and the `tw:names/abraham` relation; `ev:plagues-of-egypt` gives Exodus 7–12 and OBS story 10; with no `xtopics` in the set, `installed: false` and no state (Review Focus 5). Commit `query: topics and the two fixed queries`.

### Task P14: Gate on the sample

- [ ] Build en and es-419 with the topics sources into a scratch folder (Task 18's command with `--topics <LP3_SOURCES>`), run `spec/tests/queries/run.ts`. Expected: the 7 fixed queries `ok`; the sizes of `xtopics`, es-419 `topics`, and the total with `xmap` and es-419 `map` ≤ 2 097 152 bytes (report each). The number of TIPNR people and places that get an es-419 name and an English name (from ULT/UST alignment). Over the size: stop with `ABEL:`. Commit only the command line change, `cli: --topics in build-v3`.

### Task P15: B7, the aligned-phrase index over whole languages

- [ ] Fetch the aligned bridge texts of every book of en (ULT, UST) and es-419 (GLT, GST) from the staging parts the phase 0 sample came from (`fase0-paquetes/scripts/bajar_muestra.ps1`) into `LP3_SOURCES\aligned\`; build their book segments; rerun `spec/tests/measure/alignedIndex.ts`: entries, one segment, parts by first letter and by Strong group, largest part, build time, the three lookups. Nothing is committed but the ledger line; end with `ABEL:` and the numbers (Abel decides whether it becomes a unit of its own).

### Task P16: Spec status

- [ ] `spec/README.md`: phase 2 part B implemented; open items updated (`ev:` names, images and basemap built later in the order Abel approved: UBS animals and plants at 360 px by default and 600 px optional, then the OBS images, then our own basemap; AI-made, unverifiable Pixabay, unconfirmed FIA images and Biblica's English maps left out). Run `bun test`, `bun run type-check`, `compare.ts --built`. Commit `spec: status after phase 2 part B`.

## Part C (written after part B's FIN, approved by Abel before it runs)

Abel decided on 2026-11-03, from P15's numbers, that the aligned-phrase index becomes its own optional catalog unit:
not downloaded by default, split by Strong group, with its own `needs`; no map or topics segment depends on it. Its
spec, builder, readers (TypeScript and Python), queries and size check are part C, planned once part B is complete.

## After Task P16 (controller)

Final review with three Opus reviewers (spec and readers; source readers and builders; Python, queries and command line), one fix wave, one scoped re-review, "Deviations from this plan" appended here, then `FIN:` with the commit range, the gate numbers and the open items.

## Deviations from this plan

Written by the controller from the ledger after the final review and its fix wave.

1. **References are not converted (Review Focus 2).** TIPNR, Theographic (KJV) and OBS references are English = the UHB's own numbering (`Psa.3.0`, Malachi 4, Jonah 1:17 are in the UHB sample). The plan's "converted with `fromHebrewNumbering`" was wrong; nothing is converted. Unknown book or chapter still goes to the report. `topics.cddl` and `fuentes.md` say so since the fix wave.
2. **`xtopics` topics table has `title` and `ustrong` columns and a pinned `refs` order; topics part `names` are flat verse lists** (no per-name provenance). Needed by Decision 2, `ids.md` and the P2 review. A format tweak in the unpublished 3.0.
3. **Relation types the plan did not name** (P9): `participant` (event→`per:`), `place` (event→`lug:`), `tribe` (person→tribe), `occurs-in` (story or section→event) by verse overlap, not containment. They are in `ids.md` and `xtopics.cddl`.
4. **"OBS story 10" for `ev:plagues-of-egypt`** means "includes `obs:10`": by overlap the list is `obs:10, 11, 12, 48`, and `per:abraham` has 20 stories. A stricter rule would be a spec change.
5. **Glued prepositions stay in aligned names** (P11, Decision 5 taken literally): es-419 shows "de Moab" as a top variant. Open for a later heuristic or a choice in the UI. Alignment names are also noisy ("Mientras tanto" for Boaz, "Yo" for Paul).
6. **Outline parser** accepts `Outline` and `Esquema…` headings, a label after the range and half verses (found on the real es-419 notes in P14). It still reports, and does not read, bare chapter ranges, comma lists and entries without a range (about 146 issue lines in en). The fix wave also reports non-item lines that end in a range.
7. **TIPNR Strong keys:** `dStrong` → Strong by letter plus the first four digits (`H2148P` → `H2148`, `G2197H` → `G2197`); `same-as` and the alignment use the same four-digit rule (fix wave).
8. **Python and TypeScript agree on `local` entries:** unknown keys dropped, names non-empty, refs two verse ids of books 1..66, names NFC (P16 and the fix wave).
9. **Final-wave fixed query:** `ev:plagues-of-egypt` compares only the story `occurs-in`; the section `occurs-in` from the English tN outline is not cross-checked, because the independent oracle has no outline parser (`ignoreRelationsFrom` in the query file, said in `queries/README.md`).
10. **`--topics` of `build-v3`** checks its four Theographic files, at least one story file and one TIPNR file; with `--topics` a skipped topic query is a failure.
11. **Catalog fingerprints:** every `xtopics` and `topics` part is re-checked when any topics source changes (`catalog.md`), not only the parts of the touched books.
12. **B7 (aligned-phrase index)** is not built here. Abel decided on 2026-11-03: its own optional catalog unit, split by Strong group, not downloaded by default, with its own `needs`; spec, builder, readers, queries and size check are part C. Measured numbers are in `.superpowers/sdd/2026-11-02-language-pack-v3-phase2b/task-P15-report.md`.
13. **Left as minors:** `resolve()` prefers a person on a shared unique name (the spec says so); `releases` spread can overwrite defaults with `undefined` in `language.ts`; `builder` appears in segment `res` but is not a catalog resource; `theographic.ts` reads `r.fields` inconsistently; `sectionId` with an undefined `lastVerse` gives the `c.v` form silently; the writer does not validate local `refs` verse ids; a catalog test uses a stub `needs`; es-419 sample has only Titus and Ruth aligned; the Theographic fuentes row lacks the commit that last touched `json/`.
