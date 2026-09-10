/**
 * Chapter-grained scripture-usj SoT.
 *
 * New writes: `scripture-usj:{resourceKey}:{book}:{chapter}` (one IDB get).
 * Legacy book blobs at `scripture-usj:{resourceKey}:{book}` migrate lazily
 * on the first chapter read.
 */

import type { AlignmentMap, UsjScriptureCacheContent } from '@bt-synergy/usj-processor'

import {
  usjScriptureChapterKey,
  usjScriptureKey,
} from './scriptureCacheKeys'
import { isUsjScriptureCacheContent } from './usjCache'

export type UsjChapterCache = {
  get(key: string): Promise<unknown>
  set?(key: string, entry: unknown): Promise<void>
}

export type UsjScriptureBookIndex = {
  book: string
  bookCode: string
  metadata: UsjScriptureCacheContent['metadata']
  chapterNumbers: number[]
}

export function unwrapUsjEntry(entry: unknown): unknown {
  if (entry && typeof entry === 'object' && 'content' in entry) {
    const content = (entry as { content: unknown }).content
    if (content && typeof content === 'object') return content
  }
  return entry
}

export function isUsjBookIndex(value: unknown): value is UsjScriptureBookIndex {
  if (!value || typeof value !== 'object') return false
  const row = value as UsjScriptureBookIndex
  return Array.isArray(row.chapterNumbers) && typeof row.bookCode === 'string'
}

function wrapEntry(
  content: unknown,
  extra?: Record<string, unknown>
): { content: unknown; timestamp: number } & Record<string, unknown> {
  return { content, timestamp: Date.now(), ...extra }
}

function alignmentsForChapter(
  alignmentMap: AlignmentMap | undefined,
  bookCode: string,
  chapter: number
): AlignmentMap {
  const subset: AlignmentMap = {}
  if (!alignmentMap) return subset
  const prefix = `${bookCode} ${chapter}:`.toLowerCase()
  for (const [verseRef, groups] of Object.entries(alignmentMap)) {
    if (verseRef.toLowerCase().startsWith(prefix)) {
      subset[verseRef] = groups
    }
  }
  return subset
}

function chapterNumbersFromBook(book: UsjScriptureCacheContent): number[] {
  if (book.chapters?.length) {
    return book.chapters.map((ch, i) => ch.number ?? i + 1)
  }
  return []
}

export function buildUsjChapterContent(
  book: UsjScriptureCacheContent,
  chapter: number
): UsjScriptureCacheContent | null {
  const slice = book.chapters?.find((ch) => (ch.number ?? 0) === chapter)
  if (!slice) return null
  const nodes = slice.content ?? []
  return {
    book: book.book,
    bookCode: book.bookCode,
    metadata: book.metadata,
    usj: {
      type: book.usj?.type ?? 'USJ',
      version: book.usj?.version ?? '3.0',
      content: nodes,
    },
    alignmentMap: alignmentsForChapter(book.alignmentMap, book.bookCode, chapter),
    chapters: [{ number: chapter, content: nodes }],
  }
}

export function buildUsjBookIndex(book: UsjScriptureCacheContent): UsjScriptureBookIndex {
  return {
    book: book.book,
    bookCode: book.bookCode,
    metadata: book.metadata,
    chapterNumbers: chapterNumbersFromBook(book),
  }
}

function mergeChapterContents(
  index: UsjScriptureBookIndex,
  chapters: UsjScriptureCacheContent[]
): UsjScriptureCacheContent {
  const alignmentMap: AlignmentMap = {}
  const slices: Array<{ number: number; content: unknown[] }> = []
  const usjContent: unknown[] = []
  const ordered = [...chapters].sort((a, b) => {
    const na = a.chapters?.[0]?.number ?? 0
    const nb = b.chapters?.[0]?.number ?? 0
    return na - nb
  })
  for (const ch of ordered) {
    const number = ch.chapters?.[0]?.number ?? 0
    const nodes = ch.chapters?.[0]?.content ?? ch.usj?.content ?? []
    slices.push({ number, content: nodes })
    usjContent.push(...nodes)
    Object.assign(alignmentMap, ch.alignmentMap ?? {})
  }
  return {
    book: index.book,
    bookCode: index.bookCode,
    metadata: index.metadata,
    usj: { type: 'USJ', version: '3.0', content: usjContent },
    alignmentMap,
    chapters: slices,
  }
}

export async function writeUsjChapters(
  cache: UsjChapterCache,
  resourceKey: string,
  bookId: string,
  book: UsjScriptureCacheContent,
  options?: { prioritize?: number[] }
): Promise<void> {
  if (!cache.set) return
  const bookCode = bookId.toLowerCase()
  const numbers = chapterNumbersFromBook(book)
  const prioritize = options?.prioritize ?? []
  const ordered = [
    ...prioritize.filter((n) => numbers.includes(n)),
    ...numbers.filter((n) => !prioritize.includes(n)),
  ]

  for (const chapter of ordered) {
    const content = buildUsjChapterContent(book, chapter)
    if (!content) continue
    await cache.set(usjScriptureChapterKey(resourceKey, bookCode, chapter), wrapEntry(content, {
      resourceKey,
      bookId: bookCode,
      chapter,
    }))
  }

  await cache.set(
    usjScriptureKey(resourceKey, bookCode),
    wrapEntry(buildUsjBookIndex(book), { resourceKey, bookId: bookCode })
  )
}

async function migrateBookBlobToChapters(
  cache: UsjChapterCache,
  resourceKey: string,
  bookId: string,
  book: UsjScriptureCacheContent
): Promise<void> {
  await writeUsjChapters(cache, resourceKey, bookId, book)
}

export async function readUsjChapter(
  cache: UsjChapterCache,
  resourceKey: string,
  bookId: string,
  chapter: number
): Promise<UsjScriptureCacheContent | null> {
  const bookCode = bookId.toLowerCase()
  const chapterKey = usjScriptureChapterKey(resourceKey, bookCode, chapter)
  const chapterHit = unwrapUsjEntry(await cache.get(chapterKey))
  if (isUsjScriptureCacheContent(chapterHit) && (chapterHit.usj || chapterHit.chapters?.length)) {
    return chapterHit
  }

  const bookKey = usjScriptureKey(resourceKey, bookCode)
  const bookHit = unwrapUsjEntry(await cache.get(bookKey))
  if (isUsjScriptureCacheContent(bookHit) && (bookHit.usj || bookHit.chapters?.length)) {
    await migrateBookBlobToChapters(cache, resourceKey, bookCode, bookHit)
    return buildUsjChapterContent(bookHit, chapter)
  }
  return null
}

export async function readUsjBook(
  cache: UsjChapterCache,
  resourceKey: string,
  bookId: string
): Promise<UsjScriptureCacheContent | null> {
  const bookCode = bookId.toLowerCase()
  const bookKey = usjScriptureKey(resourceKey, bookCode)
  const bookHit = unwrapUsjEntry(await cache.get(bookKey))
  if (isUsjScriptureCacheContent(bookHit) && (bookHit.usj || bookHit.chapters?.length)) {
    return bookHit
  }

  const index = isUsjBookIndex(bookHit) ? bookHit : null
  const numbers = index?.chapterNumbers ?? []
  if (numbers.length === 0) return null

  const chapters: UsjScriptureCacheContent[] = []
  for (const chapter of numbers) {
    const row = await readUsjChapter(cache, resourceKey, bookCode, chapter)
    if (row) chapters.push(row)
  }
  if (chapters.length === 0) return null
  return mergeChapterContents(
    index ?? {
      book: bookCode,
      bookCode,
      metadata: chapters[0]!.metadata,
      chapterNumbers: numbers,
    },
    chapters
  )
}

export async function hasUsjChapterOrBook(
  cache: UsjChapterCache,
  resourceKey: string,
  bookId: string
): Promise<boolean> {
  const bookCode = bookId.toLowerCase()
  const bookHit = unwrapUsjEntry(await cache.get(usjScriptureKey(resourceKey, bookCode)))
  if (isUsjScriptureCacheContent(bookHit) && (bookHit.usj || bookHit.chapters?.length)) {
    return true
  }
  if (isUsjBookIndex(bookHit) && bookHit.chapterNumbers.length > 0) return true
  const ch1 = unwrapUsjEntry(await cache.get(usjScriptureChapterKey(resourceKey, bookCode, 1)))
  return isUsjScriptureCacheContent(ch1) && Boolean(ch1.usj || ch1.chapters?.length)
}
