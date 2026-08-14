/**
 * Exclusive CombinedHelps card selection (TN + TWL share one active card).
 * Filter may show many matches; only this selection paints HELPS_CARD_SELECTED.
 */

import {
  filterDisplayLinks,
  filterDisplayNotes,
  type TokenFilterLike,
} from '../../../features/helps/helpsDisplayFilters'
import type { HelpsKindFilter } from './types'
import {
  buildSortedMergedRows,
  type LinkWithAlignments,
  type MergedRow,
  type NoteWithAlignments,
} from './useCombinedHelpsMerge'

export type HelpsCardKind = 'tn' | 'twl'

export type HelpsCardSelection = { kind: HelpsCardKind; id: string } | null

export function isHelpsCardSelected(
  selection: HelpsCardSelection,
  kind: HelpsCardKind,
  id: string
): boolean {
  return selection?.kind === kind && selection.id === id
}

export function firstVisibleHelpsSelection(rows: MergedRow[]): HelpsCardSelection {
  const row = rows[0]
  if (!row) return null
  return row.kind === 'tn' ? { kind: 'tn', id: row.note.id } : { kind: 'twl', id: row.link.id }
}

/** After a scripture token click: keep the filtered list, highlight the first visible match only. */
export function focusFirstMatchingHelpsCard(params: {
  notes: NoteWithAlignments[]
  links: LinkWithAlignments[]
  kindFilter: HelpsKindFilter
  tokenFilter: TokenFilterLike
  helpsScope: 'scripture' | 'obs'
  bookCodeLower: string
}): HelpsCardSelection {
  const filterParams = {
    helpsScope: params.helpsScope,
    obsQuoteFilter: null,
    verseFilter: null,
    tokenFilter: params.tokenFilter,
    bookCodeLower: params.bookCodeLower,
  }
  const { displayNotes } = filterDisplayNotes(params.notes, filterParams)
  const { displayLinks } = filterDisplayLinks(params.links, filterParams)
  return firstVisibleHelpsSelection(
    buildSortedMergedRows(displayNotes, displayLinks, params.kindFilter)
  )
}

/** OBS overlapping quotes: filter may show many; activate the first in list order. */
export function focusFirstOverlappingHelpsCard(
  overlappingIds: string[],
  notes: Array<{ id: string }>,
  links: Array<{ id: string }>,
  kindFilter: HelpsKindFilter
): HelpsCardSelection {
  const idSet = new Set(overlappingIds)
  const matchedNotes = notes.filter((n) => idSet.has(n.id)) as NoteWithAlignments[]
  const matchedLinks = links.filter((l) => idSet.has(l.id)) as LinkWithAlignments[]
  return firstVisibleHelpsSelection(buildSortedMergedRows(matchedNotes, matchedLinks, kindFilter))
}
