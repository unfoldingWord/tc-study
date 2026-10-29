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

export type OriginalsIndexResult = { key: string; books: number; rows: number; reason?: string }

const NO_CATALOG = 'sin fila en el catálogo'

function indexScanPrefixes(original: string): string[] {
  return scansFor(original)
    .filter((scan) => scan.layer === 'index')
    .map((scan) => scan.prefix)
}

async function staleIndexKeys(cache: IndexCache, original: string): Promise<string[]> {
  const held = indexScanPrefixes(original)
  const keysUnder = async (prefix: string) => (await cache.getByPrefix(prefix)).map((row) => row.key)
  return (await Promise.all(held.map(keysUnder))).flat()
}

/** Throws when the store already holds index rows of this original and cannot remove them. */
async function assertCanClearIndex(cache: IndexCache, original: string): Promise<void> {
  const stale = await staleIndexKeys(cache, original)
  if (!stale.length) return
  if (cache.transactRaw) return
  if (cache.deleteMany || cache.delete) return
  throw new Error(
    `El almacén de la caché ya tiene ${stale.length} filas de índice de ${original} y no puede borrarlas (falta transactRaw, deleteMany o delete).`
  )
}

/**
 * The keys of an original's scripture rows, once the index rows the store holds of it are gone, so a book or a code
 * it no longer has leaves no row behind. With `transactRaw`, keys only and in one go; otherwise by reading the rows.
 */
async function scriptureKeysWithoutIndex(cache: IndexCache, original: string, scripture: string): Promise<string[]> {
  const held = indexScanPrefixes(original)
  if (cache.transactRaw) {
    let keys: string[] = []
    await cache.transactRaw({ keys: [], prefixes: [scripture, ...held] }, (found) => {
      keys = found.prefixKeys.get(scripture) ?? []
      return { puts: [], deletes: held.flatMap((prefix) => found.prefixKeys.get(prefix) ?? []) }
    })
    return keys
  }
  const keysUnder = async (prefix: string) => (await cache.getByPrefix(prefix)).map((row) => row.key)
  const stale = await staleIndexKeys(cache, original)
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
): Promise<OriginalsIndexResult[]> {
  const { cache, catalog } = stores
  const timestamp = Date.now()
  const out: OriginalsIndexResult[] = []

  const planned: Array<{ key: string; meta: BookStampSource | null }> = []
  for (const key of originalKeys) {
    planned.push({ key, meta: await catalog.get(key) })
  }
  for (const { key, meta } of planned) {
    if (meta) await assertCanClearIndex(cache, key)
  }

  for (const { key, meta } of planned) {
    if (!meta) {
      out.push({ key, books: 0, rows: 0, reason: NO_CATALOG })
      continue
    }
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
