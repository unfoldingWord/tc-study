# Language packs format 3: MACULA in columns (`macula` v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Controller rules: `.claude/lp3-controller.md`.

**Goal:** BT Servant Mini's two coming features, "who is who" (referents) and a sentence-structure diagram, read MACULA from the `orig` segments by word position, with the antecedent occurrence, the codes documented, and a Genesis `orig` that opens fast enough on a mid-range phone. Also fix the memory blow-up of `renderings({strong})`.

**Owner (CLAUDE.md):** unfoldingWord work (format 3 in tc-study, for BT Servant). Under the format 3 project exception, Claude writes the code and a different agent (`lp3-reviewer`, Codex where named) reviews it, as in phase 2. Abel confirms the exception before Task M1. An optional follow-up in Taller (Idiomas Puentes) is listed at the end and is not part of this plan.

**Architecture:** A new version 2 of the optional `orig` table `macula`. It replaces version 1 in what the builder writes. Version 1 stays readable. The trees are stored per sentence, each as a byte string of uvarints, with the span of word positions it covers, so a reader decodes only the sentences of the verse it shows. The referents become columns keyed by word position, resolved at build time: the word that refers, the entity, the antecedent's verse and, when it can be fixed, the antecedent's position. No catalog, class, unit or required table changes.

**Spec:** `packages/language-pack-v3/spec/` at `f98a0aa6` (origin/master, the section map merged); `spec/cddl/orig.cddl`; `spec/README.md` open item "MACULA and the lexicon in columns".

## What was measured before writing this (2026-11-16)

- **Where the time goes.** Genesis `orig` (en, `0e878be4…`, 374 287 bytes compressed, 1 017 315 uncompressed), in bun on this PC, warm: inflate 13–21 ms, sha256 2–8 ms (subtle) or 21 ms (JavaScript), CBOR decode of the body 67–104 ms, `origView` 14–24 ms. The `macula` table is 564 925 of the 1 017 315 body bytes (trees 307 686, referents 257 177) and about 55 ms of the decode, because it is many small nested arrays. Skipping the table does not help: `readSegment` decodes the whole body before it skips a table (`container.md`, order of checks, step 4). So the gain has to come from making the table small and flat, not from leaving it out.
- **Old readers.** The catalog readers in `wt/lp3-mcp` and at tc-study `c68e3622` reject a catalog that lists an unknown class, and any `optional` unit that is not `aligned:` (`readSegmentEntry`, `readUnit`). So a separate class or unit for MACULA would break the common catalog for every installed app. A new version of the optional table `macula` does not: `readSegment` (TypeScript, both copies) and `lp3read.py` skip an optional table whose version they do not know, and `origView` gives a model without `macula`.
- **Who reads `macula` v1 today.** Nobody reads its contents. Mini only bundles the library code (`web/desktop/main.js`), and Servos reads MACULA from the format 2.0 parts, not from format 3. So the builder can write v2 alone. An old app then shows no MACULA, and it showed none before.
- **What `x` and `y` are.** They are not person and gender. Taller's `src/domain/referents.ts` (`referentFiles`) writes a target as `[kind, piece, chapter, verse, word]`. `chapter` and `verse` give the verse of the antecedent word (in the app's numbering), and `0, 0` means the same verse as the word that refers. `kind`: `r` refers (a pronoun or suffix stands for it), `s` subject left unsaid, `c` causer (MACULA frame `AA`), `a` agent (`A0`), `p` patient (`A1`), `o` any other frame place. `piece` is the suffix's text when only a piece of a Hebrew word refers. `word` indexes `words` (`[form, strong]`, the antecedent's form as pointed text and its Strong). The word that refers is keyed by `referentKey` (letters only: no marks, lowercase, final sigma as σ) and its occurrence among the words of its verse with that key.
- **Tree labels.** Taller's `build-trees.mts` and `src/domain/syntaxTree.ts` write a part as `role` + `*` when it is a clause (MACULA lowfat `class="cl"`). The bare `*` is a clause with no role. `&` is a joining word (lowfat class `cj`/`conj` with no role). The roles are MACULA lowfat's `role` attribute: `s`, `v`, `vc`, `o`, `o2`, `io`, `p`, `adv`, `aux`, `pp`. Task M1 checks each meaning against the MACULA documentation (Clear-Bible/macula-greek and macula-hebrew) and writes down any it cannot confirm as such. A leaf is a word id `CCCVVVWWW` (UHB/UGNT place, which Taller fits by letters). `[id, text]` is a piece of a Hebrew word.
- **Can the antecedent be fixed to one word?** The source gives its verse and Strong, not its place. The rule "the one word of that verse whose Strong is the entity's, or else the one of several whose form contains the entity's form" fixes it for: Ruth 91 %, Jonah 87 %, Titus 92 %, Genesis 86 %, Matthew 94 %, Psalms 80 %, Romans 88 % (of 745, 397, 448, 11 411, 8 115, 13 244 and 2 912 references). The word that refers is found by key and occurrence for all but Ruth 2 of 602, Genesis 1 of 8 275, Matthew 61 of 5 637, Psalms 44 of 9 342 and Romans 22 of 1 622 (script: scratchpad `ante.ts`, rerun in Task M6).
- **`renderings({strong})` is real.** `renderings({strong: 'H5281'})` (Naomi, in Ruth only) on the en packs took 19.3 s and left 860 MB heap (1.2 GB rss) in bun. `query/renderings.ts` opens `book:` and `orig:` of every installed book, even when the `xmap` says the Strong is not there. The reader caches every `Segment` and view it read, with no limit (`segCache`, `viewCache` in `reader.ts`). On a phone this runs out of memory.

## Decisions for Abel before this runs

1. **The format 3 exception.** Claude writes and `lp3-reviewer` reviews (Codex on the spec, Task M1), as in phases 1 and 2. Confirm it still holds for this work.
2. **The antecedent occurrence.** Today's source only lets the builder fix it for 80–94 % of references (above).
   - **Option A (recommended):** ship now with the rule above. Every row always carries the entity and the antecedent's verse ("she → Ruth (2:2)"). The position is given only when the rule fixes it, and is absent otherwise, never guessed. Later, a Taller change (follow-up below) can make it exact with no format change: the column stays, more rows get a value.
   - **Option B:** make it exact first. Taller writes the target's key and occurrence, the MACULA release is rebuilt, and then this plan runs. That puts Taller (Idiomas Puentes) and a new MACULA release before any of this ships.
3. **Positions, not `CCCVVVWWW`.** Every word in v2 (tree leaves, referents) is an original word position (`ids.md`), the same numbers the alignment and `orig.words` use. A reader that needs `chapter:verse` gets it from the events, as today. Recommended, since Mini already maps alignment by position.

## Global Constraints

Phase 1 and 2 Global Constraints hold (deterministic CBOR, no Node in readers, the spec is the authority, rulings in the ledger). In addition:

- Branch `feat/lp3-macula-v2` from `f98a0aa6`. Commits stay local until Abel says yes. No push, PR, merge or publish without him.
- Only the `macula` table of `orig` changes. `words` and `text` are byte-equal to what `f98a0aa6` builds for the same sources. No other class changes.
- The builder writes `macula` v2 only. Both readers (TypeScript and `lp3read.py`) read v1 and v2. An old reader skips v2: test it with the code of `c68e3622` and of `wt/lp3-mcp` (read-only: import from a copy, change nothing there).
- MACULA stays under CC BY 4.0. `release` and the resource's license in the catalog are unchanged.
- Nothing is guessed. A tree word or a referring word whose place cannot be found, and an antecedent the rule cannot fix, are counted in the build report (per book) and left out (tree leaf, row) or left empty (antecedent position).
- Size and speed gate (Task M6), on the en build of all 66 books: the Genesis `orig` opens (`readSegment` + `origView`, warm, bun, this PC) in at most half of today's time measured the same way (`f98a0aa6` build), and its body is at most 60 % of today's 1 017 315 bytes. Reading one verse's trees and referents after that takes under 5 ms.

## Review Focus

1. **Old readers** skip v2 and still open the segment (both old copies, and `lp3read.py` with v2 not in its known versions). Test in M2 and M6.
2. **A sentence across verses** (Titus 1:1–4, Matthew) is found from each of its verses, once. Test in M3.
3. **Hebrew pieces** (`[id, text]`): the piece's text survives and its position is its word's. Test in M3.
4. **Repeated forms** in a verse: the referring word is the right occurrence. A verse with two words of the entity's Strong gives no antecedent position. Test in M4.
5. **The antecedent in another chapter** (`x, y` ≠ 0) and in the same verse (`0, 0`) both give the right verse. Test in M4.
6. **`words` and `text` unchanged** by the new table. Test in M3.

---

### Task M1: Specification of `macula` v2 and the codes

**Files:** modify `spec/cddl/orig.cddl`, `spec/README.md` (open item; status line), `spec/tests/README.md` (reader output and `E_BODY` checks of v2), `spec/ids.md` (a short note: MACULA words are positions).

- [ ] `orig.cddl`: `? "macula": macula` becomes `macula-v1 / macula-v2` by the table's version in `h.tables`. Keep v1 as it is, and document its codes in comments: the target `[kind, piece, chapter, verse, word]`, the kinds, the key and occurrence, `0, 0`, and the tree labels and leaves, all from the facts above.
- [ ] `macula-v2`:
  ```
  macula-v2 = {
    "release": tstr,
    ? "trees": {
      "labels": strtab,          ; every label ("*", "v", "s*", "&"...), most used first, ties by code point
      "pieces": strtab,          ; the texts of Hebrew word pieces, most used first
      "lo": deltas,              ; per sentence: its lowest word position (svarint deltas, sentences in book order)
      "span": uvarints,          ; per sentence: highest position minus lowest
      "nodes": [* bstr],         ; per sentence: its tree in preorder, as uvarints (below)
    },
    ? "referents": {
      "ents": [* [tstr, tstr]],  ; [form, strong]: the form as published, the Strong as a map key (ids.md, strongKey)
      "kinds": strtab,           ; "r", "s", "c", "a", "p", "o", most used first
      "pieces": strtab,          ; "" and the suffix texts
      "cols": {                  ; one row per reference, rows by word position, then the source order
        "word": uvarints,        ; delta of the referring word's position from the row before (first from 0)
        "kind": uvarints, "piece": uvarints, "ent": uvarints,
        "ch": uvarints, "vs": uvarints,   ; the antecedent's chapter and verse (never 0: resolved)
        "ante": uvarints,        ; the antecedent's position + 1; 0 when the rule cannot fix it
      },
    },
  }
  ```
  A tree in `nodes` is a list of uvarints `t`, read in preorder from the root. `t % 3 == 0`: a part with label `t / 3`, followed by one uvarint, its number of children. `t % 3 == 1`: a word at position `lo + (t - 1) / 3`. `t % 3 == 2`: a piece of the word at `lo + (t - 2) / 3`, followed by one uvarint, its index in `pieces`. The list is used up exactly by one root.
- [ ] Reader output for v2 (`tests/README.md`): `macula.v` 2, the trees as `{lo, hi, tree}` per sentence with the tree decoded into `[label, ...children]`, a word as its position, a piece as `[position, text]`. The referents as rows `{word, kind, piece, form, strong, ch, vs, ante?}`.
- [ ] `E_BODY` checks of v2: columns of unequal length; an index outside its strtab or `ents`; a tree that is cut short, has bytes left or more than one root; a word position outside `lo..lo+span` or outside the book's words; a node deeper than 64; `ch`/`vs` 0; `ante` above the number of words.
- [ ] Rule text for the builder: the antecedent rule (above), the key and occurrence of the referring word, what is counted and left out.
- [ ] Codex reviews the spec read-only (recipe: Servos memory `codex-cli-windows.md`) together with the `lp3-reviewer`.
- [ ] Commit `spec: macula v2 in columns, and the MACULA codes`.

### Task M2: Model, writer and view of v2

**Files:** `src/model.ts` (`OrigModel.macula` gains the v2 shape: `{ release; v: 2; trees?: MaculaTrees; referents?: MaculaReferents }`, with `MaculaTrees = { labels; pieces; lo: number[]; span: number[]; nodes: Uint8Array[] }` and the referent columns as arrays), `src/build/orig.ts` (`origSegment` writes v2 from the model), `src/read/orig.ts` (`ORIG_TABLES.macula = [1, 2]`; the view checks the columns and keeps `nodes` undecoded).

- [ ] Create `src/read/macula.ts` (no Node): `sentencesAt(trees, lo, hi)` (indexes of the sentences whose span meets `lo..hi`), `sentenceTree(trees, i)` (decodes one, with the `E_BODY` checks), `referentsAt(refs, lo, hi)` (rows of the words `lo..hi`), and `verseRange(model, chapter, verse)` (first and last word position from the events).
- [ ] Tests: round trip; each `E_BODY` check; v1 still read; a segment with v2 read with `known: { words: [1], text: [1], macula: [1] }` (an old reader) skips the table and gives a model without `macula`.
- [ ] Commit `orig: macula v2 model, writer and view`.

### Task M3: Build the trees

**Files:** create `src/build/macula/trees.ts`; modify `src/build/orig.ts` (`extractOrig` turns the published trees into v2 with the book's verse starts).

- [ ] A leaf id `CCCVVVWWW` → position = first word of `C:V` + `WWW` − 1. A `[id, text]` leaf → a piece. A leaf whose verse is not in the book, or whose `WWW` is past the verse's words, is dropped and counted.
- [ ] Labels and pieces as strtabs; sentences in published order. A sentence that keeps no word is dropped and counted.
- [ ] Tests: Ruth 2:3 and Titus 1:1–4 from the printed examples (survey) give the same trees, positions in place of ids; a cross-verse sentence is found from each verse; `words` and `text` byte-equal to the v1 build.
- [ ] Commit `orig: MACULA trees as v2`.

### Task M4: Build the referents

**Files:** create `src/build/macula/referents.ts`; modify `src/build/orig.ts`.

- [ ] Referring word: in verse `c:v`, the word whose `referentKey(form)` equals the key, counting occurrences from 0 (the same function as Taller's, written here with a test against its examples). Not found → the item is dropped and counted.
- [ ] Each target `[kind, piece, x, y, n]` → one row: `ch, vs` = `x, y`, or the referring word's verse when `x` is 0; `ent` = `n` (with `ents` built from `words`, the Strong through `strongKey`); `ante` by the rule: the one word of `ch:vs` whose `strongKey` equals the entity's, else the one of several whose `referentKey` contains the entity's or is contained by it, else none.
- [ ] Tests: Ruth 2:3 (`she → Ruth (2:2)`: `ante` is Ruth's word in 2:2), Ruth 2:4, Titus 1:5 (two targets on one verb), a verse with two words of the entity's Strong (no `ante`), an unknown key (dropped, counted).
- [ ] Commit `orig: MACULA referents by position, with the antecedent`.

### Task M5: Python reader

**Agent:** `lp3-pyreader`, from the spec alone.

- [ ] `lp3read.py` reads v1 and v2 (`KNOWN_TABLES` versions per table), with the v2 checks and reader output of `tests/README.md`.
- [ ] A frozen conformance case `macula-v2` (Ruth: small) built by `build-cases.ts`, run by both readers. Existing cases unchanged (`build-cases.ts --check`).
- [ ] Commit `reader-py: macula v2` and `spec: the macula-v2 case`.

### Task M6: `renderings` and the client

**Files:** `packages/language-pack-client/src/query/renderings.ts`, `packages/language-pack-client/src/reader.ts`, tests.

- [ ] With the `xmap`, `renderings` opens only the books where it counts the Strong (`counted`). Without it, all, as today.
- [ ] The reader keeps a book's `Segment` only until its view is built (the view is what is cached), so a segment's bytes are not held twice. If a test shows memory still grows past one book per call, bound the book and orig views (least recently used, a small number) and say so in the report.
- [ ] Test: `renderings({strong})` of a one-book Strong opens one `book:` and one `orig:`. Measure H5281 on the en packs before and after (time, heap) and put the numbers in the report.
- [ ] Commit `client: renderings opens only the books that have the Strong`.

### Task M7: Gate on real data and spec status

- [ ] Build en (all 66 `orig`) from the same sources as staging. Report per book: sentences, dropped leaves, referents rows, dropped items, `ante` fixed / not fixed; segment sizes against the `f98a0aa6` build.
- [ ] The speed and size gate of the Global Constraints, on Genesis, Psalms and Matthew, plus one verse read.
- [ ] Old readers: open the new Genesis `orig` with the reader of `c68e3622` (`git archive c68e3622 packages/language-pack-v3` into the scratchpad) and with `wt/lp3-mcp`'s, unchanged. Both give the model without `macula`. Then read the new common catalog with both.
- [ ] `spec/README.md`: status line; the open item "MACULA … in columns" closed for MACULA (the lexicon stays open); deviations.
- [ ] Commit `spec: status after macula v2`.

## After Task M7 (controller)

- Final review: three Opus `lp3-reviewer`s in parallel (spec and Python reader; builders; readers and client), as `.claude/lp3-controller.md` says.
- PR ready, not opened, until Abel says yes. Staging (`packs-staging`) only from master after Abel merges, coordinated with the Mini coordinator (`local_846480fa…`) and the OBS session (`local_7aea409e…`), which also publish en. The common catalog gets a new revision, since every `orig` segment id changes.
- Send the Mini coordinator the decided shapes: positions, the v2 columns, `sentencesAt`/`sentenceTree`/`referentsAt`, the codes, and that an old app sees no MACULA.

## Follow-up, not in this plan

- **Taller (Idiomas Puentes):** `referentFiles` writes for each target the antecedent's key and occurrence in its verse, as a sixth and seventh item. Taller's own reader ignores extra items. Then a new MACULA release lets the builder fix every antecedent, with no format change. Claude does this under the Idiomas Puentes rules, after this plan merges and only if Abel wants it.
