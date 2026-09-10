/**
 * Pure lane-2 / lane-3 job planners — no workers, no coverage I/O.
 * Scheduler applies coverage + enqueue; tests assert admission contents.
 */

import { alignRelationId, quoteRelationId } from '../helps/helpsAlignCache'
import { knownChapterCount } from '../nav/bookChapterCounts'
import {
  OBS_STORY_COUNT,
  nextCanonBooks,
  nextCurrentBookChapters,
  nextUnadmittedChapters,
} from './warmBookOrder'
import { prepareRelationId } from './warmCoverage'
import {
  classifyWarmResource,
  downloadPriorityOf,
  keysInLanguages,
  sharesCurrentMode,
  type ClassifiedWarmKey,
} from './warmResourceClass'
import type { WarmJob } from './warmTypes'

export type WarmPlanStamps = {
  helpsStampByKey?: Record<string, string>
  olKey?: string
  olStamp?: string
  targetStampByKey?: Record<string, string>
  textLanguageByTarget?: Record<string, string>
  olStampByKey?: Record<string, string>
}

export type WarmAdmitGroup = {
  relationId: string
  stamp: string
  jobs: WarmJob[]
}

export type Lane2PlanArgs = {
  bookId: string
  chapter: number
  lastChapter: number
  downloadedKeys: string[]
  visibleKeys: Iterable<string>
  sourceResourceId: string | null
  textLanguageCode: string
  helpsLanguageCode: string
  stamps?: WarmPlanStamps
  olKey: string
  olStamp: string
  /**
   * When set, quote/align is admitted only if `olKey` is in this set
   * (UHB/UGNT zip marked complete). Omitted = admit whenever olKey is set.
   */
  readyOlKeys?: Iterable<string>
  /** Already admitted / pending job keys — used with `budget` to resume. */
  admittedKeys?: Iterable<string>
  /** Max new jobs this pass. Omitted = admit the whole current-book plan. */
  budget?: number
}

export type Lane3PlanArgs = {
  bookId: string
  downloadedKeys: string[]
  textLanguageCode: string
  helpsLanguageCode: string
  stamps?: WarmPlanStamps
  articleIdsByKey?: Record<string, string[]>
  admittedKeys: Iterable<string>
  budget: number
  olStampForBook: (book: string) => { olKey: string; olStamp: string }
  /** Skip a relation that coverage already completed (stamp + unit count). */
  skipRelation?: (relationId: string, stamp: string, minUnitCount: number) => boolean
  /** When set, quote/align waits until this OL key is marked complete. */
  readyOlKeys?: Iterable<string>
}

function stampFor(item: ClassifiedWarmKey, stamps?: WarmPlanStamps): string {
  if (item.stampBag === 'helps') return stamps?.helpsStampByKey?.[item.key] ?? 'nostamp'
  return stamps?.targetStampByKey?.[item.key] ?? 'nostamp'
}

function classifiedInLangs(keys: string[], textLang: string, helpsLang: string): ClassifiedWarmKey[] {
  return keysInLanguages(keys, [textLang, helpsLang]).map(classifyWarmResource)
}

function scriptureKeysOf(items: ClassifiedWarmKey[]): string[] {
  return items.filter((i) => i.isScripture).map((i) => i.key)
}

/** Visible first, then other text-lang scripture, other helps-lang TN/TWL, then downloadPriority. */
export function sortLane2Keys(
  items: ClassifiedWarmKey[],
  args: { textLanguageCode: string; helpsLanguageCode: string; visibleKeys: Set<string> }
): ClassifiedWarmKey[] {
  const textLang = args.textLanguageCode.toLowerCase()
  const helpsLang = args.helpsLanguageCode.toLowerCase()
  const band = (item: ClassifiedWarmKey): number => {
    const visible = args.visibleKeys.has(item.key)
    if (visible) return 0
    if (item.isScripture && item.language === textLang) return 1
    if (item.quotesOl && item.language === helpsLang) return 2
    return 3
  }
  return [...items].sort((a, b) => {
    const d = band(a) - band(b)
    if (d !== 0) return d
    return downloadPriorityOf(a.typeId) - downloadPriorityOf(b.typeId)
  })
}

export function sortLane3Keys(items: ClassifiedWarmKey[]): ClassifiedWarmKey[] {
  return [...items].sort((a, b) => downloadPriorityOf(a.typeId) - downloadPriorityOf(b.typeId))
}

function prepareUnitJobs(args: {
  item: ClassifiedWarmKey
  bookId: string
  units: number[]
  lane: 2 | 3
}): WarmJob[] {
  const { item, bookId, units, lane } = args
  return units.map((unit) => ({
    jobKey: `prep:${item.typeId}:${item.key}:${bookId}:${unit}`,
    lane,
    kind: 'prepare-unit' as const,
    languageCode: item.language,
    resourceKey: item.key,
    bookId,
    typeId: item.typeId,
    unit,
    tier: 'both' as const,
  }))
}

function quoteJobs(args: {
  item: ClassifiedWarmKey
  bookId: string
  chapters: number[]
  lane: 2 | 3
  helpsStamp: string
  olKey: string
  olStamp: string
}): WarmJob[] {
  const { item, bookId, chapters, lane, helpsStamp, olKey, olStamp } = args
  const helpsType = item.helpsType
  if (!helpsType) return []
  return chapters.map((chapter) => ({
    jobKey: `quote:${item.key}:${bookId}:${chapter}`,
    lane,
    kind: 'quote-chapter' as const,
    languageCode: item.language,
    resourceKey: item.key,
    bookId,
    chapter,
    helpsStamp,
    olKey,
    olStamp,
    helpsType,
  }))
}

function alignJobs(args: {
  item: ClassifiedWarmKey
  targetKey: string
  bookId: string
  chapters: number[]
  lane: 2 | 3
  helpsStamp: string
  olKey: string
  olStamp: string
  targetStamp: string
  textLanguage?: string
}): WarmJob[] {
  const helpsType = args.item.helpsType
  if (!helpsType) return []
  return args.chapters.map((chapter) => ({
    jobKey: `align:${args.item.key}:${args.targetKey}:${args.bookId}:${chapter}`,
    lane: args.lane,
    kind: 'align-chapter' as const,
    languageCode: args.item.language,
    resourceKey: args.item.key,
    bookId: args.bookId,
    chapter,
    helpsStamp: args.helpsStamp,
    olKey: args.olKey,
    olStamp: args.olStamp,
    targetKey: args.targetKey,
    targetStamp: args.targetStamp,
    helpsType,
    textLanguage: args.textLanguage,
  }))
}

function pushGroup(out: WarmAdmitGroup[], relationId: string, stamp: string, jobs: WarmJob[]) {
  if (jobs.length === 0) return
  out.push({ relationId, stamp, jobs })
}

function olKeyIsReady(olKey: string, readyOlKeys?: Iterable<string>): boolean {
  if (!readyOlKeys) return true
  const set = readyOlKeys instanceof Set ? readyOlKeys : new Set(readyOlKeys)
  return set.has(olKey)
}

/** Lane 2 quote/align chapters: skip current chapter of visible TN/TWL (lane 1 owns it). */
export function lane2QuoteAlignChapters(args: {
  lastChapter: number
  currentChapter: number
  skipCurrent: boolean
}): number[] {
  const out: number[] = []
  for (let ch = 1; ch <= args.lastChapter; ch++) {
    if (args.skipCurrent && ch === args.currentChapter) continue
    out.push(ch)
  }
  return out
}

function obsStoryBookId(story: number): string {
  return String(story)
}

/**
 * Lane 2: rest of the current book for every downloaded key in the language set
 * that shares Bible vs OBS mode. Visible scripture prepare stays on the
 * dedicated prepare worker (not re-queued here).
 */
export function collectLane2Groups(args: Lane2PlanArgs): WarmAdmitGroup[] {
  const visibleKeys = args.visibleKeys instanceof Set ? args.visibleKeys : new Set(args.visibleKeys)
  const bookId = args.bookId.toLowerCase()
  const last =
    bookId === 'obs' ? Math.max(args.lastChapter, OBS_STORY_COUNT) : args.lastChapter
  const items = sortLane2Keys(
    classifiedInLangs(args.downloadedKeys, args.textLanguageCode, args.helpsLanguageCode).filter(
      (i) => sharesCurrentMode(i.typeId, bookId)
    ),
    {
      textLanguageCode: args.textLanguageCode,
      helpsLanguageCode: args.helpsLanguageCode,
      visibleKeys,
    }
  )
  const scriptures = scriptureKeysOf(items)
  const out: WarmAdmitGroup[] = []
  const admitted = new Set(args.admittedKeys ?? [])
  const budget = { left: args.budget ?? Number.POSITIVE_INFINITY }

  const takeChapters = (chapters: number[], jobKey: (ch: number) => string): number[] => {
    if (budget.left <= 0) return []
    const next: number[] = []
    for (const ch of chapters) {
      if (budget.left <= 0) break
      if (admitted.has(jobKey(ch))) continue
      next.push(ch)
      budget.left -= 1
    }
    return next
  }

  for (const item of items) {
    if (budget.left <= 0) break
    const visible = visibleKeys.has(item.key)
    const pStamp = stampFor(item, args.stamps)

    if (item.unitScope === 'canon' && item.hasPrepare) {
      // Open + adjacent stay on the interactive prepare worker. Rest of the
      // current book (including visible scripture) waits until lane 1 drains.
      const units = takeChapters(
        nextCurrentBookChapters({
          chapter: args.chapter,
          lastChapter: last,
          skipCurrentAndAdjacent: visible,
        }),
        (unit) => `prep:${item.typeId}:${item.key}:${bookId}:${unit}`
      )
      pushGroup(
        out,
        prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: bookId }),
        pStamp,
        prepareUnitJobs({ item, bookId, units, lane: 2 })
      )
    }

    if (item.unitScope === 'obs-book' && item.hasPrepare) {
      const units = takeChapters(
        nextCurrentBookChapters({
          chapter: args.chapter,
          lastChapter: last,
          skipCurrentAndAdjacent: visible,
        }),
        (unit) => `prep:${item.typeId}:${item.key}:obs:${unit}`
      )
      pushGroup(
        out,
        prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: 'obs' }),
        pStamp,
        prepareUnitJobs({ item, bookId: 'obs', units, lane: 2 })
      )
    }

    if (item.unitScope === 'obs-stories' && item.hasPrepare) {
      const stories = takeChapters(
        nextCurrentBookChapters({
          chapter: args.chapter,
          lastChapter: last,
          skipCurrentAndAdjacent: visible,
        }),
        (story) => `prep:${item.typeId}:${item.key}:${obsStoryBookId(story)}:${story}`
      )
      for (const story of stories) {
        const bid = obsStoryBookId(story)
        pushGroup(
          out,
          prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: bid }),
          pStamp,
          prepareUnitJobs({ item, bookId: bid, units: [story], lane: 2 })
        )
      }
    }

    if (item.quotesOl && item.helpsType && args.olKey && olKeyIsReady(args.olKey, args.readyOlKeys)) {
      const helpsStamp = args.stamps?.helpsStampByKey?.[item.key] ?? 'nostamp'
      const qStamp = `${helpsStamp}|${args.olStamp}`
      const planned = lane2QuoteAlignChapters({
        lastChapter: last,
        currentChapter: args.chapter,
        skipCurrent: visible,
      })
      const qChapters = takeChapters(planned, (ch) => `quote:${item.key}:${bookId}:${ch}`)
      pushGroup(
        out,
        quoteRelationId({ helpsKey: item.key, olKey: args.olKey, book: bookId }),
        qStamp,
        quoteJobs({
          item,
          bookId,
          chapters: qChapters,
          lane: 2,
          helpsStamp,
          olKey: args.olKey,
          olStamp: args.olStamp,
        })
      )

      const targets = scriptures.length
        ? scriptures
        : args.sourceResourceId
          ? [args.sourceResourceId]
          : []
      for (const sk of targets) {
        if (budget.left <= 0) break
        const targetStamp = args.stamps?.targetStampByKey?.[sk] ?? 'nostamp'
        const aChapters = takeChapters(
          planned,
          (ch) => `align:${item.key}:${sk}:${bookId}:${ch}`
        )
        pushGroup(
          out,
          alignRelationId({
            helpsKey: item.key,
            olKey: args.olKey,
            targetKey: sk,
            book: bookId,
          }),
          `${helpsStamp}|${args.olStamp}|${targetStamp}`,
          alignJobs({
            item,
            targetKey: sk,
            bookId,
            chapters: aChapters,
            lane: 2,
            helpsStamp,
            olKey: args.olKey,
            olStamp: args.olStamp,
            targetStamp,
            textLanguage: args.stamps?.textLanguageByTarget?.[sk],
          })
        )
      }
    }
  }

  return out
}

function admitCanonPrepare(
  out: WarmAdmitGroup[],
  item: ClassifiedWarmKey,
  book: string,
  admitted: Set<string>,
  budget: { left: number },
  stamps?: WarmPlanStamps,
  skipRelation?: Lane3PlanArgs['skipRelation']
): void {
  if (!item.hasPrepare || budget.left <= 0) return
  const maxCh = knownChapterCount(book)
  const pRel = prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book })
  const pStamp = stampFor(item, stamps)
  if (skipRelation?.(pRel, pStamp, maxCh)) return
  const jobKey = (ch: number) => `prep:${item.typeId}:${item.key}:${book}:${ch}`
  const chapters = nextUnadmittedChapters({
    book,
    admittedKeys: admitted,
    jobKey,
    budget: budget.left,
  })
  const jobs = prepareUnitJobs({ item, bookId: book, units: chapters, lane: 3 })
  for (const j of jobs) admitted.add(j.jobKey)
  budget.left -= jobs.length
  pushGroup(out, pRel, pStamp, jobs)
}

function admitQuoteAlign(
  out: WarmAdmitGroup[],
  item: ClassifiedWarmKey,
  book: string,
  scriptures: string[],
  admitted: Set<string>,
  budget: { left: number },
  olKey: string,
  olStamp: string,
  stamps?: WarmPlanStamps,
  skipRelation?: Lane3PlanArgs['skipRelation'],
  readyOlKeys?: Iterable<string>
): void {
  if (!item.quotesOl || !item.helpsType || !olKey || budget.left <= 0) return
  if (!olKeyIsReady(olKey, readyOlKeys)) return
  const helpsStamp = stamps?.helpsStampByKey?.[item.key] ?? 'nostamp'
  const maxCh = knownChapterCount(book)

  const qRel = quoteRelationId({ helpsKey: item.key, olKey, book })
  const qStamp = `${helpsStamp}|${olStamp}`
  if (!skipRelation?.(qRel, qStamp, maxCh)) {
    const qJobKey = (ch: number) => `quote:${item.key}:${book}:${ch}`
    const qChapters = nextUnadmittedChapters({
      book,
      admittedKeys: admitted,
      jobKey: qJobKey,
      budget: budget.left,
    })
    const qJobs = quoteJobs({
      item,
      bookId: book,
      chapters: qChapters,
      lane: 3,
      helpsStamp,
      olKey,
      olStamp,
    })
    for (const j of qJobs) admitted.add(j.jobKey)
    budget.left -= qJobs.length
    pushGroup(out, qRel, qStamp, qJobs)
  }

  for (const sk of scriptures) {
    if (budget.left <= 0) break
    const targetStamp = stamps?.targetStampByKey?.[sk] ?? 'nostamp'
    const aRel = alignRelationId({ helpsKey: item.key, olKey, targetKey: sk, book })
    const aStamp = `${helpsStamp}|${olStamp}|${targetStamp}`
    if (skipRelation?.(aRel, aStamp, maxCh)) continue
    const aJobKey = (ch: number) => `align:${item.key}:${sk}:${book}:${ch}`
    const aChapters = nextUnadmittedChapters({
      book,
      admittedKeys: admitted,
      jobKey: aJobKey,
      budget: budget.left,
    })
    const aJobs = alignJobs({
      item,
      targetKey: sk,
      bookId: book,
      chapters: aChapters,
      lane: 3,
      helpsStamp,
      olKey,
      olStamp,
      targetStamp,
      textLanguage: stamps?.textLanguageByTarget?.[sk],
    })
    for (const j of aJobs) admitted.add(j.jobKey)
    budget.left -= aJobs.length
    pushGroup(out, aRel, aStamp, aJobs)
  }
}

function admitObsStories(
  out: WarmAdmitGroup[],
  item: ClassifiedWarmKey,
  admitted: Set<string>,
  budget: { left: number },
  stamps?: WarmPlanStamps,
  skipRelation?: Lane3PlanArgs['skipRelation']
): void {
  if (!item.hasPrepare || budget.left <= 0) return
  const stories = nextUnadmittedChapters({
    book: 'obs',
    last: OBS_STORY_COUNT,
    admittedKeys: admitted,
    jobKey: (story) => `prep:${item.typeId}:${item.key}:${obsStoryBookId(story)}:${story}`,
    budget: budget.left,
  })
  const pStamp = stampFor(item, stamps)
  for (const story of stories) {
    const bid = obsStoryBookId(story)
    const pRel = prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: bid })
    if (skipRelation?.(pRel, pStamp, 1)) continue
    const jobs = prepareUnitJobs({ item, bookId: bid, units: [story], lane: 3 })
    for (const j of jobs) admitted.add(j.jobKey)
    budget.left -= jobs.length
    pushGroup(out, pRel, pStamp, jobs)
  }
}

function admitObsBook(
  out: WarmAdmitGroup[],
  item: ClassifiedWarmKey,
  admitted: Set<string>,
  budget: { left: number },
  stamps?: WarmPlanStamps,
  skipRelation?: Lane3PlanArgs['skipRelation']
): void {
  if (!item.hasPrepare || budget.left <= 0) return
  const pRel = prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: 'obs' })
  const pStamp = stampFor(item, stamps)
  if (skipRelation?.(pRel, pStamp, OBS_STORY_COUNT)) return
  const jobKey = (ch: number) => `prep:${item.typeId}:${item.key}:obs:${ch}`
  const units = nextUnadmittedChapters({
    book: 'obs',
    last: OBS_STORY_COUNT,
    admittedKeys: admitted,
    jobKey,
    budget: budget.left,
  })
  const jobs = prepareUnitJobs({ item, bookId: 'obs', units, lane: 3 })
  for (const j of jobs) admitted.add(j.jobKey)
  budget.left -= jobs.length
  pushGroup(out, pRel, pStamp, jobs)
}

function admitArticles(
  out: WarmAdmitGroup[],
  item: ClassifiedWarmKey,
  articleIds: string[],
  admitted: Set<string>,
  budget: { left: number },
  stamps?: WarmPlanStamps,
  skipRelation?: Lane3PlanArgs['skipRelation']
): void {
  if (!item.hasPrepare || articleIds.length === 0 || budget.left <= 0) return
  const pRel = prepareRelationId({ typeId: item.typeId, resourceKey: item.key, book: 'articles' })
  const pStamp = stampFor(item, stamps)
  if (skipRelation?.(pRel, pStamp, articleIds.length)) return
  const jobs: WarmJob[] = []
  for (const unit of articleIds) {
    if (budget.left <= 0) break
    const jobKey = `prep-article:${item.typeId}:${item.key}:${unit}`
    if (admitted.has(jobKey)) continue
    admitted.add(jobKey)
    budget.left -= 1
    jobs.push({
      jobKey,
      lane: 3,
      kind: 'prepare-article',
      languageCode: item.language,
      resourceKey: item.key,
      bookId: unit,
      typeId: item.typeId,
      unit,
      tier: 'both',
    })
  }
  pushGroup(out, pRel, pStamp, jobs)
}

/**
 * Lane 3: every downloaded key in {textLang, helpsLang} — full canon,
 * OBS stories, and article units. Throttle via `budget`.
 */
export function collectLane3Groups(args: Lane3PlanArgs): WarmAdmitGroup[] {
  const items = sortLane3Keys(
    classifiedInLangs(args.downloadedKeys, args.textLanguageCode, args.helpsLanguageCode)
  )
  if (items.length === 0) return []

  const scriptures = scriptureKeysOf(items)
  const canonItems = items.filter((i) => i.unitScope === 'canon')
  const quoteItems = items.filter((i) => i.quotesOl)
  const obsStoryItems = items.filter((i) => i.unitScope === 'obs-stories')
  const obsBookItems = items.filter((i) => i.unitScope === 'obs-book')
  const articleItems = items.filter((i) => i.unitScope === 'articles')

  const admitted = new Set(args.admittedKeys)
  const budget = { left: args.budget }
  const out: WarmAdmitGroup[] = []
  const books = nextCanonBooks(args.bookId)

  for (const book of books) {
    if (budget.left <= 0) break
    const { olKey, olStamp } = args.olStampForBook(book)
    for (const item of canonItems) {
      if (budget.left <= 0) break
      admitCanonPrepare(out, item, book, admitted, budget, args.stamps, args.skipRelation)
    }
    if (olKey) {
      for (const item of quoteItems) {
        if (budget.left <= 0) break
        admitQuoteAlign(
          out,
          item,
          book,
          scriptures,
          admitted,
          budget,
          olKey,
          olStamp,
          args.stamps,
          args.skipRelation,
          args.readyOlKeys
        )
      }
    }
  }

  for (const item of obsStoryItems) {
    if (budget.left <= 0) break
    admitObsStories(out, item, admitted, budget, args.stamps, args.skipRelation)
  }
  for (const item of obsBookItems) {
    if (budget.left <= 0) break
    admitObsBook(out, item, admitted, budget, args.stamps, args.skipRelation)
  }
  for (const item of articleItems) {
    if (budget.left <= 0) break
    admitArticles(
      out,
      item,
      args.articleIdsByKey?.[item.key] ?? [],
      admitted,
      budget,
      args.stamps,
      args.skipRelation
    )
  }

  return out
}

export function flattenGroups(groups: WarmAdmitGroup[]): WarmJob[] {
  return groups.flatMap((g) => g.jobs)
}
