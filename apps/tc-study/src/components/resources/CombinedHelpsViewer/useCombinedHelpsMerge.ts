import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import type { HelpsQuoteStatus } from '../../../features/helps/resolveHelpsQuoteStatus'
import { useMemo } from 'react'
import {
  filterDisplayLinks,
  filterDisplayNotes,
  type DisplayFilterParams,
} from '../../../features/helps/helpsDisplayFilters'
import { refSortParts } from './combinedHelpsUtils'
import type { HelpsKindFilter } from './types'

export type { HelpsKindFilter } from './types'
export {
  filterDisplayLinks,
  filterDisplayNotes,
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  type DisplayFilterParams,
  type ReferenceRange,
} from '../../../features/helps/helpsDisplayFilters'

export type NoteWithAlignments = TranslationNote & {
  quoteTokens?: Array<{ text: string; id?: string | number; strong?: string; lemma?: string; morph?: string }>
  alignedTokens?: Array<{ position: number }>
  semanticIds?: string[]
  quoteStatus?: HelpsQuoteStatus
}

export type LinkWithAlignments = TranslationWordsLink & {
  quoteTokens?: Array<{ text: string }>
  alignedTokens?: Array<{ position: number }>
  semanticIds?: string[]
  quoteStatus?: HelpsQuoteStatus
}

export type MergedRow =
  | {
      kind: 'tn'
      ref: string
      sortChapter: number
      sortVerse: number
      sortPosition: number
      note: NoteWithAlignments
    }
  | {
      kind: 'twl'
      ref: string
      sortChapter: number
      sortVerse: number
      sortPosition: number
      link: LinkWithAlignments
    }

/**
 * Entries with alignedTokens get their first token's position.
 * Entries without inherit the preceding entry's position + 0.5 (chained)
 * so consecutive unaligned entries don't collapse.
 */
export function inheritedPositions(
  entries: Array<{ alignedTokens?: Array<{ position: number }> }>
): number[] {
  const positions: number[] = []
  for (let i = 0; i < entries.length; i++) {
    const direct = entries[i]?.alignedTokens?.[0]?.position
    if (direct !== undefined) {
      positions.push(direct)
    } else {
      positions.push(i > 0 ? positions[i - 1]! + 0.5 : -1)
    }
  }
  return positions
}

/** Filter merged rows by kind ('all' keeps everything). */
export function filterRowsByKind(rows: MergedRow[], kindFilter: HelpsKindFilter): MergedRow[] {
  if (kindFilter === 'all') return rows
  if (kindFilter === 'notes') return rows.filter((r) => r.kind === 'tn')
  return rows.filter((r) => r.kind === 'twl')
}

/** Sort by chapter → verse → position → kind/id tiebreakers. */
export function sortMergedRows(rows: MergedRow[]): MergedRow[] {
  return [...rows].sort((a, b) => {
    if (a.sortChapter !== b.sortChapter) return a.sortChapter - b.sortChapter
    if (a.sortVerse !== b.sortVerse) return a.sortVerse - b.sortVerse
    if (a.sortPosition !== b.sortPosition) return a.sortPosition - b.sortPosition
    if (a.kind !== b.kind) return a.kind === 'tn' ? -1 : 1
    const idA = a.kind === 'tn' ? a.note.id : a.link.id
    const idB = b.kind === 'tn' ? b.note.id : b.link.id
    return String(idA).localeCompare(String(idB))
  })
}

/** Merge notes + links into sortable rows (does not apply kind filter). */
export function mergeNotesAndLinksToRows(
  notes: NoteWithAlignments[],
  links: LinkWithAlignments[]
): MergedRow[] {
  const rows: MergedRow[] = []
  const tnPositions = inheritedPositions(notes)
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!
    const { chapter, verse } = refSortParts(note.reference)
    rows.push({
      kind: 'tn',
      ref: note.reference,
      sortChapter: chapter,
      sortVerse: verse,
      sortPosition: tnPositions[i]!,
      note,
    })
  }
  const twlPositions = inheritedPositions(links)
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!
    const { chapter, verse } = refSortParts(link.reference)
    rows.push({
      kind: 'twl',
      ref: link.reference,
      sortChapter: chapter,
      sortVerse: verse,
      sortPosition: twlPositions[i]!,
      link,
    })
  }
  return rows
}

/** Merge, filter by kind, and sort into a single ordered list. */
export function buildSortedMergedRows(
  notes: NoteWithAlignments[],
  links: LinkWithAlignments[],
  kindFilter: HelpsKindFilter
): MergedRow[] {
  const includeNotes = kindFilter !== 'twl'
  const includeLinks = kindFilter !== 'notes'
  const rows = mergeNotesAndLinksToRows(
    includeNotes ? notes : [],
    includeLinks ? links : []
  )
  return sortMergedRows(rows)
}

/** Group consecutive rows that share the same reference. */
export function groupMergedRows(rows: MergedRow[]): { ref: string; items: MergedRow[] }[] {
  const groups: { ref: string; items: MergedRow[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.ref === row.ref) last.items.push(row)
    else groups.push({ ref: row.ref, items: [row] })
  }
  return groups
}

export interface UseCombinedHelpsDisplayParams extends DisplayFilterParams {
  notesWithAlignedTokens: NoteWithAlignments[]
  filteredByReference: LinkWithAlignments[]
}

/** Hook: token/verse/OBS filters for notes and links shown in the list. */
export function useCombinedHelpsDisplay({
  notesWithAlignedTokens,
  filteredByReference,
  helpsScope,
  obsQuoteFilter,
  verseFilter,
  tokenFilter,
  bookCodeLower,
}: UseCombinedHelpsDisplayParams) {
  const params: DisplayFilterParams = {
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    bookCodeLower,
  }

  const { displayNotes, hasNoteMatches } = useMemo(
    () => filterDisplayNotes(notesWithAlignedTokens, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params fields listed explicitly
    [notesWithAlignedTokens, helpsScope, obsQuoteFilter, verseFilter, tokenFilter, bookCodeLower]
  )

  const { displayLinks, hasLinkMatches } = useMemo(
    () => filterDisplayLinks(filteredByReference, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredByReference, helpsScope, obsQuoteFilter, verseFilter, tokenFilter, bookCodeLower]
  )

  return { displayNotes, hasNoteMatches, displayLinks, hasLinkMatches }
}

export interface UseCombinedHelpsMergedRowsParams {
  displayNotes: NoteWithAlignments[]
  displayLinks: LinkWithAlignments[]
  kindFilter: HelpsKindFilter
}

/** Hook: merge + kind-filter + sort + group for the combined helps list. */
export function useCombinedHelpsMergedRows({
  displayNotes,
  displayLinks,
  kindFilter,
}: UseCombinedHelpsMergedRowsParams) {
  const mergedRows = useMemo(
    () => buildSortedMergedRows(displayNotes, displayLinks, kindFilter),
    [displayNotes, displayLinks, kindFilter]
  )

  const mergedGroups = useMemo(() => groupMergedRows(mergedRows), [mergedRows])

  return { mergedRows, mergedGroups }
}
