import { parseLinkChapterVerse } from '../../../features/helps/quoteTokens'
import { isObsCombinedHelpsId } from '../../../features/helps/combinedHelpsIds'
import {
  isNotesResourceType,
  isWordsLinksResourceType,
  normalizeResourceTypeId,
} from '../../../utils/normalizeResourceTypeId'
import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'

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

/**
 * OBS vs scripture CombinedHelps — persist id / type, not only appliesToScope.
 * Workspace/AppStore projections can drop appliesToScope after the panel-entry refactor.
 */
export function resolveHelpsViewerScope(input: {
  resourceId?: string | null
  resourceKey?: string | null
  type?: string | null
  appliesToScope?: string | null
}): 'scripture' | 'obs' {
  if (isObsCombinedHelpsId(input.resourceId) || isObsCombinedHelpsId(input.resourceKey)) {
    return 'obs'
  }
  if (normalizeResourceTypeId(input.type) === RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS) {
    return 'obs'
  }
  if (input.appliesToScope === 'obs') return 'obs'
  return 'scripture'
}

/** CombinedHelps TN/TWL card click → obs-frame-highlight payload. */
export function obsFrameHighlightFromHelpsRow(row: {
  id: string
  reference: string
  quote?: string | null
  occurrence?: string | number | null
  kind: 'tn' | 'twl'
}): {
  storyNumber: number
  frameNumber: number
  quote: string
  occurrence: number
  rowId: string
  kind: 'tn' | 'twl'
} | null {
  const quote = row.quote?.trim()
  if (!quote) return null
  const { chapter, verse } = helpsCardVerseFilter(row.reference)
  const occRaw = Number.parseInt(String(row.occurrence ?? '1'), 10)
  return {
    storyNumber: chapter,
    frameNumber: verse,
    quote,
    occurrence: Number.isFinite(occRaw) ? occRaw : 1,
    rowId: row.id,
    kind: row.kind,
  }
}
