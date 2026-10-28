/**
 * The word index of every book of the real originals. Run only when `PACKS_DIR=<folder>` names a folder with
 * `originals.langpack.zip` (UGNT v0.34 and UHB v3.0.0, built 2026-10-27): the counts below were measured on 2026-10-28
 * with a script doing the same walk. Prints the verse entries, the gzip-9 size of each book's rows as JSONL, and the
 * time to build them.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { decodeWords, importLanguagePack, packTargetFrom } from '@bt-synergy/language-pack'
import { bookContentStamp, type BookStampSource } from '@bt-synergy/resource-catalog'
import { isUsjScriptureChapterKey, unwrapUsjEntry, usjScriptureKey } from '@bt-synergy/scripture-loader'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { BOOK_CHAPTER_COUNTS } from '../nav/bookChapterCounts'
import { buildBookIndex, type BookIndexStrong, type BookIndexVerses } from './bookIndex'

const PACKS_DIR = process.env.PACKS_DIR
if (!PACKS_DIR) console.log('bookIndex.real.test.ts: skipped (set PACKS_DIR=<folder> with originals.langpack.zip)')

const ORIGINALS = ['unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb']

type BookRows = { original: string; book: string; rows: ReturnType<typeof buildBookIndex> }

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

describe.skipIf(!PACKS_DIR)('buildBookIndex on the real originals', () => {
  test(
    'numbers every word of both originals and lists them by Strong code',
    async () => {
      const cache = new IndexedDBCacheAdapter({ dbName: 'book-index-real-cache', storeName: 'cache-entries', version: 1 })
      const catalog = new IndexedDBCatalogAdapter({ dbName: 'book-index-real-catalog', storeName: 'catalog-entries', version: 1 })
      let started = Date.now()
      const imported = await importLanguagePack({
        bytes: new Uint8Array(readFileSync(join(PACKS_DIR!, 'originals.langpack.zip'))),
        target: packTargetFrom({ cache: cache as never, catalog: catalog as never }),
        versions: { sot: { usjProcessing: USJ_PROCESSING_VERSION } },
        layers: ['sot'],
      })
      console.log(`originals.langpack.zip: ${imported.written} rows opened in ${((Date.now() - started) / 1000).toFixed(1)} s`)

      // Read every chapter row of every book first, so the time below is the build's alone.
      started = Date.now()
      const inputs: Array<{ original: string; book: string; stamp: string; chapters: Array<{ chapter: number; usj: unknown }> }> = []
      for (const original of ORIGINALS) {
        const meta = (await catalog.get(original)) as BookStampSource | null
        expect(meta).not.toBeNull()
        for (const book of Object.keys(BOOK_CHAPTER_COUNTS)) {
          const prefix = `${usjScriptureKey(original, book)}:`
          const chapters = (await cache.getByPrefix(prefix))
            .filter((row) => isUsjScriptureChapterKey(row.key))
            .map((row) => ({
              chapter: Number(row.key.slice(prefix.length)),
              usj: (unwrapUsjEntry(row.entry) as { usj?: unknown } | null)?.usj,
            }))
          if (chapters.length) inputs.push({ original, book, stamp: bookContentStamp(meta, book), chapters })
        }
      }
      console.log(`${inputs.length} books read in ${((Date.now() - started) / 1000).toFixed(1)} s`)
      expect(inputs.length).toBe(66)

      started = Date.now()
      const books: BookRows[] = inputs.map(({ original, book, stamp, chapters }) => ({
        original,
        book,
        rows: buildBookIndex(original, book, chapters, stamp),
      }))
      const buildMs = Date.now() - started

      const verses = (b: BookRows) => b.rows[0]!.value as BookIndexVerses
      const strongRows = books.flatMap((b) => b.rows.slice(1).map((r) => ({ book: b.book, key: r.key, value: r.value as BookIndexStrong })))
      const ofCode = (original: string, code: string) => strongRows.filter((r) => r.key.startsWith(`index:strong:${original}:${code}:`))
      const wordsIn = (rows: ReturnType<typeof ofCode>) => rows.reduce((n, r) => n + decodeWords(r.value.words).length, 0)

      expect(books.reduce((n, b) => n + verses(b).words, 0)).toBe(444_472)
      expect(strongRows.length).toBe(59_279)

      const grace = ofCode(ORIGINALS[0]!, 'G5485')
      expect(grace.length).toBe(23)
      expect(wordsIn(grace)).toBe(156)
      const titus = books.find((b) => b.book === 'tit')!
      const starts = decodeWords(verses(titus).starts)
      const refs = verses(titus).verses.split(' ')
      const refOf = (word: number) => {
        let i = 0
        while (i + 1 < starts.length && starts[i + 1]! <= word) i++
        return refs[i]
      }
      const graceInTitus = decodeWords(grace.find((r) => r.book === 'tit')!.value.words)
      expect([...new Set(graceInTitus.map(refOf))]).toEqual(['1:4', '2:11', '3:7', '3:15'])

      const favor = ofCode(ORIGINALS[1]!, 'H2580')
      expect(wordsIn(favor)).toBe(69)
      expect(new Set(favor.map((r) => r.book)).size).toBe(16)

      expect(wordsIn(ofCode(ORIGINALS[0]!, 'G3588'))).toBe(19_808)

      const entries = books.flatMap((b) => verses(b).verses.split(' ').filter(Boolean))
      console.log(`verse entries: ${entries.length}; of them {c}:0: ${entries.filter((ref) => ref.endsWith(':0')).length}`)
      console.log(`Titus: ${verses(titus).words} words`)

      const sizes = books
        .map((b) => ({
          book: b.book,
          bytes: gzipSync(b.rows.map((r) => `${JSON.stringify({ key: r.key, value: r.value })}\n`).join(''), { level: 9 }).length,
        }))
        .sort((a, b) => a.bytes - b.bytes)
      const total = sizes.reduce((n, s) => n + s.bytes, 0)
      const median = (sizes[(sizes.length - 1) >> 1]!.bytes + sizes[sizes.length >> 1]!.bytes) / 2
      const largest = sizes[sizes.length - 1]!
      const smallest = sizes[0]!
      console.log(
        `rows as JSONL, gzip -9: ${total} bytes (${kb(total)}) in all; median ${kb(median)}; ` +
          `largest ${largest.book} ${kb(largest.bytes)}; smallest ${smallest.book} ${kb(smallest.bytes)}`
      )
      console.log(`built 66 books in ${buildMs} ms`)
    },
    600_000
  )
})
