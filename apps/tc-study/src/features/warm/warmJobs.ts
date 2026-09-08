/**
 * Pure warm-job runners shared by warm.worker and prepare.worker fallback.
 * All inputs come from IndexedDB via cacheAdapter — no large postMessage payloads.
 */

import type { OptimizedChapter, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { viewModelChapterToOptimized } from '@bt-synergy/scripture-loader'
import { batchAlignLinks } from '../helps/batchAlignLinks'
import {
  mergeAndWriteCachedAlignments,
  readCachedAlignments,
  type CachedAlignments,
  type HelpsAlignCacheAdapter,
} from '../helps/helpsAlignCache'
import {
  mergeAndWriteCachedQuoteTokens,
  readCachedQuoteTokens,
  toCachedQuoteTokens,
  type CachedQuoteTokens,
  type HelpsQuoteCacheAdapter,
} from '../helps/helpsQuoteCache'
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { compactFromAlignResult } from '../helps/reconstructAlignFromPositions'
import { getPreparer, type PrepareCacheAdapter } from '../prepare/prepareRegistry'
import { readPreparedUnit, writePreparedNav, writePreparedUnit } from '../prepare/prepareCache'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import {
  SCRIPTURE_PREPARE_VERSION,
  scripturePreparer,
  type ScriptureFullChapter,
} from '../scripture/scripturePreparer'
import { batchBuildQuoteTokens } from '../scripture/scripturePrepCore'
import { notesPreparer, type NotesSource } from '../notes/notesPreparer'
import { wordsLinksPreparer, type WordsLinksSource } from '../wordsLinks/wordsLinksPreparer'
import type {
  WarmAlignChapterJob,
  WarmJob,
  WarmJobOutcome,
  WarmPrepareArticleJob,
  WarmPrepareUnitJob,
  WarmQuoteChapterJob,
} from './warmTypes'

const LINK_SLICE = 32

function yieldSlice(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function forSlices<T>(
  items: T[],
  fn: (slice: T[], offset: number) => Promise<void> | void
): Promise<void> {
  for (let i = 0; i < items.length; i += LINK_SLICE) {
    await fn(items.slice(i, i + LINK_SLICE), i)
    if (i + LINK_SLICE < items.length) await yieldSlice()
  }
}

function noteToPseudoLink(note: {
  id: string
  reference: string
  quote?: string
  occurrence?: string
  tags?: string
}): TranslationWordsLink {
  return {
    id: note.id,
    reference: note.reference,
    tags: note.tags || '',
    occurrence: note.occurrence || '1',
    origWords: note.quote || '',
    twLink: '',
    articlePath: '',
  }
}

async function loadOlChapter(
  cache: PrepareCacheAdapter,
  bookId: string,
  chapter: number
): Promise<OptimizedChapter | null> {
  const ol = resolveOriginalLanguageKey(bookId)
  if (!ol) return null
  const source = await scripturePreparer.readSource(
    { cacheAdapter: cache },
    ol.resourceKey,
    bookId
  )
  if (!source) return null
  return viewModelChapterToOptimized(source.viewModel, chapter)
}

async function readHelpsLinksForChapter(
  cache: PrepareCacheAdapter,
  job: WarmQuoteChapterJob | WarmAlignChapterJob
): Promise<TranslationWordsLink[]> {
  if (job.helpsType === 'notes') {
    const source = (await notesPreparer.readSource(
      { cacheAdapter: cache },
      job.resourceKey,
      job.bookId
    )) as NotesSource | null
    if (!source) return []
    const byChapter = source.notes.notesByChapter
    const notes =
      byChapter?.[String(job.chapter)] ??
      (source.notes.notes ?? []).filter(
        (n) => parseInt(n.reference.split(':')[0] || '0', 10) === job.chapter
      )
    return notes.filter((n) => n.quote?.trim()).map(noteToPseudoLink)
  }
  const source = (await wordsLinksPreparer.readSource(
    { cacheAdapter: cache },
    job.resourceKey,
    job.bookId
  )) as WordsLinksSource | null
  if (!source) return []
  const byChapter = source.links.linksByChapter
  const links =
    byChapter?.[String(job.chapter)] ??
    (source.links.links ?? []).filter(
      (l) => parseInt(l.reference.split(':')[0] || '0', 10) === job.chapter
    )
  return links.filter((l) => l.origWords?.trim())
}

export async function runWarmPrepareUnit(
  cache: PrepareCacheAdapter,
  job: WarmPrepareUnitJob,
  cancelled: () => boolean
): Promise<WarmJobOutcome> {
  const preparer = getPreparer(job.typeId)
  if (!preparer) return 'noop'
  if (cancelled()) return 'noop'
  const source = await preparer.readSource({ cacheAdapter: cache }, job.resourceKey, job.bookId)
  if (cancelled() || source == null) return 'noop'

  const tiers = job.tier === 'both' ? (['light', 'full'] as const) : [job.tier]
  let already = true
  for (const tier of tiers) {
    const existing = await readPreparedUnit(
      cache,
      job.typeId,
      job.resourceKey,
      job.bookId,
      job.unit,
      tier,
      preparer.version
    )
    if (!existing) {
      already = false
      break
    }
  }
  if (already) return 'cached'

  if (preparer.prepareNav) {
    await writePreparedNav(
      cache,
      job.typeId,
      job.resourceKey,
      job.bookId,
      preparer.version,
      preparer.prepareNav(source)
    )
  }

  for (const tier of tiers) {
    if (cancelled()) return 'noop'
    const payload =
      tier === 'light'
        ? preparer.prepareLight(source, job.unit)
        : preparer.prepareFull(source, job.unit)
    await writePreparedUnit(
      cache,
      job.typeId,
      job.resourceKey,
      job.bookId,
      job.unit,
      tier,
      preparer.version,
      payload
    )
  }
  return 'finished'
}

export async function runWarmQuoteChapter(
  cache: PrepareCacheAdapter & HelpsQuoteCacheAdapter,
  job: WarmQuoteChapterJob,
  cancelled: () => boolean
): Promise<WarmJobOutcome> {
  if (cancelled()) return 'noop'
  const links = await readHelpsLinksForChapter(cache, job)
  if (cancelled()) return 'noop'
  if (!links.length) return 'cached'

  const existing = await readCachedQuoteTokens(cache, {
    helpsKey: job.resourceKey,
    helpsStamp: job.helpsStamp,
    olKey: job.olKey,
    olStamp: job.olStamp,
    book: job.bookId,
    chapter: job.chapter,
  })
  const needsBuild = links.filter(
    (l) => !(existing && Object.prototype.hasOwnProperty.call(existing, l.id))
  )
  if (!needsBuild.length) return 'cached'

  const olChapter = await loadOlChapter(cache, job.bookId, job.chapter)
  if (!olChapter || cancelled()) return 'noop'

  const built: CachedQuoteTokens = {}
  await forSlices(needsBuild, async (slice, offset) => {
    if (cancelled()) return
    const results = batchBuildQuoteTokens({
      links: slice,
      originalChapters: [olChapter],
      bookCode: job.bookId.toUpperCase(),
    })
    for (const row of results) {
      const link = slice[row.index]
      if (!link) continue
      built[link.id] = toCachedQuoteTokens(
        row.tokens as Array<{
          id?: number
          text?: string
          type?: string
          occurrence?: number
          content?: string
        }>
      )
    }
    void offset
  })
  if (cancelled() || Object.keys(built).length === 0) return 'noop'

  await mergeAndWriteCachedQuoteTokens(
    cache,
    {
      helpsKey: job.resourceKey,
      helpsStamp: job.helpsStamp,
      olKey: job.olKey,
      olStamp: job.olStamp,
      book: job.bookId,
    },
    built,
    () => job.chapter
  )
  return 'finished'
}

export async function runWarmAlignChapter(
  cache: PrepareCacheAdapter & HelpsAlignCacheAdapter & HelpsQuoteCacheAdapter,
  job: WarmAlignChapterJob,
  cancelled: () => boolean
): Promise<WarmJobOutcome> {
  if (cancelled()) return 'noop'
  const links = await readHelpsLinksForChapter(cache, job)
  if (cancelled()) return 'noop'
  if (!links.length) return 'cached'

  const quoteRow = await readCachedQuoteTokens(cache, {
    helpsKey: job.resourceKey,
    helpsStamp: job.helpsStamp,
    olKey: job.olKey,
    olStamp: job.olStamp,
    book: job.bookId,
    chapter: job.chapter,
  })
  if (!quoteRow) return 'noop'

  const existingAlign = await readCachedAlignments(cache, {
    helpsKey: job.resourceKey,
    helpsStamp: job.helpsStamp,
    olKey: job.olKey,
    olStamp: job.olStamp,
    targetKey: job.targetKey,
    targetStamp: job.targetStamp,
    book: job.bookId,
    chapter: job.chapter,
  })
  if (
    existingAlign &&
    links.every((l) => Object.prototype.hasOwnProperty.call(existingAlign, l.id))
  ) {
    return 'cached'
  }

  const full = await readPreparedUnit<ScriptureFullChapter>(
    cache,
    'scripture',
    job.targetKey,
    job.bookId,
    job.chapter,
    'full',
    SCRIPTURE_PREPARE_VERSION
  )
  if (!full || cancelled()) return 'noop'

  const targetTokens = extractPreparedBroadcastTokens(
    job.bookId.toLowerCase(),
    job.chapter,
    full,
    1,
    999
  )
  if (!targetTokens.length) return 'noop'

  const alignInputs = links
    .filter((l) => Object.prototype.hasOwnProperty.call(quoteRow, l.id))
    .map((l) => ({
      id: l.id,
      reference: l.reference,
      origWords: l.origWords,
      occurrence: l.occurrence,
      quoteReady: true as const,
      quoteTokens: (quoteRow[l.id] ?? []).map((t) => ({
        id: t.id,
        text: t.text,
        type: t.type as 'word',
        occurrence: t.occurrence,
        content: t.content,
      })),
    }))

  if (!alignInputs.length) return 'noop'

  const built: CachedAlignments = {}
  await forSlices(alignInputs, async (slice) => {
    if (cancelled()) return
    const results = batchAlignLinks({
      links: slice,
      targetTokens: targetTokens as never,
      bookCode: job.bookId.toLowerCase(),
      currentChapter: job.chapter,
      endChapter: job.chapter,
      tokenBook: job.bookId.toLowerCase(),
      tokenChapter: job.chapter,
      tokenEndChapter: job.chapter,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: job.resourceKey,
      textLanguage: job.textLanguage,
    })
    for (const result of results) {
      const link = slice.find((l) => l.id === result.id)
      if (!link) continue
      const verse = parseInt(link.reference.split(':')[1] || '1', 10)
      built[result.id] = compactFromAlignResult({
        alignedTokens: result.alignedTokens,
        quoteTokens: link.quoteTokens as never,
        bookCode: job.bookId.toLowerCase(),
        chapter: job.chapter,
        verse,
        occurrence: link.occurrence,
      })
    }
  })
  if (cancelled() || Object.keys(built).length === 0) return 'noop'

  await mergeAndWriteCachedAlignments(
    cache,
    {
      helpsKey: job.resourceKey,
      helpsStamp: job.helpsStamp,
      olKey: job.olKey,
      olStamp: job.olStamp,
      targetKey: job.targetKey,
      targetStamp: job.targetStamp,
      book: job.bookId,
    },
    built,
    () => job.chapter
  )
  return 'finished'
}

export async function runWarmPrepareArticle(
  cache: PrepareCacheAdapter,
  job: WarmPrepareArticleJob,
  cancelled: () => boolean
): Promise<WarmJobOutcome> {
  if (cancelled()) return 'noop'
  const preparer = getPreparer(job.typeId)
  if (!preparer) return 'noop'
  // Article entry id is the unit; pass it as readSource bookId.
  const source = await preparer.readSource(
    { cacheAdapter: cache },
    job.resourceKey,
    String(job.unit)
  )
  if (cancelled() || source == null) return 'noop'
  const tiers = job.tier === 'both' ? (['light', 'full'] as const) : [job.tier]
  let already = true
  for (const tier of tiers) {
    const existing = await readPreparedUnit(
      cache,
      job.typeId,
      job.resourceKey,
      job.bookId || String(job.unit),
      job.unit,
      tier,
      preparer.version
    )
    if (!existing) {
      already = false
      break
    }
  }
  if (already) return 'cached'
  for (const tier of tiers) {
    if (cancelled()) return 'noop'
    const payload =
      tier === 'light'
        ? preparer.prepareLight(source, job.unit as never)
        : preparer.prepareFull(source, job.unit as never)
    await writePreparedUnit(
      cache,
      job.typeId,
      job.resourceKey,
      job.bookId || String(job.unit),
      job.unit,
      tier,
      preparer.version,
      payload
    )
  }
  return 'finished'
}

export async function runWarmJob(
  cache: PrepareCacheAdapter & HelpsAlignCacheAdapter & HelpsQuoteCacheAdapter,
  job: WarmJob,
  cancelled: () => boolean
): Promise<WarmJobOutcome> {
  switch (job.kind) {
    case 'prepare-unit':
      return runWarmPrepareUnit(cache, job, cancelled)
    case 'quote-chapter':
      return runWarmQuoteChapter(cache, job, cancelled)
    case 'align-chapter':
      return runWarmAlignChapter(cache, job, cancelled)
    case 'prepare-article':
      return runWarmPrepareArticle(cache, job, cancelled)
  }
}
