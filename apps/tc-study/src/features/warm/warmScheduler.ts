/**
 * Main-thread warm scheduler singleton — survives React remounts.
 *
 * Now  = lane 1 (visible owners): current chapter prepare + live quote/align.
 * Soon = lane 2: rest of current book for all downloaded keys in {text,helps}
 *        languages that share Bible vs OBS mode.
 * Later = lane 3: full-canon / OBS-story / article fill for every downloaded
 *        key in those languages (32-job slices, coverage resume).
 *
 * Multiple owners (helps / scripture) merge complementary visible context
 * so scripture+scripture and helps layouts both feed the same queue.
 */

import { isResourceMarkedComplete } from '../download/resourceDownloadComplete'
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { knownChapterCount } from '../nav/bookChapterCounts'
import { collectLane2Groups, collectLane3Groups } from './warmAdmitPlan'
import { shouldCancelWarmJobsForLanguage } from './warmCancelPolicy'
import {
  applyCoverageOutcome,
  createCoverageSettleState,
  type CoverageSettleState,
} from './warmCoverageSettle'
import { LANE3_JOBS_PER_PASS } from './warmBookOrder'
import {
  LANE2_JOBS_PER_PASS,
  LANE3_ADMIT_COOLDOWN_MS,
  LANE3_MAX_PENDING,
  canAdmitBackgroundLanes,
  warmLaneBlockedReason,
} from './warmLanePolicy'
import { classifyWarmResource, languageFromKey } from './warmResourceClass'
import {
  cancelWarmJobs,
  enqueueWarmJob,
  getWarmQueueStats,
  isDedicatedWarmWorkerActive,
  subscribeWarmDone,
} from '../../workers/warmClient'
import { subscribePrepareWarmDone } from '../../workers/prepareClient'
import {
  createProcessStepRing,
  pushProcessStep,
} from '../debug/processStepRing'
import { markRelationCovered, readWarmCoverage } from './warmCoverage'
import { runWarmGc, type WarmGcCacheAdapter } from './warmGc'
import type { WarmJob, WarmJobOutcome } from './warmTypes'

export type VisibleWarmResource = {
  typeId: string
  resourceKey: string
  role: 'scripture' | 'helps'
  helpsType?: 'notes' | 'words-links'
}

export type WarmContextOwner = 'helps' | 'scripture' | 'default'

export type WarmVisibleContext = {
  bookId: string
  chapter: number
  lastChapter: number
  visibleResources: VisibleWarmResource[]
  sourceResourceId: string | null
  textLanguageCode: string
  helpsLanguageCode: string
  scrollUnsettled: boolean
  /** Stamp bags resolved on the main thread (catalog metadata). */
  stamps?: {
    helpsStampByKey: Record<string, string>
    olKey?: string
    olStamp?: string
    targetStampByKey: Record<string, string>
    textLanguageByTarget?: Record<string, string>
    /** UGNT + UHB stamps so lane 3 can quote/align OT and NT books. */
    olStampByKey?: Record<string, string>
  }
  /** TA/TW entry ids from catalog ingredients (lane 3 prepare-article). */
  articleIdsByKey?: Record<string, string[]>
  /** Downloaded catalog keys for lane 3 (owner/lang/id). */
  downloadedKeys?: string[]
  /** Bumps when a download session finishes or a resource zip completes. */
  downloadGeneration?: number
  /** OL keys whose zip is marked complete — quote/align admit waits for these. */
  readyOlKeys?: string[]
  cacheAdapter?: WarmGcCacheAdapter | null
}

type StatsListener = (stats: WarmSchedulerStats) => void

export type WarmSchedulerStats = {
  lane1Drained: boolean
  scrollUnsettled: boolean
  pendingJobKeys: number
  /** Sample of pending jobKeys for debug UI (capped). */
  pendingJobKeySample: string[]
  dedicatedWorker: boolean
  /** Why lane 2 admit is gated (null = open). */
  lane2Blocked: string | null
  /** Why lane 3 admit is gated (null = open). */
  lane3Blocked: string | null
  context: WarmVisibleContext | null
  /** Recent warm job outcomes (newest last). */
  recentOutcomes: Array<{ t: number; jobKey: string; outcome: WarmJobOutcome }>
  /** Lane-1 busy owners for debug. */
  lane1BusyOwnerSample: string[]
}

type CoverageBatch = CoverageSettleState

const ownerContexts = new Map<WarmContextOwner, WarmVisibleContext>()
let context: WarmVisibleContext | null = null
let lane1Drained = false
const lane1BusyOwners = new Set<WarmContextOwner>()
const pendingKeys = new Set<string>()
/** languageCode captured at enqueue — used to drop pending keys on pane cancel. */
const pendingLangByKey = new Map<string, string>()
const coverageByJob = new Map<string, string>()
const coverageBatches = new Map<string, CoverageBatch>()
const listeners = new Set<StatsListener>()
let seededBookKey = ''
const admittedLane2Keys = new Set<string>()
let admittedLane2Seed = ''
const admittedLane3Keys = new Set<string>()
let admittedLane3Seed = ''
let gcScheduled = false
let lastLane3AdmitAt = 0
let lane3AdmitTimer: ReturnType<typeof setTimeout> | null = null
const outcomeRing = createProcessStepRing(40)
const recentOutcomes: Array<{ t: number; jobKey: string; outcome: WarmJobOutcome }> = []

function buildWarmStats(): WarmSchedulerStats {
  const pendingSample = [...pendingKeys].slice(0, 24)
  const documentVisible =
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  return {
    lane1Drained,
    scrollUnsettled: context?.scrollUnsettled ?? false,
    pendingJobKeys: pendingKeys.size,
    pendingJobKeySample: pendingSample,
    dedicatedWorker: isDedicatedWarmWorkerActive(),
    lane2Blocked: warmLaneBlockedReason({
      lane1Drained,
      scrollUnsettled: context?.scrollUnsettled,
      documentVisible,
      lane: 2,
    }),
    lane3Blocked: warmLaneBlockedReason({
      lane1Drained,
      scrollUnsettled: context?.scrollUnsettled,
      documentVisible,
      pendingJobKeys: pendingKeys.size,
      maxPending: LANE3_MAX_PENDING,
      lastAdmitAt: lastLane3AdmitAt,
      now: Date.now(),
      cooldownMs: LANE3_ADMIT_COOLDOWN_MS,
      lane: 3,
    }),
    context,
    recentOutcomes: [...recentOutcomes],
    lane1BusyOwnerSample: [...lane1BusyOwners],
  }
}

function emit() {
  const stats = buildWarmStats()
  for (const l of listeners) l(stats)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __warmDebug?: WarmSchedulerStats }).__warmDebug = stats
  }
}

function downloadedKeysHash(keys: string[] | undefined): string {
  return (keys ?? []).slice().sort().join(',')
}

function langChanged(prev: string, next: string): boolean {
  return Boolean(prev && next && prev.toLowerCase() !== next.toLowerCase())
}

function mergeOwnerContexts(
  owners: Map<WarmContextOwner, WarmVisibleContext>
): WarmVisibleContext | null {
  if (owners.size === 0) return null
  const list = [...owners.values()]
  const visibleByKey = new Map<string, VisibleWarmResource>()
  const helpsStampByKey: Record<string, string> = {}
  const targetStampByKey: Record<string, string> = {}
  const textLanguageByTarget: Record<string, string> = {}
  const olStampByKey: Record<string, string> = {}
  const articleIdsByKey: Record<string, string[]> = {}
  const downloaded = new Set<string>()
  let bookId = ''
  let chapter = 1
  let lastChapter = 0
  let sourceResourceId: string | null = null
  let textLanguageCode = ''
  let helpsLanguageCode = ''
  let scrollUnsettled = false
  let olKey: string | undefined
  let olStamp: string | undefined
  const readyOl = new Set<string>()
  let cacheAdapter: WarmGcCacheAdapter | null | undefined

  for (const c of list) {
    if (c.bookId) bookId = c.bookId
    if (c.chapter) chapter = c.chapter
    lastChapter = Math.max(lastChapter, c.lastChapter || 0)
    if (c.sourceResourceId) sourceResourceId = c.sourceResourceId
    if (c.textLanguageCode) textLanguageCode = c.textLanguageCode
    if (c.helpsLanguageCode) helpsLanguageCode = c.helpsLanguageCode
    scrollUnsettled = scrollUnsettled || c.scrollUnsettled
    if (c.cacheAdapter) cacheAdapter = c.cacheAdapter
    for (const r of c.visibleResources) visibleByKey.set(r.resourceKey, r)
    Object.assign(helpsStampByKey, c.stamps?.helpsStampByKey)
    Object.assign(targetStampByKey, c.stamps?.targetStampByKey)
    Object.assign(textLanguageByTarget, c.stamps?.textLanguageByTarget)
    Object.assign(olStampByKey, c.stamps?.olStampByKey)
    if (c.stamps?.olKey) olKey = c.stamps.olKey
    if (c.stamps?.olStamp) olStamp = c.stamps.olStamp
    for (const k of c.readyOlKeys ?? []) readyOl.add(k)
    for (const [k, ids] of Object.entries(c.articleIdsByKey ?? {})) {
      const prev = articleIdsByKey[k] ?? []
      articleIdsByKey[k] = [...new Set([...prev, ...ids])]
    }
    for (const k of c.downloadedKeys ?? []) downloaded.add(k)
  }

  return {
    bookId,
    chapter,
    lastChapter: lastChapter > 0 ? lastChapter : knownChapterCount(bookId),
    visibleResources: [...visibleByKey.values()],
    sourceResourceId,
    textLanguageCode,
    helpsLanguageCode,
    scrollUnsettled,
    stamps: {
      helpsStampByKey,
      olKey,
      olStamp,
      targetStampByKey,
      textLanguageByTarget,
      olStampByKey,
    },
    articleIdsByKey,
    downloadedKeys: [...downloaded],
    downloadGeneration: Math.max(0, ...list.map((c) => c.downloadGeneration ?? 0)),
    readyOlKeys: [...readyOl],
    cacheAdapter,
  }
}

function registerCoverageJobs(relationId: string, stamp: string, jobKeys: string[]): void {
  if (jobKeys.length === 0) return
  let batch = coverageBatches.get(relationId)
  if (!batch || batch.stamp !== stamp) {
    batch = createCoverageSettleState(stamp)
    coverageBatches.set(relationId, batch)
  }
  for (const key of jobKeys) {
    batch.remaining.add(key)
    coverageByJob.set(key, relationId)
  }
}

function settleCoverage(jobKey: string, outcome: WarmJobOutcome): void {
  const relationId = coverageByJob.get(jobKey)
  coverageByJob.delete(jobKey)
  if (!relationId) return
  const batch = coverageBatches.get(relationId)
  if (!batch) return
  const { shouldMark, succeeded } = applyCoverageOutcome(batch, jobKey, outcome)
  if (batch.remaining.size > 0) return
  coverageBatches.delete(relationId)
  const cache = context?.cacheAdapter
  if (!cache || !shouldMark) return
  void markRelationCovered(cache, relationId, batch.stamp, succeeded)
}

async function enqueue(job: WarmJob): Promise<boolean> {
  if (pendingKeys.has(job.jobKey)) return false
  pendingKeys.add(job.jobKey)
  if (job.languageCode) pendingLangByKey.set(job.jobKey, job.languageCode)
  try {
    await enqueueWarmJob(job)
    return true
  } catch {
    pendingKeys.delete(job.jobKey)
    pendingLangByKey.delete(job.jobKey)
    settleCoverage(job.jobKey, 'noop')
    return false
  }
}

async function enqueueCoveredGroup(
  relationId: string,
  stamp: string,
  jobs: WarmJob[]
): Promise<void> {
  const fresh = jobs.filter((j) => !pendingKeys.has(j.jobKey))
  if (fresh.length === 0) return
  registerCoverageJobs(
    relationId,
    stamp,
    fresh.map((j) => j.jobKey)
  )
  for (const job of fresh) {
    await enqueue(job)
  }
}

function onJobDone(jobKey: string, outcome: WarmJobOutcome = 'noop') {
  pendingKeys.delete(jobKey)
  pendingLangByKey.delete(jobKey)
  settleCoverage(jobKey, outcome)
  const t = Date.now()
  recentOutcomes.push({ t, jobKey, outcome })
  while (recentOutcomes.length > 24) recentOutcomes.shift()
  pushProcessStep(outcomeRing, {
    worker: 'warm',
    step: `outcome:${outcome}`,
    detail: jobKey,
    t,
  })
  emit()
  if (canAdmitLane2()) void seedLane2()
  scheduleMaybeAdmitLane3()
}

// Subscribe once at module load.
subscribeWarmDone((msg) => onJobDone(msg.jobKey, msg.outcome ?? 'noop'))
subscribePrepareWarmDone((msg) => onJobDone(msg.jobKey, msg.outcome ?? 'noop'))

function documentIsVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function canAdmitLane2(): boolean {
  return canAdmitBackgroundLanes({
    lane1Drained: Boolean(context && lane1Drained),
    scrollUnsettled: context?.scrollUnsettled,
    documentVisible: documentIsVisible(),
    lane: 2,
  })
}

function canAdmitLane3(): boolean {
  return canAdmitBackgroundLanes({
    lane1Drained: Boolean(context && lane1Drained),
    scrollUnsettled: context?.scrollUnsettled,
    documentVisible: documentIsVisible(),
    pendingJobKeys: pendingKeys.size,
    maxPending: LANE3_MAX_PENDING,
    lastAdmitAt: lastLane3AdmitAt,
    now: Date.now(),
    cooldownMs: LANE3_ADMIT_COOLDOWN_MS,
    lane: 3,
  })
}

function scheduleMaybeAdmitLane3(): void {
  if (canAdmitLane3()) {
    void maybeAdmitLane3()
    return
  }
  if (!canAdmitLane2()) return
  if (pendingKeys.size >= LANE3_MAX_PENDING) return
  if (lane3AdmitTimer != null) return
  const elapsed = Date.now() - lastLane3AdmitAt
  const wait = Math.max(0, LANE3_ADMIT_COOLDOWN_MS - elapsed)
  lane3AdmitTimer = setTimeout(() => {
    lane3AdmitTimer = null
    if (canAdmitLane3()) void maybeAdmitLane3()
  }, wait)
}

function articleIdsHash(map: Record<string, string[]> | undefined): string {
  return Object.entries(map ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ids]) => `${k}:${ids.length}`)
    .join(',')
}

function seedKeyFor(ctx: WarmVisibleContext): string {
  return [
    ctx.bookId,
    ctx.visibleResources.map((r) => r.resourceKey).join(','),
    ctx.sourceResourceId ?? '',
    downloadedKeysHash(ctx.downloadedKeys),
    articleIdsHash(ctx.articleIdsByKey),
    String(ctx.downloadGeneration ?? 0),
  ].join('|')
}

function resetLane3AdmitsIfNeeded(ctx: WarmVisibleContext): void {
  const seed = seedKeyFor(ctx)
  if (seed === admittedLane3Seed) return
  admittedLane3Seed = seed
  admittedLane3Keys.clear()
}

function resetLane2AdmitsIfNeeded(ctx: WarmVisibleContext): void {
  const seed = seedKeyFor(ctx)
  if (seed === admittedLane2Seed) return
  admittedLane2Seed = seed
  admittedLane2Keys.clear()
  seededBookKey = seed
}

async function seedLane2(): Promise<void> {
  if (!context || !canAdmitLane2()) return
  if (pendingKeys.size >= LANE3_MAX_PENDING) return
  const { bookId, chapter, lastChapter, visibleResources, sourceResourceId, stamps, downloadedKeys } =
    context
  resetLane2AdmitsIfNeeded(context)

  const ol = resolveOriginalLanguageKey(bookId)
  const olKey = stamps?.olKey ?? ol?.resourceKey ?? ''
  const olStamp = stamps?.olStamp ?? 'nostamp'
  const bookLast = lastChapter > 0 ? lastChapter : knownChapterCount(bookId)

  const visibleKeyList = visibleResources.map((r) => r.resourceKey)
  const readyOlKeys = await resolveReadyOlKeys(context)
  const groups = collectLane2Groups({
    bookId,
    chapter,
    lastChapter: bookLast,
    downloadedKeys: [
      ...new Set([
        ...(downloadedKeys ?? []),
        ...visibleKeyList,
        ...(sourceResourceId ? [sourceResourceId] : []),
      ]),
    ],
    visibleKeys: visibleKeyList,
    sourceResourceId,
    textLanguageCode: context.textLanguageCode,
    helpsLanguageCode: context.helpsLanguageCode,
    stamps,
    olKey,
    olStamp,
    readyOlKeys,
    admittedKeys: [...admittedLane2Keys, ...pendingKeys],
    budget: LANE2_JOBS_PER_PASS,
  })
  for (const g of groups) {
    for (const job of g.jobs) admittedLane2Keys.add(job.jobKey)
    await enqueueCoveredGroup(g.relationId, g.stamp, g.jobs)
  }
}

async function resolveReadyOlKeys(ctx: WarmVisibleContext): Promise<string[] | undefined> {
  const fromOwners = ctx.readyOlKeys ?? []
  const cache = ctx.cacheAdapter
  if (!cache) return fromOwners.length > 0 ? [...new Set(fromOwners)] : undefined
  const candidates = new Set<string>(fromOwners)
  if (ctx.stamps?.olKey) candidates.add(ctx.stamps.olKey)
  for (const k of Object.keys(ctx.stamps?.olStampByKey ?? {})) candidates.add(k)
  const ready: string[] = []
  for (const key of candidates) {
    if (fromOwners.includes(key) || (await isResourceMarkedComplete(cache, key))) {
      ready.push(key)
    }
  }
  // No confirmed-complete OL → unknown (older zips may lack the flag). Let jobs probe USFM.
  if (ready.length === 0) return undefined
  return ready
}

function olStampForBook(
  book: string,
  stamps: WarmVisibleContext['stamps']
): { olKey: string; olStamp: string } {
  const ol = resolveOriginalLanguageKey(book)
  const olKey = ol?.resourceKey ?? ''
  const fromMap = olKey ? stamps?.olStampByKey?.[olKey] : undefined
  const olStamp =
    fromMap ?? (olKey && olKey === stamps?.olKey ? stamps.olStamp : undefined) ?? 'nostamp'
  return { olKey, olStamp }
}

async function maybeAdmitLane3(): Promise<void> {
  if (!context || !canAdmitLane3()) return
  const {
    bookId,
    textLanguageCode,
    helpsLanguageCode,
    downloadedKeys = [],
    articleIdsByKey = {},
    stamps,
    cacheAdapter,
  } = context

  const langs = new Set(
    [textLanguageCode, helpsLanguageCode].map((l) => l.toLowerCase()).filter(Boolean)
  )
  const inLang = downloadedKeys.filter((k) => langs.has(languageFromKey(k)))
  if (inLang.length === 0) return
  resetLane3AdmitsIfNeeded(context)

  const coverage = cacheAdapter ? await readWarmCoverage(cacheAdapter) : {}
  const skipRelation = (relationId: string, stamp: string, minUnitCount: number) => {
    const entry = coverage[relationId]
    return Boolean(entry && entry.stamp === stamp && entry.unitCount >= minUnitCount)
  }

  const articles = { ...articleIdsByKey }
  if (cacheAdapter?.getByPrefix) {
    for (const key of inLang) {
      if (articles[key]?.length) continue
      const classified = classifyWarmResource(key)
      if (!classified.isArticle) continue
      try {
        const rows = await cacheAdapter.getByPrefix(`${key}/`)
        const ids = rows
          .map((r) => (r.key.startsWith(`${key}/`) ? r.key.slice(key.length + 1) : ''))
          .filter((id) => id && !id.includes(':'))
        if (ids.length) articles[key] = ids
      } catch {
        /* prefix scan is best-effort */
      }
    }
  }

  const readyOlKeys = await resolveReadyOlKeys(context)
  // Dedicated warm.worker can take a slice; folded prepare.worker gets 1 job
  // so batch-align / batch-quotes stay interactive.
  const budget = isDedicatedWarmWorkerActive() ? LANE3_JOBS_PER_PASS : 1
  const groups = collectLane3Groups({
    bookId,
    downloadedKeys,
    textLanguageCode,
    helpsLanguageCode,
    stamps,
    articleIdsByKey: articles,
    admittedKeys: [...admittedLane3Keys, ...pendingKeys],
    budget,
    olStampForBook: (book) => olStampForBook(book, stamps),
    skipRelation,
    readyOlKeys,
  })
  if (groups.some((g) => g.jobs.length > 0)) {
    lastLane3AdmitAt = Date.now()
  }
  for (const g of groups) {
    for (const job of g.jobs) admittedLane3Keys.add(job.jobKey)
    await enqueueCoveredGroup(g.relationId, g.stamp, g.jobs)
  }

  scheduleGc()
}

function scheduleGc() {
  if (gcScheduled || !context?.cacheAdapter) return
  gcScheduled = true
  const run = () => {
    gcScheduled = false
    if (!context?.cacheAdapter) return
    void runWarmGc({
      cache: context.cacheAdapter,
      sourceResourceId: context.sourceResourceId,
      textLanguageCode: context.textLanguageCode,
      helpsLanguageCode: context.helpsLanguageCode,
      currentBook: context.bookId,
      stamps: context.stamps,
    })
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 })
  } else {
    setTimeout(run, 3000)
  }
}

function applyMergedContext(): void {
  const prev = context
  context = mergeOwnerContexts(ownerContexts)
  if (prev && context) {
    if (
      langChanged(prev.textLanguageCode, context.textLanguageCode) &&
      shouldCancelWarmJobsForLanguage({
        previousLanguage: prev.textLanguageCode,
        nextTextLanguage: context.textLanguageCode,
        nextHelpsLanguage: context.helpsLanguageCode,
      })
    ) {
      void warmScheduler.cancelJobsForLanguage(prev.textLanguageCode)
    }
    if (
      langChanged(prev.helpsLanguageCode, context.helpsLanguageCode) &&
      shouldCancelWarmJobsForLanguage({
        previousLanguage: prev.helpsLanguageCode,
        nextTextLanguage: context.textLanguageCode,
        nextHelpsLanguage: context.helpsLanguageCode,
      })
    ) {
      void warmScheduler.cancelJobsForLanguage(prev.helpsLanguageCode)
    }
    if (prev.bookId !== context.bookId) {
      seededBookKey = ''
      admittedLane2Seed = ''
      admittedLane2Keys.clear()
    }
  }
  emit()
  if (canAdmitLane2()) void seedLane2()
  scheduleMaybeAdmitLane3()
}

export const warmScheduler = {
  setVisibleContext(next: WarmVisibleContext, owner: WarmContextOwner = 'default') {
    ownerContexts.set(owner, next)
    applyMergedContext()
  },

  clearVisibleContext(owner: WarmContextOwner) {
    if (!ownerContexts.has(owner)) return
    ownerContexts.delete(owner)
    lane1BusyOwners.delete(owner)
    lane1Drained = lane1BusyOwners.size === 0
    applyMergedContext()
  },

  notifyLane1Drained(owner: WarmContextOwner = 'default') {
    lane1BusyOwners.delete(owner)
    lane1Drained = lane1BusyOwners.size === 0
    emit()
    if (canAdmitLane2()) void seedLane2()
    scheduleMaybeAdmitLane3()
  },

  notifyLane1Busy(owner: WarmContextOwner = 'default') {
    lane1BusyOwners.add(owner)
    lane1Drained = false
    emit()
  },

  async enqueue(job: WarmJob): Promise<boolean> {
    if (job.lane >= 2 && !canAdmitLane2()) return false
    if (job.lane >= 3 && !canAdmitLane3()) return false
    return enqueue(job)
  },

  /** True while a jobKey is queued/in-flight in the scheduler (not local book-filter maps). */
  isJobPending(jobKey: string): boolean {
    return pendingKeys.has(jobKey)
  },

  async cancelJobsForLanguage(lang: string) {
    if (!lang) return
    const needle = lang.toLowerCase()
    await cancelWarmJobs({ languageCode: lang })
    // Cancelled queued/in-flight jobs never emit `done` — free matching keys
    // so the same jobKeys can be re-enqueued after a pane switch back.
    for (const [key, code] of [...pendingLangByKey]) {
      if (code.toLowerCase() !== needle) continue
      pendingKeys.delete(key)
      pendingLangByKey.delete(key)
      settleCoverage(key, 'noop')
    }
    emit()
  },

  subscribe(listener: StatsListener): () => void {
    listeners.add(listener)
    listener(buildWarmStats())
    return () => listeners.delete(listener)
  },

  getStats(): WarmSchedulerStats {
    return buildWarmStats()
  },

  async refreshQueueStats() {
    return getWarmQueueStats()
  },
}
