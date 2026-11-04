# Language packs format 3, phase 2 part C (the aligned-phrase index) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the index of aligned words and phrases per language (gateway text → Strong keys, with books, verses and occurrences) as an optional unit of the language catalog, so the translation-helps MCP, BT Servant and Servos can answer "what does 'la diestra de Dios' mean, and where else does it appear" without opening every book.

**Architecture:** A new segment class `aligned` (one language), built from the `book` segments the language build already makes, with the entry rules of the Task 21 measurement (`spec/tests/measure/alignedIndex.ts`) moved into a Node-free builder. The index is split into parts; each part is its own catalog unit `aligned:{part}`, marked optional, needed by nothing and needing nothing, so no other segment changes when it is built or not.

**Tech Stack:** as parts A and B.

**Spec:** `packages/language-pack-v3/spec/` as part B left it (`19159a61`, pushed); the open item "An index of aligned words and phrases per language" in `spec/README.md`; the measurement definitions at the top of `spec/tests/measure/alignedIndex.ts`; Abel's decision of 2026-11-03 ("Sí, unidad opcional").

## Decision for Abel before this runs: how the index is split

Abel approved "its own optional unit, split by Strong group". Writing this plan showed a problem with the split: the lookups that motivated the index go **from a phrase to Strong keys** ("diestra", "before his face"). With parts by Strong group, a reader does not know which part holds a phrase, so one lookup opens every part (English: 16 parts, 3.4 MB). With parts by the first letter of the phrase, one lookup opens one part (English: 35 parts, the largest 651 KB; the measurement can rebalance letters into parts of at most about 250 KB).

- **Option 1 (recommended): parts by the start of the key**, letters grouped so that no part passes 256 KB compressed. One phrase lookup opens one part. The reverse question ("how does this language render G1188") is already answered from the book segments' alignment and the maps.
- **Option 2 (as approved): parts by Strong group** (`G5`, `H1`, as the lexicon). Best for "renderings of this Strong"; a phrase lookup opens all parts.

**Abel chose Option 1 on 2026-11-03 ("Por letra, recomendado").** Every task below implements Option 1; Option 2 is not built.

## Global Constraints

Parts A and B's Global Constraints hold. In addition:

- Branch `feat/language-pack-v3-phase2`, from `19159a61`. Commits local until Abel says yes.
- The `aligned` units are optional: the catalog marks them `optional: true`, no unit lists one in `needs`, and they list no `needs`. Building with or without them gives byte-equal segments of every other class.
- Entry rules are those of the Task 21 script, verbatim (its header comment): word entries, maximal runs of two or more word pieces with equal non-empty `align`, key NFC and `toLocaleLowerCase(lang)`, Strong keys by `strongKey`, occurrences counted per text.
- A part's compressed size ≤ 262 144 bytes (Option 1) on the whole-language build of P15 (`LP3_SOURCES\aligned\`); over it, the partition is refined, not the entry rules.

## Review Focus

1. **A phrase found in one text only** (GLT but not GST) keeps its verse once and its occurrences from that text. Test in C3.
2. **A key whose first character is outside the basic Latin letters** ("¿", "Ἰ", a digit) lands in a defined part and is found by the query. Test in C3 and C5.
3. **The unit not on the device**: a phrase query answers `installed: false`, never "not found". Test in C5.
4. **Other segments unchanged** by building the index. Test in C3.
5. **Case and normalization**: "Diestra" and "diestra" (and a decomposed "á") find the same entry. Test in C5.

---

### Task C1: Specification of the `aligned` class

**Files:** create `spec/cddl/aligned.cddl`; modify `spec/cddl/common.cddl` (`class-name`), `spec/container.md` (class list), `spec/cddl/catalog.cddl` and `spec/catalog.md` (unit `aligned:{part}`; unit key `? "optional": true`: a device installs it only when asked), `spec/tests/README.md` (reader output, `E_BODY` checks), `spec/README.md` (the open item becomes "specified").

- Header: `lang`, `group` (the part name), `res` (the bridge texts used, with release tags). Tables (required, v1): `keys` (`texts`, sorted by code point, unique), `strongs` (strtab), `data` (`uvarints` as the Task 21 header says), and `part` rule text: Option 1, `group` is the range of first code points of the part (`a`, `b-c`, `other`); Option 2, the lexicon group.
- Reader output: `entries` as `{key: {strong: {book: [verses, occurrences]}}}`.
- `E_BODY`: keys unsorted or repeated; a key outside its part's range; numbers left over or cut short; a Strong index outside `strongs`; book numbers not increasing or outside 1..66; `verses` 0 or above `occurrences`.
- Codex reviews (recipe in the Servos memory `codex-cli-windows.md`) with the Sonnet reviewer.
- Commit `spec: the aligned class and its optional units`.

### Task C2: Model, writer, view, reader output and units

**Files:** `src/model.ts` (`AlignedModel = { lang; group; res; entries: Map<string, Map<string, Map<string, [verses: number, occurrences: number]>>> }`), create `src/build/aligned/segment.ts` (`alignedSegment`), `src/read/aligned.ts` (`alignedView`, `ALIGNED_TABLES`); modify `src/codec/container.ts` (`CLASS_NAMES` gets `aligned` after `topics`), `src/read/output.ts`, `src/build/catalog.ts` (`unitIdOf`: `aligned:{group}`; `optional` on the unit; `aligned` units never in `needs`).

- Tests: round trip; each `E_BODY` check; a catalog with two parts lists `aligned:a` and `aligned:b-c`, both `optional`, no `needs`; frozen cases unchanged (`build-cases.ts --check`).
- Commit `aligned: model, writer, view and optional units`.

### Task C3: `buildAligned` and the language build

**Files:** create `src/build/aligned/build.ts`; modify `src/build/language.ts` (`buildLanguage` gains `aligned?: boolean`); make `spec/tests/measure/alignedIndex.ts` call the builder instead of its own copy of the rules; tests.

**Interfaces:** `export function partOf(key: string, strongs: string[]): string[]` (Option 1: one part from the first code point via a fixed table `ALIGNED_PARTS`; Option 2: one part per Strong group present); `export function buildAligned(o: { lang: string; books: BookModel[]; origs: Map<string, OrigModel>; texts: (res: string) => boolean }): { parts: AlignedModel[]; report: string[] }` — `texts` picks the bridge texts (ULT, UST for en; GLT, GST for es-419, as in Task 21).

- `ALIGNED_PARTS` (Option 1) is fixed in the code from the P15 English build: letters grouped in alphabet order so each part stays under 256 KB; `other` holds every key whose first code point is not in the table. The same table serves every language.
- Tests on es-419 Titus and Ruth (fixtures): `diestra`-like synthetic entry found; Review Focus 1, 2 and 4; the measurement script gives the same counts as before (its Task 21 numbers on the sample).
- Commit `aligned: buildAligned and the optional units of a language`.

### Task C4: Python reader

`lp3-pyreader`, from C1's spec alone: decode `aligned` and its checks; `compare.ts --built` adds the index of the fixtures. Commit `reader-py: aligned`.

### Task C5: Query

**Files:** `src/query/aligned.ts` (or the query module the code already has), `spec/tests/queries/README.md` (kind `phrase` `{lang, text}`), `spec/tests/queries/answers.py` (independent answer from the book alignment of the raw parts, not from the builder), query files `phrase-diestra.json` (es-419; expected may be "not found" on the sample, which is a valid answer), `phrase-right-hand.json`, `phrase-before-his-face.json` (en).

- `phrase(m, lang, text)`: normalize as the builder does, pick the part with `partOf`, answer `{ installed, found, strongs: {strong: {books, verses, occurrences}} }`; `installed: false` when that part is not in the set.
- Tests: Review Focus 3 and 5; the three fixed queries match `answers.py`.
- Commit `query: phrase lookups in the aligned index`.

### Task C6: Command line and gate

- `build-v3.ts --aligned` builds the units. Gate on the whole-language build (`LP3_SOURCES\aligned\`, as P15): number of parts, the largest part (≤ 262 144 bytes for Option 1), total, build time; the three fixed queries `ok`; every other segment byte-equal to a build without `--aligned`. Over the limit: stop with `ABEL:`.
- Commit `cli: --aligned in build-v3`.

### Task C7: Spec status

`spec/README.md`: part C implemented; open items updated. Run `bun test`, `bun run type-check`, `compare.ts --built`, pytest. Commit `spec: status after phase 2 part C`.

## After Task C7 (controller)

Final review with three Opus reviewers (spec and readers; builder and catalog; Python, query and command line), one fix wave, one scoped re-review, "Deviations from this plan" appended here, then `FIN:` with the commit range, the gate numbers and the open items. Every reviewer dispatch starts with the format 3 project exception. A supervisor 15-minute check runs for the whole of part C (`.claude/lp3-controller.md`).

## Deviations from this plan

Recorded by the controller at the end of part C (commits `704378f4..db300242`).

- **Partition below one letter.** One-letter groups left English `a`, `t`, `w` over 262 144 B and `th` alone at 469 766 B. Groups are now prefix ranges: ends are 1–6 characters `[a-z]([a-z ]{0,4}[a-z])?`, `P-Q` holds a key iff `P <= key` and `key.slice(0, len(Q)) <= Q` by code point; `ALIGNED_PARTS` is 16 contiguous ranges (largest 249 991 B on English) plus `other` (catalog-aware: keys outside every range the catalog lists). One phrase lookup still opens one part.
- **Option 2 wording in tasks ignored**; only Option 1 (parts by start of key) was built.
- **Extra E_BODY rules** after the Python reader (both readers): a `strongs` table repeating a text; `s=0` or Strong key with `b=0`; `P-Q` with `P > Q`; unit id `aligned:{x}` whose `x` is not a valid group; empty key; repeated Strong index in an entry. `optional` appears in the reader output of `units`; "no unit lists an aligned unit in `needs`" and "aligned units list no `needs`" are builder rules (the builder throws), readers do not check; ordering and non-overlap of aligned units are builder rules too.
- **Added beyond the plan:** `answers.py --whole` and `spec/tests/queries/whole.ts` (independent whole-language check of the three fixed queries); report line `aligned: on|off, N units`.
- **Final-review fixes:** TS now rejects header `v != 1` for every class (as Python did); the spec says a catalog listing `aligned` units needs a part C reader (older readers: E_BODY on the catalog, E_HEADER on the segment); docs and unit-id/group assertions in the query tests.

Open items (not done): fixed aligned conformance case in `spec/tests`; `src/read/output.ts:193` calls `alignedView` without groups (catalog-aware `other` check never runs in `readerOutput`); non-Latin languages all land in `other` with no size guard; a TS `read` test with a hand-built `v:2` body; `unitsOf` doc comma; aligned `inputs` hash tN rows (needless rebuild); `res` tag last-wins; measure script no longer prints verse refs; 249 985 → 249 991 B drift not bisected; `answers.py` uses `.lower()` not `toLocaleLowerCase(lang)`.
