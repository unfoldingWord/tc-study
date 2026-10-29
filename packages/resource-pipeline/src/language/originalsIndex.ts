/**
 * The word index of the originals (`buildBookIndex`), written into the cache store before the `originals` pack is made
 * from it, so the pack carries it as its `index` layer. For each original the catalog has: every book with a USJ book
 * row (`scripture-usj:{key}:{book}`), built from its chapter rows and stamped with the book's `bookContentStamp`.
 */

import { scansFor, type RawCacheStore } from '@bt-synergy/language-pack'
import { bookContentStamp, type BookStampSource } from '@bt-synergy/resource-catalog'
import { isUsjScriptureChapterKey, unwrapUsjEntry, USJ_SCRIPTURE_PREFIX } from '@bt-synergy/scripture-loader'
import { buildBookIndex } from './bookIndex'

/**
 * The cache adapter methods it needs (`IndexedDBCacheAdapter` has them all). Without `transactRaw`, the old index rows
 * go with `deleteMany` or `delete`; a store with neither can only be given an index it does not have yet.
 */
type IndexCache = Pick<RawCacheStore, 'getByPrefix' | 'transactRaw'> &
  Required<Pick<RawCacheStore, 'putRawMany'>> & {
    deleteMany?(keys: string[]): Promise<void>
    delete?(key: string): Promise<void>
  }

/**
 * The keys of an original's scripture rows, once the index rows the store holds of it are gone, so a book or a code
 * it no longer has leaves no row behind. With `transactRaw`, keys only and in one go; otherwise by reading the rows.
 */
async function scriptureKeysWithoutIndex(cache: IndexCache, original: string, scripture: string): Promise<string[]> {
  const held = scansFor(original)
    .filter((scan) => scan.layer === 'index')
    .map((scan) => scan.prefix)
  if (cache.transactRaw) {
    let keys: string[] = []
    await cache.transactRaw({ keys: [], prefixes: [scripture, ...held] }, (found) => {
      keys = found.prefixKeys.get(scripture) ?? []
      return { puts: [], deletes: held.flatMap((prefix) => found.prefixKeys.get(prefix) ?? []) }
    })
    return keys
  }
  const keysUnder = async (prefix: string) => (await cache.getByPrefix(prefix)).map((row) => row.key)
  const stale = (await Promise.all(held.map(keysUnder))).flat()
  if (stale.length) {
    if (cache.deleteMany) await cache.deleteMany(stale)
    else if (cache.delete) for (const key of stale) await cache.delete(key)
    else {
      throw new Error(
        `El almacén de la caché ya tiene ${stale.length} filas de índice de ${original} y no puede borrarlas (falta transactRaw, deleteMany o delete).`
      )
    }
  }
  return keysUnder(scripture)
}

export async function addOriginalsIndex(
  stores: { cache: IndexCache; catalog: { get(key: string): Promise<BookStampSource | null> } },
  originalKeys: readonly string[]
): Promise<Array<{ key: string; books: number; rows: number }>> {
  const { cache, catalog } = stores
  const timestamp = Date.now()
  const out: Array<{ key: string; books: number; rows: number }> = []
  for (const key of originalKeys) {
    const meta = await catalog.get(key)
    if (!meta) continue
    const scripture = `${USJ_SCRIPTURE_PREFIX}${key}:`
    // The books are the book rows: no `:` after the book.
    const books = (await scriptureKeysWithoutIndex(cache, key, scripture))
      .map((k) => k.slice(scripture.length))
      .filter((rest) => rest && !rest.includes(':'))

    let built = 0
    let rows = 0
    for (const book of books) {
      const prefix = `${scripture}${book}:`
      const chapters = (await cache.getByPrefix(prefix))
        .filter((row) => isUsjScriptureChapterKey(row.key))
        .map((row) => ({ chapter: Number(row.key.slice(prefix.length)), usj: (unwrapUsjEntry(row.entry) as { usj?: unknown } | null)?.usj }))
      // A book row without its chapters would be indexed as a book of no words.
      if (!chapters.length) continue
      const index = buildBookIndex(key, book, chapters, bookContentStamp(meta, book))
      await cache.putRawMany(index.map((row) => ({ key: row.key, entry: { ...row.value, timestamp } })))
      built += 1
      rows += index.length
    }
    out.push({ key, books: built, rows })
  }
  return out
}
