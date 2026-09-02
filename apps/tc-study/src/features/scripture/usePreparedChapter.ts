/**
 * Read light/full prepared scripture for one chapter; refresh on prepare ready.
 */

import { useEffect, useState } from 'react'
import { useCacheAdapter } from '../../contexts'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { subscribePrepareReady } from '../../workers/prepareClient'
import {
  fetchPreparedChapterTiers,
  paragraphsFromLightChapter,
  peekPreparedChapter,
  prefetchPreparedBookLight,
  seedPreparedChapter,
} from './preparedChapterCache'
import type { ScriptureFullChapter, ScriptureLightChapter } from './scripturePreparer'

export interface PreparedChapterState {
  light: ScriptureLightChapter | null
  full: ScriptureFullChapter | null
  matchKeys: string[] | null
  paragraphs: string[]
}

const EMPTY: PreparedChapterState = {
  light: null,
  full: null,
  matchKeys: null,
  paragraphs: [],
}

export function usePreparedChapter(args: {
  resourceKey: string
  bookId: string
  chapter: number
  enabled?: boolean
}): PreparedChapterState {
  const { resourceKey, bookId, chapter, enabled = true } = args
  const cache = useCacheAdapter()
  const [state, setState] = useState<PreparedChapterState>(() => {
    if (!enabled || !resourceKey || !bookId || chapter < 1) return EMPTY
    const peeked = peekPreparedChapter(resourceKey, bookId, chapter)
    if (!peeked) return EMPTY
    return {
      light: peeked.light,
      full: peeked.full,
      matchKeys: peeked.full?.matchKeys ?? null,
      paragraphs: paragraphsFromLightChapter(peeked.light),
    }
  })

  useEffect(() => {
    if (!enabled || !resourceKey || !bookId || chapter < 1) {
      setState(EMPTY)
      return
    }
    let cancelled = false

    const apply = (entry: {
      light: ScriptureLightChapter | null
      full: ScriptureFullChapter | null
    }) => {
      if (cancelled) return
      setState({
        light: entry.light,
        full: entry.full,
        matchKeys: entry.full?.matchKeys ?? null,
        paragraphs: paragraphsFromLightChapter(entry.light),
      })
    }

    const peeked = peekPreparedChapter(resourceKey, bookId, chapter)
    if (peeked && (peeked.light || peeked.full)) apply(peeked)

    void fetchPreparedChapterTiers(cache, resourceKey, bookId, chapter).then((entry) => {
      apply(entry)
    })

    const unsub = subscribePrepareReady((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== resourceKey) return
      if (msg.bookId.toLowerCase() !== bookId.toLowerCase()) return
      if (msg.unit !== chapter) return
      const tiers: Array<'light' | 'full'> =
        msg.tier === 'full' ? ['full'] : msg.tier === 'light' ? ['light'] : ['light', 'full']
      void fetchPreparedChapterTiers(cache, resourceKey, bookId, chapter, tiers).then(
        (entry) => {
          seedPreparedChapter(resourceKey, bookId, chapter, entry)
          apply(entry)
        }
      )
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [cache, resourceKey, bookId, chapter, enabled])

  return state
}

/**
 * Warm light/full for a chapter window (slots). Returns a revision tick for
 * consumers that read the LRU synchronously via peekPreparedChapter.
 */
export function usePreparedChapterWindow(args: {
  resourceKey: string
  bookId: string
  chapters: readonly number[]
  enabled?: boolean
}): number {
  const { resourceKey, bookId, chapters, enabled = true } = args
  const cache = useCacheAdapter()
  const [revision, setRevision] = useState(0)
  const chaptersKey = chapters.join(',')

  useEffect(() => {
    if (!enabled || !resourceKey || !bookId || chapters.length === 0) return
    let cancelled = false
    const chapterList = chaptersKey
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1)

    const warm = async () => {
      for (const chapter of chapterList) {
        if (cancelled) continue
        await fetchPreparedChapterTiers(cache, resourceKey, bookId, chapter)
      }
      if (!cancelled) setRevision((n) => n + 1)
    }
    void warm()

    const unsub = subscribePrepareReady((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== resourceKey) return
      if (msg.bookId.toLowerCase() !== bookId.toLowerCase()) return
      if (!chapterList.includes(msg.unit)) return
      void fetchPreparedChapterTiers(cache, resourceKey, bookId, msg.unit).then(() => {
        if (!cancelled) setRevision((n) => n + 1)
      })
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [cache, resourceKey, bookId, chaptersKey, enabled])

  return revision
}

function scheduleIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: 1500 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, 0)
  return () => clearTimeout(id)
}

/**
 * Prefetch light-only prepared JSON for every chapter of the open book into
 * the book-scoped light map. Does not mount DOM. Returns a revision tick so
 * peeks refresh as lights arrive.
 */
export function usePreparedBookLightPreload(args: {
  resourceKey: string
  bookId: string
  chapters: readonly number[]
  enabled?: boolean
}): number {
  const { resourceKey, bookId, chapters, enabled = true } = args
  const cache = useCacheAdapter()
  const [revision, setRevision] = useState(0)
  const chaptersKey = chapters.join(',')

  useEffect(() => {
    if (!enabled || !resourceKey || !bookId || chapters.length === 0) return
    let cancelled = false
    const chapterList = chaptersKey
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1)

    const bump = () => {
      if (!cancelled) setRevision((n) => n + 1)
    }

    const cancelIdle = scheduleIdle(() => {
      void prefetchPreparedBookLight(cache, resourceKey, bookId, chapterList).then(() => {
        bump()
      })
    })

    const unsub = subscribePrepareReady((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== resourceKey) return
      if (msg.bookId.toLowerCase() !== bookId.toLowerCase()) return
      if (!chapterList.includes(msg.unit)) return
      // Light or full ready: ensure light is in the book map for this unit.
      void fetchPreparedChapterTiers(cache, resourceKey, bookId, msg.unit, ['light']).then(
        () => {
          bump()
        }
      )
    })

    return () => {
      cancelled = true
      cancelIdle()
      unsub()
    }
  }, [cache, resourceKey, bookId, chaptersKey, enabled])

  return revision
}
