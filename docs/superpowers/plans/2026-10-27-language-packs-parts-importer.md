# Language packs parts importer (Servos plan 3, part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bt-synergy can plan, stage and apply language-pack parts on a device: one IndexedDB transaction per unit
(a book or the shared unit), a slot register in the same store, catalog rows and receipts, proven to rebuild exactly
what the whole pack holds.

**Architecture:** `cache-adapter-indexeddb` gains an atomic read-decide-write method (`transactRaw`) and a byte store
for staging. `language-pack/src/parts/` gains `register.ts` (register rows, `readRegister`), `plan.ts` (`planParts`,
`partsCoverage`), `staging.ts` (`PartsStaging`, sha-checked), `apply.ts` (`applyParts`) and `receipts.ts`.
`PackTarget`/`packTargetFrom` carry the new method through.

**Tech Stack:** TypeScript, Bun 1.3.3 (`bun test` per package), fake-indexeddb 6.0.0, pako (already a dependency).

**Spec:** `docs/superpowers/specs/2026-10-27-language-packs-parts-importer-design.md`

## Global Constraints

- Branch `feat/packs-parts-importer` in the worktree `C:\Users\LENOVO\Git\Github\wt\tcs-parts-importer` (from
  `uw/master` e36aa839). Never touch `C:\Users\LENOVO\Git\Github\bt-synergy` (shared) or `wt/bts-master`.
- `bun install` once in the worktree; after changing a package others read from `dist/` (language-pack,
  cache-adapter-indexeddb), run `bash scripts/build-pack-tools.sh`, then `git checkout --
  packages/toc-generator-cli/bin packages/door43-api/tsconfig.tsbuildinfo bun.lock` if they show as modified.
- Many files are CRLF: keep each file's line endings. Comments and commits in English; every commit ends with a blank
  line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nothing pushed, published or dispatched
  without Abel's yes.
- Register row key prefix: `parts-slot:`; row: `{ key: 'parts-slot:' + slotId, entry: { content: SlotRecord,
  timestamp: <ms> } }`, `SlotRecord = { sha256: string; keys: string[]; list: string; at: string }` (`list` = the
  list's `language`, `originals` for the originals list; `at` ISO).
- Rows written from parts: `entry = { ...value, timestamp: <apply ms> }`, no `expiresAt` (value is the part row's
  value; if it is not an object, write it unchanged).
- Receipt: `resource:{key}` with `buildIngestReceiptFromCatalog(metadata, { ingestSchema, downloadMethod: 'parts' })`
  (resource-catalog); `ingestSchema = ingestSchemaForResourceType(type, list.versions.sot.usjProcessing)`.
- Units: `unitOfPart(entry)` (`book <b>` for book, alignments, original; `shared` otherwise). Order: book units in
  canonical Bible order, then `shared`.
- Known pre-existing failures elsewhere in the repo (door43-api network, scripture-loader 1, TN loader 3) are not this
  plan's.

## Review Focus

1. A part row whose key is not in its slot (a malformed or mismatched part): the unit is refused, nothing written
   (Task 4).
2. A slot listed twice in a plan (the same slot named by the language list and the originals list): applied once,
   the register says which list (Task 3 plan, Task 4 apply).
3. A target without `transactRaw` (an old adapter): `applyParts` fails at once with a clear message, writes nothing
   (Task 4).
4. Staging `get` returning bytes whose sha256 no longer matches (storage corruption): the unit is refused (Task 4).
5. Quota exceeded inside a unit's transaction: reported as `quota`, other units go on, the register unchanged for
   that unit (Task 4, simulated in the memory target).

---

### Task 1: The atomic method on the IndexedDB adapter

**Files:** Modify `packages/cache-adapter-indexeddb/src/indexeddb.ts`; Test `packages/cache-adapter-indexeddb/tests/transactRaw.test.ts`

**Interfaces — Produces:**
```ts
type RawRead = { keys: string[]; prefixes: string[] }
type RawFound = { rows: Map<string, unknown>; prefixKeys: Map<string, string[]> } // key → entry; prefix → keys
type RawWrite = { puts: Array<{ key: string; entry: unknown }>; deletes: string[] }
transactRaw(read: RawRead, decide: (found: RawFound) => RawWrite): Promise<void>
```
One readwrite transaction: `get` each key, `getAllKeys(IDBKeyRange.bound(p, p + '\uffff'))` each prefix; when all
reads are back, call `decide` synchronously, then `put` each row exactly as given (no chunk splitting) and `delete`
each key exactly (no chunk expansion: callers list chunk keys themselves); resolve on `complete`; if `decide` throws
or the transaction errors, abort and reject with that error (a `QuotaExceededError` keeps its `name`).

- [ ] **Step 1: Tests** in `transactRaw.test.ts` (fake-indexeddb, as `putRawMany.test.ts`):
  `'reads keys and prefixes, then writes and deletes in one transaction'` (seed 3 rows; read 1 key + 1 prefix; decide
  puts 1 and deletes 1; assert the found map and keys, then the store); `'a decide that throws leaves the store as it
  was'`; `'deletes exactly the keys given, chunks included only when listed'` (seed `tn:x:tit` + `tn:x:tit:1`; delete
  only `tn:x:tit` → `tn:x:tit:1` still there); `'puts rows exactly as given'` (a book-shaped entry is not split).
- [ ] **Step 2: Run** `bun test tests/transactRaw.test.ts` in the package. Expected: FAIL (no method).
- [ ] **Step 3: Implement** `transactRaw` with the interface above.
- [ ] **Step 4: Run** the package's `bun test`. Expected: PASS. Rebuild tools (Global Constraints).
- [ ] **Step 5: Commit** `IndexedDB cache: read, decide and write in one transaction`.

### Task 2: Staging

**Files:** Create `packages/cache-adapter-indexeddb/src/byteStore.ts` (export from its index), `packages/language-pack/src/parts/staging.ts`; Tests `packages/cache-adapter-indexeddb/tests/byteStore.test.ts`, `packages/language-pack/src/parts/staging.test.ts`

**Interfaces — Produces:**
```ts
// cache-adapter-indexeddb
class IndexedDBByteStore { constructor(opts: { dbName: string; storeName?: string /* 'bytes' */ })
  put(key: string, bytes: Uint8Array): Promise<void>; get(key: string): Promise<Uint8Array | null>
  has(key: string): Promise<boolean>; delete(key: string): Promise<void>
  list(): Promise<Array<{ key: string; size: number; at: string }>> }
// language-pack
type ByteStore = /* the five methods above */
interface PartsStaging { put(sha: string, bytes: Uint8Array): Promise<void>; get(sha: string): Promise<Uint8Array | null>
  has(sha: string): Promise<boolean>; delete(sha: string): Promise<void>; list(): Promise<Array<{ sha: string; size: number; at: string }>> }
function stagingFrom(store: ByteStore): PartsStaging   // put refuses (throws) when sha256Hex(bytes) !== sha
function memoryByteStore(): ByteStore                  // for tests and apps without IndexedDB
```

- [ ] **Step 1: Tests**: byteStore round trip, `list` sizes, `delete`; staging: `'put refuses bytes whose sha256 is
  not their name'` (store unchanged), `'put then get returns the same bytes'`, `list` maps `key`→`sha`.
- [ ] **Step 2: Run** both, expected FAIL. **Step 3: Implement.** **Step 4: Run** both packages' `bun test`, PASS;
  rebuild tools.
- [ ] **Step 5: Commit** `Parts staging: verified bytes waiting to be applied`.

### Task 3: The register, the plan and coverage

**Files:** Create `packages/language-pack/src/parts/register.ts`, `plan.ts`; Tests `register.test.ts`, `plan.test.ts`

**Interfaces — Produces:**
```ts
const REGISTER_PREFIX = 'parts-slot:'
type SlotRecord = { sha256: string; keys: string[]; list: string; at: string }
type Register = Map<string /* slotId */, SlotRecord>
function slotOfEntry(entry: PartEntry): PartSlot                 // {kind, resource, book?, group?}
function registerRow(slot: string, record: SlotRecord, now: number): { key: string; entry: unknown }
function readRegister(rows: Iterable<{ key: string; entry: unknown }>): Register
type PlanInput = { list: PartsList; originals?: PartsList; register: Register; chosen: string[] /* unit ids */ }
type PartsPlan = { download: PartEntry[]; remove: string[] /* slotIds */; units: string[]; bytes: number }
function planParts(input: PlanInput): PartsPlan
type Coverage = Map<string /* resource key */, { present: number; missing: number; missingBytes: number; whole: boolean }>
function partsCoverage(input: PlanInput): Coverage   // whole: every part the lists name for that resource is present
```
Rules: a part is in scope when `unitOfPart(entry)` is chosen; `download` = in-scope parts whose slot is absent or has
another sha (deduplicated by slot; the originals list's entry wins for `original`/`macula`); `remove` = register slots
whose `record.list === list.language`, in chosen units, that neither list names (another language's slots and
`originals` slots are never removed by a plan; originals are only replaced by another sha); `planParts` and
`partsCoverage` throw when `list.originals` is set and `originals` is not given; `units` = chosen units touched by `download` or `remove`, in the order of
Global Constraints; `bytes` = sum of `download[].bytes`.

- [ ] **Step 1: Tests** with small hand-made lists (two books, one shared group, an originals list): first plan (all
  in scope), nothing to do when the register matches, a changed sha, an unchosen book ignored, a slot no longer named
  → `remove`, the same slot in both lists → once (Review Focus 2), `units` order, `bytes`; `readRegister` ignores
  non-`parts-slot:` rows; coverage `whole` true/false and missing bytes.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement.** **Step 4: Run** `bun test` in language-pack, PASS.
- [ ] **Step 5: Commit** `Parts: the slot register, the plan and coverage`.

### Task 4: Applying, one transaction per unit

**Files:** Create `packages/language-pack/src/parts/apply.ts`, `packages/language-pack/src/parts/testTarget.ts`
(in-memory target, test-only export); Modify `packages/language-pack/src/types.ts` (`PackTarget.transactRaw?`),
`packages/language-pack/src/stores.ts` (`RawCacheStore.transactRaw?`, wired in `packTargetFrom`); Test `apply.test.ts`

**Interfaces — Consumes:** Task 1's `transactRaw` shape (as `PackTarget.transactRaw`), Task 2's `PartsStaging`,
Task 3's register, plan and `slotOfEntry`. **Produces:**
```ts
type ApplyInput = { target: PackTarget; staging: PartsStaging; plan: PartsPlan; list: PartsList; originals?: PartsList
  register: Register; chosen: string[]; versions: PackVersions; now?: () => number }
type ApplyResult = { applied: string[]; failed: Array<{ unit: string; reason: 'missing' | 'quota' | 'invalid' | 'versions' | 'error'; message: string }>
  completed: string[] /* resources whole after this apply */; originalsReplaced: boolean; bytesApplied: number }
function applyParts(input: ApplyInput): Promise<ApplyResult>
```
Behaviour (spec §3, §2): refuse everything (`versions`) when any layer of `list.versions` differs from `versions`
(compare like `importLanguagePack`'s `differingLayers`, String()); refuse at once without `target.transactRaw`;
refuse (`missing`, nothing applied) when a planned sha is not staged. Per unit, in order: read each staged part,
check `sha256Hex` again (Review Focus 4), `readPart`, check every row's slot with `slotOfRow` against the entry's slot
(Review Focus 1, `invalid`); then one `transactRaw` reading the unit's register rows and, for each resource the
register does not know yet, its key prefixes (`tn:{rk}:`, `prepared:` … — derive from `scansFor`/`belongsTo` in
`keys.ts`); decide: deletes = old register keys not in the new part + (first time) prefix keys whose `slotOfRow` is
this slot and not in the new part + all keys and the register row of `plan.remove` slots of this unit; puts = rows
with `timestamp` = now and no `expiresAt` + the register rows. A `QuotaExceededError` → `quota`. Before the
unit's `transactRaw` (after its parts are checked): `putCatalogRows` for the unit's resources from the list
(`restoreCatalogBookkeeping(metadata, now)`, `availability.offline` = the device's current value unless coverage before
the unit already makes it true); if it fails, the unit fails (`error`) with nothing written and its parts staged. After
the unit commits: `putCatalogRows` again only to set `availability.offline` = every part of that resource within the
chosen units present after this unit (coverage `missing === 0 && present > 0`; a failure is reported as `error`, the
unit stays applied), then `staging.delete` each applied sha (ignore errors). `originalsReplaced` = an `original`/`macula` slot already held another sha.

- [ ] **Step 1: Tests** (memory target, hand-made parts built with `writePart`): first download of two books + shared;
  a replaced slot whose old alignment keys are deleted and new ones written; a `remove`d slot; first-time cleanup
  deletes the whole-pack rows of that slot only (another slot's rows of the same resource stay); rows carry
  `timestamp` = now and no `expiresAt`; a second book fails (`invalid` row) and the first stays applied, the second's
  register untouched; `quota` from the memory target's simulated error; `missing` when a sha is not staged (nothing
  written); `versions`; no `transactRaw` → refused; catalog rows restored with `catalogedAt` and `offline` true only
  when every part of that resource within the chosen units is present (`missing === 0 && present > 0`), also when the
  resource is not whole; staging emptied of applied parts; `originalsReplaced`.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** (and the memory target: same contract as Task 1, with a switch to
  throw a `QuotaExceededError` on the next transaction). **Step 4: Run** language-pack `bun test` and
  `bun run type-check`, PASS; rebuild tools.
- [ ] **Step 5: Commit** `Parts: apply each unit in one transaction, with the register and the catalog`.

### Task 5: Receipts

**Files:** Create `packages/language-pack/src/parts/receipts.ts`; Modify `apply.ts` (call it at the end); Test `receipts.test.ts`

**Interfaces — Produces:** `receiptChanges(input: { lists: PartsList[]; register: Register; catalog: Map<string, ResourceMetadata>; versions: PackVersions }): { puts: Array<{ key: string; entry: unknown }>; deletes: string[] }`
— a receipt `resource:{key}` (`entry: { content: {}, metadata: buildIngestReceiptFromCatalog(...) }`, as the whole
pack's receipts are shaped — check one in `pack.test.ts` fixtures and match it) for each resource whose parts in the
lists are all in the register; a delete for each resource that has a receipt with `downloadMethod: 'parts'` and is
no longer whole. `applyParts` applies these in one more `transactRaw` after the last unit. (As built, fix round 1:
the input also takes `touched`, `existing` — the receipts read in that transaction — and `now`; the pass runs on every
call not refused, an empty plan included, over the resources the lists name plus those touched, with the register
read inside the transaction; it skips a receipt `isMatchingIngestReceipt` already accepts and carries
`absentFromRelease` from a receipt of the same release. Apps call `applyParts` at startup, so receipts heal.)

- [ ] **Step 1: Tests**: whole resource → receipt with `releaseStamp` of its catalog row, `ingestSchema`
  `usj:{version}` for scripture and `helps:1` for notes, `downloadMethod: 'parts'`; a resource chosen in part → none;
  a resource that stops being whole → its parts receipt deleted, a receipt not from parts left alone; `isMatchingIngestReceipt`
  accepts the written receipt.
- [ ] **Step 2–4:** FAIL, implement, PASS (`bun test`, `bun run type-check`).
- [ ] **Step 5: Commit** `Parts: receipts for resources whose parts are all in`.

### Task 6: Exports, and the real-data proof

**Files:** Modify `packages/language-pack/src/index.ts`; Create `packages/language-pack/src/parts/realParts.test.ts`

- [ ] **Step 1: Export** from `index.ts`: `planParts`, `partsCoverage`, `readRegister`, `REGISTER_PREFIX`,
  `stagingFrom`, `memoryByteStore`, `applyParts`, and the types (`SlotRecord`, `Register`, `PartsPlan`, `Coverage`,
  `PartsStaging`, `ByteStore`, `ApplyInput`, `ApplyResult`). Rebuild tools.
- [ ] **Step 2: Real data, run only when `PARTS_REAL=<folder>` is set** (skipped otherwise, saying so). The folder
  holds: `es-419.langpack.zip`, `originals.langpack.zip` (whole q9-a12, tc-study run 40502309021 — copy them from
  `C:\Users\LENOVO\Git\Github\wt\paquetes-q9a12`), `es-419.json` and `originals.json` (the parts lists: get with
  `npx wrangler r2 object get language-packs-staging/catalog/f2.0-u2.3.0-p6000230-q9-a12-t1/es-419.json --remote
  --file …` from `C:\Users\LENOVO\Git\Github\wt\mcp-worker-parts`, and the originals list at the language list's
  `originals.path`), and `parts/<sha>.part.gz` for every part both lists name (GET
  `https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev/v2/packs/parts/<sha>`, check sha256; the parts
  route never dispatches). Test: import both whole packs into memory target A with `importLanguagePack`; stage every
  part and `applyParts` everything into memory target B (all units chosen); compare the rows of the part layers
  (keys and values, ignoring `timestamp`, `expiresAt` and the other volatile fields; ignoring `resource:` receipts
  and `parts-slot:` rows). Expected: no key only in one side, no differing value; print counts.
- [ ] **Step 3: Run** it with the folder and without (skips). Then the language-pack and cache-adapter-indexeddb
  suites and `bun run type-check`.
- [ ] **Step 4: Commit** `Parts: exported for apps, and proven to rebuild the whole pack`.
