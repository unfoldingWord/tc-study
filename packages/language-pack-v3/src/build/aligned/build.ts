/**
 * The index of aligned phrases of a language (`spec/cddl/aligned.cddl`): from the book models and the originals to the
 * {@link AlignedModel} of each part. The entry rules are those of the cddl, verbatim (they were first measured by
 * `spec/tests/measure/alignedIndex.ts`, which now calls this file). No Node module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import { strongKey, verseId } from '../../ids'
import type { AlignedModel, BookModel, OrigModel } from '../../model'
import { inAlignedRange } from './segment'

/**
 * The parts, by the start of the key (normative for this builder, the same table for every language): ranges of keys in code
 * point order, contiguous (the end of one is followed by the start of the next: `ar` `b`... no hole, no overlap), from `a` to `z`.
 * Chosen greedily over the keys of the whole English build of P15, each part at most 250 000 bytes compressed (limit 262 144), the
 * ends as short as the keys allow (prefixes of 1 to 6 characters). A key outside every range goes to `other`.
 */
export const ALIGNED_PARTS: readonly string[] = [
  'a-and ha',
  'and hb-awar',
  'awas-contac',
  'contad-foo',
  'fop-ha',
  'hb-if on',
  'if oo-leb',
  'lec-od',
  'oe-prisc',
  'prisd-sol',
  'som-the ch',
  'the ci-they g',
  'they h-trea',
  'treb-whi',
  'whj-you wh',
  'you wi-z',
]

/** The part a key goes to: one group name (the range that holds the key, else `other`). `strongs` is not used (the parts are by the key). */
export function partOf(key: string, _strongs: string[]): string[] {
  for (const group of ALIGNED_PARTS) if (inAlignedRange(group, key)) return [group]
  return ['other']
}

export type AlignedEntry = { kind: 'word' | 'phrase'; strongs: Map<string, Map<string, [number, number]>> }

const same = (x: number[], y: number[]): boolean => x.length === y.length && x.every((v, k) => v === y[k])

/**
 * The entries of the whole language (key to Strong keys to book to `[verses, occurrences]`), before the split into parts. An entry
 * none of whose words has a Strong key is here with no Strong key (the measurement of Task 21 counted it); {@link buildAligned}
 * does not store it.
 */
export function alignedEntries(o: {
  lang: string
  books: BookModel[]
  origs: Map<string, OrigModel>
  texts: (res: string) => boolean
}): { entries: Map<string, AlignedEntry>; res: [string, string][]; report: string[] } {
  const { lang } = o
  const index = new Map<string, AlignedEntry>()
  const verses = new Map<string, Set<number>>() // key|strong|book -> distinct verses
  const resUsed = new Map<string, string>()
  const report: string[] = []
  const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase(lang)
  const add = (key: string, kind: 'word' | 'phrase', strongs: string[], book: string, verse: number): void => {
    let entry = index.get(key)
    if (entry === undefined) index.set(key, (entry = { kind, strongs: new Map() }))
    for (const s of strongs) {
      let per = entry.strongs.get(s)
      if (per === undefined) entry.strongs.set(s, (per = new Map()))
      let c = per.get(book)
      if (c === undefined) per.set(book, (c = [0, 0]))
      const id = `${key}\u0000${s}\u0000${book}`
      let seen = verses.get(id)
      if (seen === undefined) verses.set(id, (seen = new Set()))
      if (!seen.has(verse)) {
        seen.add(verse)
        c[0]++
      }
      c[1]++
    }
  }
  for (const b of o.books) {
    const orig = o.origs.get(b.book)
    if (orig === undefined) {
      report.push(`aligned: book ${b.book}: no originals: left out`)
      continue
    }
    const strongsOf = (a: number[]): string[] => [...new Set(a.map((p) => strongKey(orig.words[p]?.strong ?? '')).filter((s) => s !== ''))]
    for (const text of b.texts) {
      if (!o.texts(text.res) || text.align === undefined) continue
      const tag = b.res.find(([key]) => key === text.res)?.[1]
      if (tag !== undefined) resUsed.set(text.res, tag)
      const words: { t: string; a: number[]; v: number; adj: boolean }[] = []
      let ev = 0
      let chapter = 0
      let verse = 0
      let ord = 0
      let gap = false // only " " pieces since the last word
      for (let i = 0; i < text.pieces.length; i++) {
        while (ev < text.events.length && text.events[ev]![0] <= i) {
          const [, kind, arg] = text.events[ev++]!
          if (kind === 'chapter') {
            chapter = parseInt(arg, 10) || 0
            verse = 0
          } else if (kind === 'verse') verse = parseInt(arg, 10) || 0
        }
        const [p, isWord] = text.pieces[i]!
        if (isWord) {
          words.push({ t: p, a: text.align[ord++] ?? [], v: verseId(b.book, chapter, verse), adj: gap })
          gap = true
        } else if (p !== ' ') gap = false
      }
      for (const w of words) if (w.a.length > 0) add(norm(w.t), 'word', strongsOf(w.a), b.book, w.v)
      for (let i = 0; i < words.length; ) {
        const w = words[i]!
        if (w.a.length === 0) {
          i++
          continue
        }
        let j = i + 1
        while (j < words.length && words[j]!.adj && same(words[j]!.a, w.a)) j++
        if (j - i >= 2) add(norm(words.slice(i, j).map((x) => x.t).join(' ')), 'phrase', strongsOf(w.a), b.book, w.v)
        i = j
      }
    }
  }
  const res = [...resUsed].sort((a, b) => compareCodePoints(a[0], b[0]))
  return { entries: index, res, report }
}

/**
 * The parts of the index of a language: one {@link AlignedModel} per part that has a key, in the order of the table and then
 * `other`. `texts` picks the bridge texts by resource key (`/glt`, `/gst` for es-419; `/ult`, `/ust` for en). `report` has a line
 * for a book left out because its originals are missing, and one when no text was read.
 */
export function buildAligned(o: {
  lang: string
  books: BookModel[]
  origs: Map<string, OrigModel>
  texts: (res: string) => boolean
}): { parts: AlignedModel[]; report: string[] } {
  const { entries, res, report } = alignedEntries(o)
  if (![...entries.values()].some((e) => e.strongs.size > 0)) report.push(`aligned: ${o.lang} has no aligned text: no part built`)
  const parts = new Map<string, AlignedModel>()
  for (const [key, entry] of entries) {
    if (entry.strongs.size === 0) continue // an entry with no Strong key is not stored
    const strongs = [...entry.strongs.keys()]
    for (const group of partOf(key, strongs)) {
      let part = parts.get(group)
      if (part === undefined) parts.set(group, (part = { lang: o.lang, group, res, entries: new Map() }))
      part.entries.set(key, entry.strongs)
    }
  }
  const order = [...ALIGNED_PARTS, 'other']
  return { parts: order.filter((g) => parts.has(g)).map((g) => parts.get(g)!), report }
}

/** The bridge texts of the aligned index: a resource key that ends in `/glt`, `/gst`, `/ult` or `/ust`. */
export const isBridgeText = (res: string): boolean => /\/(glt|gst|ult|ust)$/.test(res)

