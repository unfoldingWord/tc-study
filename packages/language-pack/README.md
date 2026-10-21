# @bt-synergy/language-pack

One zip with what a language needs to be read offline on another device, as specified in
`apps/tc-study/docs/cache-data-structure.md` §6: catalog rows, receipts, the source of truth and, optionally, the
artifacts built from it (prepared views, `helps-quote:`, `helps-align:` per target, `helps-text:` titles). A pack
travels by file (SD card, USB, Bluetooth) and opens with no network.

It is the format of the translation-resource packages of Servos (github.com/idiomaspuentes/servos), and tc-study can
use it for its own exports. `@bt-synergy/resource-pipeline` makes the store a pack is built from
(`cli/prepare-language.ts`).

## Kinds of pack

| Kind | What it holds |
|---|---|
| `language` | Every resource of the language, whole, with its receipts. No originals. |
| `originals` | UGNT and/or UHB, whole. The same for every language. |
| `base` | Catalog rows of all the language's resources; TA, TW, OBS and their helps whole. Book-scoped resources (scripture, notes, questions, word links) bring only their catalog row and the books that exist. |
| `book` | One or more books of the book-scoped resources, with no receipts: a receipt says the whole release is complete. |

A language, base or book pack names in `requires` the original releases its quotes and aligned quotes were built
against (the keys say it). On opening, if the device has another release of that original, those two layers are left
out (they would never be read) and rebuilt there; if it has none yet, they come anyway and match once the originals pack
is opened. `ImportPackResult.originals` says which case it was.

A 1.0 pack has no kind: it is a `language` pack that may carry the originals inside.

## Layout

```
manifest.json                       format, kind, language, books, requires, layers, versions, and per resource:
                                    key, role, stamp, row counts, books
catalog.json                        [{ key, metadata }] for every packed resource
rows/{layer}/{resource}.jsonl       one {"key", "entry"} per line, raw as the cache store keeps it
```

Layers: `receipt`, `sot` (always included), `prepared`, `quote`, `align`, `text`. Rows are raw store rows, chapter
chunks included, so opening a pack needs no parsing and no rebuild. Every derived key keeps its stamp: an app that no
longer accepts a stamp or a version treats the row as a miss and rebuilds it from the source of truth. Zips are made at
DEFLATE level 9 unless `compressionLevel` says otherwise.

## Use

```ts
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { buildLanguagePack, importLanguagePack, packSourceFrom, packTargetFrom, readPackManifest } from '@bt-synergy/language-pack'

const stores = { cache: new IndexedDBCacheAdapter({ dbName: 'tc-study-cache' }), catalog: new IndexedDBCatalogAdapter({ /* … */ }) }
const versions = { sot: { usjProcessing: USJ_PROCESSING_VERSION }, quote: { helpsQuote: HELPS_QUOTE_VERSION }, align: { helpsAlign: HELPS_ALIGN_VERSION } }
const source = packSourceFrom(stores)

const language = await buildLanguagePack({ source, language: 'es-419', versions })                    // es-419.langpack.zip
const originals = await buildLanguagePack({ source, language: 'es-419', kind: 'originals', versions }) // originals.langpack.zip
const base = await buildLanguagePack({ source, language: 'es-419', kind: 'base', versions })
const titus = await buildLanguagePack({ source, language: 'es-419', kind: 'book', books: ['tit'], versions })

const about = await readPackManifest(bytes) // show what it brings before importing
const result = await importLanguagePack({ bytes, target: packTargetFrom(stores), versions })
```

Each resource comes whole or not at all. When the device has the same release, the pack fills the gaps; when it has
another release, the resource is left as it is unless `overwrite: true`, and then it is replaced whole. Receipts are
written last for each resource, so a pack cut short never marks an incomplete resource as complete.

## What a pack is not yet enough for

- **tc-study's Read page still needs the network to open a language**: it clears its panels and then searches the
  Door43 catalog; offline, nothing fills them from the local catalog. A pack gives the device every row; the app has
  to learn to start from them.
- **A book pack has no receipts**, so tc-study's download monitor would try to download those resources. An app that
  opens book packs keeps track of which books it has (the manifest lists them).
- **A pack only carries what the store has, complete.** `@bt-synergy/resource-pipeline` (`prepareLanguage`) makes such
  a store; the Read page alone builds mostly what was visited.
- OBS images are remote URLs and are not in the pack; neither is the app shell (tc-study has no service worker).

Pass the app's processing versions (`versions`) when making and opening a pack: an app with another source version
refuses it (it would throw the rows away), and one with other derived versions skips those layers and rebuilds them.

## Tests

`bun test` (`src/pack.test.ts`, `src/pack.kinds.test.ts`).
