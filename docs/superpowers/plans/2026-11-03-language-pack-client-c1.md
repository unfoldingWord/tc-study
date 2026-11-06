# Language packs format 3, C1 (the common client library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The controller follows `.claude/lp3-controller.md` and dispatches `lp3-implementer`, `lp3-reviewer` and `lp3-runner`.

**Goal:** A TypeScript library, `packages/language-pack-client/`, with which Servos, tc-study and translation-helps-mcp download, store, verify, activate and query format 3 packs, from the Worker or from a transfer file, with no network once installed.

**Architecture:** Three layers over `@bt-synergy/language-pack-v3`, which stays the only code that parses or builds the format. (1) A dumb store keyed by segment id (memory, IndexedDB, files) plus one installed-state document. (2) An installer: fetch and verify catalogs (sha256 ids and Ed25519 signatures), plan what to fetch, verify every segment as it arrives, and activate a unit only when it and its needs are complete. Transfer files and old `.langpack.zip` packs go through the same verify-and-activate path. (3) A reader that opens installed segments lazily and answers the eight queries, each answer carrying its citations, the revision it describes, its coverage and the related books not on the device.

**Tech Stack:** TypeScript (strict, the `language-pack-v3` tsconfig), Bun 1.3.3 test runner, `@noble/curves` only as the Ed25519 fallback where `crypto.subtle` has no Ed25519 (old WebViews), `fake-indexeddb` (dev only), `bun:sqlite` in tests for the FTS5 driver.

**Spec:** `packages/language-pack-v3/spec/` as tc-study `master` has it after phases 1–3 (`6f4c4b25`): `serving.md` (routes, answers, errors, "Order a client follows"), `catalog.md` (units, activation, published against installed, signatures and "When a reader checks, and when it rejects", going back, optional units), `transfer.md` (receiving, cut files, old packs), `container.md` (ids, order of checks), `counts.md` (the four states). Existing code this builds on: `language-pack-v3/src/sign.ts` (`checkSignatures`, `verifyCatalog`, `keyId`, `signCatalog`), `language-pack-v3/keys/` (public keys), and the import rules of `resource-pipeline/cli/transfer-v3.ts`.

## Changes after Abel's approval (2026-11-06)

Abel approved decisions 1 and 3–7. Phases 1–3 merged first, so: decision 2 is replaced by `serving.md`; decision 1 reuses `sign.ts` (one implementation of the rules, `@noble/curves` only as the primitive where WebCrypto lacks Ed25519); Task 7 follows the import rules `transfer-v3.ts` already has; Task 13 adds an opt-in end-to-end run against staging. The tasks below are already updated. The C1 section of the Plan tab and "La biblioteca común", "Cómo una app usa el mapa", "La transición sin red" and "Las secciones de los artículos" of the Consumidores tab of https://claude.ai/artifact/5Vw6P8Bm3bo51VkTRwsuPA.

## Decisions for Abel before this runs

Each is what the tasks below implement unless Abel says otherwise.

1. **Signatures (approved, then aligned with phase 3).** The rules live once, in `language-pack-v3/src/sign.ts` (`checkSignatures`), and follow `catalog.md` "When a reader checks, and when it rejects": trusted keys are `Record<keyId, Uint8Array>` (raw 32-byte keys); with keys, every `published` catalog must verify (`FormatError('E_SIGNATURE')`); with no keys, `sig` is ignored; a `local` catalog arriving in a transfer file is `E_SIGNATURE` when keys are given. `sign.ts` gains one optional parameter, the Ed25519 primitive; the client uses `crypto.subtle` when it supports Ed25519 and otherwise `@noble/curves` (exact version pinned) in strict RFC 8032 mode (`zip215: false`). The canonical-point and small-order checks stay in `sign.ts` and run for both. The staging key is `language-pack-v3/keys/78d2e6299a2de4d0.pub`; apps pass their keys, the library ships none.
2. **Routes: replaced by `serving.md`.** `GET /v3/packs/{lang}/catalog`, `GET /v3/packs/common/catalog`, `GET /v3/packs/seg/{id}`. The client follows "Order a client follows": language catalog (with `If-None-Match`), then the common catalog when the id that `requires` names differs from the installed one, checking that the fetched common catalog's id equals it; segments by id. Catalogs are never fetched under `seg/`.
3. **Search storage.** The library ships the SQLite schema, the import of book segments into FTS5 and the search SQL behind a four-method `SqlDriver` interface, tested with `bun:sqlite`. The drivers for wa-sqlite (browser), Capacitor and Tauri are written with C3 and C5, where those runtimes exist. The Worker searches in memory over the books it has open (open decision 5 of the Consumidores tab stays open). Snowball stems for es and pt go to C2.
4. **Browser store.** IndexedDB only (works on every WebView Servos targets). OPFS is not built in C1; if tc-study needs it for speed, it is a fourth `BlobStore` in C5.
5. **Query names.** The code uses English names: `passage`, `concept`, `article`, `renderings`, `search`, `topics`, `books`, `context` (pasaje, concepto, articulo, traducciones, buscar, temas, libros, contexto). No two share a root. The schemas file gives each its Spanish label for C2.
6. **Phone timings (C1.7).** Measured on this desktop by a bench script and reported, not asserted against the phone targets. The 2 GB phone measurement is a step of C3 (Servos), where the app runs.
7. **Default install.** `refresh` and the first `install` bring the catalogs, `xmap`, `map`, `xtopics` and `topics`. Books, `obs`, `lex:*` and complements only when asked. `aligned:*` (optional units) only when asked by part id or with `aligned: true`.

## Global Constraints

- Branch `feat/language-pack-client`, rebased on tc-study `origin/master` `6f4c4b25` (phases 1–3 merged). Worktree `C:\Users\LENOVO\Git\Github\wt\lp3-client`. Commits local until Abel says yes. Never touch `wt/langpack-v3`, the shared checkout `bt-synergy`, or Servos.
- Package `@bt-synergy/language-pack-client`, `version 0.1.0`, `"type": "module"`, `main`/`types` `./src/index.ts` as `language-pack-v3`; dependency `"@bt-synergy/language-pack-v3": "workspace:*"`. Copy `language-pack-v3/tsconfig.json`.
- **No duplicated format code.** Parsing, ids, sha256, CBOR, views, transfer read/write, the bridge and map answers come from `@bt-synergy/language-pack-v3`. When a needed function is not exported there, export it from `language-pack-v3/src/index.ts` (the only changes allowed in that package are those exports, the optional Ed25519 primitive of Task 3 in `sign.ts`, and a spec fix if a task finds a spec bug; spec fixes get their own commit).
- **No Node in the main entry.** Nothing reachable from `src/index.ts` imports `node:*` or `bun:*`. Node-only code lives in `src/node/` and is exported by subpath (`./node/fsStore`). The main entry runs in a browser, a WebView, a Cloudflare Worker and Bun.
- **A segment id is not the sha256 of the file bytes**: it is the id `readSegment` checks (the hash of the uncompressed body, `container.md`). Every segment that enters the store is checked with `readSegment(bytes, { known: KNOWN[class], expectedId })`. A complement's id is the sha256 of its bytes (`sha256` from `language-pack-v3`). Ids are lowercase hex, 64 characters.
- **Errors.** Format defects keep `FormatError` and its codes. Signature failures are `FormatError('E_SIGNATURE')` from `sign.ts`, never a client code. Client conditions throw `ClientError` (Task 1) with one of: `E_DOWNGRADE` (lower revision not confirmed, or the same revision with another id: a fork, always refused), `E_COMMON` (the common catalog fetched or carried is not the one `requires` names), `E_NO_BASE` (update transfer without its base), `E_NO_PACK` (`404 catalog not found`: the language has no format 3 pack yet; do not poll), `E_NETWORK` (any other failed fetch or 4xx/5xx; carries `status` and, for 429, `retryAfter` seconds; installed content is kept), `E_STORE` (the store failed, quota included), `E_NOT_INSTALLED` (a query needs a unit that is not active), `E_ARG` (bad argument).
- **Tests never reach a network** other than `127.0.0.1` (the fake server of Task 5), except Task 13's opt-in run against staging, skipped unless `LP3_STAGING=1` and never in CI. Production is never touched. No private key is written to any file: test keys are generated at run time (`ed25519.utils.randomPrivateKey()`).
- Run tests from `packages/language-pack-client` with `bun test` (output to a file, read the summary). `bun x tsc --noEmit -p packages/language-pack-client` must pass at every commit. `language-pack-v3`'s own `bun test` must still pass after any export added there.
- Code, comments and commits in English; each commit body says why. Documentation for people (README) in English like the sibling package.

## Review Focus

1. **A download cut in the middle of a unit** (network drops after 2 of 3 segments). The unit is not activated, the previous revision keeps answering, and the next `install` fetches only the missing segment. Test in Task 6.
2. **Bytes on the device that no longer match their id** (disk corruption, a bad sync). The reader treats the segment as missing, says so in the answer (`notInstalled`), and `verify()` lists it; nothing throws an uncaught `FormatError` into the app. Test in Task 8.
3. **A language catalog whose required common revision is not available** (server lags, or a transfer file without the common catalog). Language units that need `orig:*` wait, `map` and `topics` still activate, and `status` names the missing common revision. Test in Task 6.
4. **The store fails mid-install** (IndexedDB `QuotaExceededError`, a full SD card). `install` rejects with `E_STORE`, the installed state is the one before the call, and segments already written are kept for the retry. Test in Task 6 with a store wrapper that throws on the n-th `put`.
5. **Two installs at once** (the person taps twice, or a sync and a transfer import overlap). Calls on one client run one after the other; no segment is fetched twice; the final state is the same as running them in sequence. Test in Task 6.

---

### Task 1: Package, errors, and the memory and file stores

**Files:**
- Create: `packages/language-pack-client/package.json`, `tsconfig.json`, `README.md` (one paragraph; Task 12 completes it), `src/index.ts`, `src/errors.ts`, `src/store/types.ts`, `src/store/memory.ts`, `src/node/fsStore.ts`
- Test: `src/store/memory.test.ts`, `src/node/fsStore.test.ts`

**Interfaces:**
- Produces:
  - `class ClientError extends Error { code: ClientErrorCode }`, `type ClientErrorCode` (the eight codes of Global Constraints), `CLIENT_ERROR_CODES`.
  - `interface BlobStore { has(id: string): Promise<boolean>; get(id: string): Promise<Uint8Array | undefined>; put(id: string, bytes: Uint8Array): Promise<void>; delete(id: string): Promise<void>; ids(): Promise<string[]>; getState(): Promise<InstalledState | undefined>; setState(state: InstalledState): Promise<void> }`. `put` and `delete` of an id that is not 64 lowercase hex throw `ClientError('E_ARG')`. The store never checks content (callers verify). `setState` is atomic: a crash leaves the old or the new state, never a mix.
  - `type InstalledState` (in `store/types.ts`, filled in by Task 4; Task 1 declares it as `{ v: 1; [k: string]: unknown }` and Task 4 narrows it).
  - `memoryStore(): BlobStore`; `fsStore(dir: string): BlobStore` (Node subpath `./node/fsStore`): segments at `<dir>/seg/<id[0..2]>/<id>`, state at `<dir>/state.json`, written as `state.json.tmp` then `rename`.

- [ ] **Step 1: Write the failing tests.** One shared suite `storeContract(make: () => Promise<BlobStore>)` in `src/store/contract.ts` (exported for Task 2), run by both test files: put/get/has/delete/ids round trip; `get` of an absent id is `undefined`; `put` of `"ABC"` and of an uppercase id throws `E_ARG`; `setState`/`getState` round trip; state survives a new store over the same dir (fs only); a `state.json.tmp` left behind does not replace a good `state.json` (fs only).
- [ ] **Step 2: Run them and see them fail** (`bun test` in the package: module not found).
- [ ] **Step 3: Implement** the files above. `package.json` scripts as `language-pack-v3` (`test`, `type-check`); add `"exports": { ".": "./src/index.ts", "./node/fsStore": "./src/node/fsStore.ts" }`. Run `bun install` at the repo root.
- [ ] **Step 4: Run tests and `tsc --noEmit`**: pass.
- [ ] **Step 5: Commit** `client: package, errors and the memory and file stores`.

### Task 2: The IndexedDB store

**Files:**
- Create: `src/store/indexeddb.ts`; Test: `src/store/indexeddb.test.ts`
- Modify: `package.json` (devDependency `fake-indexeddb`, exact version), `src/index.ts`

**Interfaces:**
- Consumes: `BlobStore`, `storeContract` (Task 1).
- Produces: `indexedDbStore(o?: { name?: string; indexedDB?: IDBFactory }): Promise<BlobStore>`; default database name `tc-language-packs`, object stores `seg` (key: id) and `state` (one key `state`). A `QuotaExceededError` (or any `DOMException` from a write) becomes `ClientError('E_STORE')` with the original as `cause`.

- [ ] **Step 1:** Test file runs `storeContract` with `indexedDbStore({ indexedDB: new IDBFactory() })` from `fake-indexeddb`, plus: a write that the fake rejects (stub `IDBObjectStore.prototype.put` to throw a `DOMException('…', 'QuotaExceededError')`) rejects with `E_STORE`.
- [ ] **Step 2:** See it fail.
- [ ] **Step 3:** Implement with plain IndexedDB requests wrapped in promises (no library). One transaction per call.
- [ ] **Step 4:** Tests and `tsc` pass.
- [ ] **Step 5: Commit** `client: IndexedDB store`.

### Task 3: Verifying catalogs (reusing `sign.ts`), and going back

**Files:**
- Modify: `language-pack-v3/src/sign.ts` (optional primitive), `language-pack-v3/src/sign.test.ts` (run its signature cases with the noble primitive too), `language-pack-v3/package.json` (devDependency `@noble/curves` for that test)
- Create: `src/verify.ts`, `src/ed25519.ts`, `test/keys.ts` (test helper: a key pair made at run time with `crypto.subtle.generateKey('Ed25519')`, its `keyId`, and `sign(bytes)` through `signCatalog` of `sign.ts`)
- Modify: `package.json` (dependency `@noble/curves`, exact version), `src/index.ts`
- Test: `src/verify.test.ts`

**Interfaces:**
- Produces in `language-pack-v3/src/sign.ts` (no rule moves out of it):
  - `type Ed25519Verify = (publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array) => Promise<boolean>`.
  - `checkSignatures(header, id, trusted, verify?: Ed25519Verify)` and `verifyCatalog(catalogFile, trusted, verify?: Ed25519Verify)`: the default stays the `crypto.subtle` call that is there today; the canonical-point and small-order checks run before either primitive. Exported from `index.ts` with the type.
- Produces in the client:
  - `ed25519Verify(): Promise<Ed25519Verify>` (`src/ed25519.ts`): once per process, tries `crypto.subtle.importKey('raw', …, { name: 'Ed25519' })` on a fixed valid key; if it throws, returns the `@noble/curves/ed25519` primitive with `{ zip215: false }`. `noblePrimitive` and `subtlePrimitive` are exported for tests.
  - `type TrustPolicy = { trustedKeys?: Record<string, Uint8Array> }` (no keys: signatures ignored, as `catalog.md` rule 1).
  - `type VerifiedCatalog = { id: string; bytes: Uint8Array; catalog: CatalogModel; name: string; publisher: string; revision: number; origin: 'published' | 'local'; signedBy?: string }` (`name` is `about.catalog`).
  - `verifyCatalogFile(bytes: Uint8Array, policy: TrustPolicy, o: { from: 'network' | 'transfer' | 'store' | 'bridge'; expectedId?: string }): Promise<VerifiedCatalog>`: `readSegment` (`expectedClass: 'catalog'`, `CATALOG_TABLES`, `expectedId`), `catalogView`, then with keys: a `published` catalog through `checkSignatures(…, await ed25519Verify())`; a `local` catalog from `transfer` or `network` is `E_SIGNATURE` (`catalog.md` rule 3, and a server never sends one); a `local` catalog from `bridge` or `store` is accepted unchecked.
  - `checkRevision(installed: InstalledCatalog | undefined, incoming: VerifiedCatalog, confirmDowngrade?: boolean): 'same' | 'newer' | 'first'`: same publisher and name, lower revision → `E_DOWNGRADE` unless confirmed; same revision and other id → `E_DOWNGRADE` always (a fork, as `transfer-v3.ts`); same id → `'same'` (no-op).

- [ ] **Step 1: Tests**, on catalogs the test builds and signs with `test/keys.ts`, each run twice (`subtlePrimitive` and `noblePrimitive`, `describe.each`): trusted → ok with `signedBy`; untrusted key only → `E_SIGNATURE`; a flipped signature byte → `E_SIGNATURE`; two signatures, an unknown one and a valid trusted one → ok; unsigned with keys → `E_SIGNATURE`; unsigned without keys → ok; a flipped body byte with `expectedId` → `E_ID`; `spec/tests/transferencia-catalogo-local/` catalog with its `local.keys.json` from `transfer` → `E_SIGNATURE`, from `bridge` → ok; `checkRevision` 12 over 9 `'newer'`, 9 over 12 `E_DOWNGRADE` and ok confirmed, other publisher `'first'`, same revision other id `E_DOWNGRADE` even confirmed, same id `'same'`. In `language-pack-v3`, `sign.test.ts` runs its existing signature vectors (canonical, small order, every-trusted-element) with the noble primitive as well, and they give the same results.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement. Any throw from a primitive is a failed signature (as `sign.ts` does today).
- [ ] **Step 4:** Tests of both packages, `tsc` pass.
- [ ] **Step 5: Commit** `client: verify catalogs with the reader's signature rules, with a pure-JS fallback`.
- [ ] **Step 6: Codex review** (read-only, recipe in the Servos memory `codex-cli-windows.md`) of the `sign.ts` change and `src/verify.ts`, `src/ed25519.ts`, with the Sonnet reviewer.

### Task 4: Installed state, install plans and activation

**Files:**
- Create: `src/state.ts`, `src/plan.ts`
- Modify: `src/store/types.ts` (narrow `InstalledState`), `src/index.ts`
- Test: `src/plan.test.ts`, `src/state.test.ts`

**Interfaces:**
- Consumes: `VerifiedCatalog` (Task 3).
- Produces:
  - `type InstalledCatalog = { name: string; publisher: string; revision: number; id: string; origin: 'published' | 'local' }`
  - `type InstalledUnit = { catalog: string; revision: number; catalogId: string; segments: string[]; needs: string[]; optional?: true }` (`segments` are ids; `needs` are qualified unit keys).
  - `type InstalledState = { v: 1; published: Record<string, InstalledCatalog>; active: Record<string, InstalledCatalog>; units: Record<string, InstalledUnit> }`. Units are keyed `<catalog name>/<unit id>` (`es-419/book:rut`, `<common name>/orig:rut`), so several languages share a device. `published` is the newest verified catalog known; `active` is the catalog each catalog's active units came from.
  - `emptyState(): InstalledState`.
  - `qualify(catalogs: VerifiedCatalog[], catalog: string, unit: string): string`: a `needs` entry resolves to the unit in its own catalog if it lists it, else in a catalog it `requires`; otherwise it stays `<own>/<unit>` and is reported as unsatisfiable.
  - `type Want = { books?: string[]; units?: string[]; aligned?: true | string[]; defaults?: boolean }` (`defaults` true unless false: `xmap`, `map`, `xtopics`, `topics`).
  - `type Step = { key: string; catalog: string; unit: string; segments: { id: string; class: string; size: number }[]; complete: boolean }`.
  - `planInstall(catalogs: VerifiedCatalog[], state: InstalledState, want: Want, have: ReadonlySet<string>): { steps: Step[]; bytes: number; unknown: string[] }`: the wanted units and, transitively, their `needs`; optional units only when named; order catalogs' maps first (`xmap`, `map`, `xtopics`, `topics`), then each wanted book with its needs in the order of `want.books`, then the rest; `bytes` counts only segments not in `have`; `unknown` lists wanted units no catalog has.
  - `activate(state: InstalledState, catalogs: VerifiedCatalog[], have: ReadonlySet<string>): { state: InstalledState; activated: string[]; waiting: { key: string; missing: string[] }[] }`: pure. A unit of a catalog is activated when all its segments are in `have` and every unit it needs is activated in the result (fixed point); until then its previous entry stays as it is. A unit whose segment ids equal the installed ones just takes the new revision. Units of the old revision that the new catalog dropped stay until `prune` (Task 6).
  - `updates(state: InstalledState, catalogs: VerifiedCatalog[]): { key: string; from: number; to: number; bytes: number }[]`: installed units whose published segments differ ("the map says Ruth changed; it weighs N").

- [ ] **Step 1: Tests** on synthetic `VerifiedCatalog` values (no bytes needed: build `CatalogModel` objects in the test): Ruth needs `orig:rut`, `map` and `art:tw:kt` → plan order and `bytes`; `aligned:a-am` absent unless named; `aligned: true` brings every `aligned:` unit; `defaults: false` brings only what is named; `activate` with `orig:rut` missing leaves `book:rut` waiting and lists the missing segment, while `map` activates; with an older `book:rut` active, the old entry stays until the new one is complete (catalog.md "Until then, it keeps using the unit it had"); two languages each with `book:tit` keep separate keys; a `needs` naming a unit that is in the required common catalog qualifies to the common name; `updates` reports a changed book with the new segments' size.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement as pure functions (no store, no I/O).
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: installed state, install plans and activation by unit`.

### Task 5: The sample build, the fake server and the HTTP source

**Files:**
- Create: `test/sample.ts`, `test/fakeServer.ts`, `src/source/http.ts`
- Modify: `src/index.ts`
- Test: `src/source/http.test.ts`

**Interfaces:**
- Consumes: `test/keys.ts` (Task 3), `signCatalog` of `sign.ts`.
- Produces:
  - `interface PackSource { catalog(name: string, o?: { etag?: string; signal?: AbortSignal }): Promise<{ bytes: Uint8Array; etag?: string } | 'not-modified'>; segment(id: string, signal?: AbortSignal): Promise<Uint8Array> }` (`name` is a language tag or `common`).
  - `httpSource(o: { base: string; fetch?: typeof fetch }): PackSource` on the three paths of `serving.md` (`/v3/packs/{lang}/catalog`, `/v3/packs/common/catalog`, `/v3/packs/seg/{id}`), with `If-None-Match` when `etag` is given (304 → `'not-modified'`). `404 {"error":"catalog not found"}` → `ClientError('E_NO_PACK')`; 429 → `E_NETWORK` with `retryAfter` from `Retry-After`; any other non-2xx or a thrown fetch → `E_NETWORK` with `status`.
  - `test/sample.ts`: `buildSample(): Promise<Sample>` with `type Sample = { segments: Map<string, Uint8Array>; langCatalog: Uint8Array; commonCatalog: Uint8Array; keys: { keyId: string; publicKey: string; privateKey: Uint8Array } }`. Builds es-419 (Titus and Ruth) and the common build from `language-pack-v3/spec/tests/data` the way `src/build/invalidation.test.ts` does, with topics from `spec/tests/data/topics` and `aligned: true`, then signs both catalogs with a key generated at run time. Memoised per process (the build is the slow part).
  - `test/fakeServer.ts`: `startFakeServer(content: Sample | { bucketDir: string }, o?: { failSegment?: (id: string, n: number) => 'ok' | 404 | 'drop' | 'corrupt'; noCommon?: boolean }): { url: string; hits: string[]; set(content): void; stop(): void }` with `Bun.serve({ port: 0, hostname: '127.0.0.1' })`. It follows `serving.md` exactly for what a client sees: the three paths and the `seg/catalog` rule, 400 `bad pack path` (uppercase hex, trailing slash, extra element), the two 404 bodies, 405 with `Allow`, strong `ETag` and 304 on `If-None-Match`, the `Cache-Control` values, the CORS headers, JSON error bodies. `{ bucketDir }` serves an R2-shaped folder (`v3/catalog/{lang}.seg`, `v3/catalog/common.seg`, `v3/seg/{id}.seg`, as `wt/lp3-staging/bucket-rev1`). `set` swaps the content (a new revision). `noCommon` answers the common catalog with 404. `hits` records each path served. `corrupt` flips one byte of the body. Range (206/416) is not needed by the client and may answer 200.

- [ ] **Step 1: Tests:** `httpSource` against the fake server gets the language catalog (its id is the one `buildSample` made), the common catalog and a segment by id; the second catalog request with the ETag is `'not-modified'`; an unknown language is `E_NO_PACK`; a missing segment is `E_NETWORK` 404; the fake server's 400, 405 and CORS answers match `serving.md` (one test each); an aborted signal rejects.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement. If `buildLanguage` needs a book list or registry the test data cannot give, mirror `invalidation.test.ts` exactly; note any such choice in the report.
- [ ] **Step 4:** Tests, `tsc` pass. Report how long `buildSample` takes.
- [ ] **Step 5: Commit** `client: HTTP source, with a sample build and a local fake server for tests`.

### Task 6: The client: refresh, install, status, prune

**Files:**
- Create: `src/client.ts`, `src/install.ts` (download and verify loop)
- Modify: `src/index.ts`
- Test: `src/client.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `createClient(o: { store: BlobStore; source?: PackSource; trust: TrustPolicy }): LanguagePackClient`.
  - `interface LanguagePackClient { refresh(lang: string, o?: { confirmDowngrade?: boolean; signal?: AbortSignal }): Promise<RefreshReport>; install(lang: string, want?: Want, o?: { signal?: AbortSignal; onProgress?: (p: Progress) => void }): Promise<InstallReport>; status(lang: string): Promise<Status>; prune(): Promise<{ removed: string[] }>; verify(): Promise<{ bad: string[] }> }` (Tasks 7 and 8 add methods).
  - `RefreshReport = { catalogs: InstalledCatalog[]; updates: ReturnType<typeof updates>; unchanged: boolean; missingCommon?: { name: string; revision: number; id: string } }`. `refresh` follows `serving.md` "Order a client follows": the language catalog with the stored ETag (304 → `unchanged`), `verifyCatalogFile(…, { from: 'network' })`, `checkRevision`; then, when the id its `requires` names is not the stored common catalog's, `GET` the common catalog, verify it, and check its id equals that one (`E_COMMON` otherwise: the server's common catalog is ahead or behind; the language units that need it wait and `missingCommon` says which). It stores both catalog files (by id) and their ETags, and writes them to `state.published`. It activates nothing. `InstalledCatalog` gains `etag?: string`.
  - `InstallReport = { activated: string[]; waiting: { key: string; missing: string[] }[]; fetched: string[]; bytes: number }`; `Progress = { done: number; total: number; bytes: number; key: string }`.
  - `install` calls `refresh` when the language has no published catalog, then `planInstall`, fetches each segment not in the store, checks it with `readSegment(bytes, { known: KNOWN[class], expectedId })` (a mismatch is not stored and the unit waits: the report names it), `put`s it, and after each step runs `activate` and `setState`, so a cut keeps every unit already complete.
  - `Status = { lang: string; published?: InstalledCatalog; active?: InstalledCatalog; units: { key: string; revision: number; installed: boolean; optional: boolean; bytes: number }[]; updates: ReturnType<typeof updates>; missingCommon?: RefreshReport['missingCommon'] }`.
  - `prune` deletes store ids that no active unit and no stored catalog of `active`/`published` uses. `verify` re-reads every stored segment against its id and returns the bad ones (Review Focus 2 uses it).
  - Calls on one client run in a queue (one promise chain): Review Focus 5.

- [ ] **Step 1: Tests** against `startFakeServer(buildSample())` with `memoryStore()` and the sample key trusted: `install('es-419', { books: ['rut'] })` activates `xmap`, `map`, `xtopics`, `topics`, `book:rut`, `orig:rut` and Ruth's article groups, and no `aligned:` unit; `install` with `aligned: ['<one part>']` adds that part only; a second `install` fetches nothing (`hits` unchanged). Review Focus 1 (`failSegment` returns `drop` for one segment of `book:rut` once: Ruth waits, the retry fetches only that id). Review Focus 3 (`noCommon`, and a common catalog of another id: `map`/`topics` active, `book:rut` waiting, `missingCommon` set, no throw from `install`). `E_NO_PACK` for an unknown language. A second `refresh` sends `If-None-Match` and reports `unchanged`. Review Focus 4 (a store wrapper whose 3rd `put` throws `E_STORE`: `install` rejects with `E_STORE`, `getState` equals the state before, the two segments put are kept). Review Focus 5 (two `install` calls at once: each id appears once in `hits`, final state equals sequential). A `corrupt` segment is reported in `waiting` and not stored. Untrusted server key → `E_SIGNATURE`, nothing stored. A refreshed lower revision → `E_DOWNGRADE`. `prune` after replacing Ruth with a new revision removes the old Ruth segment only.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement. For the new-revision tests, `test/sample.ts` may expose `buildSample({ revision, tweak })` reusing `invalidation.test.ts`'s tweak idea.
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: refresh, install by unit, status and prune`.
- [ ] **Step 6: Codex review** of `src/install.ts` and `src/client.ts` (read-only) with the Sonnet reviewer.

### Task 7: Transfer files and old packs

**Files:**
- Create: `src/transfer.ts`
- Modify: `src/client.ts` (three methods), `src/index.ts`
- Test: `src/transfer.test.ts`

**Interfaces:**
- Consumes: `readTransfer`, `writeTransfer`, `bridgeZip`, `KNOWN` from `language-pack-v3`; Tasks 3, 4, 6.
- Produces, on `LanguagePackClient`:
  - `importTransfer(bytes: Uint8Array, o?: { confirmDowngrade?: boolean }): Promise<ImportReport>` with `ImportReport = { catalogs: InstalledCatalog[]; stored: string[]; rejected: { id: string; code: string }[]; missing: string[]; activated: string[]; waiting: { key: string; missing: string[] }[] }`. The rules are those `resource-pipeline/cli/transfer-v3.ts` `import` already has, applied to a `BlobStore` instead of a folder: `readTransfer(bytes, { known: KNOWN })`; every catalog inside through `verifyCatalogFile(…, { from: 'transfer' })` (a `local` one is `E_SIGNATURE` with keys) and `checkRevision` (lower → `E_DOWNGRADE` unless confirmed; same revision other id always refused; same id no-op) before anything is written; an `update` whose `base` the state does not have → `E_NO_BASE` before anything is written; a language catalog whose `requires` is neither stored nor in the file → its units that need the common catalog wait; then every `ok` entry is stored, the catalogs last, and `activate` runs (an incomplete newer catalog never replaces a complete older unit: `activate` keeps the old one until the new one is whole).
  - `exportTransfer(o: { lang: string; mode: 'full' | 'update'; books?: string[]; units?: string[]; base?: Uint8Array[] }): Promise<Uint8Array>`: from the active catalogs and segments only (never a segment that is not active). `full` as `transfer.md` "Modes", the common catalog and its needed segments included; `update` as `transfer-v3.ts export update`: `base` are the receiver's catalog files (verified as `from: 'transfer'`), the file's `base` is their `[about.catalog, about.revision]`, and it holds the catalogs plus only the segments of the chosen units that the base catalogs do not name.
  - `importOldPack(zip: Uint8Array): Promise<ImportReport>`: `bridgeZip`, then the local catalog through `verifyCatalogFile(…, { from: 'bridge' })`; a later published catalog replaces it (normal `activate`).

- [ ] **Step 1: Tests:** export `full` with Ruth from a client installed from the fake server, import into a second client with `memoryStore()` and no source: Ruth readable state equals the first (`status` units). `update`: change Ruth (new revision from `buildSample({ tweak })`), export update with the second client's catalog files as `base`, import: only Ruth's new segments travel (assert entry ids). `update` into an empty client → `E_NO_BASE`. `spec/tests/transferencia-cortada/cut.tcpack`: the complete entries are stored, the cut ones are in `missing`, and units fully present activate (`transfer.md` "A file cut short"; that case is unsigned, so the client is made with no keys). `spec/tests/transferencia-catalogo-local/local.tcpack` with its `local.keys.json` → `E_SIGNATURE`, nothing stored. An import whose newer catalog is incomplete leaves the older complete Ruth active. A transfer with a lower revision → `E_DOWNGRADE`. `importOldPack(spec/tests/data/es-419-tit.langpack.zip)`: a local catalog with `origin: local`, `book:tit` waits for `orig:tit` until the common catalog is installed, then activates.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: import and export transfer files, and import old packs`.
- [ ] **Step 6: Codex review** of `src/transfer.ts` (read-only) with the Sonnet reviewer.

### Task 8: The reader: opening installed segments

**Files:**
- Create: `src/reader.ts`
- Modify: `src/client.ts` (`open`), `src/index.ts`; `language-pack-v3/src/index.ts` (export `mapView`, `xmapView`, `alignedView`, `answer`, `type MapSet`, `phrase`, `alignedKey`, `groupOfKey` and anything else Tasks 8–11 import; nothing else changes there)
- Test: `src/reader.test.ts`

**Interfaces:**
- Produces:
  - `client.open(lang: string): Promise<PackReader>`; `openFromSegments(o: { lang: string; catalogs: VerifiedCatalog[]; get: (id: string) => Promise<Uint8Array | undefined> }): PackReader` (the Worker path: no store, no state; every unit the catalogs list counts as installed when `get` returns its bytes).
  - `interface PackReader { lang: string; revisions(): { lang?: number; common?: number }; installed(unit: string): boolean; book(book: string): Promise<BookModel | undefined>; orig(book: string): Promise<OrigModel | undefined>; articles(group: string): Promise<ArticleModel[] | undefined>; maps(): Promise<MapSet>; size(unit: string): number; unitOf(cls: 'book' | 'art' | 'orig', key: string): string | undefined }` plus the query methods Tasks 9–11 add.
  - Views are cached per segment id (a `Map`), read with `readSegment(bytes, { known: KNOWN[class], expectedId })`. A segment whose bytes fail is treated as not installed and recorded in `reader.problems: { id: string; code: string }[]` (Review Focus 2); no `FormatError` reaches the caller.
  - `maps()` assembles `MapSet` from the active `xmap`, `map`, `xtopics`, `topics` and the `aligned:` parts present, with `revision` of the language catalog.

- [ ] **Step 1: Tests:** after `install('es-419', { books: ['rut'] })`, `book('rut')` has `lang: 'es-419'`, `book('tit')` is `undefined` and `installed('book:tit')` is false while `size('book:tit')` is the catalog's size; `maps()` answers `answer(m, { kind: 'strong', key: 'G5485' })` the same as `spec/tests/queries/g5485.json` when the sample covers it (otherwise a key the sample has; say which in the report); Review Focus 2: overwrite a stored Ruth segment with other bytes, `book('rut')` is `undefined` and `problems` names it; `openFromSegments` over the sample's map gives the same `maps()` answers.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests of both packages, `tsc` pass.
- [ ] **Step 5: Commit** `client: a reader over installed segments, and the exports it needs`.

### Task 9: The answer envelope, and `passage`, `context`, `article`

**Files:**
- Create: `src/query/envelope.ts`, `src/query/passage.ts`, `src/query/article.ts`
- Modify: `src/reader.ts` (methods), `src/index.ts`
- Test: `src/query/passage.test.ts`, `src/query/article.test.ts`

**Interfaces:**
- Produces:
  - `type Cite = { res: string; release: string; id?: string; ref?: string; section?: string }` (`res` the resource key, `release` its stamp from the segment's `res`).
  - `type CellState = State` (re-export of `State` from `language-pack-v3`'s `query/maps.ts`: `'count' | 'zero' | 'none' | 'partial'`; do not redefine it, and do not call it `Coverage`, which is the map's coverage type in `codec/counts`).
  - `type Answer<T> = { query: QueryName; data: T | null; cites: Cite[]; revision: { lang?: number; common?: number; units: Record<string, number> }; coverage?: Record<string, CellState>; notInstalled: { book?: string; unit: string; bytes: number; what?: string }[] }`. `revision.units` names the revision of every installed unit the answer read (so Ruth of 9 under a map of 12 says both: "Libros de revisiones distintas").
  - `type QueryName = 'passage' | 'concept' | 'article' | 'renderings' | 'search' | 'topics' | 'books' | 'context'`.
  - `reader.passage(ref: string): Promise<Answer<PassageData>>` with `PassageData = { book: string; ref: string; texts: { res: string; text: string }[]; notes: HelpRow[]; questions: HelpRow[]; links: HelpRow[] }`. `ref` parsed by `parseRef` (`E_ARG` otherwise). Text by verse range from `pieces` and `events`. Book not installed → `data: null`, `notInstalled: [{ book, unit: 'book:<b>', bytes }]`. Coverage per help resource from the map's `coverage` for that book (`none` when the language has no notes for it: "Un idioma con pocos recursos").
  - `reader.article(id: string, section?: string | 'all'): Promise<Answer<ArticleData>>` with `ArticleData = { id: string; title: string; sections: (SectionModel & { otherLang: boolean })[]; more: { sid: string; title?: string; role: Role }[] }`. Default sections: tW `definition` (and `intro` if no definition); tA `description` and `reason`; otherwise the first section. `otherLang` is `section.lang !== reader.lang` ("la ficha dice «en inglés»"). An article whose group is not installed → `notInstalled` with that `art:` unit.
  - `reader.context(ref: string): Promise<Answer<ContextData>>`: the passage, plus for each concept the passage's notes and links name (`concept`, deduplicated) the default sections of its article (or its `notInstalled` entry), plus the map's books for each concept with the ones not installed in `notInstalled`.

- [ ] **Step 1: Tests:** `passage('rut 1:1-2')` texts non-empty for GLT and GST, notes in range only, cites carry the stamps; `passage('rom 4:1')` → `data: null` and `notInstalled` with the catalog's size; `passage('xyz 1:1')` → `E_ARG`. Mixed revisions: install Ruth at revision 1, refresh to revision 2 where only the map changed, `passage('rut 1:1').revision.units` gives `book:rut` 1 and `map` 2. `article` on `spec/tests/articulo-mal-titulado/art.seg` (load it through `openFromSegments` with a catalog the test builds, or the sample's group if it holds the same article): the English section has `otherLang: true`, the section ids are those of the expected file. A tW article returns only the definition by default and lists the rest in `more`; `article(id, 'all')` returns all. `context('rut 1:1')` includes at least one article's default section and one concept.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: the answer envelope and the passage, article and context queries`.

### Task 10: `concept`, `renderings`, `topics`, `books`, and the schemas file

**Files:**
- Create: `src/query/maps.ts`, `src/query/renderings.ts`, `src/query/schemas.json`
- Modify: `src/reader.ts`, `src/index.ts`
- Test: `src/query/maps.test.ts`, `src/query/schemas.test.ts`

**Interfaces:**
- Consumes: `answer`, `MapSet` (Task 8 exports), `Answer` (Task 9).
- Produces:
  - `reader.concept(id: string): Promise<Answer<unknown>>`: `answer(m, { kind: 'concept', id })` as `data`; `notInstalled` lists the books where the concept has a count and whose `book:` unit is not active, with their size.
  - `reader.topics(q?: { category?: string; book?: string }): Promise<Answer<unknown>>`: `category` → `answer(m, { kind: 'category', topicKind })`; `book` → the topics of that book from the `xtopics` part (and names from `topics`); neither → the five categories with their counts. Without `xtopics`: `data: { installed: false }` (never "not found", `catalog.md` "Topics and installation").
  - `reader.books(q: { article: string } | { concept: string }): Promise<Answer<{ books: Record<string, { state: CellState; count?: number; verses?: number; installed: boolean; bytes?: number }> }>>`: `concept` from the concept answer's books; `article` (`ta:…`, `tw:…`) from `answer(m, { kind: 'usage', concept, source })` with the language's tN for tA and TWL for tW. `none` stays `none` ("Isaías: sin fuente", not zero).
  - `reader.renderings(q: { strong: string } | { book: string; word: number }): Promise<Answer<{ strong: string; renderings: { text: string; count: number; refs: string[] }[] }>>`: from the alignments (`TextModel.align`) of the installed books of this language against their `orig` words with that Strong (`strongKey` for the key); `{ book, word }` takes the Strong of that original word position. Books where the `xmap` counts the Strong but that are not installed go to `notInstalled`. When the `aligned:` part of a rendering's key is installed, `phrase` is not needed here (that is C2).
  - `schemas.json`: one JSON Schema (draft 2020-12) object per query name: `{ "<name>": { "label": { "es": "<pasaje…>" }, "description": "<one English sentence>", "input": { …schema of the arguments… } } }`, the eight names of Decision 5.

- [ ] **Step 1: Tests:** `books({ article: 'ta:translate/figs-metaphor' })` on the sample gives `count` for Ruth and Titus if their notes cite it and `none` for a book whose tN the sample does not cover (Isaiah: "Un libro sin recursos en inglés"; `none`, never `zero`); `books({ concept: 'per:abraham' })` (or a concept the sample has) flags `installed` per book; `concept` lists not-installed books with bytes; `topics()` without `xtopics` installed (`install(…, { defaults: false, books: ['rut'] })`) → `installed: false`; `topics({ category: 'person' })` with it → ids sorted; `renderings({ strong: '<a Strong of Ruth 1:1 in the sample>' })` returns at least one rendering with its count and refs; schemas: the file has exactly the eight names, each `input` is a valid schema (compile with a tiny check: `type: 'object'`, `properties`, `required` present; no new dependency).
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: concept, renderings, topics and books, with the schemas of the eight queries`.

### Task 11: Search: the SQL driver, FTS5 import, and the in-memory search

**Files:**
- Create: `src/search/sql.ts`, `src/search/memory.ts`
- Modify: `src/reader.ts` (`search`), `src/client.ts` (`index` option), `src/index.ts`
- Test: `src/search/sql.test.ts` (uses `bun:sqlite`; the test file is the only place it is imported), `src/search/memory.test.ts`

**Interfaces:**
- Produces:
  - `interface SqlDriver { exec(sql: string): Promise<void>; run(sql: string, params: unknown[]): Promise<void>; all<T>(sql: string, params: unknown[]): Promise<T[]>; transaction<T>(fn: () => Promise<T>): Promise<T> }`.
  - `sqlIndex(driver: SqlDriver): SearchIndex`; `memoryIndex(): SearchIndex` (the Worker); `interface SearchIndex { init(): Promise<void>; addBook(lang: string, book: BookModel, segmentId: string): Promise<void>; removeSegment(segmentId: string): Promise<void>; has(segmentId: string): Promise<boolean>; search(lang: string, text: string, f?: SearchFilters): Promise<Hit[]> }`.
  - `type SearchFilters = { books?: string[]; kinds?: ('text' | 'note' | 'question' | 'link')[]; limit?: number }` (default limit 20); `type Hit = { kind: string; book: string; ref: string; res: string; id?: string; snippet: string; score: number }`.
  - Schema: one FTS5 table `pieces(body, kind UNINDEXED, lang UNINDEXED, book UNINDEXED, ref UNINDEXED, res UNINDEXED, rid UNINDEXED, seg UNINDEXED, tokenize = 'unicode61 remove_diacritics 2')` and a table `indexed(seg PRIMARY KEY, lang, book)`. One row per verse per text, per note, per question (question and response), per link. Rank by `bm25`. The user's text is passed as a quoted FTS5 phrase per word (never raw FTS5 syntax: a quote or `*` in the query must not throw).
  - `createClient` gains `index?: SearchIndex`; after `activate`, newly active `book:` segments are added and replaced ones removed. `reader.search(text, filters)` uses the client's index when given, else a `memoryIndex` filled with the books the reader opens; the answer's `notInstalled` lists the language's books not installed (with bytes) so the app can say "y hay más en …".

- [ ] **Step 1: Tests:** with `bun:sqlite` in memory wrapped as `SqlDriver`: install Ruth, `search('Noemí')` (or a word the sample's Ruth has) finds Ruth hits with refs; accent-insensitive (`noemi`); a query with `"` and `*` does not throw; `books: ['tit']` filter excludes Ruth; installing a new revision of Ruth removes the old segment's rows (no duplicate hits). The same hit set (by `ref` and `kind`) from `memoryIndex`.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, `tsc` pass; confirm with `grep` that nothing under `src/` except `*.test.ts` imports `bun:` or `node:` outside `src/node/`.
- [ ] **Step 5: Commit** `client: full-text search with an SQL driver and in memory`.

### Task 12: The five situations end to end, timings, README

**Files:**
- Create: `src/situations.test.ts`, `bench/timings.ts`
- Modify: `README.md`

**Interfaces:** consumes everything; produces no new API.

- [ ] **Step 1: The five situations of "Lo que más puede fallar"** as one test each, through `createClient` and the fake server or `openFromSegments` with the spec fixtures:
  - few resources: es-419 Ruth, `passage` coverage says what exists and what is `none`; `spec/tests/idioma-parcial/map-core.seg` read through the reader gives the same coverage as its expected file;
  - a book with no English sources: `books({ article: … })` says `none` for Isaiah (`spec/tests/queries/isaiah.json`);
  - an old pack with no network: `importOldPack` of the es-419 Titus zip, `passage('tit 1:1')` answers with partial coverage once `orig:tit` arrives by transfer;
  - mixed revisions: `spec/tests/revisiones-mixtas/` (catalog, map core and Ruth) through `openFromSegments`: the answer names both revisions;
  - a mistitled article: `spec/tests/articulo-mal-titulado/art.seg`: section ids unchanged, `otherLang` true.
- [ ] **Step 2:** Run; fix what fails in the task that owns it (report it).
- [ ] **Step 3: `bench/timings.ts`** (`bun bench/timings.ts`, needs `LP3_SAMPLE`, as `query/topicsFixture.ts`): builds English Psalms from `C:\Users\LENOVO\Git\Github\wt\fase0-paquetes\muestra` once, then measures (median of 20): from stored bytes to `book('psa')` readable; `passage('psa 23:1')` with its notes; `context('psa 23:1')`. Prints the numbers; asserts nothing. Record them in the README under "Timings (desktop)", with the targets (Psalms readable < 3 s, a verse with its helps < 50 ms, on the 2 GB phone in C3).
- [ ] **Step 4: README:** what the library does, the three layers, `createClient` with each store, the trust policy, the routes of `serving.md`, the eight queries and the envelope, what is left to the apps (SQL drivers, OPFS, phone timings, stems).
- [ ] **Step 5:** All tests of both packages and `tsc` pass.
- [ ] **Step 6: Commit** `client: the five failure situations end to end, desktop timings and README`.

### Task 13: Opt-in end-to-end run against staging

**Files:**
- Create: `src/staging.e2e.test.ts`

**Interfaces:** consumes `createClient`, `httpSource`, `startFakeServer({ bucketDir })`, `fsStore`; produces nothing.

- Skipped unless `LP3_STAGING=1` (`test.skipIf`). Never in CI: no workflow sets the flag, and the README says so.
- Staging: `https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev` (en, es-419 and common at revision 2). Trusted key: the test reads `packages/language-pack-v3/keys/78d2e6299a2de4d0.pub` (not copied into code). Revision 1: `LP3_STAGING_REV1` (default `C:/Users/LENOVO/Git/Github/wt/lp3-staging/bucket-rev1`), served by the fake server.
- Only `GET` requests to staging; nothing is written outside a temp store. Production is never named.

- [ ] **Step 1: Write the test:** an `fsStore` in a temp dir; install es-419 with Ruth from the fake server over `bucket-rev1` (revision 1, signatures checked with the staging key); `passage('rut 1:1')` answers with `revision.lang` 1. Then a client over the same store with `httpSource` on staging: `refresh('es-419')` reports revision 2 and the changed units in `updates`; `install('es-419', { books: ['rut'] })` fetches only segments not in the store and activates revision 2; `passage('rut 1:1')` answers with `revision.lang` 2; `verify()` reports nothing bad. Print the bytes fetched from staging.
- [ ] **Step 2:** Run without the flag: skipped. Run once with `LP3_STAGING=1` (read-only GETs to staging; no approval needed beyond this plan). Record the result in the ledger.
- [ ] **Step 3: Commit** `client: an opt-in end-to-end run against staging, from revision 1 to 2`.

---

## Final review

Three Opus reviewers in parallel (`.claude/lp3-controller.md`, "Reviews"), each with its part of `git diff 6f4c4b25..HEAD`, the ledger's deferred items and the rulings:

1. **Trust and installation:** the `sign.ts` change, `src/verify.ts`, `src/ed25519.ts`, `src/state.ts`, `src/plan.ts`, `src/install.ts`, `src/client.ts`, `src/transfer.ts`, the stores. Against `catalog.md` (activation, going back, optional units, signatures) and `transfer.md` (receiving, cut files, old packs). Questions: can anything unverified reach the store or the reader; can a failure leave a half state; does anything activate early.
2. **Reading and queries:** `src/reader.ts`, `src/query/*`, the exports added to `language-pack-v3`. Against `counts.md` (four states, never `zero` for `none`), "Published against installed", "Topics and installation", the optional `aligned` rules, and the Consumidores tab's sections and "Cómo una app usa el mapa".
3. **Search, portability, tests and docs:** `src/search/*`, `src/node/*`, `package.json`, tests, `src/staging.e2e.test.ts`, `test/*`, `bench/*`, README. Questions: anything Node-only reachable from the main entry; FTS5 injection; tests that pass for the wrong reason; the fake server faithful to `serving.md`; the staging test off unless its flag is set.

Fix rounds as the controller rules say. Then the controller writes `FIN:` with the commit list, the timings, and the open items (at least: the production publisher key, drivers and OPFS for C3/C5, phone timings, stems for C2, whether `transfer-v3.ts` should later call the library instead of its own copy of the import rules).
