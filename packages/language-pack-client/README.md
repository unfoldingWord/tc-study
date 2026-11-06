# @bt-synergy/language-pack-client

Common client library of language packs format 3. It installs, updates and queries packs on top of `@bt-synergy/language-pack-v3`. The main entry (`src/index.ts`) imports no Node module (a test, `src/entry.test.ts`, follows its import graph and fails if one appears), so it runs in browsers, WebViews, Cloudflare Workers and Bun. Node-only code is in `src/node/`.

## What it does

- Fetches the language catalog and the common catalog from a server, checks their signatures, and installs the units a person asks for (books, articles, maps), checking every segment by its id.
- Keeps an installed state in a store you choose, activates a unit only when it and what it needs are complete, and tells you what has an update.
- Moves packs without a network: exports and imports transfer files (`.tcpack`), and converts format 1.1 `.langpack.zip` files into a local catalog.
- Opens a reader over what is installed and answers eight queries in one envelope.

## The three layers

1. **Source and store.** `PackSource` (`httpSource`) gets bytes from a server; `BlobStore` (`memoryStore`, `indexedDbStore`, `fsStore`) keeps segments by id and one installed-state record.
2. **Install.** `createClient` verifies catalogs (`verifyCatalogFile`, `TrustPolicy`), plans (`planInstall`, `updates`, `activate`) and runs `refresh`, `install`, `importTransfer`, `exportTransfer`, `importOldPack`, `status`, `prune`, `verify`.
3. **Read.** `client.open(lang)` gives a `PackReader`: `book`, `orig`, `articles`, `maps` and the eight queries. `openFromSegments` builds the same reader from catalogs and a `get(id)` function, with no store (used for fixtures, tests and tools).

## createClient

```ts
import { createClient, httpSource, memoryStore, indexedDbStore } from '@bt-synergy/language-pack-client'
import { fsStore } from '@bt-synergy/language-pack-client/node/fsStore'

const source = httpSource({ base: 'https://packs.example.org' })
const trust = { trustedKeys: { [keyId]: publicKeyBytes } }

// Tests, short-lived processes, Workers: nothing survives.
const client = createClient({ store: memoryStore(), source, trust })

// Browsers and WebViews: IndexedDB (database name defaults to "tc-language-packs").
const web = createClient({ store: await indexedDbStore({ name: 'my-app-packs' }), source, trust })

// Node and Bun (the subpath is the only place `node:fs` is imported): one file per segment in a folder.
const disk = createClient({ store: fsStore('/var/lib/my-app/packs'), source, trust })

await client.refresh('es-419')                     // catalogs, updates
await client.install('es-419', { books: ['tit'] }) // units, with the common ones they need
const reader = await client.open('es-419')
const answer = await reader.passage('tit 1:1')
```

`source` is optional: a client without one works offline (`importTransfer`, `importOldPack`, `open`) and `refresh` or `install` throw `E_ARG`. A `BlobStore` is a small interface (`has`, `get`, `put`, `delete`, `ids`, `getState`, `setState`); `setState` must be atomic. An optional `index` (a `SearchIndex`) is kept up to date by installs and imports.

## Trust policy

`trust` is `{ trustedKeys?: Record<keyId, Uint8Array> }` (Ed25519 public keys, 32 raw bytes).

- With `trustedKeys` given, even an empty map: a published catalog must carry a signature by a listed key, or it is `E_SIGNATURE` and nothing is installed; a local catalog is refused when it comes from a server or a transfer file (it is only valid when made on the device, by `importOldPack`).
- Without `trustedKeys`: signatures are not checked. Use this for tests only.
- A lower `about.revision` of the same publisher and catalog is `E_DOWNGRADE` unless the call passes `confirmDowngrade: true`. A catalog of the same name from another publisher is treated the same way, whatever its revision (the installed state is kept by catalog name); a published catalog over a local one (an old pack) replaces it unit by unit, where it has a replacement: a bridged unit by the same unit of the published catalog, and the bridged `<lang>/orig:<book>` by the common catalog's `orig:<book>` once that is installed and nothing installed needs the bridged one; `prune` then removes what was replaced, and the local catalog once none of its units is left. A bridged book the published catalog lacks stays, with its orig. A bridged unit the published catalog of its name does not list never serves a need of a published unit. A common catalog that a language names in `requires` and that is older than the installed one is stored and used for that language's units by id, without replacing the installed one.
- Every segment is checked against the id the catalog gives it (the sha256 of its body) before it is stored or read; a stored segment that fails later is treated as not installed and listed in `reader.problems`.

The signature check uses WebCrypto Ed25519 when the runtime has it and falls back to `@noble/curves`.

## The routes it uses (`spec/serving.md`)

| Route | What |
|---|---|
| `GET /v3/packs/{lang}/catalog` | the language catalog; sent with `If-None-Match` when one is installed, a 304 means nothing changed |
| `GET /v3/packs/common/catalog` | the common catalog, fetched when the id in the language catalog's `requires` differs from the installed one |
| `GET /v3/packs/seg/{id}` | a segment by its id (64 lowercase hex); the same id is the same bytes for every language |

The order is: language catalog, then the common catalog it requires, then the segments of the chosen units. A unit is activated only when it and its `needs` are complete. `HEAD` and `OPTIONS` exist on the server; the client only uses `GET`.

`install` fetches up to `concurrency` segments at once (default 4): `client.install('es-419', { books: ['tit'] }, { concurrency: 4 })`. `1` asks one segment after the other, in plan order. Each segment is fetched once even when several units share it, a unit is activated (and the state saved) as soon as it and its `needs` are complete, and `onProgress` fires once per stored segment. Calls on one client still run one after the other.

A segment the server does not have (404) or whose bytes are not the segment leaves its unit waiting, and the install goes on. Any other failed request (429, 5xx, a dropped connection) stops the install: no new request starts, the requests already running settle and what they verify is stored, the units complete by then are activated and the state is saved once, then `install` rejects with the first such error, `E_NETWORK` (`status`, and `retryAfter` in seconds for a 429). Installed content is kept; call `install` again later, after `retryAfter` when there is one. An abort (`signal`) stops new requests the same way and keeps the units already complete, then `install` rejects with `signal.reason`, even when the abort comes during the last segment's store or save; only a network failure seen before the abort, or a store failure, is thrown instead.

On staging, es-419 Titus took about 50–75 s one segment at a time and about 12–15 s with the default of 4.

**Mixed revisions.** A unit keeps the revision it was activated from until its own segments change. A shared dependency can move on under it: when another language updates the common `orig:<book>`, a book of this language built against the older original stays as it is. The reader then does not use that book's alignment positions (they point into another original): `renderings` leaves the book out and says so in `notInstalled` (`what: 'stale'`). The other way is refused: an older catalog (a language built against an older common catalog) does not move back a unit installed from a later revision.

## The eight queries and the envelope

All are methods of `PackReader`; each returns an `Answer<T>`:

```ts
type Answer<T> = {
  query: 'passage' | 'concept' | 'article' | 'renderings' | 'search' | 'topics' | 'books' | 'context'
  data: T | null                                   // null when the unit that answers is not installed
  cites: { res; release; id?; ref?; section? }[]   // where each datum comes from
  revision: { lang?; common?; units: Record<unit, number> } // a book of revision 1 under a map of revision 2 says both
  coverage?: Record<resource, 'count' | 'zero' | 'none' | 'partial'>
  notInstalled: { book?; unit; bytes; what? }[]    // what would have been needed, with its size
}
```

| Query | Asks | Data |
|---|---|---|
| `passage(ref)` | `'tit 1:1'`, `'tit 1:1-3'` | texts, notes, questions and links in range; coverage of the language's resources for the book |
| `article(id, section?)` | `'tw:kt/faith'` | sections (the definition by default, or one by id, or `'all'`), `more` (the rest), `otherLang` for a section kept in another language |
| `context(ref)` | a passage | the passage plus, for each concept its notes and links name, the article (when installed) and the books that use it |
| `concept(id)` | `'tw:kt/grace'`, `'per:abraham'` | the concept, names, relations; books where it is used that are not installed go to `notInstalled` |
| `topics({ category?, book? })` | people, places, events, stories, sections | the topics of the `xtopics` module (`installed: false` when it is not on the device) |
| `books({ article } or { concept })` | which books use it | one cell per book: `state`, `count`, `verses`, `installed`, `bytes` |
| `renderings({ strong } or { book, word })` | a Strong's number or a word | how the language renders it, with counts and references |
| `search(text, filters?)` | full text | hits over the installed books, from the client's index or one built in memory |

`none` means the source does not cover the book; it is not zero. The JSON Schema of each `data` is `schemas` (exported from the package, `src/query/schemas.json`). For a `ta:` article, `books` and `context` read the usage table of the language's `map`, judged by the language's own `tn` source (the coverage key whose last segment is `tn`, not `unfoldingWord/en/tn`); a language whose map has none gets `none` in every cell. A `tw:` article reads the English word links (`unfoldingWord/en/twl`) of the `xmap`. The answer names the `map` or `xmap` unit in `revision.units`. When the map a query needs is not on the device or its bytes are bad (`xmap` for `tw:` and Strong's numbers, `map` for `ta:`, `xtopics` for topics), the data says `installed: false` and the unit is in `notInstalled`: nobody looked, which is not `none`. `renderings` resolves the Strong's number by the lookup rule of the `strong` table (`G5485` is `G54850` when the table has that one) and `data.strong` is the resolved key. A passage's `coverage` is `zero` for a source that covers the whole book but has no row in the range. `search` returns hits of the books active in this reader only.

Errors are `ClientError` with a `code` (`CLIENT_ERROR_CODES`): the list is `CLIENT_ERROR_CODES` (`E_DOWNGRADE`, `E_COMMON`, `E_NO_BASE`, `E_NO_PACK`, `E_NETWORK`, `E_STORE`, ...); a signature or format failure is a `FormatError` of `language-pack-v3` with its own code (`E_SIGNATURE`, `E_BODY`, ...).

## Tests

`bun test` (needs the sibling `packages/language-pack-v3` for the spec fixtures). `src/situations.test.ts` runs the five failure situations of the plan end to end: few resources, a book with no sources, an old pack with no network, mixed revisions, a mistitled article.

`src/staging.e2e.test.ts` runs against the staging Worker (read-only GETs) and is opt-in: it is skipped unless `LP3_STAGING=1`, and no CI workflow sets that flag.

## Timings (desktop)

`LP3_SAMPLE=<phase 0 sample folder> bun bench/timings.ts` builds English Psalms from the sample once, then reports the median of 20 runs, each on a fresh reader over the stored bytes (the second and third rows have the book read already, as a screen would).

Measured on the author's Windows 11 desktop, Bun 1.3.3 (the build of English Psalms itself took about 69 s and is not a client cost). What the numbers include: the segments are already in memory (store I/O is not measured: no IndexedDB or disk read), the catalogs are verified once before the runs (no signature check per run), and the JIT is warm (the 20 runs follow one untimed read). On a phone, reading the segments from the store comes on top.

| Operation | Target (2 GB phone, C3) | Desktop median |
|---|---|---|
| stored bytes -> `book('psa')` readable | < 3 s | 180 ms (min 141, max 205) |
| `passage('psa 23:1')` with its notes | < 50 ms | 5.4 ms (min 2.9, max 13) |
| `context('psa 23:1')` | < 50 ms | 6.0 ms (min 3.7, max 10) |

The phone has not been measured yet: that is C3.

## Left to the apps

- **SQL drivers.** `sqlIndex(driver)` takes a `SqlDriver`; the library ships none (SQLite in a WebView, `bun:sqlite`, D1 are the app's to wire). Without one, `memoryIndex` is used and filled on the first search.
- **OPFS.** Only memory, IndexedDB and the Node folder store exist; an OPFS store for big installs is an app (or a later task), through `BlobStore`.
- **Phone timings.** Only desktop numbers are here; the targets above are checked on the 2 GB phone in C3.
- **Stems.** `search` matches words as they are; stemming per language is for the app (or a later task).
- **Key distribution.** The app decides which public keys it trusts and how it gets them.
