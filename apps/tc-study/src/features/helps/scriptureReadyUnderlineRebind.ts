/**
 * Rebind CombinedHelps quote underlines to scripture readiness.
 *
 * Helps-first (empty USJ) must not throw. When panel-1 USJ / SCRIPTURE_TOKENS
 * arrives, the same notes must produce a new broadcast key so late scripture
 * still receives NOTES_TOKEN_GROUPS.
 */

import { parseLinkChapterVerse } from './quoteTokens'
import { resolveQuoteSemanticIds, type QuoteSemanticSource } from './resolveQuoteSemanticIds'

export const SCRIPTURE_EMPTY_REVISION = 'scripture:empty'

export interface ScriptureContentRevisionInput {
  sourceResourceId?: string | null
  book?: string | null
  chapter?: number | null
  tokenCount: number
}

export interface UnderlineNoteInput {
  id: string
  reference: string
  semanticIds?: QuoteSemanticSource['semanticIds']
  quoteTokens?: QuoteSemanticSource['quoteTokens']
  occurrence?: QuoteSemanticSource['occurrence']
}

export interface UnderlineTokenGroup {
  sourceId: string
  semanticIds: string[]
}

/** Fingerprint of owner scripture (resource + book/chapter + USJ token count). */
export function scriptureContentRevision(input: ScriptureContentRevisionInput): string {
  if (!input.tokenCount || input.tokenCount <= 0) return SCRIPTURE_EMPTY_REVISION
  const book = (input.book ?? '').toLowerCase()
  const chapter = input.chapter ?? 0
  const source = input.sourceResourceId ?? ''
  return `scripture:${source}:${book}:${chapter}:${input.tokenCount}`
}

export function tokenGroupsBroadcastDedupeKey(
  kindFilter: string,
  groups: UnderlineTokenGroup[],
  scriptureRevision: string
): string {
  const groupsKey = groups.map((g) => `${g.sourceId}:${g.semanticIds.length}`).join('|')
  return `${kindFilter}:${groupsKey}:${scriptureRevision}`
}

/**
 * Underline groups from already-loaded helps notes.
 * Empty scripture / missing quoteTokens → [] (no throw).
 */
export function underlineGroupsFromHelpsNotes(
  notes: UnderlineNoteInput[],
  bookCode: string
): UnderlineTokenGroup[] {
  const groups: UnderlineTokenGroup[] = []
  const book = (bookCode || '').toLowerCase()
  for (const note of notes) {
    if (!note.quoteTokens?.length && !note.semanticIds?.length) continue
    const { chapter, verse } = parseLinkChapterVerse(note.reference)
    const semanticIds = resolveQuoteSemanticIds(note, book, chapter, verse)
    if (semanticIds.length > 0) groups.push({ sourceId: note.id, semanticIds })
  }
  return groups
}

/** Retry UGNT/UHB quote match after scripture hydrates or OL zip lands. */
export function shouldRetryOriginalLanguageLoad(opts: {
  hasOriginalContent: boolean
  scriptureRevision: string
  lastAttemptedRevision: string | null
  olDownloadTick?: number
  lastAttemptedDownloadTick?: number | null
}): boolean {
  if (opts.hasOriginalContent) return false
  if (
    opts.olDownloadTick != null &&
    opts.olDownloadTick > 0 &&
    opts.olDownloadTick !== (opts.lastAttemptedDownloadTick ?? 0)
  ) {
    return true
  }
  if (!opts.scriptureRevision || opts.scriptureRevision === SCRIPTURE_EMPTY_REVISION) return false
  return opts.scriptureRevision !== opts.lastAttemptedRevision
}

/**
 * When SCRIPTURE_TOKENS leaves `scripture:empty`, NOTES_TOKEN_GROUPS must
 * rebroadcast even if group shape looked the same under the empty revision.
 */
export function shouldResetTokenGroupsDedupe(args: {
  previousRevision: string | null
  nextRevision: string
}): boolean {
  if (!args.nextRevision || args.nextRevision === SCRIPTURE_EMPTY_REVISION) return false
  return (
    args.previousRevision == null || args.previousRevision === SCRIPTURE_EMPTY_REVISION
  )
}
