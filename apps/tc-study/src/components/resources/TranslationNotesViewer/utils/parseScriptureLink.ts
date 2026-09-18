/**
 * Parse scripture references from markdown links and USJ note / xref text.
 *
 * Used by CombinedHelps / TN markdown clicks and ScriptureViewer footnote / xref
 * markers so both go through the same BCV shape → navigateToReference path.
 */

import type { BCVReference } from '../../../../contexts/types-only'
import { BOOK_TITLES } from '../../../../utils/bookNames'

const EXTRA_BOOK_ALIASES: Record<string, string> = {
  matt: 'mat',
  mt: 'mat',
  mk: 'mrk',
  lk: 'luk',
  jn: 'jhn',
  '1tim': '1ti',
  '2tim': '2ti',
  '1sam': '1sa',
  '2sam': '2sa',
  ps: 'psa',
  psalm: 'psa',
  psalms: 'psa',
  song: 'sng',
}

const CHAPTER_VERSE_PATTERN =
  /(\d+):(\d+)(?:[-–—](?:(\d+):)?(\d+))?/g

type BookAlias = { alias: string; code: string }

const BOOK_ALIASES: BookAlias[] = (() => {
  const seen = new Set<string>()
  const list: BookAlias[] = []
  const add = (alias: string, code: string) => {
    const key = alias.toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    list.push({ alias: key, code })
  }

  for (const [code, title] of Object.entries(BOOK_TITLES)) {
    add(title, code)
    add(title.replace(/\s+/g, ''), code)
    add(code, code)
  }
  for (const [alias, code] of Object.entries(EXTRA_BOOK_ALIASES)) {
    add(alias, code)
  }

  list.sort((a, b) => b.alias.length - a.alias.length)
  return list
})()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const BOOK_NAME_PATTERN = new RegExp(
  `\\b(?:${BOOK_ALIASES.map((b) => escapeRegExp(b.alias)).join('|')})\\.?$`,
  'i'
)

function lookupBookCode(name: string): string | null {
  const key = name.replace(/\.$/, '').toLowerCase()
  const hit = BOOK_ALIASES.find((b) => b.alias === key)
  return hit?.code ?? null
}

function chapterVerseFromMatch(
  match: RegExpExecArray,
  book: string
): BCVReference {
  const chapter = parseInt(match[1]!, 10)
  const verse = parseInt(match[2]!, 10)
  const endChapterStr = match[3]
  const endVerseStr = match[4]
  const result: BCVReference = { book, chapter, verse }
  if (endVerseStr) {
    result.endVerse = parseInt(endVerseStr, 10)
    if (endChapterStr) {
      result.endChapter = parseInt(endChapterStr, 10)
    }
  }
  return result
}

function bookBeforeMatch(
  text: string,
  matchIndex: number
): { code: string; start: number } | null {
  const rawBefore = text.slice(0, matchIndex)
  const trimmed = rawBefore.trimEnd()
  const match = trimmed.match(BOOK_NAME_PATTERN)
  if (!match) return null
  const code = lookupBookCode(match[0])
  if (!code) return null
  return { code, start: trimmed.length - match[0].length }
}

/**
 * Parse every `Book C:V` / `C:V` reference in free text
 * (`1 Timothy 5:3–16`, `Matthew 1:1–17; Luke 3:23–38`).
 */
export function parseScriptureRefsFromText(
  text: string,
  currentBook: string
): BCVReference[] {
  const refs: BCVReference[] = []
  const seen = new Set<string>()
  CHAPTER_VERSE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CHAPTER_VERSE_PATTERN.exec(text)) !== null) {
    const bookHit = bookBeforeMatch(text, match.index)
    const book = bookHit?.code || currentBook
    if (!book) continue
    const ref = chapterVerseFromMatch(match, book)
    const key = `${ref.book}:${ref.chapter}:${ref.verse}:${ref.endChapter ?? ''}:${ref.endVerse ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  return refs
}

export function parseScriptureRefFromText(
  text: string,
  currentBook: string
): BCVReference | null {
  return parseScriptureRefsFromText(text, currentBook)[0] ?? null
}

export type ScriptureTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; text: string; ref: BCVReference }

/** Split heading / note / xref text into plain runs and clickable refs. */
export function splitScriptureRefText(
  text: string,
  currentBook: string
): ScriptureTextPart[] {
  const parts: ScriptureTextPart[] = []
  CHAPTER_VERSE_PATTERN.lastIndex = 0
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = CHAPTER_VERSE_PATTERN.exec(text)) !== null) {
    const bookHit = bookBeforeMatch(text, match.index)
    const book = bookHit?.code || currentBook
    const cvStart = match.index
    const refStart = bookHit ? bookHit.start : cvStart
    const start = Math.max(refStart, cursor)
    if (start > cursor) {
      parts.push({ kind: 'text', text: text.slice(cursor, start) })
    }
    const refText = text.slice(start, cvStart + match[0].length)
    parts.push({
      kind: 'ref',
      text: refText,
      ref: chapterVerseFromMatch(match, book),
    })
    cursor = cvStart + match[0].length
  }
  if (cursor < text.length) {
    parts.push({ kind: 'text', text: text.slice(cursor) })
  }
  return parts.length > 0 ? parts : [{ kind: 'text', text }]
}

/**
 * Parse a scripture reference from link text or file path
 *
 * @param linkText - The text between brackets (e.g., "1:1–2:10" or "See verse 5")
 * @param linkHref - The link URL (e.g., "../01/01.md")
 * @param currentBook - The current book code to use if not specified
 * @returns Parsed BCVReference or null if not a scripture link
 */
export function parseScriptureLink(
  linkText: string,
  linkHref: string,
  currentBook: string
): BCVReference | null {
  const refFromText = parseScriptureRefFromText(linkText, currentBook)
  if (refFromText) {
    return refFromText
  }

  const refFromPath = parseReferenceFromPath(linkHref, currentBook)
  if (refFromPath) {
    return refFromPath
  }

  return null
}

/**
 * Parse a scripture reference from a file path
 * Handles formats like:
 * - "../01/01.md" -> chapter 1, verse 1
 * - "../12/05.md" -> chapter 12, verse 5
 * - "../../gen/01/01.md" -> book GEN, chapter 1, verse 1
 */
function parseReferenceFromPath(href: string, currentBook: string): BCVReference | null {
  const pathPattern = /(?:\.\.\/)+(?:([a-z]{3})\/)?(\d+)\/(\d+)\.md/i
  const match = href.match(pathPattern)

  if (!match) {
    return null
  }

  const bookFromPath = match[1]
  const chapter = parseInt(match[2], 10)
  const verse = parseInt(match[3], 10)

  return {
    book: bookFromPath ? bookFromPath.toLowerCase() : currentBook,
    chapter,
    verse,
  }
}
