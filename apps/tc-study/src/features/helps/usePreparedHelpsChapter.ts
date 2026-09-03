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

    void (async () => {
      setStatus('pending')
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

      // Miss — serve loader fallback immediately; heal in background.
      setPreparedNotes(null)
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

    void (async () => {
      setStatus('pending')
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

      setPreparedLinks(null)
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
