# Language packs: the parts importer (Servos plan 3, part B)

Date: 2026-10-27. Status: design approved section by section by Abel; spec to review.

## Why

Language packs are published as parts (format 2.0): a language list names content-addressed gzip parts, each holding
the rows of one slot (`kind:resource[:book][:group]`). An app needs to download only the parts it lacks and apply
them so a reader never sees a mix of old and new (new notes over old alignments). Nothing on the client side exists
yet: `readPart` and the list types exist, but no planner, staging, importer or slot register.

Plan 3 (Servos online) is split in three: A (Servos on current bt-synergy, done: idiomaspuentes/servos#9), **B (this
spec: the importer, in bt-synergy)**, C (Servos online: network, policies, UI). B is everything local; C downloads
parts into B's staging, decides when, remembers what the person chose, and shows it.

B lives in bt-synergy and knows nothing of Servos. In this delivery only Servos uses it; tc-study can adopt it later.

## What exists (e36aa839)

- `language-pack/src/parts/partFile.ts`: `readPart(bytes)` (ungzip + JSONL, no sha check), `sha256Hex`, `PART_LAYERS`
  (sot, prepared, quote, align, text — receipts never travel), volatile fields stripped (`timestamp`, `expiresAt`, …).
- `partsList.ts`: `PartsList`, `PartEntry {sha256, bytes, rows, kind, resource, book?, group?, fingerprint, layers}`,
  `unitOfPart` (`book <b>` for book, alignments, original; `shared` otherwise), `restoreCatalogBookkeeping`.
- `partSlots.ts`: `PartSlot`, `slotId`, `slotOfRow(row, resource{key,type,subject})`. One part = one slot; a slot is
  in one part per list; a resource spans several parts (a book part and an alignments part; groups and titles).
- Catalog rows travel in the list's `resources[].metadata` (with `bookBlobs`/`bookBlobsRef`). Derived keys
  (`helps-quote:`, `helps-align:`) carry per-book stamps that readers compute from the device's catalog row.
- The whole-pack importer (`pack.ts`) never deletes rows; `IndexedDBCacheAdapter` has one transaction per
  `putRawMany` and per `delete`, no multi-operation transaction; the cache and the catalog are separate databases.

## Design

### 1. Pieces

- **`planParts(input) → PartsPlan`** (pure, `language-pack/src/parts/`). Input: the language list, the originals list,
  the register (what the device holds), and the chosen units (`shared`, `book <b>`). Output: the parts to download
  (missing slots, or slots whose sha differs), this language's slots the list no longer names within the chosen
  units (§2), and the total bytes. It touches nothing.
- **`PartsStaging`** (interface in `language-pack`): `put(sha, bytes)` (refuses bytes whose sha256 is not `sha`),
  `get(sha)`, `has(sha)`, `delete(sha)`, `list()`. IndexedDB implementation in `cache-adapter-indexeddb`, in its own
  database with a configurable name (Servos: `servos-partes`), so the resources database keeps its version.
- **`applyParts(input) → ApplyResult`**: applies a plan from staging into the resources and the catalog, with the
  register.
- **Target:** `PackTarget` gains an optional atomic method (below, §5); `IndexedDBCacheAdapter` implements it; tests
  use an in-memory target with the same contract.
- **`partsCoverage({ list, originals, register, chosen })`** (the same input as `planParts`): per resource, chosen
  parts present and missing, in count and bytes, and whether every part the lists name for it is present (`whole`).

### 2. The register and replacing a slot

- One row per slot in the resources store: `parts-slot:{slotId}` → `{ sha256, keys, list, at }`; `keys` are all the
  part's row keys (chapter chunks included); `list` is the language or `originals`. The slot id includes the group.
- Replacing a slot, in one transaction: delete the old register's keys the new part no longer has; put every row of
  the new part; put the register row. Shared keys are overwritten.
- A slot in the register that this language's list put there (its record's `list` is the list's language) and that
  the new lists no longer name, within the chosen units: its keys and its register row are deleted. Slots outside
  the chosen units are not touched, nor are another language's slots (the register is shared by every language on
  the device). Slots from the originals list (`list` is `originals`) are never removed by a plan, since every
  language shares them; they are only replaced when a list names another sha.
- Every row written gets `timestamp` = apply time and no `expiresAt`: part rows do not expire; the register removes
  them when a part replaces them.
- Rows from before parts (whole packs): the first time a resource's slot is applied by parts, rows of that resource
  the register does not know are also deleted, found by the resource's key prefixes and placed with `slotOfRow` so
  only that slot's rows go, and only within the units being applied.
- Originals are shared by all languages (their slots carry no language): one register entry. A language whose list
  names originals with another sha replaces them, and the result says so (`originalsReplaced`): another language's
  aligned quotes built on the previous originals may miss until that language updates.

### 3. Applying

- `applyParts` starts only when every part of the plan is in staging; otherwise it changes nothing and names what is
  missing.
- **One transaction per unit**: a book (its book, alignments and original parts) or the shared unit. Not one per
  whole update: a builder code change gives every part a new sha, so an update can be a whole language, too big for
  one transaction on a phone. Everything that depends on each other is in one unit (a book's alignments are made on
  that book's text and original), so a reader never sees new notes with old alignments of the same book; two
  different books may differ for a moment, which breaks nothing. The first download follows the same rule. The
  originals list's parts are applied in the units they belong to (an `original` part in its book's unit, MACULA in
  the shared unit, as `unitOfPart` says). Order: book units in canonical order, then the shared unit.
- Inside a unit's transaction: read the register rows and the keys to delete (§5), write and delete rows, write the
  register. Parts are gunzipped one at a time to build the transaction; peak memory is the largest unit (a few MB per
  book for English).
- **The catalog, after each unit**: the catalog rows of that unit's resources, from the list, through
  `restoreCatalogBookkeeping`. Between the unit's transaction and its catalog rows an aligned quote may miss for a
  moment (the book stamp is still the old one); it is never wrong. `availability.offline = true` when every part
  of that resource within the chosen units is present.
- After each unit commits, its parts are deleted from staging (a failed delete is harmless).
- **Result**: units applied, units failed (with the reason), resources completed, `originalsReplaced`, bytes applied.

### 4. Receipts and completeness

- When every part a list names for a resource is in the register (the whole resource), the importer writes its
  receipt `resource:{key}` in a small transaction after the last unit that completes it, in today's shape:
  `downloadComplete: true` and its date, `releaseStamp` (the catalog row's release stamp), `ingestSchema`
  (`usj:{version}` for scripture, `helps:1` otherwise, with the existing helpers), and `downloadMethod: 'parts'`.
  Existing readers (`isResourceMarkedComplete`, the completeness checker, loaders, Servos) keep working.
- On a new release the receipt is written again with the new stamp when the resource is complete again; until then it
  reads as the previous release.
- If a resource stops being complete (a slot that the list no longer names was removed), its receipt is deleted.
- A resource chosen in part (some books) gets no receipt: "complete" would mislead bt-synergy's readers. Apps use
  `partsCoverage` for "41 MB left" and for what Servos calls interrupted.

### 5. Staging, the atomic method, errors

- **Staging**: bytes per sha with size and date; `put` checks the sha256. Cleaning parts that wait too long is the
  app's (`list()`).
- **The atomic method** on the target: given keys and key prefixes to read, a function of what was found returns the
  puts and deletes, and all of it runs in one IndexedDB readwrite transaction (the register and the keys to delete
  are read inside it). Two windows applying at once then serialize per unit and leave a consistent register; no lock
  is needed. On any error nothing of that transaction is written.
- **Errors**:
  - the list's versions differ from the app's (any layer): nothing is applied, the result says so (the app shows
    "update the app");
  - a unit cannot be applied (an unreadable part, a row outside its slot, a full disk — `quota` reported apart): that
    unit is not written, its parts stay in staging, the other units go on;
  - the app closes midway: what was applied is in the register; planning again yields only the missing units.

### 6. Tests (`bun test`)

- The adapter's atomic method with a test IndexedDB: a failure leaves no put and no delete.
- With an in-memory target: first download; a replaced slot leaving old keys out; a slot the list no longer names;
  cleanup of whole-pack rows; shared and replaced originals; a failing unit that leaves the others; receipts when
  complete and when no longer complete; dates (`timestamp`, no `expiresAt`); `planParts` and `partsCoverage`.
- With real data, a test that runs only when given the files: staging has es-419 as parts and the whole q9-a12 pack of
  the same release (tc-study run 40502309021). Import the whole pack into one store and apply the parts into another:
  the same rows, except receipts and date fields.

## Out of B

- Downloading (four at a time, originals first, Range resume, 404 → refetch the list), when to download, what the
  person chose, interface: C.
- Showing `droppedRows`-like information to people: C.
- tc-study adopting the importer: later.
