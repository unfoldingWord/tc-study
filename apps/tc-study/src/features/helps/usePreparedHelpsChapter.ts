/**
 * Load prepared TN / TWL chapter rows for the current span.
 * On miss, heal from the already-loaded book payload (main-thread prepare).
 * Returns null rows when prepared cache is unavailable — callers keep loader fallback.
 */

import type { ProcessedNotes, ProcessedWordsLinks } from '@bt-synergy/resource-parsers'
import { useEffect, useRef, useState } from 'react'
import { useCacheAdapter } from '../../contexts'
import type { NotesFullRow } from '../notes/notesPreparer'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'
import type { WordsLinksFullRow } from '../wordsLinks/wordsLinksPreparer'
import {
  healPreparedNotesChapter,
  healPreparedWordsLinksChapter,
  readPreparedNotesSpan,
  readPreparedWordsLinksSpan,
  type PreparedHelpsStatus,
} from './ensurePreparedHelpsChapter'

function chapterList(start: number, end: number): number[] {
  const out: number[] = []
  for (let c = start; c <= end; c++) out.push(c)
  return out
}

/**
 * Chapter BCV change must not refetch/rebuild book notes already in memory.
 * First-load (no prior span) still hydrates prepared cache; no-payload stays pending.
 */
export function resolvePreparedHelpsReload(args: {
  hasBookPayload: boolean
  spanChanged: boolean
  hadPreviousSpan: boolean
}): {
  clearRows: boolean
  pending: boolean
  skipFetch: boolean
} {
  if (args.hasBookPayload && args.spanChanged && args.hadPreviousSpan) {
    return { clearRows: false, pending: false, skipFetch: true }
  }
  if (args.hasBookPayload) {
    return { clearRows: args.spanChanged, pending: false, skipFetch: false }
  }
  return {
    clearRows: args.spanChanged,
    pending: true,
    skipFetch: false,
  }
}

export function usePreparedNotesChapter(args: {
  resourceKey: string
  bookId: string
  startChapter: number
  endChapter: number
  /** Whole-book payload for heal when prepared rows are missing. */
  processedNotes?: ProcessedNotes | null
}): {
  preparedNotes: NotesFullRow[] | null
  status: PreparedHelpsStatus
} {
  const cache = useCacheAdapter() as PrepareCacheAdapter | null
  const { resourceKey, bookId, startChapter, endChapter, processedNotes } = args
  const [preparedNotes, setPreparedNotes] = useState<NotesFullRow[] | null>(null)
  const [status, setStatus] = useState<PreparedHelpsStatus>('pending')
  const genRef = useRef(0)
  const spanRef = useRef('')

  const processedNotesRef = useRef(processedNotes)
  processedNotesRef.current = processedNotes
  const notesReadyKey =
    processedNotes != null
      ? `${processedNotes.bookCode}:${processedNotes.notes?.length ?? 0}:${Object.keys(processedNotes.notesByChapter ?? {}).length}`
      : ''

  useEffect(() => {
    if (!cache || !resourceKey || !bookId || startChapter < 1) {
      setPreparedNotes(null)
      setStatus('miss')
      return
    }

    const gen = ++genRef.current
    let cancelled = false
    const span = `${bookId}:${startChapter}:${endChapter}`
    const spanChanged = spanRef.current !== span
    const reload = resolvePreparedHelpsReload({
      hasBookPayload: processedNotesRef.current != null,
      spanChanged,
      hadPreviousSpan: Boolean(spanRef.current),
    })
    if (reload.clearRows) {
      setPreparedNotes(null)
    }
    spanRef.current = span
    if (reload.skipFetch) {
      return
    }

    void (async () => {
      if (reload.pending) setStatus('pending')
      const hit = await readPreparedNotesSpan(
        cache,
        resourceKey,
        bookId,
        startChapter,
        endChapter
      )
      if (cancelled || gen !== genRef.current) return

      if (hit) {
        setPreparedNotes(hit)
        setStatus('ready')
        return
      }

      // Miss — keep the last span so a token filter does not flash empty
      // while heal/loader catch up. First paint stays null → loader fallback.
      setStatus('miss')

      const source = processedNotesRef.current
      if (!source) return
      const healed = await healPreparedNotesChapter({
        cache,
        resourceKey,
        bookId,
        chapters: chapterList(startChapter, endChapter),
        notes: source,
      })
      if (cancelled || gen !== genRef.current) return
      if (healed) {
        setPreparedNotes(healed)
        setStatus('ready')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cache, resourceKey, bookId, startChapter, endChapter, notesReadyKey])

  return { preparedNotes, status }
}

export function usePreparedWordsLinksChapter(args: {
  resourceKey: string
  bookId: string
  startChapter: number
  endChapter: number
  processedLinks?: ProcessedWordsLinks | null
}): {
  preparedLinks: WordsLinksFullRow[] | null
  status: PreparedHelpsStatus
} {
  const cache = useCacheAdapter() as PrepareCacheAdapter | null
  const { resourceKey, bookId, startChapter, endChapter, processedLinks } = args
  const [preparedLinks, setPreparedLinks] = useState<WordsLinksFullRow[] | null>(null)
  const [status, setStatus] = useState<PreparedHelpsStatus>('pending')
  const genRef = useRef(0)
  const spanRef = useRef('')

  const processedLinksRef = useRef(processedLinks)
  processedLinksRef.current = processedLinks
  const linksReadyKey =
    processedLinks != null
      ? `${processedLinks.bookCode}:${processedLinks.links?.length ?? 0}:${Object.keys(processedLinks.linksByChapter ?? {}).length}`
      : ''

  useEffect(() => {
    if (!cache || !resourceKey || !bookId || startChapter < 1) {
      setPreparedLinks(null)
      setStatus('miss')
      return
    }

    const gen = ++genRef.current
    let cancelled = false
    const span = `${bookId}:${startChapter}:${endChapter}`
    const spanChanged = spanRef.current !== span
    const reload = resolvePreparedHelpsReload({
      hasBookPayload: processedLinksRef.current != null,
      spanChanged,
      hadPreviousSpan: Boolean(spanRef.current),
    })
    if (reload.clearRows) {
      setPreparedLinks(null)
    }
    spanRef.current = span
    if (reload.skipFetch) {
      return
    }

    void (async () => {
      if (reload.pending) setStatus('pending')
      const hit = await readPreparedWordsLinksSpan(
        cache,
        resourceKey,
        bookId,
        startChapter,
        endChapter
      )
      if (cancelled || gen !== genRef.current) return

      if (hit) {
        setPreparedLinks(hit)
        setStatus('ready')
        return
      }

      setStatus('miss')

      const source = processedLinksRef.current
      if (!source) return
      const healed = await healPreparedWordsLinksChapter({
        cache,
        resourceKey,
        bookId,
        chapters: chapterList(startChapter, endChapter),
        links: source,
      })
      if (cancelled || gen !== genRef.current) return
      if (healed) {
        setPreparedLinks(healed)
        setStatus('ready')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cache, resourceKey, bookId, startChapter, endChapter, linksReadyKey])

  return { preparedLinks, status }
}
