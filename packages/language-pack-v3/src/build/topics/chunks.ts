/**
 * The section map of the common unit: the `chunks` table of the `xtopics` core (`spec/cddl/xtopics.cddl`). It holds the sections
 * of the English ULT, per book: each is the first and the last verse of a stretch the ULT marks with a `\ts\*` milestone. No Node
 * module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import { put } from '../../codec/values'
import { bookNumber, verseId } from '../../ids'
import type { TextModel } from '../../model'
import { leadingNumber } from '../orig'

/**
 * The sections of one book's text. A section starts at the first verse at or after a `ms:ts` milestone, and the first one at the
 * first verse of the book. It ends at the verse before the start of the next, in the list `verses` (the ids of the verses of the
 * original of the book, as `versesOf` gives them: it knows where a chapter ends); the last ends at the last verse of the list.
 * Verse 0 and the introductions are in no section, a verse bridge counts as its first number, and two milestones with no verse
 * between them make one break. A text without `ms:ts` gives `[]`: the breaks are never invented. A start the list does not
 * have moves to the next verse it has; one with none after it is dropped.
 */
export function chunksOfText(text: TextModel, book: string, verses: readonly number[]): [number, number][] {
  bookNumber(book)
  const list = verses.filter((v) => v % 1000 !== 0 && Math.floor((v % 1_000_000) / 1000) > 0).sort((a, b) => a - b)
  let hasBreak = false
  let pending = false
  let chapter = 0
  let first: number | undefined
  const starts = new Set<number>()
  for (const [, kind, arg] of text.events) {
    if (kind === 'open' && arg === 'ms:ts') {
      hasBreak = true
      pending = true
    } else if (kind === 'chapter') {
      chapter = leadingNumber(arg, 'chapter')
    } else if (kind === 'verse' && chapter > 0 && /^[0-9]/.test(arg)) {
      const verse = leadingNumber(arg, 'verse')
      if (verse === 0) continue
      const id = verseId(book, chapter, verse)
      first ??= id
      if (pending) starts.add(id)
      pending = false
    }
  }
  if (!hasBreak || first === undefined) return []
  starts.add(first)
  const placed = new Set<number>()
  for (const s of starts) {
    const id = list.find((v) => v >= s)
    if (id !== undefined) placed.add(id)
  }
  const sorted = [...placed].sort((a, b) => a - b)
  return sorted.map((from, i) => {
    const next = sorted[i + 1]
    const to = next === undefined ? list[list.length - 1] : list[list.indexOf(next) - 1]
    return [from, to] as [number, number]
  })
}

/** The `chunks` table, in the order of the encoder (books by code point); a book with no section is not in it. */
export function chunksTable(byBook: Map<string, [number, number][]>): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {}
  for (const book of [...byBook.keys()].sort(compareCodePoints)) {
    const list = byBook.get(book)!
    if (list.length === 0) continue
    for (const [a, b] of list) {
      if (!(Math.floor(a / 1_000_000) === bookNumber(book) && Math.floor(b / 1_000_000) === bookNumber(book))) throw new Error(`chunks: ${book} has a verse of another book`)
      if (a > b) throw new Error(`chunks: ${book} has a section that runs backwards`)
    }
    for (let i = 1; i < list.length; i++) if (list[i][0] <= list[i - 1][1]) throw new Error(`chunks: ${book} has sections that overlap or are not ascending`)
    put(out, book, list.map(([a, b]) => [a, b] as [number, number]))
  }
  return out
}
