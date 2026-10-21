import { chapterWindowAround } from '../../../../features/nav/chapterInfiniteScroll'

/**
 * Chapters whose prepared tiers should stay warm: the window around the nav
 * chapter, every painted chapter, and one neighbor beyond each painted edge
 * (the chapter an edge reveal would bring in next). Insertion order, no repeats.
 */
export function chaptersToWarm(args: {
  navChapter: number
  lastChapter: number
  painted: readonly number[]
}): number[] {
  const warm = new Set<number>(chapterWindowAround(args.navChapter, args.lastChapter))
  for (const chapter of args.painted) warm.add(chapter)
  if (args.painted.length > 0) {
    const lo = Math.min(...args.painted)
    const hi = Math.max(...args.painted)
    if (lo > 1) warm.add(lo - 1)
    if (hi < args.lastChapter) warm.add(hi + 1)
  }
  return [...warm]
}
