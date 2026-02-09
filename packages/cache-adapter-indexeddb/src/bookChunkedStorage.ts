/**
 * Transparent chapter-level storage for book-organized resources (scripture, TN, TQ).
 * The adapter uses this to split one logical entry into a manifest + one record per chapter,
 * and to reassemble on get, without changing the public get/set API.
 */

import type { CacheEntry } from '@bt-synergy/resource-cache'

/** Key prefixes for book-organized resources that we store by chapter. */
export const BOOK_ORGANIZED_PREFIXES = ['scripture:', 'tn:', 'tq:'] as const

/** Marker in stored entry to indicate chunked (manifest-only) record. */
export const CHUNKED_MARKER = '_chunkedBook'

export function isBookOrganizedKey(key: string): boolean {
  return BOOK_ORGANIZED_PREFIXES.some((p) => key.startsWith(p))
}

/**
 * Returns true if this key is a chapter sub-key (e.g. scripture:owner/lang/id:gen:1).
 * Used to filter keys() to logical keys only.
 */
export function isChapterSubKey(key: string): boolean {
  if (!isBookOrganizedKey(key)) return false
  const parts = key.split(':')
  const last = parts[parts.length - 1]
  return /^\d+$/.test(last) && parts.length > 1
}

/**
 * Map a raw key to its logical key (base key for book-organized entries).
 * e.g. scripture:owner/lang/id:gen:1 -> scripture:owner/lang/id:gen
 */
export function toLogicalKey(key: string): string {
  if (!isChapterSubKey(key)) return key
  const lastColon = key.lastIndexOf(':')
  return lastColon > 0 ? key.slice(0, lastColon) : key
}

/**
 * Check if entry is a chunked manifest (has marker, no full content).
 */
export function isChunkedManifest(entry: CacheEntry | Record<string, unknown>): boolean {
  const e = entry as Record<string, unknown>
  const meta = e?.metadata as Record<string, unknown> | undefined
  const content = e?.content as Record<string, unknown> | undefined
  return Boolean(
    meta?.[CHUNKED_MARKER] === true ||
    e?.[CHUNKED_MARKER] === true ||
    (content && typeof content === 'object' && content[CHUNKED_MARKER] === true)
  )
}

// --- Scripture: entry.content.chapters (array) ---

function isScriptureEntry(entry: CacheEntry | Record<string, unknown>): boolean {
  const c = (entry as CacheEntry).content ?? entry
  return Array.isArray((c as { chapters?: unknown })?.chapters)
}

function scriptureChapters(entry: CacheEntry): { metadata: unknown; chapters: unknown[] } {
  const content = entry.content as { metadata?: unknown; chapters: unknown[] }
  return { metadata: content.metadata, chapters: content.chapters ?? [] }
}

export function canSplitScripture(key: string, entry: CacheEntry): boolean {
  const chapters = (entry.content as { chapters?: unknown[] })?.chapters
  return key.startsWith('scripture:') && isScriptureEntry(entry) && (chapters?.length ?? 0) > 0
}

export function splitScriptureEntry(key: string, entry: CacheEntry): { manifestEntry: CacheEntry; chapterEntries: Array<{ key: string; entry: CacheEntry }> } {
  const { metadata, chapters } = scriptureChapters(entry)
  const manifestEntry: CacheEntry = {
    ...entry,
    content: { metadata, [CHUNKED_MARKER]: true },
    metadata: { ...entry.metadata, [CHUNKED_MARKER]: true },
  }
  const chapterEntries = (chapters as Array<{ number?: number }>).map((ch, i) => {
    const chapterNum = ch?.number ?? i + 1
    return {
      key: `${key}:${chapterNum}`,
      entry: { ...entry, content: ch } as CacheEntry,
    }
  })
  return { manifestEntry, chapterEntries }
}

export function reassembleScripture(manifestEntry: CacheEntry, chapterEntries: Array<{ key: string; entry: CacheEntry }>): CacheEntry {
  const content = manifestEntry.content as { metadata?: unknown; [k: string]: unknown }
  const metadata = content?.metadata
  const chapters = chapterEntries
    .sort((a, b) => {
      const na = parseInt(a.key.split(':').pop() ?? '0', 10)
      const nb = parseInt(b.key.split(':').pop() ?? '0', 10)
      return na - nb
    })
    .map((c) => c.entry.content)
  return {
    ...manifestEntry,
    content: { ...content, metadata, chapters },
    metadata: manifestEntry.metadata ? { ...manifestEntry.metadata } : undefined,
  }
}

// --- TN: entry.notesByChapter (Record<string, TranslationNote[]>) ---

function isNotesEntry(entry: CacheEntry | Record<string, unknown>): boolean {
  const e = entry as Record<string, unknown>
  return typeof e?.notesByChapter === 'object' && e.notesByChapter !== null && !Array.isArray(e.notesByChapter)
}

function notesByChapter(entry: CacheEntry | Record<string, unknown>): Record<string, unknown[]> {
  const e = entry as Record<string, unknown>
  return (e.notesByChapter as Record<string, unknown[]>) ?? {}
}

export function canSplitNotes(key: string, entry: CacheEntry): boolean {
  return key.startsWith('tn:') && isNotesEntry(entry) && Object.keys(notesByChapter(entry)).length > 0
}

export function splitNotesEntry(key: string, entry: CacheEntry): { manifestEntry: CacheEntry; chapterEntries: Array<{ key: string; entry: CacheEntry }> } {
  const byChapter = notesByChapter(entry)
  const entryAny = entry as unknown as Record<string, unknown>
  const rest = Object.fromEntries(Object.entries(entryAny).filter(([k]) => k !== 'notesByChapter' && k !== 'notes')) as Record<string, unknown>
  const meta = entryAny.metadata && typeof entryAny.metadata === 'object' ? (entryAny.metadata as Record<string, unknown>) : {}
  const manifestEntry: CacheEntry = {
    content: {},
    ...rest,
    notesByChapter: {} as Record<string, unknown[]>,
    notes: [] as unknown[],
    metadata: { ...meta, [CHUNKED_MARKER]: true },
    [CHUNKED_MARKER]: true,
  } as unknown as CacheEntry

  const chapterEntries = Object.entries(byChapter).map(([chapterNum, notes]) => ({
    key: `${key}:${chapterNum}`,
    entry: { content: { notes }, metadata: entryAny.metadata } as CacheEntry,
  }))
  return { manifestEntry, chapterEntries }
}

export function reassembleNotes(manifestEntry: CacheEntry, chapterEntries: Array<{ key: string; entry: CacheEntry }>): CacheEntry {
  const base = manifestEntry as unknown as Record<string, unknown>
  const out: Record<string, unknown[]> = {}
  let notes: unknown[] = []
  for (const { key: chKey, entry: chEntry } of chapterEntries) {
    const chapterNum = chKey.split(':').pop() ?? '0'
    const chAny = chEntry as unknown as Record<string, unknown>
    const chContent = chAny.content as { notes?: unknown[] } | undefined
    const arr = chContent?.notes ?? chAny.notes ?? []
    out[chapterNum] = Array.isArray(arr) ? arr : []
    notes = notes.concat(out[chapterNum])
  }
  const restored: Record<string, unknown> = { ...base, notesByChapter: out, notes }
  delete restored[CHUNKED_MARKER]
  if (restored.metadata && typeof restored.metadata === 'object') delete (restored.metadata as Record<string, unknown>)[CHUNKED_MARKER]
  return restored as unknown as CacheEntry
}

// --- TQ: entry.questionsByChapter ---

function isQuestionsEntry(entry: CacheEntry | Record<string, unknown>): boolean {
  const e = entry as Record<string, unknown>
  return typeof e?.questionsByChapter === 'object' && e.questionsByChapter !== null && !Array.isArray(e.questionsByChapter)
}

function questionsByChapter(entry: CacheEntry | Record<string, unknown>): Record<string, unknown[]> {
  const e = entry as Record<string, unknown>
  return (e.questionsByChapter as Record<string, unknown[]>) ?? {}
}

export function canSplitQuestions(key: string, entry: CacheEntry): boolean {
  return key.startsWith('tq:') && isQuestionsEntry(entry) && Object.keys(questionsByChapter(entry)).length > 0
}

export function splitQuestionsEntry(key: string, entry: CacheEntry): { manifestEntry: CacheEntry; chapterEntries: Array<{ key: string; entry: CacheEntry }> } {
  const byChapter = questionsByChapter(entry)
  const entryAny = entry as unknown as Record<string, unknown>
  const rest = Object.fromEntries(Object.entries(entryAny).filter(([k]) => k !== 'questionsByChapter' && k !== 'questions')) as Record<string, unknown>
  const meta = entryAny.metadata && typeof entryAny.metadata === 'object' ? (entryAny.metadata as Record<string, unknown>) : {}
  const manifestEntry: CacheEntry = {
    content: {},
    ...rest,
    questionsByChapter: {} as Record<string, unknown[]>,
    questions: [] as unknown[],
    metadata: { ...meta, [CHUNKED_MARKER]: true },
    [CHUNKED_MARKER]: true,
  } as unknown as CacheEntry

  const chapterEntries = Object.entries(byChapter).map(([chapterNum, questions]) => ({
    key: `${key}:${chapterNum}`,
    entry: { content: { questions }, metadata: entryAny.metadata } as CacheEntry,
  }))
  return { manifestEntry, chapterEntries }
}

export function reassembleQuestions(manifestEntry: CacheEntry, chapterEntries: Array<{ key: string; entry: CacheEntry }>): CacheEntry {
  const base = manifestEntry as unknown as Record<string, unknown>
  const out: Record<string, unknown[]> = {}
  let questions: unknown[] = []
  for (const { key: chKey, entry: chEntry } of chapterEntries) {
    const chapterNum = chKey.split(':').pop() ?? '0'
    const chAny = chEntry as unknown as Record<string, unknown>
    const chContent = chAny.content as { questions?: unknown[] } | undefined
    const arr = chContent?.questions ?? chAny.questions ?? []
    out[chapterNum] = Array.isArray(arr) ? arr : []
    questions = questions.concat(out[chapterNum])
  }
  const restored: Record<string, unknown> = { ...base, questionsByChapter: out, questions }
  delete restored[CHUNKED_MARKER]
  if (restored.metadata && typeof restored.metadata === 'object') delete (restored.metadata as Record<string, unknown>)[CHUNKED_MARKER]
  return restored as unknown as CacheEntry
}

// --- Unified split / reassemble ---

export function canSplitBookEntry(key: string, entry: CacheEntry): boolean {
  return canSplitScripture(key, entry) || canSplitNotes(key, entry) || canSplitQuestions(key, entry)
}

export function splitBookEntry(key: string, entry: CacheEntry): { manifestEntry: CacheEntry; chapterEntries: Array<{ key: string; entry: CacheEntry }> } {
  if (canSplitScripture(key, entry)) return splitScriptureEntry(key, entry)
  if (canSplitNotes(key, entry)) return splitNotesEntry(key, entry)
  if (canSplitQuestions(key, entry)) return splitQuestionsEntry(key, entry)
  return { manifestEntry: entry, chapterEntries: [] }
}

export function reassembleBookEntry(
  key: string,
  manifestEntry: CacheEntry,
  chapterEntries: Array<{ key: string; entry: CacheEntry }>
): CacheEntry {
  if (key.startsWith('scripture:')) return reassembleScripture(manifestEntry, chapterEntries)
  if (key.startsWith('tn:')) return reassembleNotes(manifestEntry, chapterEntries)
  if (key.startsWith('tq:')) return reassembleQuestions(manifestEntry, chapterEntries)
  return manifestEntry
}
