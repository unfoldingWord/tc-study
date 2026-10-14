/**
 * Build every derived row of a language that is already downloaded: prepared views of every book, unit, story and
 * article, quotes and aligned quotes of every chapter, and TA/TW titles. These are tc-study's lane-3 warm jobs, planned
 * by the same `collectLane3Groups` with no budget and run by the same `runWarmJob`, so the rows are the ones the Read
 * page would build little by little; then the title pass writes the `helps-text:` rows the Read page writes as titles
 * come on screen. Coverage is marked exactly as the warm scheduler marks it, so the app does not redo the work.
 */

import { resourceContentStamp, RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import { isResourceMarkedComplete } from '../download/resourceDownloadComplete'
import { resolveTaTitle, resolveTwTitle, twTitleEntry } from '../helps/articleTitles'
import type { HelpsTextKind } from '../helps/helpsCacheKeys'
import { writeHelpsText, type HelpsTextCacheAdapter } from '../helps/helpsTextStore'
import { getCachedTocTitleIndex, type TocIngredient } from '../helps/tocTitleIndex'
// Every preparer registers itself on import, as the warm and prepare workers do.
import '../prepare/registerPreparers'
import { resolveOriginalLanguageKey } from '../scripture/originalLanguage'
import { UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY } from '../scripture/originalLanguageSpecs'
import { collectLane3Groups, type WarmPlanStamps } from '../warm/warmAdmitPlan'
import { markRelationCovered, readWarmCoverage } from '../warm/warmCoverage'
import { applyCoverageOutcome, createCoverageSettleState, type CoverageSettleState } from '../warm/warmCoverageSettle'
import { runWarmJob } from '../warm/warmJobs'
import { classifyWarmResource, languageFromKey } from '../warm/warmResourceClass'
import { resolveWarmStamps, type WarmStampCatalog } from '../warm/warmStamps'
import type { WarmJob, WarmJobOutcome } from '../warm/warmTypes'

export type PipelineCache = Parameters<typeof runWarmJob>[0] &
  HelpsTextCacheAdapter & {
    getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
  }

export interface PipelineCatalog extends WarmStampCatalog {
  getAllResourceKeys(): Promise<string[]>
}

export type BuildProgress =
  | { phase: 'plan'; jobs: number }
  | { phase: 'jobs'; done: number; total: number; job: WarmJob; outcome: WarmJobOutcome }
  | { phase: 'titles'; resourceKey: string }

export interface TitlesReport {
  resourceKey: string
  kind: HelpsTextKind
  written: number
  /** Entries whose title is not in the TOC: the Read page shows a placeholder and never stores it. */
  placeholders: number
}

export interface BuildReport {
  language: string
  /** The language's resources and whether each has a complete receipt for its current release. */
  resources: Array<{ resourceKey: string; complete: boolean }>
  jobs: { total: number } & Record<WarmJobOutcome, number>
  /** Jobs that did not build: blocked (source or original missing) or noop. */
  incomplete: Array<{ jobKey: string; outcome: WarmJobOutcome }>
  relationsCovered: number
  titles: TitlesReport[]
}

/** No budget: every lane-3 job of the language at once. */
const NO_BUDGET = Number.MAX_SAFE_INTEGER

function olStampForBook(book: string, olStampByKey: Record<string, string>): { olKey: string; olStamp: string } {
  const olKey = resolveOriginalLanguageKey(book)?.resourceKey ?? ''
  return { olKey, olStamp: (olKey && olStampByKey[olKey]) || 'nostamp' }
}

/** The original languages marked complete; none known means "let the jobs probe", as the warm scheduler does. */
async function readyOriginals(cache: PipelineCache): Promise<string[] | undefined> {
  const ready: string[] = []
  for (const key of [UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY]) {
    if (await isResourceMarkedComplete(cache, key)) ready.push(key)
  }
  return ready.length > 0 ? ready : undefined
}

/** TA/TW entry ids when the catalog has no ingredients for them: the article rows already in the cache. */
async function articleIdsFromCache(cache: PipelineCache, key: string): Promise<string[]> {
  if (!cache.getByPrefix) return []
  try {
    const rows = await cache.getByPrefix(`${key}/`)
    return rows
      .map((r) => (r.key.startsWith(`${key}/`) ? r.key.slice(key.length + 1) : ''))
      .filter((id) => id && !id.includes(':'))
  } catch {
    return []
  }
}

async function writeTitles(
  cache: PipelineCache,
  catalog: WarmStampCatalog,
  resourceKey: string,
  kind: 'ta-title' | 'tw-title'
): Promise<TitlesReport> {
  const report: TitlesReport = { resourceKey, kind, written: 0, placeholders: 0 }
  const meta = (await catalog.getResourceMetadata(resourceKey)) as {
    contentMetadata?: { ingredients?: Array<TocIngredient & { identifier?: string }> }
  } | null
  const ingredients = meta?.contentMetadata?.ingredients ?? []
  const stamp = resourceContentStamp(meta as never)
  const index = getCachedTocTitleIndex(resourceKey, stamp, ingredients)
  for (const ingredient of ingredients) {
    const id = ingredient.identifier
    if (!id) continue
    let entryId: string
    let result: { value: string; confident: boolean }
    if (kind === 'ta-title') {
      // Notes link `rc://*/ta/man/{section}/{slug}`; the entry id is `{section}/{slug}`.
      if (id.split('/').length !== 2) continue
      entryId = id
      result = resolveTaTitle(index, id)
    } else {
      // Words links point to `rc://*/tw/dict/bible/{category}/{term}`; the entry id is `{category}/{term}`.
      const entry = twTitleEntry(`rc://*/tw/dict/${id.startsWith('bible/') ? id : `bible/${id}`}`)
      if (!entry) continue
      entryId = entry.entryId
      result = resolveTwTitle(index, entry)
    }
    if (!result.confident) {
      report.placeholders += 1
      continue
    }
    await writeHelpsText(cache, kind, resourceKey, stamp, entryId, result.value)
    report.written += 1
  }
  return report
}

export async function buildLanguageArtifacts(options: {
  language: string
  cache: PipelineCache
  catalog: PipelineCatalog
  onProgress?: (progress: BuildProgress) => void
  cancelled?: () => boolean
}): Promise<BuildReport> {
  const { cache, catalog, onProgress } = options
  const language = options.language.toLowerCase()
  const cancelled = options.cancelled ?? (() => false)

  const allKeys = await catalog.getAllResourceKeys()
  const inLang = allKeys.filter((k) => languageFromKey(k) === language)
  const bags = await resolveWarmStamps({ catalog, stampKeys: inLang })

  const articleIdsByKey = { ...bags.articleIdsByKey }
  for (const key of inLang) {
    if (articleIdsByKey[key]?.length || !classifyWarmResource(key).isArticle) continue
    const ids = await articleIdsFromCache(cache, key)
    if (ids.length) articleIdsByKey[key] = ids
  }

  const coverage = await readWarmCoverage(cache)
  const stamps: WarmPlanStamps = {
    helpsStampByKey: bags.helpsStampByKey,
    targetStampByKey: bags.targetStampByKey,
    textLanguageByTarget: bags.textLanguageByTarget,
    olStampByKey: bags.olStampByKey,
  }
  const groups = collectLane3Groups({
    bookId: 'gen',
    downloadedKeys: allKeys,
    textLanguageCode: language,
    helpsLanguageCode: language,
    stamps,
    articleIdsByKey,
    admittedKeys: [],
    budget: NO_BUDGET,
    olStampForBook: (book) => olStampForBook(book, bags.olStampByKey),
    skipRelation: (relationId, stamp, minUnitCount) => {
      const entry = coverage[relationId]
      return Boolean(entry && entry.stamp === stamp && entry.unitCount >= minUnitCount)
    },
    readyOlKeys: await readyOriginals(cache),
  })

  // Register every job before running any, so a relation split over several groups is marked once, when all of it
  // is done.
  const batches = new Map<string, CoverageSettleState>()
  const relationOf = new Map<string, string>()
  const jobs: WarmJob[] = []
  for (const group of groups) {
    let batch = batches.get(group.relationId)
    if (!batch || batch.stamp !== group.stamp) {
      batch = createCoverageSettleState(group.stamp)
      batches.set(group.relationId, batch)
    }
    for (const job of group.jobs) {
      if (relationOf.has(job.jobKey)) continue
      batch.remaining.add(job.jobKey)
      relationOf.set(job.jobKey, group.relationId)
      jobs.push(job)
    }
  }
  onProgress?.({ phase: 'plan', jobs: jobs.length })

  const counts: BuildReport['jobs'] = { total: jobs.length, finished: 0, cached: 0, blocked: 0, noop: 0 }
  const incomplete: BuildReport['incomplete'] = []
  let relationsCovered = 0
  let done = 0
  for (const job of jobs) {
    if (cancelled()) break
    let outcome: WarmJobOutcome
    try {
      outcome = await runWarmJob(cache, job, cancelled)
    } catch {
      outcome = 'noop'
    }
    counts[outcome] += 1
    if (outcome === 'blocked' || outcome === 'noop') incomplete.push({ jobKey: job.jobKey, outcome })
    done += 1
    onProgress?.({ phase: 'jobs', done, total: jobs.length, job, outcome })

    const relationId = relationOf.get(job.jobKey)
    const batch = relationId ? batches.get(relationId) : undefined
    if (!relationId || !batch) continue
    const { shouldMark, succeeded } = applyCoverageOutcome(batch, job.jobKey, outcome)
    if (batch.remaining.size > 0) continue
    batches.delete(relationId)
    if (shouldMark) {
      await markRelationCovered(cache, relationId, batch.stamp, succeeded)
      relationsCovered += 1
    }
  }

  const titles: TitlesReport[] = []
  for (const key of inLang) {
    if (cancelled()) break
    const typeId = classifyWarmResource(key).typeId
    const kind =
      typeId === RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY
        ? 'ta-title'
        : typeId === RESOURCE_TYPE_IDS.TRANSLATION_WORDS
          ? 'tw-title'
          : null
    if (!kind) continue
    onProgress?.({ phase: 'titles', resourceKey: key })
    titles.push(await writeTitles(cache, catalog, key, kind))
  }

  const resources: BuildReport['resources'] = []
  for (const key of inLang) {
    const meta = await catalog.getResourceMetadata(key).catch(() => null)
    resources.push({ resourceKey: key, complete: await isResourceMarkedComplete(cache, key, meta as never) })
  }

  return {
    language,
    resources,
    jobs: counts,
    incomplete,
    relationsCovered,
    titles,
  }
}
