/**
 * Parse chapter:verse from TN/TWL reference strings (e.g. "3:5", "3:1-2", "1:intro").
 * Complex refs (`5:1,3,8,12`, `5:2-3`) collapse to the first verse for sort / navigate.
 */
import { firstHelpsVerse } from './parseHelpsReference'

export function parseLinkChapterVerse(reference: string): { chapter: number; verse: number } {
  return firstHelpsVerse(reference)
}
