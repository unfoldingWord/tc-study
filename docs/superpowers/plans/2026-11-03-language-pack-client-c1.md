# Language packs format 3, C1 (the common client library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The controller follows `.claude/lp3-controller.md` and dispatches `lp3-implementer`, `lp3-reviewer` and `lp3-runner`.

**Goal:** A TypeScript library, `packages/language-pack-client/`, with which Servos, tc-study and translation-helps-mcp download, store, verify, activate and query format 3 packs, from the Worker or from a transfer file, with no network once installed.

**Architecture:** Three layers over `@bt-synergy/language-pack-v3`, which stays the only code that parses or builds the format. (1) A dumb store keyed by segment id (memory, IndexedDB, files) plus one installed-state document. (2) An installer: fetch and verify catalogs (sha256 ids and Ed25519 signatures), plan what to fetch, verify every segment as it arrives, and activate a unit only when it and its needs are complete. Transfer files and old `.langpack.zip` packs go through the same verify-and-activate path. (3) A reader that opens installed segments lazily and answers the eight queries, each answer carrying its citations, the revision it describes, its coverage and the related books not on the device.

**Tech Stack:** TypeScript (strict, the `language-pack-v3` tsconfig), Bun 1.3.3 test runner, `@noble/curves` for Ed25519 (pure JS: old WebViews have no Ed25519 in WebCrypto), `fake-indexeddb` (dev only), `bun:sqlite` in tests for the FTS5 driver.

**Spec:** `packages/language-pack-v3/spec/` as phase 2 left it (`959533cc`): `catalog.md` (units, activation, published against installed, signatures, going back, optional units), `transfer.md` (receiving, cut files, old packs), `container.md` (ids, order of checks), `counts.md` (the four states). The C1 section of the Plan tab and "La biblioteca común", "Cómo una app usa el mapa", "La transición sin red" and "Las secciones de los artículos" of the Consumidores tab of https://claude.ai/artifact/5Vw6P8Bm3bo51VkTRwsuPA.

## Decisions for Abel before this runs

Each is what the tasks below implement unless Abel says otherwise.

1. **Signature library.** `@noble/curves` (MIT, audited, only `@noble/hashes` under it), exact version pinned. Trusted keys are passed by the app (`trustedKeys: { [keyId]: publicKeyHex }`); none ship in this package until phase 3 makes the publisher key. A published catalog with no valid signature by a trusted key is rejected (`E_UNTRUSTED`) unless the app passes `allowUnsigned: true` (tests, dev). A local catalog (`origin: local`) is only accepted from the bridge path.
2. **How the common catalog is fetched.** Only one catalog route is needed: the language catalog at `/v3/packs/<lang>/catalogo`. Its `requires` gives the common catalog's id, and the client fetches it as a segment at `/v3/packs/seg/<id>` (a catalog is a segment whose id is its sha256). **Phase 3 must serve catalogs under `seg/` too.** Both route templates are options of the HTTP source, so whatever phase 3 settles works without a code change. The supervisor tells the phase 3 session this.
3. **Search storage.** The library ships the SQLite schema, the import of book segments into FTS5 and the search SQL behind a four-method `SqlDriver` interface, tested with `bun:sqlite`. The drivers for wa-sqlite (browser), Capacitor and Tauri are written with C3 and C5, where those runtimes exist. The Worker searches in memory over the books it has open (open decision 5 of the Consumidores tab stays open). Snowball stems for es and pt go to C2.
4. **Browser store.** IndexedDB only (works on every WebView Servos targets). OPFS is not built in C1; if tc-study needs it for speed, it is a fourth `BlobStore` in C5.
5. **Query names.** The code uses English names: `passage`, `concept`, `article`, `renderings`, `search`, `topics`, `books`, `context` (pasaje, concepto, articulo, traducciones, buscar, temas, libros, contexto). No two share a root. The schemas file gives each its Spanish label for C2.
6. **Phone timings (C1.7).** Measured on this desktop by a bench script and reported, not asserted against the phone targets. The 2 GB phone measurement is a step of C3 (Servos), where the app runs.
7. **Default install.** `refresh` and the first `install` bring the catalogs, `xmap`, `map`, `xtopics` and `topics`. Books, `obs`, `lex:*` and complements only when asked. `aligned:*` (optional units) only when asked by part id or with `aligned: true`.

## Global Constraints

- Branch `feat/language-pack-client`, from `959533cc` (end of phase 2). Worktree `C:\Users\LENOVO\Git\Github\wt\lp3-client`. Commits local until Abel says yes. Never touch `wt/langpack-v3`, the shared checkout `bt-synergy`, or Servos.
- Package `@bt-synergy/language-pack-client`, `version 0.1.0`, `"type": "module"`, `main`/`types` `./src/index.ts` as `language-pack-v3`; dependency `"@bt-synergy/language-pack-v3": "workspace:*"`. Copy `language-pack-v3/tsconfig.json`.
- **No duplicated format code.** Parsing, ids, sha256, CBOR, views, transfer read/write, the bridge and map answers come from `@bt-synergy/language-pack-v3`. When a needed function is not exported there, export it from `language-pack-v3/src/index.ts` (that is the only change allowed in that package, plus a spec fix if a task finds a spec bug; spec fixes get their own commit).
- **No Node in the main entry.** Nothing reachable from `src/index.ts` imports `node:*` or `bun:*`. Node-only code lives in `src/node/` and is exported by subpath (`./node/fsStore`). The main entry runs in a browser, a WebView, a Cloudflare Worker and Bun.
- **A segment id is not the sha256 of the file bytes**: it is the id `readSegment` checks (the hash of the uncompressed body, `container.md`). Every segment that enters the store is checked with `readSegment(bytes, { known: KNOWN[class], expectedId })`. A complement's id is the sha256 of its bytes (`sha256` from `language-pack-v3`). Ids are lowercase hex, 64 characters.
- **Errors.** Format defects keep `FormatError` and its codes. Client conditions throw `ClientError` (Task 1) with one of: `E_SIGNATURE` (a signature does not verify), `E_UNTRUSTED` (no valid signature by a trusted key), `E_DOWNGRADE` (lower revision, not confirmed), `E_NO_BASE` (update transfer without its base), `E_NETWORK` (fetch failed or non-200), `E_STORE` (the store failed, quota included), `E_NOT_INSTALLED` (a query needs a unit that is not active), `E_ARG` (bad query argument).
- **Tests never reach a network** other than `127.0.0.1` (the fake server of Task 5). Nothing runs against staging or production. No private key is written to any file: test keys are generated at run time (`ed25519.utils.randomPrivateKey()`).
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

### Task 3: Verifying catalogs (ids, signatures, going back)

**Files:**
- Create: `src/verify.ts`, `test/keys.ts` (test helper: generate a key pair, `signCatalog(bytes, privateKey, keyId): Promise<Uint8Array>`)
- Modify: `package.json` (dependency `@noble/curves`, exact version), `src/index.ts`; `language-pack-v3/src/index.ts` only if a needed export is missing
- Test: `src/verify.test.ts`

**Interfaces:**
- Produces:
  - `type TrustPolicy = { trustedKeys: Record<string, string>; allowUnsigned?: boolean }` (key id → 32-byte public key, hex).
  - `type VerifiedCatalog = { id: string; bytes: Uint8Array; catalog: CatalogModel; name: string; publisher: string; revision: number; origin: 'published' | 'local'; signedBy?: string }` (`name` is `about.catalog`).
  - `verifyCatalog(bytes: Uint8Array, policy: TrustPolicy, opts?: { expectedId?: string; local?: boolean }): Promise<VerifiedCatalog>`: `readSegment` with `expectedClass: 'catalog'`, `known: CATALOG_TABLES`, then `catalogView`. Each `sig` entry with `alg: 'ed25519'` and a key in `trustedKeys` is checked over the 32-byte id; one valid one is enough (`signedBy` = its key id). A `sig` by a trusted key that does not verify → `E_SIGNATURE`. No valid trusted signature → `E_UNTRUSTED`, unless `allowUnsigned`. `origin: 'local'` → `E_UNTRUSTED` unless `opts.local` (the bridge path, Task 7).
  - `checkRevision(installed: { publisher: string; name: string; revision: number } | undefined, incoming: VerifiedCatalog, confirmDowngrade?: boolean): void`: throws `E_DOWNGRADE` when the publisher and name match and the incoming revision is lower, unless confirmed. Equal revision with a different id also throws `E_DOWNGRADE` (a publisher bug or a forgery; never replace silently).
- `signCatalog` re-writes the catalog with `writeSegment(seg, { sig: [...] })`; the id must not change (assert it in the helper).

- [ ] **Step 1: Tests**, on a catalog built in the test (`buildCatalog` over a tiny built segment, or `spec/tests/paquete-viejo/catalog.seg` for the local case): signed by a trusted key → ok with `signedBy`; signed by an untrusted key only → `E_UNTRUSTED`; trusted key with a flipped signature byte → `E_SIGNATURE`; two signatures, one untrusted and one trusted valid → ok; unsigned → `E_UNTRUSTED`, ok with `allowUnsigned`; a byte flipped in the body → `FormatError` `E_ID` (with `expectedId`); local catalog → `E_UNTRUSTED`, ok with `{ local: true }`; `checkRevision`: 12 over 9 ok, 9 over 12 `E_DOWNGRADE`, ok with confirm; other publisher → ok; same revision, other id → `E_DOWNGRADE`.
- [ ] **Step 2:** See them fail.
- [ ] **Step 3:** Implement. Use `ed25519.verify(sig, idBytes, publicKey)` from `@noble/curves/ed25519`; any throw from it is a failed signature, not a crash.
- [ ] **Step 4:** Tests, `tsc` pass.
- [ ] **Step 5: Commit** `client: verify catalogs, their signatures and their revisions`.
- [ ] **Step 6: Codex review** (read-only, recipe in the Servos memory `codex-cli-windows.md`) of `src/verify.ts` with the Sonnet reviewer.

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
- Consumes: `signCatalog` (Task 3).
- Produces:
  - `interface PackSource { catalog(lang: string, signal?: AbortSignal): Promise<Uint8Array>; segment(id: string, signal?: AbortSignal): Promise<Uint8Array> }`.
  - `httpSource(o: { base: string; catalogPath?: (lang: string) => string; segmentPath?: (id: string) => string; fetch?: typeof fetch }): PackSource`. Defaults `/v3/packs/${encodeURIComponent(lang)}/catalogo` and `/v3/packs/seg/${id}`. Non-200 or a thrown fetch → `ClientError('E_NETWORK')` with the status in the message.
  - `test/sample.ts`: `buildSample(): Promise<Sample>` with `type Sample = { segments: Map<string, Uint8Array>; langCatalog: Uint8Array; commonCatalog: Uint8Array; keys: { keyId: string; publicKey: string; privateKey: Uint8Array } }`. Builds es-419 (Titus and Ruth) and the common build from `language-pack-v3/spec/tests/data` the way `src/build/invalidation.test.ts` does, with topics from `spec/tests/data/topics` and `aligned: true`, then signs both catalogs with a key generated at run time. Memoised per process (the build is the slow part).
  - `test/fakeServer.ts`: `startFakeServer(sample: Sample, o?: { failSegment?: (id: string, n: number) => 'ok' | 404 | 'drop' | 'corrupt' }): { url: string; hits: string[]; stop(): void }` with `Bun.serve({ port: 0, hostname: '127.0.0.1' })`. Serves the language catalog at the catalog route and every segment and both catalogs at `seg/<id>`. `hits` records each path served, for the "fetched only once" tests. `corrupt` flips one byte of the body.

- [ ] **Step 1: Tests:** `httpSource` against the fake server gets the language catalog (its id is the one `buildSample` made) and a segment by id; a 404 is `E_NETWORK`; custom `catalogPath` is used; an aborted signal rejects.
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
  - `RefreshReport = { catalogs: InstalledCatalog[]; updates: ReturnType<typeof updates>; missingCommon?: { name: string; revision: number; id: string } }`. `refresh` fetches the language catalog, verifies it, fetches the common catalog by the id in `requires` (Decision 2), verifies it, runs `checkRevision` for each, stores both catalog files, and writes them to `state.published`. It activates nothing.
  - `InstallReport = { activated: string[]; waiting: { key: string; missing: string[] }[]; fetched: string[]; bytes: number }`; `Progress = { done: number; total: number; bytes: number; key: string }`.
  - `install` calls `refresh` when the language has no published catalog, then `planInstall`, fetches each segment not in the store, checks it with `readSegment(bytes, { known: KNOWN[class], expectedId })` (a mismatch is not stored and the unit waits: the report names it), `put`s it, and after each step runs `activate` and `setState`, so a cut keeps every unit already complete.
  - `Status = { lang: string; published?: InstalledCatalog; active?: InstalledCatalog; units: { key: string; revision: number; installed: boolean; optional: boolean; bytes: number }[]; updates: ReturnType<typeof updates>; missingCommon?: RefreshReport['missingCommon'] }`.
  - `prune` deletes store ids that no active unit and no stored catalog of `active`/`published` uses. `verify` re-reads every stored segment against its id and returns the bad ones (Review Focus 2 uses it).
  - Calls on one client run in a queue (one promise chain): Review Focus 5.

- [ ] **Step 1: Tests** against `startFakeServer(buildSample())` with `memoryStore()` and the sample key trusted: `install('es-419', { books: ['rut'] })` activates `xmap`, `map`, `xtopics`, `topics`, `book:rut`, `orig:rut` and Ruth's article groups, and no `aligned:` unit; `install` with `aligned: ['<one part>']` adds that part only; a second `install` fetches nothing (`hits` unchanged). Review Focus 1 (`failSegment` returns `drop` for one segment of `book:rut` once: Ruth waits, the retry fetches only that id). Review Focus 3 (server without the common catalog under `seg/`: `map`/`topics` active, `book:rut` waiting, `missingCommon` set). Review Focus 4 (a store wrapper whose 3rd `put` throws `E_STORE`: `install` rejects with `E_STORE`, `getState` equals the state before, the two segments put are kept). Review Focus 5 (two `install` calls at once: each id appears once in `hits`, final state equals sequential). A `corrupt` segment is reported in `waiting` and not stored. Untrusted server key → `E_UNTRUSTED`, nothing stored. A refreshed lower revision → `E_DOWNGRADE`. `prune` after replacing Ruth with a new revision removes the old Ruth segment only.
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
  - `importTransfer(bytes: Uint8Array, o?: { confirmDowngrade?: boolean }): Promise<ImportReport>` with `ImportReport = { catalogs: InstalledCatalog[]; stored: string[]; rejected: { id: string; code: string }[]; missing: string[]; activated: string[]; waiting: { key: string; missing: string[] }[] }`. `readTransfer(bytes, { known: KNOWN })`, then `verifyCatalog` + `checkRevision` on each catalog inside, store every `ok` entry, then `activate`. An `update` file whose `base` the state does not have → `ClientError('E_NO_BASE')` before anything is stored.
  - `exportTransfer(o: { lang: string; mode: 'full' | 'update'; books?: string[]; units?: string[]; base?: [string, number][] }): Promise<Uint8Array>`: from the active catalogs and segments only (never a segment that is not active). `full` as `transfer.md` "Modes"; `update` holds the segments of the active units that differ from the `base` revisions (the client keeps no old catalogs, so `update` needs the receiver's base given as the active catalogs of a peer; the test uses a second client's `status`).
  - `importOldPack(zip: Uint8Array): Promise<ImportReport>`: `bridgeZip`, then the local catalog through `verifyCatalog(…, { local: true })`; a later published catalog replaces it (normal `activate`).

- [ ] **Step 1: Tests:** export `full` with Ruth from a client installed from the fake server, import into a second client with `memoryStore()` and no source: Ruth readable state equals the first (`status` units). `update`: change Ruth (new revision from `buildSample({ tweak })`), export update with the second client's base, import: only Ruth's new segments travel (assert entry ids). `update` into an empty client → `E_NO_BASE`. `spec/tests/transferencia-cortada/cut.tcpack`: the complete entries are stored, the cut ones are in `missing`, and units fully present activate (`transfer.md` "A file cut short"; trust its catalog with `allowUnsigned` since that case is unsigned). A transfer with a lower revision → `E_DOWNGRADE`. `importOldPack(spec/tests/data/es-419-tit.langpack.zip)`: a local catalog with `origin: local`, `book:tit` waits for `orig:tit` until the common catalog is installed, then activates.
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
- [ ] **Step 4: README:** what the library does, the three layers, `createClient` with each store, the trust policy, the routes and Decision 2, the eight queries and the envelope, what is left to the apps (SQL drivers, OPFS, phone timings, stems).
- [ ] **Step 5:** All tests of both packages and `tsc` pass.
- [ ] **Step 6: Commit** `client: the five failure situations end to end, desktop timings and README`.

---

## Final review

Three Opus reviewers in parallel (`.claude/lp3-controller.md`, "Reviews"), each with its part of `git diff 959533cc..HEAD`, the ledger's deferred items and the rulings:

1. **Trust and installation:** `src/verify.ts`, `src/state.ts`, `src/plan.ts`, `src/install.ts`, `src/client.ts`, `src/transfer.ts`, the stores. Against `catalog.md` (activation, going back, optional units, signatures) and `transfer.md` (receiving, cut files, old packs). Questions: can anything unverified reach the store or the reader; can a failure leave a half state; does anything activate early.
2. **Reading and queries:** `src/reader.ts`, `src/query/*`, the exports added to `language-pack-v3`. Against `counts.md` (four states, never `zero` for `none`), "Published against installed", "Topics and installation", the optional `aligned` rules, and the Consumidores tab's sections and "Cómo una app usa el mapa".
3. **Search, portability, tests and docs:** `src/search/*`, `src/node/*`, `package.json`, tests, `test/*`, `bench/*`, README. Questions: anything Node-only reachable from the main entry; FTS5 injection; tests that pass for the wrong reason; the fake server faithful to Decision 2.

Fix rounds as the controller rules say. Then the controller writes `FIN:` with the commit list, the timings, and the open items (at least: the phase 3 routes and catalogs under `seg/`, the publisher key, drivers and OPFS for C3/C5, phone timings, stems for C2).
