import type { TranslatorSection } from '@bt-synergy/usfm-processor'
import type { BCVReference } from '../../contexts'
import {
  isObsFrameSelected,
  sortObsRange,
  type ObsRangePos,
} from './obsRangeUtils'
import { isVerseSelected, type VerseEntry } from './verseSelectionUtils'

export function nextVerseClickSelection(
  verseKey: string,
  startVerse: string | null,
  endVerse: string | null
): { startVerse: string | null; endVerse: string | null } {
  if (!startVerse) return { startVerse: verseKey, endVerse: null }
  if (verseKey === startVerse && !endVerse) return { startVerse: null, endVerse: null }
  if (isVerseSelected(verseKey, startVerse, endVerse)) {
    return { startVerse: verseKey, endVerse: null }
  }
  return { startVerse, endVerse: verseKey }
}

export function chapterClickSelection(chapterVerses: VerseEntry[]): {
  startVerse: string
  endVerse: string
} | null {
  if (chapterVerses.length === 0) return null
  return {
    startVerse: chapterVerses[0].key,
    endVerse: chapterVerses[chapterVerses.length - 1].key,
  }
}

export function buildVerseApplyRef(
  selectedBook: string,
  startVerse: string,
  endVerse: string | null
): BCVReference {
  const [startC, startV] = startVerse.split(':').map(Number)
  const newRef: BCVReference = {
    book: selectedBook,
    chapter: startC,
    verse: startV,
  }
  if (endVerse) {
    const [endC, endV] = endVerse.split(':').map(Number)
    newRef.endChapter = endC
    newRef.endVerse = endV
  }
  return newRef
}

export function buildSectionApplyRef(
  selectedBook: string,
  section: TranslatorSection
): BCVReference {
  return {
    book: selectedBook,
    chapter: section.start.chapter,
    verse: section.start.verse,
    endChapter: section.end.chapter !== section.start.chapter ? section.end.chapter : undefined,
    endVerse: section.end.verse,
  }
}

export function nextObsRangeClick(
  story: number,
  frame: number,
  obsRangeStart: ObsRangePos | null,
  obsRangeEnd: ObsRangePos | null
): { start: ObsRangePos | null; end: ObsRangePos | null } {
  if (!obsRangeStart) return { start: { story, frame }, end: null }
  if (obsRangeStart.story === story && obsRangeStart.frame === frame && !obsRangeEnd) {
    return { start: null, end: null }
  }
  if (isObsFrameSelected(story, frame, obsRangeStart, obsRangeEnd)) {
    return { start: { story, frame }, end: null }
  }
  return { start: obsRangeStart, end: { story, frame } }
}

export function buildObsRangeApplyRef(
  obsRangeStart: ObsRangePos,
  obsRangeEnd: ObsRangePos | null
): BCVReference {
  const end = obsRangeEnd ?? obsRangeStart
  const [s, e] = sortObsRange(obsRangeStart, end)
  return {
    book: 'obs',
    chapter: s.story,
    verse: s.frame,
    endChapter: e.story !== s.story ? e.story : undefined,
    endVerse: e.frame !== s.frame || e.story !== s.story ? e.frame : undefined,
  }
}

export function nextObsStoryHeaderSelection(
  storyNum: number,
  frameCount: number,
  obsRangeStart: ObsRangePos | null,
  obsRangeEnd: ObsRangePos | null
): { start: ObsRangePos; end: ObsRangePos | null } {
  const start = { story: storyNum, frame: 1 }
  const end = { story: storyNum, frame: frameCount }
  if (!obsRangeStart) return { start, end }
  if (
    isObsFrameSelected(storyNum, 1, obsRangeStart, obsRangeEnd) &&
    isObsFrameSelected(storyNum, frameCount, obsRangeStart, obsRangeEnd)
  ) {
    return { start, end: null }
  }
  return { start: obsRangeStart, end }
}

export function initVerseRangeFromRef(currentRef: BCVReference): {
  startVerse: string | null
  endVerse: string | null
} {
  const startVerse =
    currentRef.book !== 'obs' && currentRef.chapter && currentRef.verse
      ? `${currentRef.chapter}:${currentRef.verse}`
      : null
  const endVerse =
    currentRef.book !== 'obs' && currentRef.endChapter && currentRef.endVerse
      ? `${currentRef.endChapter}:${currentRef.endVerse}`
      : currentRef.book !== 'obs' && currentRef.endVerse && !currentRef.endChapter
        ? `${currentRef.chapter}:${currentRef.endVerse}`
        : null
  return { startVerse, endVerse }
}

export function obsStoryIdsFromIngredients(
  ingredients: Array<{ identifier: string }> | undefined
): number[] {
  const fallback = () => Array.from({ length: 50 }, (_, i) => i + 1)
  if (!ingredients?.length) return fallback()
  const nums = ingredients
    .map((i) => parseInt(i.identifier, 10))
    .filter((n) => !Number.isNaN(n) && n > 0)
  if (nums.length === 0) return fallback()
  return [...new Set(nums)].sort((a, b) => a - b)
}

export function findLoadedResourceTitle(
  loadedResources: Record<string, { resourceKey?: string; key?: string; title?: string } | undefined>,
  catalogKey: string | null
): string | null {
  if (!catalogKey) return null
  const res = Object.values(loadedResources).find(
    (r) => r?.resourceKey === catalogKey || r?.key === catalogKey
  )
  return res?.title ?? null
}
