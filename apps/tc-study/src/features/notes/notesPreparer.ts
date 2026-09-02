/**
 * Translation Notes preparer — light (plain rows) + full (hast bodies).
 * React-free; safe for workers. Reads `tn:{resourceKey}:{book}` cache.
 */

import type { ProcessedNotes, TranslationNote } from '@bt-synergy/resource-parsers'
import {
  markdownToHastSync,
  stripMarkdownLight,
  type HastRoot,
} from '../../lib/markdown/markdownToHast'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { semanticIdMatchKey } from '../helps/semanticIdMatchKey'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

export const NOTES_PREPARE_VERSION = 1

export function tnCacheKey(resourceKey: string, bookId: string): string {
  return `tn:${resourceKey}:${bookId}`
}

export interface NotesLightRow {
  id: string
  reference: string
  quote: string
  body: string
}

export interface NotesFullRow {
  id: string
  reference: string
  quote: string
  /** Folded quote surface for cheap matching. */
  quoteFolded?: string
  bodyHast: HastRoot
}

export interface NotesNavRecord {
  version: number
  bookId: string
  bookName: string
  chapters: number[]
  totalNotes: number
}

export interface NotesLightChapter {
  version: number
  unit: number
  notes: NotesLightRow[]
}

export interface NotesFullChapter {
  version: number
  unit: number
  notes: NotesFullRow[]
}

type NotesSource = {
  resourceKey: string
  bookId: string
  notes: ProcessedNotes
}

function unwrapCacheEntry(entry: unknown): ProcessedNotes | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  if (e.notesByChapter || Array.isArray(e.notes)) {
    return e as unknown as ProcessedNotes
  }
  if (e.content && typeof e.content === 'object') {
    return unwrapCacheEntry(e.content)
  }
  return null
}

function notesForUnit(source: NotesSource, unit: number): TranslationNote[] {
  const byChapter = source.notes.notesByChapter
  if (byChapter && typeof byChapter === 'object') {
    return byChapter[String(unit)] ?? []
  }
  return (source.notes.notes ?? []).filter((n) => {
    const ch = parseInt(n.reference.split(':')[0] || '0', 10)
    return ch === unit
  })
}

function unitsFromSource(source: NotesSource): number[] {
  const byChapter = source.notes.notesByChapter
  if (byChapter && typeof byChapter === 'object') {
    return Object.keys(byChapter)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
  }
  const fromMeta = source.notes.metadata?.chaptersWithNotes
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return [...fromMeta].sort((a, b) => a - b)
  }
  const chapters = new Set<number>()
  for (const n of source.notes.notes ?? []) {
    const ch = parseInt(n.reference.split(':')[0] || '0', 10)
    if (Number.isFinite(ch) && ch > 0) chapters.add(ch)
  }
  return [...chapters].sort((a, b) => a - b)
}

export function buildNotesNav(source: NotesSource): NotesNavRecord {
  const units = unitsFromSource(source)
  return {
    version: NOTES_PREPARE_VERSION,
    bookId: source.notes.bookCode || source.bookId,
    bookName: source.notes.bookName || source.bookId,
    chapters: units,
    totalNotes: source.notes.notes?.length ?? 0,
  }
}

export function buildNotesLight(source: NotesSource, unit: number): NotesLightChapter {
  const notes = notesForUnit(source, unit).map((n) => ({
    id: n.id,
    reference: n.reference,
    quote: n.quote || '',
    body: stripMarkdownLight(n.note || ''),
  }))
  return { version: NOTES_PREPARE_VERSION, unit, notes }
}

export function buildNotesFull(source: NotesSource, unit: number): NotesFullChapter {
  const notes = notesForUnit(source, unit).map((n) => {
    const quote = n.quote || ''
    return {
      id: n.id,
      reference: n.reference,
      quote,
      quoteFolded: quote ? semanticIdMatchKey(quote) : undefined,
      bodyHast: markdownToHastSync(n.note || ''),
    }
  })
  return { version: NOTES_PREPARE_VERSION, unit, notes }
}

export const notesPreparer: ResourcePreparer<NotesSource, number> = {
  id: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  version: NOTES_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const key = tnCacheKey(resourceKey, bookId)
    const entry = await ctx.cacheAdapter.get(key)
    const notes = unwrapCacheEntry(entry)
    if (!notes) return null
    return { resourceKey, bookId, notes }
  },

  unitsFor: unitsFromSource,

  prepareNav(source) {
    return buildNotesNav(source)
  },

  prepareLight(source, unit) {
    return buildNotesLight(source, unit)
  },

  prepareFull(source, unit) {
    return buildNotesFull(source, unit)
  },
}

registerPreparer(notesPreparer)
