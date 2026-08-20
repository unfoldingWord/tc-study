import { isCombinedHelpsId, isObsCombinedHelpsId } from '../../../features/helps/combinedHelpsIds'
import type { ObsFrameQuoteEntry } from '../../../signals/studioSignals'
import type { ActiveHl } from './types'

/** Types (by resource type string or key suffix) that broadcast obs-frame-quotes. */
export const OBS_QUOTE_CAPABLE_TYPES = new Set([
  'obs-notes',
  'obs-words-links',
  'obs-combined-helps',
  'combined-helps',
])

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

/** DOM id used on range/single frames (`data-obs-frame="1:1"`). */
export function obsFrameAttr(storyNum: number, frameNum: number): string {
  return `${storyNum}:${frameNum}`
}

export function obsFrameSelector(storyNum: number, frameNum: number): string {
  return `[data-obs-frame="${obsFrameAttr(storyNum, frameNum)}"]`
}

/**
 * CombinedHelps card/note click → OBS frame filter.
 * Accepts highlight `{ storyNumber, frameNumber }` or verse-filter `{ chapter, verse }`.
 */
export function obsFrameFilterFromHelpsPayload(
  payload:
    | { storyNumber?: number; frameNumber?: number; chapter?: number; verse?: number }
    | null
    | undefined
): ObsVerseFilterRef | null {
  if (!payload) return null
  const chapter = payload.storyNumber ?? payload.chapter
  const verse = payload.frameNumber ?? payload.verse
  if (chapter == null || verse == null) return null
  return { chapter, verse }
}

export function scrollObsFrameIntoView(
  root: ParentNode | null | undefined,
  filter: ObsVerseFilterRef | null,
  scrollIntoView: (el: Element) => void = (el) =>
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
): boolean {
  if (!filter || filter.verse === undefined) return false
  const scope = root ?? (typeof document !== 'undefined' ? document : null)
  if (!scope) return false
  const el = scope.querySelector(obsFrameSelector(filter.chapter, filter.verse))
  if (!el) return false
  scrollIntoView(el)
  return true
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
  if (panel2ActiveKey === combinedHelpsId || panel2ActiveKey.startsWith(`${combinedHelpsId}:`)) {
    return true
  }
  // Workspace activeIndex can stay on scripture CombinedHelps while OBS CombinedHelps
  // is the painted tab after a Bible→OBS nav switch.
  if (isObsCombinedHelpsId(panel2ActiveKey) || isCombinedHelpsId(panel2ActiveKey)) return true
  if (OBS_QUOTE_CAPABLE_TYPES.has(String(loadedType ?? ''))) return true
  const idSegment = panel2ActiveKey.split('/')[2] ?? ''
  return (
    idSegment === 'obs-tn' ||
    idSegment === 'obs-twl' ||
    idSegment.startsWith('obs-tn') ||
    idSegment.startsWith('obs-twl')
  )
}

/** True when any painted/workspace helps key can publish OBS frame quotes. */
export function panelKeysAreObsQuoteCapable(
  panelKeys: readonly string[],
  loadedTypeFor: (key: string) => string | undefined,
  combinedHelpsId: string
): boolean {
  return panelKeys.some((key) => isPanel2KeyQuoteCapable(key, loadedTypeFor(key), combinedHelpsId))
}
