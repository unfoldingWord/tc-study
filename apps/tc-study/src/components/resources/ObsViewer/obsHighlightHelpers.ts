import type { ActiveHl } from './types'
import type { ObsFrameQuoteEntry } from '../../../signals/studioSignals'

/** Types (by resource type string or key suffix) that broadcast obs-frame-quotes. */
export const OBS_QUOTE_CAPABLE_TYPES = new Set(['obs-notes', 'obs-words-links'])

export const QUOTE_BUTTON_ACTIVE_CLASS =
  'bg-highlight underline decoration-dotted decoration-underline decoration-1 underline-offset-2 rounded-sm'

export const QUOTE_BUTTON_IDLE_CLASS =
  'underline decoration-dotted decoration-underline decoration-1 underline-offset-2 hover:bg-muted rounded-sm'

/** Frame that owns the current verse-filter — same wash as CombinedHelps selected cards. */
export const OBS_FRAME_ACTIVE_CLASS = 'bg-highlight/15 border-border'

export const OBS_FRAME_IDLE_CLASS = 'border-transparent'

export type ObsVerseFilterRef = { chapter: number; verse?: number }

/** Frame click → CombinedHelps verse-filter (story:frame). */
export function obsFrameVerseFilter(
  storyNumber: number,
  frameNumber: number
): { chapter: number; verse: number } {
  return { chapter: storyNumber, verse: frameNumber }
}

/** True when `story.frame` is the current CombinedHelps verse-filter (e.g. 1:7). */
export function isObsFrameFilterActive(
  filter: ObsVerseFilterRef | null,
  storyNum: number,
  frameNum: number
): boolean {
  if (!filter || filter.verse === undefined) return false
  return filter.chapter === storyNum && filter.verse === frameNum
}

export function obsFrameChromeClass(
  filter: ObsVerseFilterRef | null,
  storyNum: number,
  frameNum: number
): string {
  return isObsFrameFilterActive(filter, storyNum, frameNum)
    ? OBS_FRAME_ACTIVE_CLASS
    : OBS_FRAME_IDLE_CLASS
}

export function sortedSourceIdsKey(ids: string[]): string {
  return [...ids].sort().join('\0')
}

export function isObsEntryActive(
  a: ActiveHl | null,
  e: ObsFrameQuoteEntry,
  currentFrameNum: number
): boolean {
  if (!a) return false
  if (a.frameNumber !== undefined && a.frameNumber !== currentFrameNum) return false
  if (a.overlappingSourceIds?.length) return a.overlappingSourceIds.includes(e.sourceId)
  if (a.quote === undefined || a.occurrence === undefined) return false
  if (a.quote !== e.quote || a.occurrence !== e.occurrence) return false
  if (a.rowId !== undefined && a.rowId !== e.sourceId) return false
  return true
}

export function isPanel2KeyQuoteCapable(
  panel2ActiveKey: string | null,
  loadedType: string | undefined,
  combinedHelpsId: string
): boolean {
  if (!panel2ActiveKey) return false
  if (panel2ActiveKey === combinedHelpsId) return true
  if (OBS_QUOTE_CAPABLE_TYPES.has(String(loadedType ?? ''))) return true
  const idSegment = panel2ActiveKey.split('/')[2] ?? ''
  return (
    idSegment === 'obs-tn' ||
    idSegment === 'obs-twl' ||
    idSegment.startsWith('obs-tn') ||
    idSegment.startsWith('obs-twl')
  )
}
