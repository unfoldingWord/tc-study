/**
 * Support-ref book filter: hydrate quote tokens from IndexedDB, warm misses,
 * then align against target scripture for the chapters in the match set.
 */

import type { OptimizedToken, TranslationNote } from '@bt-synergy/resource-parsers'
import type { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { extractUsjBroadcastTokens } from '@bt-synergy/scripture-loader'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useCacheAdapter,
  useCatalogManager,
  useLoaderRegistry,
} from '../../contexts'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { batchAlignLinks } from './batchAlignLinks'
import type { HelpsQuoteStatus } from './resolveHelpsQuoteStatus'
import {
  readCachedQuoteTokensForChapters,
  subtractCachedQuoteHits,
  type CachedQuoteToken,
  type HelpsQuoteCacheAdapter,
} from './helpsQuoteCache'
import {
  noteToPseudoLink,
  resolveHelpsQuoteCacheCtx,
  warmChapterQuotes,
} from './useWarmAdjacentHelpsQuotes'

export type SupportRefQuoteEnrichment = {
  quoteTokens?: OptimizedToken[]
  alignedTokens?: Array<{
    position: number
    content: string
    type?: string
    semanticId?: string
  }>
  semanticIds?: string[]
  quoteStatus: HelpsQuoteStatus
}

function chapterOfReference(reference: string): number {
  const n = parseInt(reference.split(':')[0] || '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function chaptersOfNotes(notes: readonly { reference: string }[]): number[] {
  const set = new Set<number>()
  for (const note of notes) set.add(chapterOfReference(note.reference))
  return [...set].sort((a, b) => a - b)
}

function cachedToOptimized(tokens: CachedQuoteToken[]): OptimizedToken[] {
  return tokens.map((t) => ({
    id: t.id,
    text: t.text,
    type: t.type,
    occurrence: t.occurrence,
    content: t.content,
  })) as OptimizedToken[]
}

export function useSupportRefQuotes(args: {
  enabled: boolean
  notes: TranslationNote[]
  tnKey: string
  bookId: string
  /** Catalog key for the target scripture (e.g. unfoldingWord/en/ult). */
  targetScriptureKey?: string
  /** Align this chapter first; other match chapters wait for idle. */
  focusChapter?: number
}): Map<string, SupportRefQuoteEnrichment> {
  const { enabled, notes, tnKey, bookId, targetScriptureKey = '', focusChapter } = args
  const cache = useCacheAdapter() as HelpsQuoteCacheAdapter | null
  const catalogManager = useCatalogManager()
  const loaderRegistry = useLoaderRegistry()

  const notesKey = useMemo(
    () =>
      enabled && notes.length
        ? notes
            .map((n) => n.id)
            .sort()
            .join(',')
        : '',
    [enabled, notes]
  )

  const [enrichment, setEnrichment] = useState<Map<string, SupportRefQuoteEnrichment>>(
    () => new Map()
  )
  const genRef = useRef(0)
  const notesRef = useRef(notes)
  notesRef.current = notes

  useEffect(() => {
    if (!enabled || !notesKey || !tnKey || !bookId || !cache || !catalogManager) {
      return
    }
    const notes = notesRef.current

    const gen = ++genRef.current
    const bookCode = bookId.toUpperCase()
    const chapters = chaptersOfNotes(notes)
    let cancelIdle: (() => void) | undefined
    let cancelAlignIdle: (() => void) | undefined

    void (async () => {
      const cacheCtx = await resolveHelpsQuoteCacheCtx(catalogManager, tnKey, bookCode)
      if (gen !== genRef.current || !cacheCtx) return

      const cached = await readCachedQuoteTokensForChapters(cache, {
        helpsKey: tnKey,
        helpsStamp: cacheCtx.helpsStamp,
        olKey: cacheCtx.olKey,
        olStamp: cacheCtx.olStamp,
        book: bookCode,
        chapters,
      })

      const quoted = notes.filter((n) => n.quote?.trim())
      const { hits, misses } = subtractCachedQuoteHits(quoted, cached)

      const applyQuotes = async (tokensById: Map<string, CachedQuoteToken[]>) => {
        if (gen !== genRef.current) return

        const quoteMap = new Map<string, OptimizedToken[]>()
        for (const [id, toks] of tokensById) {
          if (toks.length) quoteMap.set(id, cachedToOptimized(toks))
        }

        // Immediate paint: cached quotes → ol-fallback until align finishes.
        const next = new Map<string, SupportRefQuoteEnrichment>()
        for (const note of notes) {
          const qt = quoteMap.get(note.id)
          if (qt?.length) {
            next.set(note.id, { quoteTokens: qt, quoteStatus: 'ol-fallback' })
          } else if (!note.quote?.trim()) {
            next.set(note.id, { quoteStatus: 'none' })
          } else {
            next.set(note.id, { quoteStatus: 'ol-fallback' })
          }
        }
        setEnrichment(new Map(next))

        // First paint is titles + cached quotes. Align only the focus chapter
        // now; remaining Psalms-scale chapters wait for idle so lane 1 wins.
        const loader = loaderRegistry?.getLoader('scripture') as ScriptureLoader | undefined
        const scriptureKey = String(targetScriptureKey || '')
        if (!loader || typeof loader.loadViewModel !== 'function' || !scriptureKey) return

        const focus = focusChapter && focusChapter > 0 ? focusChapter : (chapters[0] ?? 1)
        const alignChapter = async (ch: number, base: Map<string, SupportRefQuoteEnrichment>) => {
          const chapterNotes = notes.filter(
            (n) => n.quote?.trim() && chapterOfReference(n.reference) === ch
          )
          if (chapterNotes.length === 0) return base
          const viewModel = await loader.loadViewModel(scriptureKey, bookId)
          if (gen !== genRef.current || !viewModel) return base
          const targetTokens = extractUsjBroadcastTokens(
            viewModel,
            ch,
            1,
            ch,
            999
          ) as OptimizedToken[]
          const results = batchAlignLinks({
            links: chapterNotes.map((n) => ({
              id: n.id,
              reference: n.reference,
              origWords: n.quote,
              occurrence: n.occurrence || '1',
              quoteReady: true as const,
              quoteTokens: quoteMap.get(n.id),
            })),
            targetTokens,
            bookCode,
            currentChapter: ch,
            endChapter: ch,
            tokenBook: bookCode,
            tokenChapter: ch,
            tokenEndChapter: ch,
            tokenStartVerse: 1,
            tokenEndVerse: 999,
            hasTokens: targetTokens.length > 0,
            quoteBuildReady: true,
            resourceKey: tnKey,
          })
          if (gen !== genRef.current) return base
          const aligned = new Map(base)
          for (const row of results) {
            const prev = aligned.get(row.id) ?? { quoteStatus: 'ol-fallback' as HelpsQuoteStatus }
            aligned.set(row.id, {
              ...prev,
              quoteTokens: prev.quoteTokens ?? quoteMap.get(row.id),
              alignedTokens: row.alignedTokens,
              semanticIds: row.semanticIds,
              quoteStatus: row.quoteStatus,
            })
          }
          setEnrichment(aligned)
          return aligned
        }

        try {
          let painted = await alignChapter(focus, next)
          const rest = chapters.filter((c) => c !== focus)
          if (rest.length === 0) return
          cancelAlignIdle?.()
          cancelAlignIdle = scheduleIdle(() => {
            void (async () => {
              for (const ch of rest) {
                if (gen !== genRef.current) return
                painted = await alignChapter(ch, painted)
              }
            })()
          }, 200)
        } catch {
          /* non-fatal align */
        }
      }

      await applyQuotes(hits)

      // Warm cache misses for chapters that still need builds, then re-hydrate.
      if (misses.length > 0 && loaderRegistry) {
        const loader = loaderRegistry.getLoader('scripture') as ScriptureLoader | undefined
        if (loader && typeof loader.loadViewModel === 'function') {
          const missChapters = chaptersOfNotes(misses)
          cancelIdle = scheduleIdle(() => {
            void (async () => {
              for (const ch of missChapters) {
                if (gen !== genRef.current) return
                const chapterNotes = misses.filter((n) => chapterOfReference(n.reference) === ch)
                try {
                  await warmChapterQuotes({
                    cache,
                    catalogManager,
                    loader,
                    helpsKey: tnKey,
                    bookId,
                    chapter: ch,
                    links: chapterNotes.map(noteToPseudoLink),
                  })
                } catch {
                  /* non-fatal */
                }
              }
              if (gen !== genRef.current) return
              const refreshed = await readCachedQuoteTokensForChapters(cache, {
                helpsKey: tnKey,
                helpsStamp: cacheCtx.helpsStamp,
                olKey: cacheCtx.olKey,
                olStamp: cacheCtx.olStamp,
                book: bookCode,
                chapters,
              })
              const allHits = new Map<string, CachedQuoteToken[]>()
              for (const note of quoted) {
                if (Object.prototype.hasOwnProperty.call(refreshed, note.id)) {
                  allHits.set(note.id, refreshed[note.id]!)
                }
              }
              // Keep prior hits too.
              for (const [id, toks] of hits) allHits.set(id, toks)
              await applyQuotes(allHits)
            })()
          }, 100)
        }
      }
    })()

    return () => {
      cancelIdle?.()
      cancelAlignIdle?.()
    }
  }, [
    enabled,
    notesKey,
    tnKey,
    bookId,
    cache,
    catalogManager,
    loaderRegistry,
    targetScriptureKey,
    focusChapter,
  ])

  return enrichment
}
