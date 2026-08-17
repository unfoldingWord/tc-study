import { parseLinkChapterVerse } from '../../../features/helps/quoteTokens'
import {
  isNotesResourceType,
  isWordsLinksResourceType,
} from '../../../utils/normalizeResourceTypeId'

export function primaryLangCode(code: string | undefined | null): string {
  if (!code) return ''
  return String(code).trim().split(/[-_/]/)[0]!.toLowerCase()
}

/** Language segment from `owner/lang/id` resource keys (handles `lang_region`). */
export function langFromResourceKey(key: string | undefined): string {
  if (!key || !key.includes('/')) return ''
  const parts = key.split('/')
  return primaryLangCode(parts[1])
}

export function isNotesType(
  t: string | undefined,
  scope: 'scripture' | 'obs' = 'scripture'
): boolean {
  return isNotesResourceType(t, scope)
}

export function isWordsLinksType(
  t: string | undefined,
  scope: 'scripture' | 'obs' = 'scripture'
): boolean {
  return isWordsLinksResourceType(t, scope)
}

export function refSortParts(ref: string): { chapter: number; verse: number } {
  const { chapter, verse } = parseLinkChapterVerse(ref)
  return { chapter, verse }
}

/** OBS CombinedHelps card → verse-filter (story:frame as chapter:verse). */
export function helpsCardVerseFilter(reference: string): { chapter: number; verse: number } {
  return parseLinkChapterVerse(reference)
}
