# Language packs generator (plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command, `publish-language`, that builds a language's pack and MCP views only when Door43 or the generator
changed, and uploads them with a catalog entry to an R2 bucket, runnable on a clean CI machine.

**Architecture:**

- `@bt-synergy/language-pack` gains three things: a compatibility key, a build id, a catalog entry type, and an import
  that reads each layer line by line.
- `resource-pipeline` turns its two scripts (`prepare-language`, `mcp-views`) into functions, and adds:
  - a discovery-only stamp reader;
  - the `publish-language` command, which decides, builds, and uploads through a small bucket interface (Bun's S3
    client against R2).

Plans 2 (workflow, R2, Workers) and 3 (Servos) consume what this plan produces.

**Tech Stack:** TypeScript, Bun 1.3 (`bun test`, `Bun.S3Client`), JSZip, fake-indexeddb, the existing tc-study
pipeline.

**Spec:** `C:\Users\LENOVO\Git\Github\translation-helps-mcp-packs\docs\superpowers\specs\2026-10-20-language-packs-online-design.md`
(parts 1 and 3, «Two ideas the rest depends on»).

## Global Constraints

- **Paths in the bucket:**
  - `catalog/<compat>/<lang>.json`
  - `packs/<compat>/<lang>/<sha256>.langpack.zip`
  - `packs/<compat>/originals/<sha256>.langpack.zip`
  - `v1/<lang>/...` (views, layout unchanged)
- **Compatibility key:** the pack format plus all five versions. Example: `f1.1-u2.3.0-p6000230-q8-a11-t1`, from
  `formatVersion` `1.1.0`, `usjProcessing` `2.3.0-usj`, `scripturePrepare` 6000230, `helpsQuote` 8, `helpsAlign` 11,
  `helpsText` 1.
- **Build id:** the generator commit, the MACULA commit, the lexicons ref and the Door43 stamps, including those of
  the originals the language needs.
- **Upload order:**
  1. packs;
  2. views;
  3. the originals entry, if its build changed;
  4. the language's catalog entry, last.
- **Object metadata:**
  - packs: `cache-control: public, max-age=31536000, immutable`;
  - catalog entries: `cache-control: no-cache`.
- **Same flags as today:** `--no-obs`, `--macula <taller checkout>/public`. Book packs are not built (`--books` is
  not passed).
- Comments and commits in English, few comments, explaining why; commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The branch:** work on `feat/language-pack` (unfoldingWord/tc-study, local folder `bt-synergy`). Its merge into
  `main` is the spec's first step and is done by Abel after a look at tc-study's highlights; this plan does not merge.

## Review Focus

1. **Hebrew text split across two zip chunks:** the multi-byte letters must decode whole. Task 1 tests a split
   inside `קָנִ֔יתָה`.
2. **A layer file whose last line has no newline, or a line longer than a chunk:** every row must still be imported.
   Task 1 tests both.
3. **An upload cut after the pack but before the entry:** the bucket must keep naming the previous build. Task 5
   tests a `put` that throws on the views.
4. **A language with resources left out** (es-419 Esther has only the literal text): the entry lists them in `left`.
   Task 2 tests it.
5. **Same Door43 stamps, new generator commit:** must rebuild; same everything must skip in seconds. Task 2 tests
   the build id; Task 5 tests the decision.

---

### Task 1: Import a layer line by line

**Files:**
- Create: `packages/language-pack/src/lines.ts`
- Modify: `packages/language-pack/src/pack.ts:355-361` (the `file.async('string')` read in `importLanguagePack`)
- Test: `packages/language-pack/src/lines.test.ts`

**Interfaces:**
- Produces:
  - `linesFrom(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string>`: non-empty lines, decoded as UTF-8 across
    chunk boundaries;
  - `chunksOf(file: JSZip.JSZipObject): AsyncIterable<Uint8Array>`: from `file.internalStream('uint8array')`, paused
    while the consumer awaits.

- [ ] **Step 1: Write the failing tests** (`bun test` style, as `pack.test.ts`). The test file defines two helpers:
  `from(chunks: Uint8Array[]): AsyncIterable<Uint8Array>` and `collect(gen): Promise<string[]>`.

```ts
test('a Hebrew word split between two chunks is decoded whole', async () => {
  const bytes = new TextEncoder().encode('{"w":"קָנִ֔יתָה"}\n{"w":"x"}\n')
  const cut = 9 // inside the second letter's bytes
  expect(await collect(linesFrom(from([bytes.slice(0, cut), bytes.slice(cut)])))).toEqual(['{"w":"קָנִ֔יתָה"}', '{"w":"x"}'])
})
test('the last line without a newline, and a line longer than a chunk, both come', async () => {
  const text = 'a'.repeat(100) + '\nlast'
  const bytes = new TextEncoder().encode(text)
  const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) => bytes.slice(i * 7, i * 7 + 7))
  expect(await collect(linesFrom(from(chunks)))).toEqual(['a'.repeat(100), 'last'])
})
test('blank lines are skipped', async () => {
  expect(await collect(linesFrom(from([new TextEncoder().encode('x\n\n\ny\n')])))).toEqual(['x', 'y'])
})
```

  Also add a test that reuses `pack.test.ts`'s round trip with `batch: 3` over a layer of 10 rows. After the change
  it must import the same rows, in the same order.

- [ ] **Step 2: Run them to verify they fail**

  Run: `cd packages/language-pack && bun test src/lines.test.ts`

  Expected: FAIL, `linesFrom` not found.

- [ ] **Step 3: Implement `linesFrom` and `chunksOf` in `lines.ts`**

  Use `TextDecoder('utf-8')` with `{ stream: true }`. `chunksOf` wraps JSZip's StreamHelper (`on('data')`,
  `on('end')`, `on('error')`, `pause()`, `resume()`) into an async iterable.

- [ ] **Step 4: Use them in `importLanguagePack`**

  Read each layer with `for await (const line of linesFrom(chunksOf(file)))`, gathering `batch` rows, then run the
  existing keep-or-write logic per batch. No layer is ever held whole as a string.

- [ ] **Step 5: Run the package's tests**

  Run: `cd packages/language-pack && bun test`

  Expected: all pass, including `pack.test.ts` and `pack.kinds.test.ts`.

- [ ] **Step 6: Commit**: `Opening a pack reads each layer line by line`. The body says why: the originals' UHB layer
  is 82 MB unzipped, too much as one string on a 2 GB phone.

### Task 2: Compatibility key, build id and catalog entry

**Files:**
- Create: `packages/language-pack/src/catalog.ts`
- Modify: `packages/language-pack/src/index.ts` (export it)
- Test: `packages/language-pack/src/catalog.test.ts`

**Interfaces:**
- Consumes: `PackManifest`, `PackVersions`, `PackRequirement`, `PACK_FORMAT_VERSION` from `types.ts`.
- Produces:

```ts
export type PackBuild = { id: string; generator: string; macula?: string; lexicons?: string; stamps: Record<string, string> }
export type PackCatalogEntry = {
  schema: 1
  language: string                       // 'es-419', or 'originals'
  compat: string
  build: PackBuild
  createdAt: string
  pack: { path: string; bytes: number; sha256: string }
  versions: PackVersions
  resources: Array<{ key: string; stamp: string; subject?: string }>
  left: Array<{ key: string; why: string }>
  requires?: PackRequirement[]
  views?: string                          // 'v1/es-419/'
}
export function compatKeyOf(formatVersion: string, versions: PackVersions): string
export function buildIdOf(build: Omit<PackBuild, 'id'>): Promise<string>        // 16 hex of sha256
export function catalogPath(compat: string, language: string): string            // 'catalog/<compat>/<lang>.json'
export function packPath(compat: string, language: string, sha256: string): string
export function catalogEntryOf(p: {
  manifest: PackManifest; compat: string; build: PackBuild; bytes: Uint8Array; sha256: string
  left: Array<{ key: string; why: string }>; views?: string
}): PackCatalogEntry
```

- [ ] **Step 1: Write the failing tests**

```ts
test('the compatibility key names the format and the five versions', () => {
  expect(compatKeyOf('1.1.0', {
    sot: { usjProcessing: '2.3.0-usj' }, prepared: { scripturePrepare: 6000230 },
    quote: { helpsQuote: 8 }, align: { helpsAlign: 11 }, text: { helpsText: 1 },
  })).toBe('f1.1-u2.3.0-p6000230-q8-a11-t1')
})
test('a pack without one of the versions has no compatibility key', () => {
  expect(() => compatKeyOf('1.1.0', { sot: { usjProcessing: '2.3.0-usj' } })).toThrow()
})
test('the build id changes with the generator, and not with the order of the stamps', async () => {
  const stamps = { 'es-419_gl/es-419/glt': 'v42#2026-10-01', 'unfoldingWord/hbo/uhb': 'v3.0.0#2026-08-14' }
  const a = await buildIdOf({ generator: 'aaa', stamps })
  expect(await buildIdOf({ generator: 'aaa', stamps: Object.fromEntries(Object.entries(stamps).reverse()) })).toBe(a)
  expect(await buildIdOf({ generator: 'bbb', stamps })).not.toBe(a)
  expect(a).toMatch(/^[0-9a-f]{16}$/)
})
test('the entry names its pack by content, its resources with stamps, and what was left out', () => {
  // manifest fixture: two resources, requires uhb; left: [{ key: 'es-419_gl/es-419/gst', why: 'no tiene est' }]
  // expect entry.pack.path === 'packs/<compat>/es-419/<sha256>.langpack.zip', entry.left has the gst item,
  // entry.requires equals manifest.requires, entry.resources maps key → stamp.
})
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cd packages/language-pack && bun test src/catalog.test.ts`

  Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement `catalog.ts`**

  - In the compatibility key, `usjProcessing` drops its `-usj` suffix, and the format keeps major.minor.
  - The build id hashes JSON with sorted keys, through `crypto.subtle`, so it works in Bun and in browsers.

- [ ] **Step 4: Run the package's tests**

  Run: `cd packages/language-pack && bun test`

  Expected: all pass. Then `bun run build`, since packs commands read `dist/`.

- [ ] **Step 5: Commit**: `A pack's compatibility key, build id and catalog entry`.

### Task 3: The two scripts become functions

**Files:**
- Create: `packages/resource-pipeline/src/language/prepareAndPack.ts` (from `cli/prepare-language.ts:44-177`)
- Create: `packages/resource-pipeline/src/language/writeMcpViews.ts` (from `cli/mcp-views.ts`)
- Modify: `packages/resource-pipeline/cli/prepare-language.ts`, `packages/resource-pipeline/cli/mcp-views.ts` (they
  parse arguments and call the functions)
- Modify: `packages/resource-pipeline/cli/companions.ts:91-98`: lexicons are read from a ref given as an argument
  (default `master`, so today's runs do not change)

**Interfaces:**
- Produces:

```ts
export type PreparedPacks = {
  language: { file: string; bytes: Uint8Array; manifest: PackManifest; skipped: Array<{ key: string; why: string }> }
  originals?: { file: string; bytes: Uint8Array; manifest: PackManifest; skipped: Array<{ key: string; why: string }> }
  report: unknown
}
export function prepareAndPack(o: {
  language: string; outDir: string; originals: boolean; books?: 'all' | string[]
  macula?: string; lexicons: false | { ref: string }; obs: boolean; log?: (line: string) => void
}): Promise<PreparedPacks>
export function writeMcpViews(o: { pack: Uint8Array; outDir: string; log?: (line: string) => void }):
  Promise<{ files: string[]; index: unknown }>
```

- [ ] **Step 1: Move the code without changing behaviour**

  Both CLIs keep their flags and output, plus a new `--lexicons-ref`.

- [ ] **Step 2: Check the CLIs still produce the same packs**

  Run: `bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out <tmp> --books all --macula C:/Users/LENOVO/Git/Github/gateway-tasks/public --no-obs`

  Then `mcp-views.ts --pack <tmp>/es-419.langpack.zip --out <tmp>/views`.

  Expected:
  - the same files, with the same `manifest.resources` keys and stamps as `servos-paquetes/2026-10-20-qere`;
  - the views summary prints «notas: 712 … 98 %».

- [ ] **Step 3: Run the package's tests**

  Run: `cd packages/resource-pipeline && bun test`

  Expected: 26 pass (the count after 920caf0).

- [ ] **Step 4: Commit**: `prepare-language and mcp-views as functions, lexicons from a given ref`.

### Task 4: Door43 stamps without building

**Files:**
- Create: `packages/resource-pipeline/src/language/door43Stamps.ts`
- Test: `packages/resource-pipeline/src/language/door43Stamps.test.ts`

**Interfaces:**
- Consumes: `discoverLanguage` (`src/discover/discoverLanguage.ts`), `resourceContentStamp`
  (`@bt-synergy/resource-catalog`).
- Produces:
  - `stampsOfRows(rows: ResourceMetadata[], o: { language: string; obs: boolean }): Record<string, string>`: pure. It
    covers the language's rows (OBS ones left out when `obs` is false) and the two originals.
  - `door43Stamps(o: { language: string; obs: boolean }): Promise<Record<string, string>>`: runs `discoverLanguage`
    into a fake-indexeddb catalog, then calls `stampsOfRows`. It downloads no zip.

- [ ] **Step 1: Write the failing test for `stampsOfRows`**

  Rows: es-419 GLT and OBS, UHB, UGNT, and an `en` row. With `obs: false`, the result has exactly the GLT, UHB and
  UGNT keys, each mapped to `resourceContentStamp(row)`.

- [ ] **Step 2: Run it to verify it fails**

  Run: `cd packages/resource-pipeline && bun test src/language/door43Stamps.test.ts`

  Expected: FAIL.

- [ ] **Step 3: Implement both functions**

- [ ] **Step 4: Run the test, then a live check**

  Run: `bun -e "import { door43Stamps } from './packages/resource-pipeline/src/language/door43Stamps'; console.log(await door43Stamps({ language: 'es-419', obs: false }))"`

  Expected:
  - it finishes in under a minute;
  - it prints the GLT stamp `v42#…`, and those of GST, TN, TQ, TWL, TW, TA, UHB and UGNT.

- [ ] **Step 5: Commit**: `Door43 stamps of a language, read from the catalog alone`.

### Task 5: `publish-language`

**Files:**
- Create: `packages/resource-pipeline/src/language/publishLanguage.ts`
- Create: `packages/resource-pipeline/cli/publish-language.ts`
- Test: `packages/resource-pipeline/src/language/publishLanguage.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 4.
- Produces:

```ts
export interface PackBucket {
  getJson<T>(key: string): Promise<T | null>
  put(key: string, body: Uint8Array | string, o: { contentType: string; cacheControl: string }): Promise<void>
}
export function r2Bucket(o: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }): PackBucket // Bun.S3Client
export type PublishResult = { language: string; outcome: 'unchanged' | 'published'; entry?: PackCatalogEntry; originals?: 'unchanged' | 'published' }
export function publishLanguage(o: {
  language: string; bucket: PackBucket; workDir: string
  generator: string; macula: { folder: string; commit: string }; lexiconsRef: string
  stamps?: (language: string) => Promise<Record<string, string>>   // default door43Stamps
  build?: typeof prepareAndPack; views?: typeof writeMcpViews        // injectable for tests
  dryRun?: boolean; log?: (line: string) => void
}): Promise<PublishResult>
```

- [ ] **Step 1: Write the failing tests**

  The tests use an in-memory `PackBucket` that records the order of `put`s, and fake `stamps`, `build` and `views`.
  - **Unchanged:** the entry at `catalog/<compat>/es-419.json` has the same build id, so the outcome is `unchanged`.
    `build` is never called and nothing is `put`.
  - **New generator:** the stamps are the same but the generator differs, so it publishes.
    - The `put` order is the pack (`packs/<compat>/es-419/<sha256>.langpack.zip`, immutable), then the views
      (`v1/es-419/...`), then `catalog/<compat>/originals.json` (only when its build id differs from the stored one),
      then `catalog/<compat>/es-419.json` (no-cache).
    - The entry's `build.stamps` include the originals' stamps.
  - **Cut short:** `put` throws on the first views file. No `catalog/...` key is written, and the error propagates.
  - **Dry run:** it computes the decision, logs it, and builds and uploads nothing.

- [ ] **Step 2: Run them to verify they fail**

  Run: `cd packages/resource-pipeline && bun test src/language/publishLanguage.test.ts`

  Expected: FAIL.

- [ ] **Step 3: Implement `publishLanguage` and `r2Bucket`**

  - The `compat` comes from `compatKeyOf(PACK_FORMAT_VERSION, <the versions prepare-language puts in packs>)`.
  - Read the versions from the same constants `prepare-language.ts:127-134` uses. Move them into one exported
    `PACK_VERSIONS` constant, so both commands share it.

- [ ] **Step 4: Write the CLI**

  ```
  bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work <dir> --generator <sha> \
    --macula <folder> --macula-commit <sha> --lexicons-ref <ref> [--dry-run]
  ```

  - Bucket settings come from `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
  - It prints one JSON line with the `PublishResult`, which the workflow reads.
  - It exits 0 on `unchanged` and `published`, and 1 on failure.

- [ ] **Step 5: Run the tests**

  Run: `cd packages/resource-pipeline && bun test`

  Expected: all pass.

- [ ] **Step 6: Commit**: `publish-language: build and upload a language only when Door43 or the generator changed`.

### Task 6: Buildable from a clean clone

**Files:**
- Create: `scripts/build-pack-tools.sh`. It runs `bun install --frozen-lockfile`, then `bun run build` in every
  package `requireFreshBuilds` checks for `prepare-language`, `mcp-views` and `publish-language`, in dependency order.
- Modify: `docs/LANGUAGE_PACKS_PLAN.md` §6: point to the spec and to `publish-language`, and say that R2 and Actions
  are now decided.

- [ ] **Step 1: Clone the branch into a fresh folder**

  Run `scripts/build-pack-tools.sh`, then `publish-language --dry-run --lang es-419` with MACULA from a fresh clone of
  `idiomaspuentes/taller`.

  Expected:
  - no stale-dist exit (code 3);
  - a JSON line with outcome `published`, decided against an empty test bucket (a dry run with no entry).

- [ ] **Step 2: Commit**: `A clean clone builds what the pack commands need`.

---

**After this plan:**

- Plan 2 (MCP repo: workflow, buckets, routes, dispatch, measuring) starts with the English measurement on a runner,
  `publish-language --no-upload --lang en` wrapped in `/usr/bin/time -v` (it builds the packs and views into `--work`
  and puts nothing; `--dry-run` only decides and builds nothing, so it measures nothing).
- If English runs out of memory there, a task is added here before en is scheduled: `buildLanguagePack` writes each
  layer's rows to the zip as a stream instead of one string (`pack.ts:164`).
