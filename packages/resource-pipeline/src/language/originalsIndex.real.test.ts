/**
 * The word index in a rebuilt `originals` pack, on real data. Run only when `PACKS_DIR=<folder>` names a folder with
 * `originals.langpack.zip` (UGNT v0.34, UHB v3.0.0 and MACULA, built 2026-10-27). The pack is opened into a store with
 * every layer, `addOriginalsIndex` writes the index of both originals, and a new `originals` pack of the same resources
 * is made from that store, then opened by an app that reads the index and by one that does not. Prints the new pack's
 * size against the old one's (and against a pack made from the same store without the index), and the time
 * `addOriginalsIndex` takes. The new pack is left in `{tmpdir}/originals-index-real/`, overwritten on each run.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import {
  ALL_LAYERS,
  buildLanguagePack,
  decodeWords,
  importLanguagePack,
  indexStrongKey,
  ORIGINAL_LANGUAGE_KEYS,
  packSourceFrom,
  packTargetFrom,
  type BuildPackParams,
} from '@bt-synergy/language-pack'
import type { BookIndexStrong } from './bookIndex'
import { closeAndDelete } from './fakeDatabases'
import { addOriginalsIndex } from './originalsIndex'
import { PACK_VERSIONS } from './packVersions'

const PACKS_DIR = process.env.PACKS_DIR
if (!PACKS_DIR) console.log('originalsIndex.real.test.ts: skipped (set PACKS_DIR=<folder> with originals.langpack.zip)')

const UGNT = 'unfoldingWord/el-x-koine/ugnt'
/** bookIndex.real.test.ts: the Strong rows of both originals, and one verses row for each of the 66 books. */
const INDEX_ROWS = 59_279 + 66

const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`
const signed = (n: number, text: string) => `${n >= 0 ? '+' : '−'}${text}`

let opened = 0
/** A fake-indexeddb store of its own, dropped when done so the next one does not add to its memory. */
function freshStore() {
  const id = opened++
  const names = { cache: `originals-index-real-cache-${id}`, catalog: `originals-index-real-catalog-${id}` }
  const cache = new IndexedDBCacheAdapter({ dbName: names.cache, storeName: 'cache-entries', version: 1 })
  const catalog = new IndexedDBCatalogAdapter({ dbName: names.catalog, storeName: 'catalog-entries', version: 1 })
  return {
    cache,
    catalog,
    target: packTargetFrom({ cache: cache as never, catalog: catalog as never }),
    drop: () => closeAndDelete([cache, catalog], [names.cache, names.catalog]),
  }
}

describe.skipIf(!PACKS_DIR)('the word index in the rebuilt originals pack', () => {
  test(
    'carries the index of both originals, opened only by an app that states its version',
    async () => {
      const oldBytes = new Uint8Array(readFileSync(join(PACKS_DIR!, 'originals.langpack.zip')))
      const store = freshStore()
      let started = Date.now()
      const old = await importLanguagePack({ bytes: oldBytes, target: store.target, versions: PACK_VERSIONS })
      console.log(`originals.langpack.zip (Oct 27): ${old.written} rows opened in ${seconds(started)}`)
      expect(old.skippedLayers).toEqual([])
      expect(old.skippedResources).toEqual([])
      const keys = old.manifest.resources.map((r) => r.key)
      expect(keys).toEqual(expect.arrayContaining([...ORIGINAL_LANGUAGE_KEYS, 'Biblica/hbo/macula', 'Biblica/el-x-koine/macula']))

      started = Date.now()
      const indexed = await addOriginalsIndex({ cache: store.cache, catalog: store.catalog }, ORIGINAL_LANGUAGE_KEYS)
      const indexTime = seconds(started)
      for (const i of indexed) console.log(`${i.key}: ${i.books} books, ${i.rows} index rows`)
      expect(indexed.map((i) => i.books)).toEqual([27, 39])
      expect(indexed.reduce((n, i) => n + i.rows, 0)).toBe(INDEX_ROWS)

      // As prepareAndPack makes it: the same resources, the default layers, this app's versions.
      const params: BuildPackParams = {
        source: packSourceFrom({ cache: store.cache as never, catalog: store.catalog as never }),
        language: old.manifest.language,
        kind: 'originals',
        versions: PACK_VERSIONS,
        originalKeys: keys,
        ...(old.manifest.app ? { app: old.manifest.app } : {}),
      }
      started = Date.now()
      const { bytes, manifest, skipped } = await buildLanguagePack(params)
      console.log(`new originals pack made in ${seconds(started)}`)
      const withoutIndex = await buildLanguagePack({ ...params, layers: ALL_LAYERS.filter((layer) => layer !== 'index') })
      await store.drop()
      expect(skipped).toEqual([])
      expect(withoutIndex.skipped).toEqual([])

      const outDir = join(tmpdir(), 'originals-index-real')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'originals.langpack.zip'), bytes)
      console.log(`written to ${join(outDir, 'originals.langpack.zip')}`)

      expect(manifest.layers).toContain('index')
      expect(manifest.versions?.index?.helpsIndex).toBe(1)
      expect(manifest.resources.map((r) => r.key)).toEqual(keys)
      const indexOf = (key: string) => manifest.resources.find((r) => r.key === key)?.rows.index ?? 0
      expect(ORIGINAL_LANGUAGE_KEYS.reduce((n, key) => n + indexOf(key), 0)).toBe(INDEX_ROWS)
      expect(indexOf('Biblica/hbo/macula') + indexOf('Biblica/el-x-koine/macula')).toBe(0)

      // An app that reads the index.
      const reader = freshStore()
      started = Date.now()
      const read = await importLanguagePack({ bytes, target: reader.target, versions: PACK_VERSIONS })
      console.log(`new pack opened with the index: ${read.written} rows in ${seconds(started)}`)
      expect(read.skippedLayers).toEqual([])
      expect(read.byLayer.index).toBe(INDEX_ROWS)
      const graceKey = indexStrongKey(UGNT, 'G5485', 'tit')
      const grace = (await reader.cache.getByPrefix(graceKey)).find((row) => row.key === graceKey)
      expect(grace).toBeDefined()
      expect(decodeWords((grace!.entry as unknown as BookIndexStrong).words)).toHaveLength(4)
      await reader.drop()

      // An app that does not.
      const { index: _index, ...versionsWithoutIndex } = PACK_VERSIONS
      const older = freshStore()
      const notRead = await importLanguagePack({ bytes, target: older.target, versions: versionsWithoutIndex })
      expect(notRead.skippedLayers).toContain('index')
      expect(notRead.byLayer.index).toBeUndefined()
      expect(notRead.written).toBe(read.written - INDEX_ROWS)
      expect(await older.cache.getByPrefix('index:')).toEqual([])
      await older.drop()

      const delta = bytes.length - oldBytes.length
      const repacked = withoutIndex.bytes.length - oldBytes.length
      const index = bytes.length - withoutIndex.bytes.length
      const percent = (n: number) => `${((Math.abs(n) / oldBytes.length) * 100).toFixed(1)} %`
      console.log(
        `new originals pack: ${bytes.length} bytes (${mb(bytes.length)}); Oct 27: ${oldBytes.length} bytes (${mb(oldBytes.length)}); ` +
          `difference ${signed(delta, mb(Math.abs(delta)))} (${signed(delta, percent(delta))}); MB = 1024² bytes`
      )
      console.log(
        `of it, the index: ${signed(index, mb(Math.abs(index)))} (${signed(index, percent(index))}); ` +
          `the same store packed without it: ${withoutIndex.bytes.length} bytes, ${signed(repacked, `${Math.abs(repacked)} bytes`)} against Oct 27`
      )
      console.log(`addOriginalsIndex: ${indexTime} for ${indexed.reduce((n, i) => n + i.books, 0)} books`)
    },
    900_000
  )
})
