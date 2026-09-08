/**
 * Main-thread warm scheduler singleton — survives React remounts.
 * Three lanes; lane 3 fills the union of both on-screen languages.
 *
 * Multiple owners (helps / scripture) merge complementary visible context
 * so scripture+scripture and helps layouts both feed the same queue.
 */

import { getDownloadPriority } from '../../config/loaderConfig'
import { alignRelationId, quoteRelationId } from '../helps/helpsAlignCache'
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { knownChapterCount } from '../nav/bookChapterCounts'
import {
  cancelWarmJobs,
  enqueueWarmJob,
  getWarmQueueStats,
  isDedicatedWarmWorkerActive,
  subscribeWarmDone,
} from '../../workers/warmClient'
import { subscribePrepareWarmDone } from '../../workers/prepareClient'
import {
  isRelationCovered,
  markRelationCovered,
  prepareRelationId,
} from './warmCoverage'
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
  }
  /** Downloaded catalog keys for lane 3 (owner/lang/id). */
  downloadedKeys?: string[]
  /** Bumps when a download session finishes so no-op admits can retry. */
  downloadGeneration?: number
  cacheAdapter?: WarmGcCacheAdapter | null
}

type StatsListener = (stats: WarmSchedulerStats) => void

export type WarmSchedulerStats = {
  lane1Drained: boolean
  scrollUnsettled: boolean
  pendingJobKeys: number
  dedicatedWorker: boolean
  context: WarmVisibleContext | null
}

type CoverageBatch = {
  stamp: string
  succeeded: number
  remaining: Set<string>
}

const NT_ORDER = [
  'mat','mrk','luk','jhn','act','rom','1co','2co','gal','eph','php','col',
  '1th','2th','1ti','2ti','tit','phm','heb','jas','1pe','2pe','1jn','2jn','3jn','jud','rev',
]

const HELPS_CATALOG_IDS = new Set([
  'tn', 'twl', 'tq', 'tw', 'ta', 'tn-obs', 'twl-obs', 'tq-obs', 'obs',
])

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
const admittedLane3Keys = new Set<string>()
let admittedLane3Seed = ''
let gcScheduled = false

function emit() {
  const stats: WarmSchedulerStats = {
    lane1Drained,
    scrollUnsettled: context?.scrollUnsettled ?? false,
    pendingJobKeys: pendingKeys.size,
    dedicatedWorker: isDedicatedWarmWorkerActive(),
    context,
  }
  for (const l of listeners) l(stats)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __warmDebug?: WarmSchedulerStats }).__warmDebug = stats
  }
}

function languageFromKey(key: string): string {
  return key.split('/')[1]?.split('_')[0]?.toLowerCase() ?? ''
}

function catalogIdFromKey(key: string): string {
  return key.split('/')[2]?.split('#')[0] ?? ''
}

function downloadedKeysHash(keys: string[] | undefined): string {
  return (keys ?? []).slice().sort().join(',')
}

function nextBooks(fromBook: string): string[] {
  const cur = fromBook.toLowerCase()
  const idx = NT_ORDER.indexOf(cur)
  if (idx < 0) return [cur]
  return [...NT_ORDER.slice(idx), ...NT_ORDER.slice(0, idx)]
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
    if (c.stamps?.olKey) olKey = c.stamps.olKey
    if (c.stamps?.olStamp) olStamp = c.stamps.olStamp
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
    },
    downloadedKeys: [...downloaded],
    downloadGeneration: Math.max(0, ...list.map((c) => c.downloadGeneration ?? 0)),
    cacheAdapter,
  }
}

function registerCoverageJobs(relationId: string, stamp: string, jobKeys: string[]): void {
  if (jobKeys.length === 0) return
  let batch = coverageBatches.get(relationId)
  if (!batch || batch.stamp !== stamp) {
    batch = { stamp, succeeded: 0, remaining: new Set() }
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
  batch.remaining.delete(jobKey)
  if (outcome === 'finished' || outcome === 'cached') batch.succeeded += 1
  if (batch.remaining.size > 0) return
  coverageBatches.delete(relationId)
  const cache = context?.cacheAdapter
  if (!cache || batch.succeeded < 1) return
  void markRelationCovered(cache, relationId, batch.stamp, batch.succeeded)
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
  emit()
  void maybeAdmitLane3()
}

// Subscribe once at module load.
subscribeWarmDone((msg) => onJobDone(msg.jobKey, msg.outcome ?? 'noop'))
subscribePrepareWarmDone((msg) => onJobDone(msg.jobKey, msg.outcome ?? 'noop'))

function canAdmitLane2(): boolean {
  return Boolean(context && lane1Drained && !context.scrollUnsettled)
}

function canAdmitLane3(): boolean {
  if (!canAdmitLane2()) return false
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
  return true
}

function seedKeyFor(ctx: WarmVisibleContext): string {
  return [
    ctx.bookId,
    ctx.visibleResources.map((r) => r.resourceKey).join(','),
    ctx.sourceResourceId ?? '',
    downloadedKeysHash(ctx.downloadedKeys),
    String(ctx.downloadGeneration ?? 0),
  ].join('|')
}

function resetLane3AdmitsIfNeeded(ctx: WarmVisibleContext): void {
  const seed = seedKeyFor(ctx)
  if (seed === admittedLane3Seed) return
  admittedLane3Seed = seed
  admittedLane3Keys.clear()
}

async function seedLane2(): Promise<void> {
  if (!context || !canAdmitLane2()) return
  const { bookId, chapter, lastChapter, visibleResources, sourceResourceId, stamps } = context
  const seedKey = seedKeyFor(context)
  if (seededBookKey === seedKey) return
  seededBookKey = seedKey

  const ol = resolveOriginalLanguageKey(bookId)
  const olKey = stamps?.olKey ?? ol?.resourceKey ?? ''
  const olStamp = stamps?.olStamp ?? 'nostamp'
  const bookLast = lastChapter > 0 ? lastChapter : knownChapterCount(bookId)

  for (const res of visibleResources) {
    const lang = languageFromKey(res.resourceKey)
    // Scripture rest-of-book is already enqueued by enqueueScriptureBookPriority.
    if (res.role !== 'scripture') {
      const pRel = prepareRelationId({
        typeId: res.typeId,
        resourceKey: res.resourceKey,
        book: bookId,
      })
      const pStamp =
        (res.role === 'helps'
          ? stamps?.helpsStampByKey[res.resourceKey]
          : stamps?.targetStampByKey[res.resourceKey]) ?? 'nostamp'
      const prepJobs: WarmJob[] = []
      for (let ch = 1; ch <= bookLast; ch++) {
        if (ch === chapter || ch === chapter - 1 || ch === chapter + 1) continue
        prepJobs.push({
          jobKey: `prep:${res.typeId}:${res.resourceKey}:${bookId}:${ch}`,
          lane: 2,
          kind: 'prepare-unit',
          languageCode: lang,
          resourceKey: res.resourceKey,
          bookId,
          typeId: res.typeId,
          unit: ch,
          tier: 'both',
        })
      }
      await enqueueCoveredGroup(pRel, pStamp, prepJobs)
    }

    if (res.role === 'helps' && res.helpsType && olKey) {
      const helpsStamp = stamps?.helpsStampByKey[res.resourceKey] ?? 'nostamp'
      const qRel = quoteRelationId({ helpsKey: res.resourceKey, olKey, book: bookId })
      const qStamp = `${helpsStamp}|${olStamp}`
      const quoteJobs: WarmJob[] = []
      for (let ch = 1; ch <= bookLast; ch++) {
        quoteJobs.push({
          jobKey: `quote:${res.resourceKey}:${bookId}:${ch}`,
          lane: 2,
          kind: 'quote-chapter',
          languageCode: lang,
          resourceKey: res.resourceKey,
          bookId,
          chapter: ch,
          helpsStamp,
          olKey,
          olStamp,
          helpsType: res.helpsType,
        })
      }
      await enqueueCoveredGroup(qRel, qStamp, quoteJobs)

      if (sourceResourceId) {
        const targetStamp = stamps?.targetStampByKey[sourceResourceId] ?? 'nostamp'
        const aRel = alignRelationId({
          helpsKey: res.resourceKey,
          olKey,
          targetKey: sourceResourceId,
          book: bookId,
        })
        const aStamp = `${helpsStamp}|${olStamp}|${targetStamp}`
        const alignJobs: WarmJob[] = []
        for (let ch = 1; ch <= bookLast; ch++) {
          alignJobs.push({
            jobKey: `align:${res.resourceKey}:${sourceResourceId}:${bookId}:${ch}`,
            lane: 2,
            kind: 'align-chapter',
            languageCode: lang,
            resourceKey: res.resourceKey,
            bookId,
            chapter: ch,
            helpsStamp,
            olKey,
            olStamp,
            targetKey: sourceResourceId,
            targetStamp,
            helpsType: res.helpsType,
            textLanguage: stamps?.textLanguageByTarget?.[sourceResourceId],
          })
        }
        await enqueueCoveredGroup(aRel, aStamp, alignJobs)
      }
    }
  }
}

async function maybeAdmitLane3(): Promise<void> {
  if (!context || !canAdmitLane3()) return
  const {
    bookId,
    lastChapter,
    textLanguageCode,
    helpsLanguageCode,
    downloadedKeys = [],
    stamps,
    cacheAdapter,
  } = context

  const langs = new Set(
    [textLanguageCode, helpsLanguageCode].map((l) => l.toLowerCase()).filter(Boolean)
  )
  const inLang = downloadedKeys.filter((k) => langs.has(languageFromKey(k)))
  if (inLang.length === 0) return
  resetLane3AdmitsIfNeeded(context)

  const helpsOnly = inLang.filter((k) => {
    const id = catalogIdFromKey(k)
    return id === 'tn' || id === 'twl'
  })
  const scriptureOnly = inLang.filter((k) => {
    const id = catalogIdFromKey(k)
    return !HELPS_CATALOG_IDS.has(id)
  })

  const books = nextBooks(bookId)
  const ol = resolveOriginalLanguageKey(bookId)
  const olKey = stamps?.olKey ?? ol?.resourceKey ?? ''
  const olStamp = stamps?.olStamp ?? 'nostamp'
  const currentLast = lastChapter > 0 ? lastChapter : knownChapterCount(bookId)

  const priorityOf = (key: string) => {
    const id = catalogIdFromKey(key)
    if (id === 'tn') return getDownloadPriority('notes')
    if (id === 'twl') return getDownloadPriority('words-links')
    return getDownloadPriority('scripture')
  }
  const sortedScripture = [...scriptureOnly].sort((a, b) => priorityOf(a) - priorityOf(b))
  const sortedHelps = [...helpsOnly].sort((a, b) => priorityOf(a) - priorityOf(b))

  for (const book of books.slice(0, 5)) {
    const maxCh = book === bookId.toLowerCase() ? currentLast : 3

    for (const sk of sortedScripture) {
      const lang = languageFromKey(sk)
      const pRel = prepareRelationId({ typeId: 'scripture', resourceKey: sk, book })
      const pStamp = stamps?.targetStampByKey[sk] ?? 'nostamp'
      if (cacheAdapter && (await isRelationCovered(cacheAdapter, pRel, pStamp, maxCh))) {
        continue
      }
      const prepJobs: WarmJob[] = []
      for (let ch = 1; ch <= maxCh; ch++) {
        const jobKey = `prep:scripture:${sk}:${book}:${ch}`
        if (pendingKeys.has(jobKey) || admittedLane3Keys.has(jobKey)) continue
        admittedLane3Keys.add(jobKey)
        prepJobs.push({
          jobKey,
          lane: 3,
          kind: 'prepare-unit',
          languageCode: lang,
          resourceKey: sk,
          bookId: book,
          typeId: 'scripture',
          unit: ch,
          tier: 'both',
        })
      }
      await enqueueCoveredGroup(pRel, pStamp, prepJobs)
    }

    if (!olKey) continue
    for (const hk of sortedHelps) {
      const lang = languageFromKey(hk)
      const helpsStamp = stamps?.helpsStampByKey[hk] ?? 'nostamp'
      const helpsType = (catalogIdFromKey(hk) === 'twl'
        ? 'words-links'
        : 'notes') as 'notes' | 'words-links'
      const qRel = quoteRelationId({ helpsKey: hk, olKey, book })
      const qStamp = `${helpsStamp}|${olStamp}`
      if (!(cacheAdapter && (await isRelationCovered(cacheAdapter, qRel, qStamp, maxCh)))) {
        const quoteJobs: WarmJob[] = []
        for (let ch = 1; ch <= maxCh; ch++) {
          const jobKey = `quote:${hk}:${book}:${ch}`
          if (pendingKeys.has(jobKey) || admittedLane3Keys.has(jobKey)) continue
          admittedLane3Keys.add(jobKey)
          quoteJobs.push({
            jobKey,
            lane: 3,
            kind: 'quote-chapter',
            languageCode: lang,
            resourceKey: hk,
            bookId: book,
            chapter: ch,
            helpsStamp,
            olKey,
            olStamp,
            helpsType,
          })
        }
        await enqueueCoveredGroup(qRel, qStamp, quoteJobs)
      }

      for (const sk of sortedScripture) {
        const targetStamp = stamps?.targetStampByKey[sk] ?? 'nostamp'
        const aRel = alignRelationId({
          helpsKey: hk,
          olKey,
          targetKey: sk,
          book,
        })
        const aStamp = `${helpsStamp}|${olStamp}|${targetStamp}`
        if (cacheAdapter && (await isRelationCovered(cacheAdapter, aRel, aStamp, maxCh))) {
          continue
        }
        const alignJobs: WarmJob[] = []
        for (let ch = 1; ch <= maxCh; ch++) {
          const jobKey = `align:${hk}:${sk}:${book}:${ch}`
          if (pendingKeys.has(jobKey) || admittedLane3Keys.has(jobKey)) continue
          admittedLane3Keys.add(jobKey)
          alignJobs.push({
            jobKey,
            lane: 3,
            kind: 'align-chapter',
            languageCode: lang,
            resourceKey: hk,
            bookId: book,
            chapter: ch,
            helpsStamp,
            olKey,
            olStamp,
            targetKey: sk,
            targetStamp,
            helpsType,
            textLanguage: stamps?.textLanguageByTarget?.[sk],
          })
        }
        await enqueueCoveredGroup(aRel, aStamp, alignJobs)
      }
    }
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
    if (langChanged(prev.textLanguageCode, context.textLanguageCode)) {
      void warmScheduler.cancelJobsForLanguage(prev.textLanguageCode)
    }
    if (langChanged(prev.helpsLanguageCode, context.helpsLanguageCode)) {
      void warmScheduler.cancelJobsForLanguage(prev.helpsLanguageCode)
    }
    if (prev.bookId !== context.bookId) {
      seededBookKey = ''
    }
  }
  emit()
  if (canAdmitLane2()) void seedLane2()
  if (canAdmitLane3()) void maybeAdmitLane3()
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
    if (canAdmitLane3()) void maybeAdmitLane3()
  },

  notifyLane1Busy(owner: WarmContextOwner = 'default') {
    lane1BusyOwners.add(owner)
    lane1Drained = false
    emit()
  },

  async enqueue(job: WarmJob) {
    if (job.lane >= 2 && !canAdmitLane2()) return
    if (job.lane >= 3 && !canAdmitLane3()) return
    await enqueue(job)
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
    listener({
      lane1Drained,
      scrollUnsettled: context?.scrollUnsettled ?? false,
      pendingJobKeys: pendingKeys.size,
      dedicatedWorker: isDedicatedWarmWorkerActive(),
      context,
    })
    return () => listeners.delete(listener)
  },

  getStats(): WarmSchedulerStats {
    return {
      lane1Drained,
      scrollUnsettled: context?.scrollUnsettled ?? false,
      pendingJobKeys: pendingKeys.size,
      dedicatedWorker: isDedicatedWarmWorkerActive(),
      context,
    }
  },

  async refreshQueueStats() {
    return getWarmQueueStats()
  },
}
