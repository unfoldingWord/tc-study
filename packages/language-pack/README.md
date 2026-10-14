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

const { bytes, manifest, skipped } = await buildLanguagePack({ source: packSourceFrom(stores), language: 'es-419', createdBy: 'Ana' })
// save `bytes` as es-419.langpack.zip

const about = await readPackManifest(bytes) // show what it brings before importing
const result = await importLanguagePack({ bytes, target: packTargetFrom(stores) })
```

Importing does not overwrite rows the device already has unless `overwrite: true`. Receipts are written last for
each resource, so a pack cut short never marks an incomplete resource as complete.

## Tests

`bun test` (`src/pack.test.ts`).
