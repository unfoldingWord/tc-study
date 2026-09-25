/**
 * Book-wide Metaphor / TWL article quote warm helpers.
 * Lane-2 jobs must not force a wrong-owner lane1 drain, and off-chapter
 * enrichment paints must not flood React every chapter.
 */

import { LANE2_JOBS_PER_PASS } from '../warm/warmLanePolicy'
import type { WarmJob } from '../warm/warmTypes'

/** Coalesce off-focus enrichment setState — focus chapter paints immediately. */
export const BOOK_FILTER_ENRICHMENT_PAINT_EVERY = 5

/** True once chapter map or fallback rows exist (stable across object identity). */
export function bookFilterContentReady(
  byChapter: Record<string, unknown[]> | null | undefined,
  fallback: readonly unknown[] | null | undefined
): boolean {
  if (byChapter && Object.keys(byChapter).length > 0) return true
  return Boolean(fallback && fallback.length > 0)
}

/**
 * Admit up to LANE2_JOBS_PER_PASS planned jobs when lane1 is drained.
 * Does not call notifyLane1Drained — CombinedHelps owns that via owner `helps`.
 *
 * Focus-chapter quote/align jobs are admitted first. While scripture scroll is
 * unsettled, only those priority jobs may run so Metaphor filter chips are not
 * stuck behind rest-of-book warm and scroll gates.
 *
 * `enqueue` must return whether the scheduler actually accepted the job — silent
 * lane gates must not leave chips spinning on phantom in-flight work.
 */
export async function flushBookFilterWarmJobs(args: {
  planned: Map<string, WarmJob>
  lane1Drained: boolean
  scrollUnsettled: boolean
  enqueue: (job: WarmJob) => Promise<boolean | void>
  maxPerFlush?: number
  /** Prefer these chapters (usually the open BCV chapter). */
  priorityChapters?: readonly number[]
  chapterOfJob?: (jobKey: string) => number | null
}): Promise<number> {
  if (args.planned.size === 0) return 0
  if (!args.lane1Drained) return 0
  const max = args.maxPerFlush ?? LANE2_JOBS_PER_PASS
  const priority = new Set(
    (args.priorityChapters ?? []).filter((n) => Number.isFinite(n) && n > 0)
  )
  const chapterOf =
    args.chapterOfJob ??
    ((jobKey: string) => {
      const n = parseInt(jobKey.split(':').pop() ?? '', 10)
      return Number.isFinite(n) && n > 0 ? n : null
    })

  const ordered: WarmJob[] = []
  const rest: WarmJob[] = []
  for (const job of args.planned.values()) {
    const chapter = chapterOf(job.jobKey)
    if (chapter != null && priority.has(chapter)) ordered.push(job)
    else rest.push(job)
  }
  const queue = args.scrollUnsettled ? ordered : ordered.concat(rest)
  if (queue.length === 0) return 0

  let admitted = 0
  for (const job of queue) {
    if (admitted >= max) break
    const ok = await args.enqueue(job)
    if (ok === false) continue
    admitted += 1
  }
  return admitted
}

/**
 * Clear local in-flight markers for jobs the scheduler is no longer running.
 * Happens when warm-done was missed (effect remount) or enqueue was gated —
 * without this, chips stay on "Building quote" until a full refresh.
 * Returns chapters that should be re-hydrated from cache.
 */
export function reconcileStaleBookFilterWarmJobs(args: {
  pendingByChapter: Map<number, Set<string>>
  planned: Map<string, WarmJob>
  isSchedulerPending: (jobKey: string) => boolean
}): number[] {
  const chapters: number[] = []
  for (const [chapter, keys] of args.pendingByChapter) {
    let changed = false
    for (const jobKey of [...keys]) {
      if (args.isSchedulerPending(jobKey)) continue
      // Still planned → waiting for a successful flush, not in-flight yet.
      if (args.planned.has(jobKey)) {
        keys.delete(jobKey)
        changed = true
        continue
      }
      // Finished (or cancelled) without our done handler.
      keys.delete(jobKey)
      changed = true
    }
    if (keys.size === 0) args.pendingByChapter.delete(chapter)
    if (changed) chapters.push(chapter)
  }
  return chapters
}

/** Move focus-chapter jobs to the front of a planned map (insertion order). */
export function prioritizeBookFilterWarmJobs(
  planned: Map<string, WarmJob>,
  focusChapter: number,
  chapterOfJob: (jobKey: string) => number | null = (jobKey) => {
    const n = parseInt(jobKey.split(':').pop() ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
): void {
  if (planned.size === 0 || !(focusChapter > 0)) return
  const focus: WarmJob[] = []
  const rest: WarmJob[] = []
  for (const job of planned.values()) {
    const chapter = chapterOfJob(job.jobKey)
    if (chapter === focusChapter) focus.push(job)
    else rest.push(job)
  }
  if (focus.length === 0) return
  planned.clear()
  for (const job of focus.concat(rest)) planned.set(job.jobKey, job)
}

/** Whether an off-focus chapter paint should flush enrichment to React. */
export function shouldFlushBookFilterEnrichmentPaint(args: {
  chapter: number
  focusChapter: number
  chaptersSincePaint: number
  isLast: boolean
}): boolean {
  if (args.chapter === args.focusChapter) return true
  if (args.isLast) return true
  return args.chaptersSincePaint >= BOOK_FILTER_ENRICHMENT_PAINT_EVERY
}
