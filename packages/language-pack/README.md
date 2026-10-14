# @bt-synergy/language-pack

One zip with what a language needs to be read offline on another device, as specified in
`apps/tc-study/docs/cache-data-structure.md` §6: catalog rows, receipts, the source of truth and, optionally, the
artifacts built from it (prepared views, `helps-quote:`, `helps-align:` per target, `helps-text:` titles). A pack
travels by file (SD card, USB, Bluetooth) and opens with no network.

It is the format of the translation-resource packages of Servos (github.com/idiomaspuentes/servos), and tc-study can
use it for its own exports.

## Layout

```
manifest.json                       format, version, language, layers, and per resource: key, role, stamp, row counts
catalog.json                        [{ key, metadata }] for every packed resource
rows/{layer}/{resource}.jsonl       one {"key", "entry"} per line, raw as the cache store keeps it
```

Layers: `receipt`, `sot` (always included), `prepared`, `quote`, `align`, `text`. Rows are raw store rows, chapter
chunks included, so opening a pack needs no parsing and no rebuild. Every derived key keeps its stamp: an app that no
longer accepts a stamp or a version treats the row as a miss and rebuilds it from the source of truth.

Original-language scriptures (UGNT, UHB) are added by default when the store has them: quotes cannot be built
without them.

## Use

```ts
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { buildLanguagePack, importLanguagePack, packSourceFrom, packTargetFrom, readPackManifest } from '@bt-synergy/language-pack'

const stores = { cache: new IndexedDBCacheAdapter({ dbName: 'tc-study-cache' }), catalog: new IndexedDBCatalogAdapter({ /* … */ }) }

const versions = { sot: { usjProcessing: USJ_PROCESSING_VERSION }, quote: { helpsQuote: HELPS_QUOTE_VERSION }, align: { helpsAlign: HELPS_ALIGN_VERSION } }
const { bytes, manifest, skipped } = await buildLanguagePack({ source: packSourceFrom(stores), language: 'es-419', versions, createdBy: 'Ana' })
// save `bytes` as es-419.langpack.zip

const about = await readPackManifest(bytes) // show what it brings before importing
const result = await importLanguagePack({ bytes, target: packTargetFrom(stores), versions })
```

Each resource comes whole or not at all. When the device has the same release, the pack fills the gaps; when it has another release, the resource is left as it is unless `overwrite: true`, and then it is replaced whole. Receipts are written last for
each resource, so a pack cut short never marks an incomplete resource as complete.

## What a pack is not yet enough for

- **tc-study's Read page still needs the network to open a language**: it clears its panels and then searches the
  Door43 catalog; offline, nothing fills them from the local catalog. A pack gives the device every row; the app has
  to learn to start from them.
- **A pack only carries what the store has, complete.** The Read page downloads in the background only the two panel
  languages, one original (the current book's testament), OBS helps after an OBS visit, and builds prepared views,
  quotes and aligned quotes mostly for the books visited. Resources opened only chapter by chapter have no receipt.
  To make a full pack, the app first has to download and build everything for the language.
- OBS images are remote URLs and are not in the pack; neither is the app shell (tc-study has no service worker).

Pass the app's processing versions (`versions`) when making and opening a pack: an app with another source version
refuses it (it would throw the rows away), and one with other derived versions skips those layers and rebuilds them.

## Tests

`bun test` (`src/pack.test.ts`).
