/**
 * Names from the alignment (plan Decision 5). For each name line of a TIPNR record (its dStrong and its references, with
 * the `a`/`b` occurrence letters), the words of a bridge text aligned to that original word in that verse. A name is taken
 * only in the verses TIPNR lists for the record (a place name that is also a common word adds nothing elsewhere).
 *
 * - **References.** TIPNR numbers as English Bibles do, which is the numbering of the UHB: no conversion. A reference
 *   with a letter names the nth word of the verse with that Strong key (`a` the first); one without names every such word.
 * - **Strong keys.** The dStrong is written as a key by `strongKeyOfDStrong`; a word of the original matches when its key
 *   (after the prefixes of the UHB, `b:`, `c:`) has the same letter and number, and the same suffix when the dStrong has one.
 * - **One-to-many.** The name is the maximal run of consecutive words aligned to that original word (only `" "` between
 *   them) that contains the first of them; the other aligned words are not part of the name and each run gets a line in
 *   `issues`.
 * - **Counting.** One count per record, per text and per original word. Names are NFC as published, never lowercased.
 *   Variants: most frequent first, ties by code point. `books` are book codes in book order, `verses` verse ids.
 * No Node module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import { BOOKS, bookNumber, verseId } from '../../ids'
import type { BookModel, OrigModel, TextModel } from '../../model'
import type { TipnrRecord } from '../../source/tipnr'
import { strongKeyOfDStrong } from './xtopics'

export type AlignedName = { name: string; count: number; books: string[]; verses: number[] }

/** The Strong key of a word of the original without the prefixes of the UHB (`c:H1961` is `H1961`). */
const keyOfWord = (strong: string): string => strong.slice(strong.lastIndexOf(':') + 1).trim()

const KEY = /^([HG])(\d{4,5})([a-z]?)$/

/** Whether a word's key is the key of the dStrong: same letter and number, and the same suffix when the dStrong has one. */
function sameKey(word: string, wanted: string): boolean {
  const w = KEY.exec(word)
  const d = KEY.exec(wanted)
  if (w === null || d === null) return false
  return w[1] === d[1] && w[2] === d[2] && (d[3] === '' || d[3] === w[3])
}

const bookCodeOf = (verse: number): string => BOOKS[Math.floor(verse / 1_000_000) - 1]

/** The verse id of each word of the original (words before the first verse of a chapter belong to its verse 0). */
function verseOfWords(orig: OrigModel): number[] {
  const out: number[] = []
  const events = orig.events
  let e = 0
  let chapter = 0
  let verse = verseId(orig.book, 0, 0)
  // Event positions count pieces, words and what lies between them; a word's position counts words only.
  for (let i = 0; i < orig.pieces.length; i++) {
    while (e < events.length && events[e][0] <= i) {
      const [, kind, arg] = events[e++]
      const n = /^\d+/.exec(arg)
      if (kind === 'chapter' && n !== null) {
        chapter = Number(n[0])
        verse = verseId(orig.book, chapter, 0)
      } else if (kind === 'verse' && n !== null) verse = verseId(orig.book, chapter, Number(n[0]))
    }
    if (orig.pieces[i][1]) out.push(verse)
  }
  return out
}

type TextIndex = {
  text: TextModel
  /** The ordinals of the words aligned to each position of the original, ascending. */
  aligned: Map<number, number[]>
  /** The index in `pieces` of each word, by ordinal. */
  pieceOf: number[]
}

function indexText(text: TextModel): TextIndex {
  const aligned = new Map<number, number[]>()
  text.align?.forEach((positions, ordinal) => {
    for (const p of positions) {
      const list = aligned.get(p)
      if (list === undefined) aligned.set(p, [ordinal])
      else list.push(ordinal)
    }
  })
  const pieceOf: number[] = []
  text.pieces.forEach(([, isWord], i) => {
    if (isWord) pieceOf.push(i)
  })
  return { text, aligned, pieceOf }
}

/** Whether the words `a` and `b` (ordinals, `a < b`) have only `" "` between them. */
function adjacent(t: TextIndex, a: number, b: number): boolean {
  let between = ''
  for (let i = t.pieceOf[a] + 1; i < t.pieceOf[b]; i++) between += t.text.pieces[i][0]
  return between === ' '
}

export function alignedNames(
  o: { records: TipnrRecord[]; books: BookModel[]; origs: Map<string, OrigModel>; lang: string },
  issues: string[],
): Map<string, AlignedName[]> {
  const byVerse = new Map<string, Map<number, number[]>>()
  const wordKeys = new Map<string, string[]>()
  const verseWords = (book: string): Map<number, number[]> | undefined => {
    const orig = o.origs.get(book)
    if (orig === undefined) return undefined
    let map = byVerse.get(book)
    if (map === undefined) {
      const made = new Map<number, number[]>()
      verseOfWords(orig).forEach((v, position) => {
        const list = made.get(v)
        if (list === undefined) made.set(v, [position])
        else list.push(position)
      })
      byVerse.set(book, (map = made))
      wordKeys.set(book, orig.words.map((w) => keyOfWord(w.strong)))
    }
    return map
  }

  const texts = new Map<string, TextIndex[]>()
  for (const b of o.books) {
    if (b.lang !== o.lang) continue
    const orig = o.origs.get(b.book)
    if (orig === undefined) continue
    if (b.orig[1] !== orig.stamp) {
      issues.push(`${b.book}: the text was aligned to the original ${b.orig[1]}, not ${orig.stamp}: no names from it`)
      continue
    }
    const list = texts.get(b.book) ?? []
    for (const t of b.texts) if (t.align !== undefined) list.push(indexText(t))
    texts.set(b.book, list)
  }

  const out = new Map<string, AlignedName[]>()
  let unaligned = 0
  for (const record of o.records) {
    const variants = new Map<string, { count: number; books: Set<string>; verses: Set<number> }>()
    const done = new Set<string>()
    for (const line of record.names) {
      const wanted = strongKeyOfDStrong(line.dStrong)
      if (wanted === null) continue
      for (const ref of line.refs) {
        const book = bookCodeOf(ref.verse)
        const textsOfBook = texts.get(book)
        const inVerse = verseWords(book)?.get(ref.verse)
        if (textsOfBook === undefined || inVerse === undefined) continue
        const keys = wordKeys.get(book)!
        let candidates = inVerse.filter((p) => sameKey(keys[p], wanted))
        if (ref.letter !== undefined) {
          const n = ref.letter.charCodeAt(0) - 97
          if (candidates[n] === undefined) {
            issues.push(`${record.id}: ${line.name} ${ref.verse}${ref.letter}: the verse has no such occurrence of ${line.dStrong}`)
            continue
          }
          candidates = [candidates[n]]
        }
        for (const position of candidates) {
          for (const t of textsOfBook) {
            const mark = `${t.text.res}\0${position}`
            if (done.has(mark)) continue
            const words = t.aligned.get(position)
            if (words === undefined) {
              unaligned++
              continue
            }
            done.add(mark)
            let end = 0
            while (end + 1 < words.length && adjacent(t, words[end], words[end + 1])) end++
            const form = (w: number): string => t.text.pieces[t.pieceOf[w]][0]
            const name = words.slice(0, end + 1).map(form).join(' ').normalize('NFC')
            if (end + 1 < words.length) {
              const rest = words.slice(end + 1).map(form)
              issues.push(
                `${record.id} ${t.text.res} ${ref.verse}: ${JSON.stringify(name)} is the run with the first aligned word; ${rest.length} other aligned word(s) left out: ${rest.join(' ')}`,
              )
            }
            let v = variants.get(name)
            if (v === undefined) variants.set(name, (v = { count: 0, books: new Set(), verses: new Set() }))
            v.count++
            v.books.add(book)
            v.verses.add(ref.verse)
          }
        }
      }
    }
    if (variants.size === 0) continue
    out.set(
      record.id,
      [...variants]
        .map(([name, v]) => ({
          name,
          count: v.count,
          books: [...v.books].sort((a, b) => bookNumber(a) - bookNumber(b)),
          verses: [...v.verses].sort((a, b) => a - b),
        }))
        .sort((a, b) => b.count - a.count || compareCodePoints(a.name, b.name)),
    )
  }
  if (unaligned > 0) issues.push(`${unaligned} reference(s) found the original word but no word of the text aligned to it`)
  return out
}
