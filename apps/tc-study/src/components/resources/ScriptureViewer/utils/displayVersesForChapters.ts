import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import type { DisplayUsjVerse } from '../types'
import { getChapterDisplayVerses } from './chapterLayoutCache'

export function displayVersesForChapters(
  viewModel: UsjScriptureViewModel,
  chapterNumbers: readonly number[]
): DisplayUsjVerse[] {
  const verses: DisplayUsjVerse[] = []
  for (const chapter of chapterNumbers) {
    verses.push(...getChapterDisplayVerses(viewModel, chapter))
  }
  return verses
}
