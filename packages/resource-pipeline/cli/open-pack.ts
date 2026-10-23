/**
 * Open one or more language packs, in order, into empty tc-study stores and check that every row each manifest lists
 * arrived.
 *
 *   bun packages/resource-pipeline/cli/open-pack.ts originals.langpack.zip es-419.langpack.zip
 *   bun packages/resource-pipeline/cli/open-pack.ts es-419-base.langpack.zip es-419-tit.langpack.zip
 *
 * Uses tc-study's IndexedDB adapters on fake-indexeddb, as a device with nothing would. Exits with 1 when a resource
 * was skipped, a layer came back with fewer rows than its pack says, or quote rows were left out because they were
 * built against another original's book than the one opened.
 */

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import {
  importLanguagePack,
  packSourceFrom,
  packTargetFrom,
  readPackManifest,
  rowsOfResource,
  type PackLayer,
} from '@bt-synergy/language-pack'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { HELPS_TEXT_VERSION } from '../src/helps/helpsCacheKeys'
import { HELPS_ALIGN_VERSION } from '../src/helps/helpsAlignCache'
import { HELPS_QUOTE_VERSION } from '../src/helps/helpsQuoteCache'

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error('Uso: open-pack <paquete.langpack.zip> [otro.langpack.zip …]')
  process.exit(2)
}

const versions = {
  sot: { usjProcessing: USJ_PROCESSING_VERSION },
  quote: { helpsQuote: HELPS_QUOTE_VERSION },
  align: { helpsAlign: HELPS_ALIGN_VERSION },
  text: { helpsText: HELPS_TEXT_VERSION },
}
const cache = new IndexedDBCacheAdapter({ dbName: 'tc-study-cache', storeName: 'cache-entries', version: 1 })
const catalog = new IndexedDBCatalogAdapter({ dbName: 'tc-study-catalog', storeName: 'catalog-entries', version: 1 })
const target = packTargetFrom({ cache: cache as never, catalog: catalog as never })
const source = packSourceFrom({ cache: cache as never, catalog: catalog as never })

let problems = 0
for (const path of paths) {
  const bytes = new Uint8Array(readFileSync(path))
  const manifest = await readPackManifest(bytes)
  const started = Date.now()
  const result = await importLanguagePack({ bytes, target, versions })
  const kind = manifest.kind ?? 'language'
  const books = manifest.books?.length ? ` (${manifest.books.join(', ')})` : ''
  console.log(
    `${basename(path)}: ${kind}${books}, ${result.written} filas en ${((Date.now() - started) / 1000).toFixed(1)} s` +
      (result.keptExisting ? `, ${result.keptExisting} ya estaban` : '')
  )
  for (const original of result.originals) {
    console.log(`  necesita ${original.key}@${original.stamp}: ${original.status}`)
  }
  // Another release of an original only costs the rows of the books whose file changed: those are the problem.
  for (const [key, layers] of Object.entries(result.droppedRows)) {
    problems += 1
    const counts = Object.entries(layers).map(([layer, n]) => `${layer} ${n}`)
    console.log(`  FILAS DEJADAS ${key}: ${counts.join(', ')} (hechas con otro original)`)
  }
  for (const skipped of result.skippedResources) {
    problems += 1
    console.log(`  SALTADO ${skipped.key}: ${skipped.why}`)
  }
  if (result.skippedLayers.length) console.log(`  capas dejadas fuera: ${result.skippedLayers.join(', ')}`)

  // Read every resource back the way a pack is made and compare with what the manifest says it carries.
  for (const res of manifest.resources) {
    const layers = Object.keys(res.rows) as PackLayer[]
    const got = await rowsOfResource(source, res.key, layers)
    const dropped = result.droppedRows[res.key] ?? {}
    const missing = layers.filter(
      (layer) =>
        !result.skippedLayers.includes(layer) &&
        (got.get(layer)?.length ?? 0) < (res.rows[layer] ?? 0) - (dropped[layer] ?? 0)
    )
    const inCatalog = Boolean(await source.catalogRow(res.key))
    if (missing.length || !inCatalog) {
      problems += 1
      console.log(
        `  FALTA ${res.key}: ${inCatalog ? '' : 'sin fila de catálogo; '}` +
          missing.map((l) => `${l} ${got.get(l)?.length ?? 0}/${res.rows[l]}`).join(', ')
      )
    }
  }
}
console.log(problems === 0 ? 'Todo llegó.' : `${problems} problemas.`)
process.exit(problems === 0 ? 0 : 1)
