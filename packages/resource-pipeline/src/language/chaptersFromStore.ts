/**
 * The chapters of a book a resource has in the cache, so a build one book at a time plans no work for a book (or
 * chapter) the resource does not have. It answers with the chapters today's whole build would turn into rows, so the
 * two builds give the same rows.
 */

import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import { isUsjBookIndex, unwrapUsjEntry } from '@bt-synergy/scripture-loader'
import { knownChapterCount } from '../nav/bookChapterCounts'
import { sotCacheKey } from '../sot/sotCacheKey'
import { typeIdFromResourceKey } from '../sot/getSoT'

const TSV_BOOK_TYPES = new Set<string>([
  RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
])

function present(entry: unknown): boolean {
  return entry != null && entry !== ''
}

/** Chapter numbers of a scripture book row: the thin index next to the chapter rows, or a legacy whole-book blob. */
function scriptureChapters(entry: unknown): number[] | null {
  const row = unwrapUsjEntry(entry)
  if (isUsjBookIndex(row)) return row.chapterNumbers.filter((n) => typeof n === 'number')
  const chapters = (row as { chapters?: Array<{ number?: number }> } | null)?.chapters
  if (Array.isArray(chapters)) return chapters.map((ch, i) => ch.number ?? i + 1)
  return null
}

/**
 * `null` when the store has no row for the book (or the resource is not book-scoped).
 *
 * Scripture: the chapters of the book's index row. TN, TQ, TWL: every chapter of the book once its row is there,
 * not only the chapters with notes, because the whole build prepares every chapter of a book it has and a chapter
 * without notes still gets its (empty) prepared rows. Either way only chapters up to the book's known count, the
 * ones the whole build plans.
 */
export async function chaptersFromStore(
  cache: { get(key: string): Promise<unknown> },
  resourceKey: string,
  book: string
): Promise<number[] | null> {
  const typeId = typeIdFromResourceKey(resourceKey)
  const bookId = book.toLowerCase()
  const last = knownChapterCount(bookId)
  if (typeId === RESOURCE_TYPE_IDS.SCRIPTURE) {
    const chapters = scriptureChapters(await cache.get(sotCacheKey({ typeId, resourceKey, book: bookId })))
    if (!chapters) return null
    return [...new Set(chapters)].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
  }
  if (TSV_BOOK_TYPES.has(typeId)) {
    if (!present(await cache.get(sotCacheKey({ typeId, resourceKey, book: bookId })))) return null
    return Array.from({ length: last }, (_, i) => i + 1)
  }
  return null
}
