/**
 * Read prepared helps chapter rows; heal via main-thread prepare on miss.
 */

import type { ProcessedNotes, ProcessedWordsLinks } from '@bt-synergy/resource-parsers'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  NOTES_PREPARE_VERSION,
  type NotesFullChapter,
  type NotesFullRow,
  type NotesSource,
} from '../notes/notesPreparer'
import { readPreparedUnit } from '../prepare/prepareCache'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'
import {
  WORDS_LINKS_PREPARE_VERSION,
  type WordsLinksFullChapter,
  type WordsLinksFullRow,
  type WordsLinksSource,
} from '../wordsLinks/wordsLinksPreparer'

export type PreparedHelpsStatus = 'ready' | 'pending' | 'miss'

const healingBooks = new Set<string>()

function healKey(typeId: string, resourceKey: string, bookId: string): string {
  return `${typeId}|${resourceKey}|${bookId.toLowerCase()}`
}

export async function readPreparedNotesSpan(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  startChapter: number,
  endChapter: number
): Promise<NotesFullRow[] | null> {
  if (!resourceKey || !bookId || startChapter < 1) return null
  const out: NotesFullRow[] = []
  for (let ch = startChapter; ch <= endChapter; ch++) {
    const chapter = await readPreparedUnit<NotesFullChapter>(
      cache,
      RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      resourceKey,
      bookId,
      ch,
      'full',
      NOTES_PREPARE_VERSION
    )
    // Incomplete span → miss so callers keep the loader slice.
    if (!chapter) return null
    out.push(...(chapter.notes ?? []))
  }
  return out
}

export async function readPreparedWordsLinksSpan(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  startChapter: number,
  endChapter: number
): Promise<WordsLinksFullRow[] | null> {
  if (!resourceKey || !bookId || startChapter < 1) return null
  const out: WordsLinksFullRow[] = []
  for (let ch = startChapter; ch <= endChapter; ch++) {
    const chapter = await readPreparedUnit<WordsLinksFullChapter>(
      cache,
      RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
      resourceKey,
      bookId,
      ch,
      'full',
      WORDS_LINKS_PREPARE_VERSION
    )
    if (!chapter) return null
    out.push(...(chapter.links ?? []))
  }
  return out
}

export async function healPreparedNotesChapter(args: {
  cache: PrepareCacheAdapter
  resourceKey: string
  bookId: string
  chapters: number[]
  notes: ProcessedNotes
}): Promise<NotesFullRow[] | null> {
  const { cache, resourceKey, bookId, chapters, notes } = args
  if (!resourceKey || !bookId || chapters.length === 0) return null
  const key = healKey(RESOURCE_TYPE_IDS.TRANSLATION_NOTES, resourceKey, bookId)
  if (healingBooks.has(key)) return null
  healingBooks.add(key)
  try {
    await import('../notes/notesPreparer')
    const { prepareBookWithPreparer } = await import('../prepare/runPrepare')
    const source: NotesSource = { resourceKey, bookId, notes }
    await prepareBookWithPreparer({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      resourceKey,
      bookId,
      cacheAdapter: cache,
      source,
      units: chapters,
      tiers: ['light', 'full'],
    })
    const start = Math.min(...chapters)
    const end = Math.max(...chapters)
    return readPreparedNotesSpan(cache, resourceKey, bookId, start, end)
  } catch (err) {
    console.error(
      `[healPreparedNotesChapter] failed for ${resourceKey}/${bookId}`,
      err
    )
    return null
  } finally {
    healingBooks.delete(key)
  }
}

export async function healPreparedWordsLinksChapter(args: {
  cache: PrepareCacheAdapter
  resourceKey: string
  bookId: string
  chapters: number[]
  links: ProcessedWordsLinks
}): Promise<WordsLinksFullRow[] | null> {
  const { cache, resourceKey, bookId, chapters, links } = args
  if (!resourceKey || !bookId || chapters.length === 0) return null
  const key = healKey(RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS, resourceKey, bookId)
  if (healingBooks.has(key)) return null
  healingBooks.add(key)
  try {
    await import('../wordsLinks/wordsLinksPreparer')
    const { prepareBookWithPreparer } = await import('../prepare/runPrepare')
    const source: WordsLinksSource = { resourceKey, bookId, links }
    await prepareBookWithPreparer({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
      resourceKey,
      bookId,
      cacheAdapter: cache,
      source,
      units: chapters,
      tiers: ['light', 'full'],
    })
    const start = Math.min(...chapters)
    const end = Math.max(...chapters)
    return readPreparedWordsLinksSpan(cache, resourceKey, bookId, start, end)
  } catch (err) {
    console.error(
      `[healPreparedWordsLinksChapter] failed for ${resourceKey}/${bookId}`,
      err
    )
    return null
  } finally {
    healingBooks.delete(key)
  }
}

/** Test-only. */
export function resetPreparedHelpsHealingForTests(): void {
  healingBooks.clear()
}
