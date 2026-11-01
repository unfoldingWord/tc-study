# Language packs format 3, phase 1: codec, builders, bridge and readers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build format 3 segments from today's format 2.0 rows. Read them back in TypeScript and, independently, in
Python, and prove both readers agree on every conformance case.

**Architecture:**
- A new package, `packages/language-pack-v3`, with four layers:
  - a codec: varints, deterministic CBOR, the container;
  - extractors that turn 2.0 rows into logical models;
  - builders that turn models into segments;
  - readers that turn segments back into the models (the "reader output" of the spec).
- Every builder is a pure function with no Node API, so the bridge runs on a device. Node-only code lives in
  `src/node/`.
- A Python reader written from the spec alone checks the TypeScript one.

**Tech Stack:** TypeScript ESM, `bun test`, `pako` 2.1.0 (deflate-raw, pinned as in format 2.0), `cbor-x` (decoding
only), `jszip` (old packs); Python 3.11 with `cbor2` for the independent reader.

**Spec:** `packages/language-pack-v3/spec/` (README, `container.md`, `ids.md`, `counts.md`, `catalog.md`,
`transfer.md`, `cddl/`, `tests/README.md`). The spec is the authority; where this plan and the spec disagree, the spec
wins.

## Global Constraints

- Package `@bt-synergy/language-pack-v3` at `packages/language-pack-v3`. `"type": "module"`, scripts `build: tsc`,
  `test: bun test`, `type-check: tsc --noEmit`, as `packages/language-pack/package.json`.
- Nothing under `src/` imports a Node module except `src/node/`. Builders and readers run in a browser and a Worker.
- Container bytes:
  - magic `89 54 4C 50`;
  - major `03`, minor `00`;
  - kind `01` segment, `02` transfer file;
  - reserved `00`;
  - header length u32 big-endian.
- Header keys `h`, `codec` (`"deflate-raw"`), `clen`, `ulen`, `id` (32 bytes), optional `sig`. The body is the CBOR map
  `{h, t}`.
- Identity: sha256 of the uncompressed body bytes. Ids are printed as lowercase hex.
- Limits: header ≤ 65 536 bytes; `ulen` and `clen` ≤ 67 108 864; CBOR nesting ≤ 16.
- Error codes, exactly: `E_MAGIC E_VERSION E_KIND E_TRUNCATED E_TRAILING E_HEADER E_CODEC E_INFLATE E_ID E_BODY
  E_HMISMATCH E_TABLE E_LIMIT`.
- Deterministic CBOR (RFC 8949 §4.2.1):
  - shortest integers, definite lengths;
  - map keys sorted by the bytes of their encoding;
  - no floats, no tags, no `null`, no `undefined`.
- Text is kept as published: no Unicode normalization, no trimming. The only exception is the TSV escapes in
  note/question/response, where `\n` and `<br>` become line breaks (`book.cddl`).
- String tables: most used first, ties by **code point** order (not UTF-16 code unit order).
- `uvarints` are unsigned LEB128, minimal, values up to 2^53 − 1. Use arithmetic, not 32-bit bit operations.
- `svarints`: zigzag `n ≥ 0 → 2n`, `n < 0 → −2n − 1`.
- `bits`: least significant bit first.
- `texts`: `{utf8, len}`.
- Compression: `pako.deflateRaw(body, { level: 9 })`; decompression `pako.inflateRaw`. The compressed bytes are not
  part of the identity, so they may differ from Python's.
- Verse id `LLCCCVVV`, with the book number from the canonical order in `ids.md`. Original positions are 0-based
  indexes among the book's `\w`, footnotes included.
- Concept ids: `tw:{kt|names|other}/{name}`, `ta:{manual}/{slug}`. Strong keys: Hebrew after the last `:`, Greek as
  published (`G54850`).
- Commits: English, a short title and a body that says why, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, no PR, no merge: the controller asks Abel.

## Review Focus

1. **Strings outside the BMP.** A string table that has them sorts by code point: `"\uFFFF"` comes before
   `"\u{1D538}"`, though UTF-16 order says the opposite. Test in Task 1.
2. **Numbers above 2^31.** Varints of 2^40 and 2^53 − 1 survive a round trip. Positions and verse ids grow, and 32-bit
   bit operations corrupt them silently. Test in Task 1.
3. **Bytes after the deflate stream** inside a body are rejected with `E_INFLATE`, not ignored. Test in Task 3.
4. **A book with notes and no text.** A language with notes for a book and no bridge text of it builds a book segment
   with `texts: []`, and its notes keep their quotes. Test in Task 8.
5. **Broken Hebrew attributes and lemmas that differ only by normalization** (seen in Psalms in phase 0). They still
   resolve to positions through the folded lookup; what does not resolve lands in `alignMissing` or `missing`. Tests
   in Tasks 6 and 7.

## Execution with specialized agents

**Controller.** One fresh Claude Code session started in `C:\Users\LENOVO\Git\Github\wt\langpack-v3`, running
superpowers:subagent-driven-development. Its only inputs are this plan and the spec, not the conversation that wrote
them. That is the largest saving: a long design conversation re-read on every turn costs more than all the subagents
together.

**Agents** (definitions in `.claude/agents/` of the worktree, excluded from git):

| Agent | Model | Tools | Does |
| --- | --- | --- | --- |
| `lp3-implementer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | One task from its brief file. TDD; commits; writes the full report to the report file; returns ≤ 10 lines. Never dispatches agents |
| `lp3-reviewer` | sonnet | Read, Grep, Glob, Bash (read-only use) | One task's review package against its brief and the spec sections it names. Returns the two verdicts and findings, ≤ 40 lines |
| `lp3-pyreader` | sonnet | Read, Edit, Write, Bash, Grep, Glob | Task 13 only. Reads `spec/` and nothing under `src/`, so its reader is independent |
| `lp3-runner` | haiku | Bash, Read | Runs a given command and returns only the failing tests and the summary line, ≤ 15 lines |

- The final whole-branch review runs on opus.
- Codex (another model family) reviews Task 3 (container) and Task 13 (Python reader), if it has tokens for a good
  model; otherwise opus does.

**Rules that keep context small:**
- Briefs, reports and review packages are files, never pasted text.
- Each dispatch carries one task, its interfaces and the global constraints; never earlier tasks' history.
- Exploration of existing code goes to the built-in `Explore` agent; only its conclusion returns.
- Small same-shape edits go in one batch to one agent.
- The ledger (`.superpowers/sdd/<plan>/progress.md`) is the memory that survives compaction.

**Setup before Task 1:**
- run `bun install` at the worktree root, in the background;
- check that `packages/language-pack` tests pass (`bun test` in that package).

---

### Task 1: Package and column codecs

**Files:**
- Create: `packages/language-pack-v3/package.json`, `tsconfig.json`, `README.md` (one paragraph pointing to `spec/`)
- Create: `packages/language-pack-v3/src/codec/columns.ts`
- Test: `packages/language-pack-v3/src/codec/columns.test.ts`

**Interfaces:**
- Produces:
  - `encodeUvarints(values: Iterable<number>): Uint8Array`
  - `decodeUvarints(bytes: Uint8Array): number[]`
  - `encodeSvarints(values: Iterable<number>): Uint8Array`
  - `decodeSvarints(bytes: Uint8Array): number[]`
  - `encodeDeltas(values: number[]): Uint8Array`
  - `decodeDeltas(bytes: Uint8Array): number[]`
  - `encodeBits(flags: boolean[]): Uint8Array`
  - `decodeBits(bytes: Uint8Array, n: number): boolean[]`
  - `encodeTexts(strings: string[]): { utf8: Uint8Array; len: Uint8Array }`
  - `decodeTexts(t: { utf8: Uint8Array; len: Uint8Array }): string[]`
  - `compareCodePoints(a: string, b: string): number`
  - `stringTable(uses: Iterable<string>): { list: string[]; index: Map<string, number> }`
  - `class ColumnError extends Error` (thrown on malformed input; Task 3 maps it to `E_BODY`)

- [ ] **Step 1: Write the failing tests** in `columns.test.ts`:
  - `uvarints round trip` on `[0, 1, 127, 128, 300, 2 ** 31, 2 ** 40, 2 ** 53 - 1]`;
  - `encodeUvarints([300])` equals `[0xac, 0x02]`;
  - `decodeUvarints` of `[0x80, 0x00]` throws `ColumnError` (not minimal);
  - `svarints` maps `[0, -1, 1, -2]` to `encodeUvarints([0, 1, 2, 3])`;
  - `deltas` of `[56001001, 56001003, 56001002]` round-trip;
  - `bits` of `[true, false, true, true, false, false, false, false, true]` is `[0x0d, 0x01]`;
  - `texts` round-trips `["", "Pablo", "ἀνέγκλητος"]` with `len` = uvarints `[0, 5, 20]`;
  - `stringTable(["b", "a", "b", "\u{1D538}", "\uFFFF"]).list` equals `["b", "a", "\uFFFF", "\u{1D538}"]`.
- [ ] **Step 2: Run** `bun test src/codec/columns.test.ts` in the package. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `columns.ts`.**
  - Varints use `Math.floor(n / 128)` and `n % 128`, never `>>`.
  - A varint longer than 8 bytes, or one above 2^53 − 1, throws `ColumnError`.
  - `stringTable` sorts by descending count, then by `compareCodePoints`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: package and column codecs".

### Task 2: Deterministic CBOR

**Files:**
- Create: `packages/language-pack-v3/src/codec/cbor.ts`
- Test: `packages/language-pack-v3/src/codec/cbor.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type CborValue = number | string | boolean | Uint8Array | CborValue[] | { [key: string]: CborValue }`
  - `encodeDeterministic(value: CborValue): Uint8Array`, which throws `TypeError` on a non-integer number, `null`,
    `undefined` or nesting deeper than 16
  - `decodeCbor(bytes: Uint8Array): CborValue`, using `cbor-x` with `mapsAsObjects: true` and `useRecords: false`,
    byte strings as `Uint8Array`. It throws `ColumnError` on tags, floats, `null` and `undefined`.

- [ ] **Step 1: Write the failing tests:**
  - `encodeDeterministic(500)` is `[0x19, 0x01, 0xf4]`; `-1` is `[0x20]`;
  - `{"tables": 1, "h": 2, "id": 3}` encodes with keys in the order `h`, `id`, `tables`;
  - `encodeDeterministic(1.5)` throws;
  - `decodeCbor(encodeDeterministic(x))` deep-equals `x` for a nested value with bytes, text, arrays and booleans;
  - the encoding of `{"h": {…}, "t": {…}}` from `spec/tests/container/minimal.expected.json` has sha256
    `644fd73e8b75f16563e6adf91301f5f7727339f3e405ab9ce9ebf3dfe7e52ea7`. Rebuild `t` exactly as
    `make_examples.py` does: the `tok` and `ev` bytes from its pieces and events.
- [ ] **Step 2: Run** `bun test src/codec/cbor.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `cbor.ts`.**
  - Write the encoder by hand (majors 0, 1, 2, 3, 4, 5, 7 for booleans).
  - Sort map keys by comparing their encoded byte strings.
  - Decode with `cbor-x`, and reject anything outside `CborValue`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: deterministic CBOR".

### Task 3: The container

**Files:**
- Create: `packages/language-pack-v3/src/codec/errors.ts`, `src/codec/container.ts`
- Test: `packages/language-pack-v3/src/codec/container.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ColumnError`), Task 2 (`encodeDeterministic`, `decodeCbor`, `CborValue`).
- Produces:
  - `type FormatErrorCode` (the 13 codes)
  - `class FormatError extends Error { code: FormatErrorCode }`
  - `type ClassName = 'catalog' | 'xmap' | 'map' | 'book' | 'orig' | 'art' | 'lex' | 'obs' | 'gen'`
  - `type LogicalHeader = { class: ClassName; v: number; tables: Record<string, [number, boolean]>; lang?: string;
    book?: string; part?: string; group?: string; orig?: [string, string]; res?: [string, string][] }`
  - `type Segment = { h: LogicalHeader; t: Record<string, CborValue> }`
  - `writeSegment(seg: Segment, extra?: { sig?: { key: string; alg: 'ed25519'; s: Uint8Array }[] }): Promise<{ bytes:
    Uint8Array; id: string; body: Uint8Array }>`
  - `readHeader(bytes: Uint8Array): { kind: 1 | 2; header: Record<string, CborValue>; headerEnd: number }`
  - `readSegment(bytes: Uint8Array, opts: { known: Record<string, number[]>; expectedId?: string }): Promise<{ seg:
    Segment; id: string; header: Record<string, CborValue>; skipped: string[] }>`. `known` maps a table name to the
    versions the caller understands; `skipped` lists the optional tables left out.
  - `hex(bytes: Uint8Array): string`

- [ ] **Step 1: Write the failing tests:**
  - `readSegment` of `spec/tests/container/minimal.seg` with `known: {strings: [1], texts: [1]}` gives id `644fd73e…`
    and the `h` of `minimal.expected.json`;
  - `truncated.seg` → `E_TRUNCATED`; `bad-id.seg` → `E_ID`;
  - `writeSegment` of that same `{h, t}` gives the same id;
  - one test per remaining code. Build each from `minimal.seg`:
    - `E_MAGIC`: byte 0 changed;
    - `E_VERSION`: byte 4 = 4;
    - `E_KIND`: byte 6 = 2;
    - `E_TRAILING`: one byte appended;
    - `E_HEADER`: header replaced by a CBOR array;
    - `E_CODEC`: codec `"zstd"`;
    - `E_INFLATE`: 3 garbage bytes after the deflate stream, `clen` adjusted;
    - `E_HMISMATCH`: header `h.lang` changed and `id` recomputed;
    - `E_TABLE`: `known` lacks `texts`;
    - `E_LIMIT`: `H` set to 70 000;
  - an extra optional table `future-x` is reported in `skipped` and absent from `seg.t`.
- [ ] **Step 2: Run** `bun test src/codec/container.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `container.ts`** in the order of `container.md` "Errors":
  - check the fixed bytes first;
  - then the header;
  - then the lengths;
  - then inflate, and check that it consumed the whole body;
  - then `ulen`, the id, the `h` equality (deep, on decoded values) and the tables.

  `E_TABLE` comes when a required table is not in `known` or has a version `known` lacks.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: container". The controller then asks for the Codex (or opus) review of
  this task.

### Task 4: Ids, references and links

**Files:**
- Create: `packages/language-pack-v3/src/ids.ts`
- Test: `packages/language-pack-v3/src/ids.test.ts`

**Interfaces:**
- Produces:
  - `BOOKS: readonly string[]` (66 codes, canonical order of `ids.md`)
  - `bookNumber(code: string): number`
  - `verseId(book: string, chapter: number, verse: number): number`
  - `parseRef(book: string, ref: string): [number, number] | null`
  - `formatRef(book: string, from: number, to: number): string`
  - `bookSet(books: Iterable<string>): Uint8Array` (9 bytes)
  - `strongKey(published: string): string`
  - `conceptOfSupportReference(s: string): string | null`
  - `conceptOfTwLink(s: string): string | null`
  - `rewriteLinks(md: string, book: string | null): string`
  - `unescapeTsv(s: string): string`

- [ ] **Step 1: Write the failing tests:**
  - `verseId('tit', 2, 11)` is `56002011`;
  - `parseRef('tit', 'front:intro')` is `[56000000, 56000000]`; `'2:intro'` is `[56002000, 56002000]`; `'1:2-4'` is
    `[56001002, 56001004]`; `'1:12-2:3'` is `[56001012, 56002003]`; `'1:1,3'` is `null`;
  - `formatRef` inverts each non-null case;
  - `strongKey('b:H4999')` is `'H4999'`, `'H7462b'` stays `'H7462b'`, and `'G54850'` stays `'G54850'`;
  - `conceptOfSupportReference('rc://*/ta/man/translate/figs-metaphor')` is `'ta:translate/figs-metaphor'`;
  - `conceptOfTwLink('rc://*/tw/dict/bible/kt/grace')` is `'tw:kt/grace'`;
  - the four rows of the `ids.md` "Links inside text" table, as `rewriteLinks` cases (book `tit`);
  - `unescapeTsv('a\\nb<br>c')` is `'a\nb\nc'`;
  - `bookSet(['gen', 'rev'])` has bit 0 and bit 65 set.
- [ ] **Step 2: Run** `bun test src/ids.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `ids.ts`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: ids, references and links".

### Task 5: Row sources

**Files:**
- Create: `packages/language-pack-v3/src/source/rows.ts`, `src/source/zipSource.ts`, `src/node/partsSource.ts`
- Create: `packages/language-pack-v3/spec/tests/data/` (about 1 MB in all) with:
  - the es-419 Titus parts of staging and the parts lists they come from;
  - the UGNT Titus parts;
  - three es-419 common parts: the tW titles part, the tW part that holds `kt/grace`, and the `ugl` lexicon part for
    G1–G999;
  - `es-419-tit.langpack.zip` (format 1.1).

  Copy them from `C:\Users\LENOVO\Git\Github\wt\fase0-paquetes\muestra` and
  `C:\Users\LENOVO\Git\Github\wt\paquetes-q9a12\`. Add a README with their source, sha256 and license (CC BY-SA 4.0).
  Whole-language checks use the full phase 0 sample instead (Task 15).
- Test: `src/source/rows.test.ts`

**Interfaces:**
- Produces:
  - `type Row = { layer: string; key: string; value: unknown }`
  - `type ResourceRef = { key: string; stamp: string; kind: string; books: string[] }`
  - `interface RowSource { rows(f: { lang: string; book?: string; resource?: string; layer?: string }):
    AsyncIterable<Row>; resources(lang: string): Promise<ResourceRef[]> }`. `lang` is `'originals'` for the originals.
  - `partsSource(o: { list: string; partsDir: string; originals?: string }): Promise<RowSource>` (Node)
  - `zipSource(zip: Uint8Array, originals?: RowSource): Promise<RowSource>`, for a format 1.1 pack: rows from
    `rows/{layer}/{resource}.jsonl` lines `{key, entry}` as `{layer, key, value: entry}`, resources from
    `manifest.json`.

- [ ] **Step 1: Write the failing tests:**
  - from the data folder, `partsSource` gives the same multiset of `(layer, key)` for es-419 Titus as `zipSource`,
    for the five resources `glt gst tn tq twl`;
  - `resources('es-419')` lists them with their stamps.
- [ ] **Step 2: Run** `bun test src/source`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Parts are `gzip` of JSONL `{layer, key, value}` (`packages/language-pack/src/parts/partFile.ts`); read them with
    `pako.ungzip`.
  - Parts lists are JSON with `parts[]` (`book`, `kind`, `resource`, `sha256`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: row sources for parts and old packs".

### Task 6: The original

**Files:**
- Create: `packages/language-pack-v3/src/model.ts` (shared model types, below), `src/build/orig.ts`, `src/read/orig.ts`
- Test: `src/build/orig.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces (in `model.ts`):
  - `type Event = [position: number, kind: 'chapter' | 'verse' | 'open' | 'close', arg: string]`
  - `type Piece = [text: string, isWord: boolean]`
  - `type OrigWord = { form: string; lemma: string; strong: string; morph: string; other?: Record<string, string> }`
  - `type OrigModel = { book: string; key: string; stamp: string; words: OrigWord[]; pieces: Piece[]; events: Event[];
    attrs?: Record<number, Record<string, string>>; macula?: { release: string; trees?: unknown; referents?: unknown } }`
- Produces (in `build/orig.ts`):
  - `extractOrig(source: RowSource, book: string): Promise<OrigModel>`
  - `origSegment(m: OrigModel): Segment`
  - `class OrigIndex { constructor(m: OrigModel); find(verse: number, text: string, occurrence: number): number | null;
    verseOf(position: number): number }`
- Produces (in `read/orig.ts`): `origView(seg: Segment): OrigModel`

- [ ] **Step 1: Write the failing tests:**
  - UGNT Titus from the data folder has 659 words;
  - `origView(origSegment(m))` deep-equals `m`;
  - `find(56001006, 'ἀνέγκλητος', 1)` is a position whose `form` is `'ἀνέγκλητος'`;
  - `find` with the text in NFD or with `/` and U+2060 inserted returns the same position;
  - a word with an attribute outside the four keeps it in `other`.
- [ ] **Step 2: Run** `bun test src/build/orig.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Walk each chapter row's `value.content.usj.content` (keys `scripture-usj:{res}:{book}:{chapter}`).
  - Words are `char` nodes with marker `w`; the rest becomes pieces and events, as in `orig.cddl`.
  - `find` tries the exact `(verse, text, occurrence)` first, then the folded text: NFC, without `/` and U+2060.
  - MACULA rows (`…/macula/trees/{BOOK}`, `…/referents/{BOOK}`) go to `macula` as they are.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: original segment".

### Task 7: Book texts and alignment

**Files:**
- Create: `packages/language-pack-v3/src/build/bookTexts.ts`, `src/build/book.ts`, `src/read/book.ts`
- Modify: `packages/language-pack-v3/src/model.ts` (add the types below)
- Test: `src/build/bookTexts.test.ts`

**Interfaces:**
- Consumes: Task 6 (`OrigIndex`, `Event`, `Piece`).
- Produces (in `model.ts`):
  - `type TextModel = { res: string; pieces: Piece[]; events: Event[]; attrs?: Record<number, Record<string, string>>;
    align?: number[][]; alignMissing?: [word: number, verse: number, original: string, occurrence: number][] }`
  - `type HelpRow = { id: string; ref: string; from: number; to: number; concept?: string; cols: Record<string, string
    | boolean>; quote?: number[]; quoteKinds?: [piece: number, kind: string][]; quoteMissing?: [piece: number, verse:
    number, word: string, occurrence: number][] }`
  - `type HelpTable = { res: string; rows: HelpRow[] }`
  - `type BookModel = { lang: string; book: string; orig: [string, string]; res: [string, string][]; texts:
    TextModel[]; notes?: HelpTable; questions?: HelpTable; links?: HelpTable }`
- Produces:
  - `extractText(rows: Row[], book: string, res: string, orig: OrigIndex): TextModel` (`build/bookTexts.ts`)
  - `bookSegment(m: BookModel): Segment` (`build/book.ts`; the helps part comes in Task 8)
  - `bookView(seg: Segment): BookModel` (`read/book.ts`)

- [ ] **Step 1: Write the failing tests** with es-419 Titus from the data folder:
  - GLT gives 1 416 pieces, 953 words, 953 aligned words, 69 events;
  - GST gives 3 075 pieces, 1 732 words, 1 732 aligned, 69 events;
  - joining the pieces of verse 1:1 of GLT starts with `"Pablo, siervo de Dios"`;
  - `bookView(bookSegment(m))` deep-equals `m` (texts only);
  - a synthetic chapter with a `zaln-s` whose `x-content` the original lacks puts that word in `alignMissing`.
- [ ] **Step 2: Run** `bun test src/build/bookTexts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as `book.cddl` "Texts" says:
  - the `zaln-s`/`zaln-e` stack gives each word its positions, through `OrigIndex.find(verse, x-content, x-occurrence)`;
  - other milestones open and close at the same position;
  - `x-occurrence` and `x-occurrences` of `\w` are dropped;
  - attributes other than `type`, `marker`, `content` and `sid` go to `attrs`.

  The table `align` is written only when some word is aligned.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: book texts and alignment".

### Task 8: Notes, questions, word links and quotes

**Files:**
- Create: `packages/language-pack-v3/src/build/bookHelps.ts`
- Modify: `src/build/book.ts`, `src/read/book.ts`
- Test: `src/build/bookHelps.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7.
- Produces:
  - `extractHelps(rows: Row[], book: string, res: string, kind: 'notes' | 'questions' | 'links', orig: OrigIndex):
    HelpTable`
  - `extractBook(source: RowSource, lang: string, book: string, orig: OrigModel): Promise<BookModel>`
  - `bookSegment` now also writes `notes`, `questions`, `links` and `quotes`; `bookView` reads them.

- [ ] **Step 1: Write the failing tests** with es-419 Titus:
  - 216 notes (212 with a quote), 36 questions, 223 links (223 with a quote);
  - every link's `concept` starts with `tw:`, and no link keeps `twLink` in `cols`;
  - the note with id `m2jl` has `ref` `'1:1'`, a `note` column that holds no literal `\n`, and links rewritten to
    `ta:`;
  - `bookView(bookSegment(m))` deep-equals `m`;
  - a model with notes and `texts: []` builds, reads back, and keeps its quotes (Review Focus 4).
- [ ] **Step 2: Run** `bun test src/build/bookHelps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as `book.cddl` "Notes, questions and word links":
  - Rows come from the sot keys `tn:{res}:{book}:{chapter}` (`content.notes`), `tq:…` (`content.questions`) and
    `twl:{res}:{book}` (`links`).
  - Quote positions come from the quote layer (`helps-quote:…`), through `OrigIndex.find`.
  - Repeated ids get `~2`, `~3` (`ids.md`).
  - The `align` layer of format 2.0 is not read.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: notes, questions, word links and quotes".

### Task 9: Articles and their sections

**Files:**
- Create: `packages/language-pack-v3/src/build/sections.ts`, `src/build/art.ts`, `src/read/art.ts`
- Test: `src/build/sections.test.ts`, `src/build/art.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `type Role = 'intro' | 'definition' | 'facts' | 'translation-suggestions' | 'examples' | 'strategies' |
    'description' | 'reason' | 'bible-references' | 'word-data' | 'unknown'`
  - `type SectionModel = { sid: string; level: number; role: Role; title?: string; lang: string; md: string; aliases?:
    string[] }`
  - `type ArticleModel = { id: string; res: string; title: string; subtitle?: string; related?: string[]; aliases?:
    string[]; sections: SectionModel[] }`
  - `type SectionRegistry = Record<string, { sid: string; title?: string; level: number; role: Role; fingerprint:
    string }[]>`
  - `splitSections(md: string): { level: number; title?: string; md: string }[]`
  - `roleOf(heading: string): { role: Role; lang: string | null }`, from a table of tW and tA headings in en, es
    and pt. `lang` is the table's language, or `null` when no rule matches.
  - `assignSids(articleId: string, articleLang: string, parts: ReturnType<typeof splitSections>, registry:
    SectionRegistry): { sections: SectionModel[]; registry: SectionRegistry }`
  - `extractArticles(source: RowSource, lang: string): Promise<Map<string, ArticleModel[]>>`, keyed by group
    (`tw:kt`, …, `ta:translate`, …)
  - `artSegment(lang: string, group: string, res: [string, string][], articles: ArticleModel[]): Segment`
  - `artView(seg: Segment): { group: string; articles: ArticleModel[] }`

- [ ] **Step 1: Write the failing tests** — cases 7 and 8 of `spec/tests/README.md` as unit tests:
  - `seccion-insertada`: build twice with the registry in between; the second build has sids `intro`, `definition`,
    `examples`, `translation-suggestions`, with the first three unchanged after the definition heading is corrected;
  - `articulo-mal-titulado`: text before any heading gives `intro`; an unplaceable heading gives `s1` and role
    `unknown`; an English heading in an es-419 article gives section `lang` `'en'`;
  - from the es-419 common parts, `tw:kt/grace` has title `'gracia, amable'`;
  - `artView(artSegment(…))` deep-equals the input.
- [ ] **Step 2: Run** `bun test src/build/sections.test.ts src/build/art.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with the matching order of `ids.md` "Sections of articles":
  1. the same heading;
  2. the same role and the same place among the sections of that role;
  3. at least half of its word trigrams in common.

  The fingerprint is the sha256 of the section's markdown. A section's `lang` is the article's language, unless
  `roleOf` says its heading is from another language's table.
  - tW articles are `sot` rows keyed `{res}/bible/{category}/{name}` with markdown values.
  - tA articles are `sot` rows keyed `{res}/{manual}/{slug}`; their titles come from the `titles` parts
    (`helps-text:ta-title:…`).
  - tA subtitles: read `sub-title` rows if the parts have them, and note in the report that they are missing if not.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: articles with stable section ids".

### Task 10: Lexicon and Open Bible Stories

**Files:**
- Create: `packages/language-pack-v3/src/build/lex.ts`, `src/read/lex.ts`, `src/build/obs.ts`, `src/read/obs.ts`
- Test: `src/build/lex.test.ts`, `src/build/obs.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5, 8 (`extractHelps` pattern for OBS helps, keyed by frame).
- Produces:
  - `extractLexicon(source: RowSource, lang: string): Promise<Map<string, LexEntry[]>>`, keyed by group `G0`, `G5`,
    `H8`…
  - `lexSegment(lang, group, res, entries): Segment`, `lexView(seg)`
  - `extractObs(source: RowSource, lang: string): Promise<ObsModel | null>`
  - `obsSegment(m: ObsModel): Segment`, `obsView(seg): ObsModel`
  - `LexEntry` and `ObsModel` follow `lex.cddl` and `obs.cddl`. OBS help rows have `frame` (story × 100 + frame) in
    place of `from`/`to`.

- [ ] **Step 1: Write the failing tests:**
  - the `ugl` part of the data folder gives group `G0` only, and every entry's Strong number is below 1000;
  - entry `G1` has lemma `ἄλφα`;
  - a sense's `refs` `{"1CH": "2:17,44"}` becomes the ranges of 1 Chronicles 2:17 and 2:44, in the original's numbering
    (use `hebrewNumbering.ts` from the pipeline, found with Explore);
  - `lexView(lexSegment(…))` round-trips;
  - OBS: a synthetic story with two frames, a note on `10:3`, a study note and a study question round-trips. Staging
    has no OBS for en or es-419: take the row shapes from the code that writes OBS rows today (found with Explore),
    and say in the report which file they came from.
- [ ] **Step 2: Run** `bun test src/build/lex.test.ts src/build/obs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: lexicon and Open Bible Stories segments".

### Task 11: Catalog and transfer file

**Files:**
- Create: `packages/language-pack-v3/src/build/catalog.ts`, `src/read/catalog.ts`, `src/transfer.ts`
- Test: `src/build/catalog.test.ts`, `src/transfer.test.ts`

**Interfaces:**
- Consumes: Task 3, and the `Segment` of every builder.
- Produces:
  - `type BuiltSegment = { seg: Segment; bytes: Uint8Array; id: string; inputs: string }`
  - `buildCatalog(o: { about: About; resources: CatalogResource[]; segments: BuiltSegment[]; requires?: [string,
    number, string][]; complements?: Complement[] }): Promise<BuiltSegment>`
  - `catalogView(seg: Segment): CatalogModel`, with `About`, `CatalogResource`, `Complement` and `CatalogModel` as
    in `catalog.cddl`
  - `unitsOf(segments: BuiltSegment[], needs: (s: BuiltSegment) => string[]): Unit[]`: one unit per book, orig book,
    art group, lex group, `obs`, `map` and `xmap` (`catalog.md`)
  - `writeTransfer(o: { mode: 'full' | 'update'; catalogs: BuiltSegment[]; entries: (BuiltSegment | { id: string;
    bytes: Uint8Array; kind: 'complement' })[]; base?: [string, number][]; made: string; by: string }): Uint8Array`
  - `readTransfer(bytes: Uint8Array): Promise<{ index: TransferIndex; entries: { id: string; kind: string; class?:
    string; bytes: Uint8Array }[]; missing: string[] }>`. A file cut inside an entry keeps the complete ones and
    lists the rest in `missing`; a file cut before the end of its catalogs throws `E_TRUNCATED`.

- [ ] **Step 1: Write the failing tests:**
  - a catalog of es-419 Titus (book, orig, needed art groups) lists unit `book:tit` with
    `needs: ['orig:tit', 'map', …]`;
  - `catalogView` round-trips;
  - case 10 (`transferencia-cortada`): a `full` transfer of case 1 and case 4 cut inside case 4's segment keeps the
    catalog and case 1 and lists case 4's id in `missing`;
  - a transfer whose index names an entry beyond the file's end throws `E_TRUNCATED` when that entry is a catalog.
- [ ] **Step 2: Run** `bun test src/build/catalog.test.ts src/transfer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as `catalog.md` and `transfer.md` say.
  - Signing is phase 3: catalogs are written unsigned.
  - Entries are ordered with the catalogs first.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: catalog and transfer file".

### Task 12: Building a language, and the bridge

**Files:**
- Create: `packages/language-pack-v3/src/build/language.ts`, `src/bridge/fromV2.ts`, `src/read/output.ts`,
  `src/index.ts`
- Test: `src/build/language.test.ts`, `src/bridge/fromV2.test.ts`

**Interfaces:**
- Consumes: Tasks 3–11.
- Produces:
  - `buildLanguage(o: { source: RowSource; lang: string; books?: string[]; registry: SectionRegistry; about:
    Omit<About, 'catalog'> }): Promise<{ segments: BuiltSegment[]; catalog: BuiltSegment; registry: SectionRegistry;
    report: string[] }>`
  - `buildCommon(o: { source: RowSource; books?: string[]; about: Omit<About, 'catalog'> }): Promise<{ segments:
    BuiltSegment[]; catalog: BuiltSegment }>`. It builds the orig segments; the xmap comes in phase 2.
  - `bridgeZip(zip: Uint8Array, originals: RowSource, device: string, now: string): Promise<{ segments:
    BuiltSegment[]; catalog: BuiltSegment }>`. The catalog has `origin: 'local'` and `publisher: 'local:' + device`.
  - `readerOutput(bytes: Uint8Array): Promise<unknown>`: the "Reader output" of `spec/tests/README.md`, keys sorted,
    `{error}` on a `FormatError`
  - `KNOWN: Record<ClassName, Record<string, number[]>>` (`read/output.ts`): the tables and versions this reader
    understands, passed to `readSegment`
  - `src/index.ts` exports the public names of Tasks 3–12.

- [ ] **Step 1: Write the failing tests:**
  - **Determinism:** `buildLanguage` of es-419 Titus run twice gives the same ids.
  - **Case 4 sizes:** the es-419 Titus book segment's file is at most 40 KB (phase 0: 35.4 KB with zlib).
  - **Case 13:** `bridgeZip` of the 1.1 zip gives a Titus book segment with the same id as `buildLanguage` from the
    parts.
  - **Reader output:** `readerOutput` of `minimal.seg` equals `minimal.expected.json`.
- [ ] **Step 2: Run** `bun test src/build/language.test.ts src/bridge`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `inputs` is the sha256 of the sorted keys and stamps of the rows a segment was built from.
  - The report lists:
    - repeated ids;
    - unknown section headings;
    - missing originals words;
    - unreadable references.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: build a language, and the bridge from old packs".

### Task 13: The independent Python reader

Dispatched to `lp3-pyreader`, which reads `packages/language-pack-v3/spec/` and nothing under `src/`.

**Files:**
- Create: `packages/language-pack-v3/spec/reader-py/lp3read.py`, `spec/reader-py/test_lp3read.py`,
  `spec/reader-py/README.md`

**Interfaces:**
- Produces: `python lp3read.py <file>`, which prints the reader output JSON (keys sorted, `ensure_ascii=False`,
  2-space indent) and exits 0. On a rejected file it prints `{"error": "<code>"}` and exits 1. Its only dependencies
  are the standard library and `cbor2`.

- [ ] **Step 1: Write the failing tests:**
  - each file in `spec/tests/container/` gives its `*.expected.json`;
  - every error code of `container.md` has a test that builds its file from `minimal.seg`, as Task 3's list does.
- [ ] **Step 2: Run** `python -m pytest spec/reader-py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** every class of `cddl/`, decoding each table into the reader output.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "language-pack-v3: independent Python reader". The controller then asks for the Codex (or
  opus) review of this task.

### Task 14: Conformance cases and cross-reader check

**Files:**
- Create: `packages/language-pack-v3/spec/tests/build-cases.ts`, `spec/tests/compare.ts`
- Create: one folder per case 4, 5 (its book half), 7, 8, 9, 10 and 13 of `spec/tests/README.md`, each with its
  `.seg` or `.tcpack` files and `expected.json`. Cases 6, 11, 12 and the map half of case 5 need the maps: they come in
  phase 2.
- Test: `packages/language-pack-v3/src/conformance.test.ts`

**Interfaces:**
- Consumes: Task 12 (`buildLanguage`, `bridgeZip`, `readerOutput`) and Task 13 (`lp3read.py`).
- Produces:
  - `bun spec/tests/build-cases.ts`: writes the cases' bytes from their inputs; it refuses to overwrite a frozen case
    unless given `--refreeze`;
  - `bun spec/tests/compare.ts`: runs both readers on every case file and prints one line per mismatch.

- [ ] **Step 1: Write the failing test** `conformance.test.ts`: for every case folder, `readerOutput` of each file
  equals its `expected.json`, and `compare.ts` exits 0.
- [ ] **Step 2: Run** `bun test src/conformance.test.ts`. Expected: FAIL (cases not built).
- [ ] **Step 3: Build the cases** with `build-cases.ts`, using the values of `spec/tests/README.md`, and write each
  `expected.json` from the TypeScript reader.

  Then run `compare.ts`. Every mismatch is a bug in one of the readers or in the spec, so fix that, not the expected
  output. A spec fix gets its own commit, and the controller notes it in the ledger.
- [ ] **Step 4: Run** `bun test` (whole package) and `bun spec/tests/compare.ts`. Expected: all pass, 0 mismatches.
- [ ] **Step 5: Commit** "language-pack-v3: conformance cases, frozen".

### Task 15: The pipeline command

**Files:**
- Create: `packages/resource-pipeline/cli/build-v3.ts`
- Modify: `packages/resource-pipeline/package.json` (dependency `@bt-synergy/language-pack-v3: workspace:*`)
- Test: `packages/resource-pipeline/cli/build-v3.test.ts`

**Interfaces:**
- Consumes: Task 5 (`partsSource`), Task 12 (`buildLanguage`, `buildCommon`).
- Produces: `bun packages/resource-pipeline/cli/build-v3.ts --list <lang list.json> --originals <originals list.json>
  --parts <dir> --out <dir> [--books tit,rut] [--registry <dir>]`.
  - It writes `segments/<id>.seg`, `catalog-<lang>.seg`, `catalog-common.seg` and `report.txt`.
  - It updates the registry files.
  - It prints one line per segment: class, book/group, KB.

- [ ] **Step 1: Write the failing test:** the command on the data folder (es-419 Titus) exits 0 and writes a
  catalog whose `book:tit` unit names a segment present in `segments/`.
- [ ] **Step 2: Run** `bun test cli/build-v3.test.ts` in `packages/resource-pipeline`. Expected: FAIL.
- [ ] **Step 3: Implement** the argument parsing in the style of `cli/prepare-language.ts`.
- [ ] **Step 4: Run** the test, then the command on the phase 0 sample: `--parts` and the lists from
  `C:\Users\LENOVO\Git\Github\wt\fase0-paquetes\muestra`, books `tit,rut,psa,mat,1ch`, languages `en` and es-419.
  Expected:
  - the test passes;
  - each book segment within 10 % of the phase 0 deflate size: en Psalms ≤ 1 320 KB, en Matthew ≤ 830 KB, es-419
    Titus ≤ 40 KB;
  - the es-419 lexicon segments hold 15 007 entries in all, and the es-419 articles 1 289;
  - so the phase 1 gate holds: es-419 Titus ≤ 105 KB and en Psalms ≤ 1.5 MB.
- [ ] **Step 5: Commit** "resource-pipeline: build format 3 segments from parts".

---

## Phase 1 gate (from the plan document)

The phase passes when:
- both readers give the same output on every case (Task 14);
- two builds give the same bytes (Task 12);
- es-419 Titus is ≤ 105 KB and en Psalms ≤ 1.5 MB (Task 15);
- the bridge converts today's Titus with the same counts and the same id (Task 12).

Then the controller asks Abel to push and to open the PR, and Abel merges it.
