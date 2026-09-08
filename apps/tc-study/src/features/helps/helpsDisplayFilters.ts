/**
 * Shared TN / TWL / CombinedHelps reference + display filters (pure).
 */

import { generateSemanticIdsForQuoteTokens } from './quoteTokens'

export interface ObsQuoteFilter {
  quote?: string
  occurrence?: number
  rowId?: string
  kind?: 'tn' | 'twl'
  sourceIds?: string[]
  wordIndex?: number
}

export interface VerseFilterState {
  chapter: number
  verse?: number
  timestamp: number
}

/** Book-wide TN filter: same Translation Academy support-reference. */
export interface SupportRefFilter {
  /** Raw `rc://…/ta/man/…` from the note. */
  supportReference: string
  /** Resolved TA title for the chip (e.g. "Doublet"). */
  title: string
  timestamp: number
}

export interface TokenFilterLike {
  semanticId: string
  content: string
  alignedSemanticIds?: string[]
  timestamp: number
}

export interface ReferenceRange {
  startChapter: number
  startVerse: number
  endChapter: number
  endVerse: number
}

export interface DisplayFilterParams {
  helpsScope: 'scripture' | 'obs'
  obsQuoteFilter: ObsQuoteFilter | null
  verseFilter: VerseFilterState | null
  tokenFilter: TokenFilterLike | null
  supportRefFilter?: SupportRefFilter | null
  bookCodeLower: string
  /** When true, empty token/verse filters fall back to the unfiltered list (standalone TN/TWL). */
  fallbackWhenEmpty?: boolean
}

export type NoteForDisplay = {
  id: string
  reference: string
  quote?: string
  occurrence?: string
  supportReference?: string
  quoteTokens?: Array<{ text: string; id?: string | number; strong?: string; lemma?: string; morph?: string }>
  semanticIds?: string[]
}

export type LinkForDisplay = {
  id: string
  reference: string
  origWords?: string
  occurrence?: string
  quoteTokens?: Array<{ text: string }>
  semanticIds?: string[]
}

/** Filter translation notes whose reference overlaps the given chapter/verse range. */
export function filterNotesByReferenceRange<T extends { reference: string }>(
  notes: T[],
  range: ReferenceRange
): T[] {
  const { startChapter, startVerse, endChapter, endVerse } = range
  return notes.filter((note) => {
    const [noteChapterStr, noteVerseRange] = note.reference.split(':')
    const noteChapter = parseInt(noteChapterStr)
    if (noteChapter < startChapter || noteChapter > endChapter) return false
    let noteStartVerse: number
    let noteEndVerse: number
    if (noteVerseRange?.includes('-')) {
      const [start, end] = noteVerseRange.split('-').map((v) => parseInt(v))
      noteStartVerse = start
      noteEndVerse = end
    } else {
      noteStartVerse = noteEndVerse = parseInt(noteVerseRange)
    }
    if (noteChapter === startChapter && noteEndVerse < startVerse) return false
    if (noteChapter === endChapter && noteStartVerse > endVerse) return false
    return true
  })
}

/** Filter TWL links whose reference falls within the given chapter/verse range. */
export function filterLinksByReferenceRange<T extends { reference: string }>(
  links: T[],
  range: ReferenceRange
): T[] {
  const { startChapter, startVerse, endChapter, endVerse } = range
  return links.filter((link) => {
    const refParts = link.reference.split(':')
    const linkChapter = parseInt(refParts[0] || '1', 10)
    const linkVerse = parseInt(refParts[1] || '1', 10)
    if (startChapter === endChapter) {
      if (linkChapter !== startChapter) return false
      return linkVerse >= startVerse && linkVerse <= endVerse
    }
    if (linkChapter < startChapter) return false
    if (linkChapter > endChapter) return false
    if (linkChapter === startChapter) return linkVerse >= startVerse
    if (linkChapter === endChapter) return linkVerse <= endVerse
    return true
  })
}

function withFallback<T>(filtered: T[], source: T[], fallbackWhenEmpty?: boolean): T[] {
  if (fallbackWhenEmpty && filtered.length === 0) return source
  return filtered
}

/** Stable key for comparing TA support-references across note rows. */
export function supportReferenceKey(ref: string | null | undefined): string {
  if (!ref?.trim()) return ''
  const trimmed = ref.trim()
  const match = trimmed.match(/ta\/man\/(.+)$/i)
  return (match?.[1] ?? trimmed).toLowerCase().replace(/\/+$/, '')
}

export function supportReferencesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ka = supportReferenceKey(a)
  const kb = supportReferenceKey(b)
  return Boolean(ka) && ka === kb
}

/**
 * Prefer the larger of chapter-map vs flat notes — chunked cache can leave the
 * map incomplete while `notes` already holds the full book.
 */
export function flattenBookNotes<T>(
  byChapter: Record<string, T[]> | null | undefined,
  fallback: T[] | null | undefined
): T[] {
  const fromChapters =
    byChapter && Object.keys(byChapter).length > 0 ? Object.values(byChapter).flat() : []
  const fromFallback = fallback ?? []
  if (fromFallback.length > fromChapters.length) return fromFallback
  if (fromChapters.length > 0) return fromChapters
  return fromFallback
}

type SupportRefDisplayNote = {
  id: string
  supportReference?: string
  quote?: string
  quoteTokens?: unknown
  alignedTokens?: unknown
  semanticIds?: unknown
  quoteStatus?: string
}

export type SupportRefNoteEnrichment = {
  quoteTokens?: unknown
  alignedTokens?: unknown
  semanticIds?: unknown
  quoteStatus?: string
}

function hasUsableHelpsAlign(
  note: SupportRefDisplayNote | SupportRefNoteEnrichment | undefined
): boolean {
  if (!note) return false
  if (Array.isArray(note.semanticIds) && note.semanticIds.length > 0) return true
  if (Array.isArray(note.alignedTokens) && note.alignedTokens.length > 0) return true
  if (Array.isArray(note.quoteTokens) && note.quoteTokens.length > 0) return true
  return false
}

/**
 * Book-wide support-ref matches. Prefer passage-aligned rows, then IndexedDB /
 * align enrichment, else settle so cards are not stuck pending.
 * Mid-flight chapter quote rebuild must not overwrite usable off-passage align.
 */
export function settleSupportRefDisplayNotes<T extends SupportRefDisplayNote>(
  bookNotes: T[],
  supportReference: string,
  alignedById: Map<string, T>,
  enrichmentById?: Map<string, SupportRefNoteEnrichment>
): T[] {
  return bookNotes
    .filter((note) => supportReferencesMatch(note.supportReference, supportReference))
    .map((note) => {
      const aligned = alignedById.get(note.id)
      const enriched = enrichmentById?.get(note.id)
      if (hasUsableHelpsAlign(aligned)) return aligned!
      if (hasUsableHelpsAlign(enriched)) {
        return {
          ...note,
          ...enriched,
        }
      }
      if (aligned) return aligned
      if (enriched) {
        return {
          ...note,
          ...enriched,
        }
      }
      const hasQuote = Boolean(note.quote?.trim())
      return {
        ...note,
        quoteStatus: hasQuote ? 'ol-fallback' : 'none',
      }
    })
}

/** Apply OBS quote / verse / token / support-ref filters to aligned notes. */
export function filterDisplayNotes<T extends NoteForDisplay>(
  notesWithAlignedTokens: T[],
  params: DisplayFilterParams
): { displayNotes: T[]; hasNoteMatches: boolean } {
  const {
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    supportRefFilter = null,
    bookCodeLower,
    fallbackWhenEmpty,
  } = params

  if (supportRefFilter) {
    const filtered = notesWithAlignedTokens.filter((note) =>
      supportReferencesMatch(note.supportReference, supportRefFilter.supportReference)
    )
    return {
      displayNotes: withFallback(filtered, notesWithAlignedTokens, fallbackWhenEmpty),
      hasNoteMatches: filtered.length > 0,
    }
  }

  if (helpsScope === 'obs' && obsQuoteFilter) {
    if (obsQuoteFilter.sourceIds?.length) {
      const idSet = new Set(obsQuoteFilter.sourceIds)
      const notes = notesWithAlignedTokens.filter((n) => idSet.has(n.id))
      return { displayNotes: notes, hasNoteMatches: notes.length > 0 }
    }
    if (obsQuoteFilter.kind === 'twl') return { displayNotes: [], hasNoteMatches: false }
    const q = obsQuoteFilter.quote?.trim().toLowerCase() ?? ''
    const occ = obsQuoteFilter.occurrence ?? 1
    const match = notesWithAlignedTokens.find(
      (n) =>
        (obsQuoteFilter.rowId && n.id === obsQuoteFilter.rowId) ||
        (n.quote?.trim().toLowerCase() === q && Number.parseInt(String(n.occurrence ?? '1'), 10) === occ)
    )
    return { displayNotes: match ? [match] : notesWithAlignedTokens, hasNoteMatches: !!match }
  }

  if (verseFilter) {
    const filtered = notesWithAlignedTokens.filter((note) => {
      const [chapterStr, verseRange] = note.reference.split(':')
      const noteChapter = parseInt(chapterStr)
      if (isNaN(noteChapter) || noteChapter !== verseFilter.chapter) return false
      if (verseFilter.verse === undefined) return true
      if (!verseRange || verseRange === 'intro') return false
      if (verseRange.includes('-')) {
        const [start, end] = verseRange.split('-').map(Number)
        return verseFilter.verse >= start && verseFilter.verse <= end
      }
      return parseInt(verseRange) === verseFilter.verse
    })
    return {
      displayNotes: withFallback(filtered, notesWithAlignedTokens, fallbackWhenEmpty),
      hasNoteMatches: filtered.length > 0,
    }
  }

  if (!tokenFilter) {
    return { displayNotes: notesWithAlignedTokens, hasNoteMatches: true }
  }

  const cleanToken = tokenFilter.content.toLowerCase().trim()
  // ... rest continues in file
  const filtered = notesWithAlignedTokens.filter((note) => {
    if (note.quoteTokens && note.quoteTokens.length > 0) {
      const cached = note.semanticIds
      const noteSemanticIds =
        cached ??
        (() => {
          const refParts = note.reference.split(':')
          const ch = parseInt(refParts[0] || '1', 10)
          const vs = parseInt(refParts[1] || '1', 10)
          return generateSemanticIdsForQuoteTokens(
            note.quoteTokens! as Parameters<typeof generateSemanticIdsForQuoteTokens>[0],
            bookCodeLower,
            ch,
            vs,
            parseInt(note.occurrence || '1', 10)
          )
        })()
      const hasAligned = tokenFilter.alignedSemanticIds?.some((alignedId) => {
        const al = alignedId.toLowerCase()
        return noteSemanticIds.some((id) => id.toLowerCase() === al)
      })
      if (hasAligned) return true
    }
    const quoteLower = note.quote?.toLowerCase() || ''
    const hasText = quoteLower.includes(cleanToken)
    const hasQt = note.quoteTokens?.some((tok) => tok.text.toLowerCase().includes(cleanToken))
    return hasText || !!hasQt
  })
  return {
    displayNotes: withFallback(filtered, notesWithAlignedTokens, fallbackWhenEmpty),
    hasNoteMatches: filtered.length > 0,
  }
}

/** Apply OBS quote / verse / token filters to reference-filtered links. */
export function filterDisplayLinks<T extends LinkForDisplay>(
  filteredByReference: T[],
  params: DisplayFilterParams
): { displayLinks: T[]; hasLinkMatches: boolean } {
  const {
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    supportRefFilter = null,
    bookCodeLower,
    fallbackWhenEmpty,
  } = params

  // Support-ref filter is TN-only (TA articles).
  if (supportRefFilter) {
    return { displayLinks: [], hasLinkMatches: false }
  }

  if (helpsScope === 'obs' && obsQuoteFilter) {
    if (obsQuoteFilter.sourceIds?.length) {
      const idSet = new Set(obsQuoteFilter.sourceIds)
      const links = filteredByReference.filter((l) => idSet.has(l.id))
      return { displayLinks: links, hasLinkMatches: links.length > 0 }
    }
    if (obsQuoteFilter.kind === 'tn') return { displayLinks: [], hasLinkMatches: false }
    const q = obsQuoteFilter.quote?.trim().toLowerCase() ?? ''
    const occ = obsQuoteFilter.occurrence ?? 1
    const match = filteredByReference.find(
      (l) =>
        (obsQuoteFilter.rowId && l.id === obsQuoteFilter.rowId) ||
        (l.origWords?.trim().toLowerCase() === q && Number.parseInt(String(l.occurrence ?? '1'), 10) === occ)
    )
    return { displayLinks: match ? [match] : filteredByReference, hasLinkMatches: !!match }
  }

  if (verseFilter) {
    const filtered = filteredByReference.filter((link) => {
      const [chapterStr, verseRange] = link.reference.split(':')
      const linkChapter = parseInt(chapterStr)
      if (isNaN(linkChapter) || linkChapter !== verseFilter.chapter) return false
      if (verseFilter.verse === undefined) return true
      if (!verseRange || verseRange === 'intro') return false
      if (verseRange.includes('-')) {
        const [start, end] = verseRange.split('-').map(Number)
        return verseFilter.verse >= start && verseFilter.verse <= end
      }
      return parseInt(verseRange) === verseFilter.verse
    })
    return {
      displayLinks: withFallback(filtered, filteredByReference, fallbackWhenEmpty),
      hasLinkMatches: filtered.length > 0,
    }
  }

  if (!tokenFilter) {
    return { displayLinks: filteredByReference, hasLinkMatches: true }
  }

  const cleanToken = tokenFilter.content.toLowerCase().trim()
  const filtered = filteredByReference.filter((link) => {
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      const cached = link.semanticIds
      const linkSemanticIds =
        cached ??
        (() => {
          const refParts = link.reference.split(':')
          const ch = parseInt(refParts[0] || '1', 10)
          const vs = parseInt(refParts[1] || '1', 10)
          return generateSemanticIdsForQuoteTokens(
            link.quoteTokens! as Parameters<typeof generateSemanticIdsForQuoteTokens>[0],
            bookCodeLower,
            ch,
            vs,
            parseInt(link.occurrence || '1', 10)
          )
        })()
      const hasAligned = tokenFilter.alignedSemanticIds?.some((alignedId) => {
        const al = alignedId.toLowerCase()
        return linkSemanticIds.some((id) => id.toLowerCase() === al)
      })
      if (hasAligned) return true
    }
    const ow = link.origWords?.toLowerCase() || ''
    const hasText = ow.includes(cleanToken)
    const hasQt = link.quoteTokens?.some((tok) => tok.text.toLowerCase().includes(cleanToken))
    return hasText || !!hasQt
  })
  return {
    displayLinks: withFallback(filtered, filteredByReference, fallbackWhenEmpty),
    hasLinkMatches: filtered.length > 0,
  }
}

/** Build OBS story-mode end verse (∞) or normal end verse. */
export function resolveRangeEndVerse(
  currentRef: { book?: string; endVerse?: number; verse: number },
  navigationMode: string
): number {
  const isObsStoryMode = navigationMode === 'chapter' && currentRef.book === 'obs'
  return isObsStoryMode ? Number.POSITIVE_INFINITY : (currentRef.endVerse || currentRef.verse)
}
