/**
 * OBS Translation Notes preparer — same tn: cache shape as Bible TN,
 * registered under obs-notes for prepare SoT parity.
 */

import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import {
  markdownToHastSync,
  stripMarkdownLight,
} from '../../lib/markdown/markdownToHast'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { semanticIdMatchKey } from '../helps/semanticIdMatchKey'
import { tnCacheKey, type NotesSource } from '../notes/notesPreparer'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

export const OBS_NOTES_PREPARE_VERSION = 1

function unwrapCacheEntry(entry: unknown): ProcessedNotes | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  if (e.notesByChapter || Array.isArray(e.notes)) {
    return e as unknown as ProcessedNotes
  }
  if (e.content && typeof e.content === 'object') return unwrapCacheEntry(e.content)
  return null
}

function notesForUnit(source: NotesSource, unit: number) {
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
  return []
}

export const obsNotesPreparer: ResourcePreparer<NotesSource, number> = {
  id: RESOURCE_TYPE_IDS.OBS_NOTES,
  version: OBS_NOTES_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const entry = await ctx.cacheAdapter.get(tnCacheKey(resourceKey, bookId))
    const notes = unwrapCacheEntry(entry)
    if (!notes) return null
    return { resourceKey, bookId, notes }
  },

  unitsFor: unitsFromSource,

  prepareLight(source, unit) {
    return {
      version: OBS_NOTES_PREPARE_VERSION,
      unit,
      notes: notesForUnit(source, unit).map((n) => ({
        id: n.id,
        reference: n.reference,
        quote: n.quote || '',
        body: stripMarkdownLight(n.note || ''),
        note: n.note || '',
      })),
    }
  },

  prepareFull(source, unit) {
    return {
      version: OBS_NOTES_PREPARE_VERSION,
      unit,
      notes: notesForUnit(source, unit).map((n) => {
        const quote = n.quote || ''
        return {
          id: n.id,
          reference: n.reference,
          quote,
          quoteFolded: quote ? semanticIdMatchKey(quote) : undefined,
          bodyHast: markdownToHastSync(n.note || ''),
          note: n.note || '',
        }
      }),
    }
  },
}

registerPreparer(obsNotesPreparer)
