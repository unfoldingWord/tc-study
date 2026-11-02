import { compareCodePoints } from '../../codec/columns'
import { conceptOfTwLink, strongKey, verseId } from '../../ids'
import type { OrigModel } from '../../model'
import type { Row } from '../../source/rows'
import { sourceRows } from '../bookHelps'
import { OrigIndex } from '../orig'

const FIRST_VERSE = /^\s*(\d+):(\d+|front|intro)/

/** Both texts of a comparison with U+2060 and `/` removed, then NFC (the first form of the README). */
const fold = (text: string): string => text.replace(/[/\u2060]/g, '').normalize('NFC')

/** The second form: NFD without the marks (vowel points, accents), and without U+05BE. */
const loose = (text: string): string => fold(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/\u05be/g, '')

/** The runs of consecutive words of `words` that equal `quote`, as start indexes, in document order. */
function runs(words: string[], quote: string[]): number[] {
  const starts: number[] = []
  if (quote.length === 0) return starts
  for (let i = 0; i + quote.length <= words.length; i++) if (quote.every((w, j) => words[i + j] === w)) starts.push(i)
  return starts
}

/**
 * Adds to `into`, for each `tw:` link of the book, the Strong keys of the original words its quote names, by the rule of
 * `spec/tests/queries/README.md` ("Deriving `strongs` for keyterms"): the first verse of the reference; the `origWords` cut at `&`
 * into pieces and each piece at white space and U+05BE into words (U+05C0 alone dropped); a piece found as a run of consecutive words
 * of the verse, compared folded and then without marks; the `occurrence` picks the run (`-1` takes all). A link with a piece that is
 * not found gives no key. The rule reads the text of the link, not the positions phase 1 resolved: it is the one the fixed queries check.
 */
export function strongsOfQuotes(rows: Row[], book: string, res: string, orig: OrigModel, into: Map<string, Set<string>>): void {
  const index = new OrigIndex(orig)
  const byVerse = new Map<number, { form: string; strong: string }[]>()
  orig.words.forEach((word, position) => {
    const verse = index.verseOf(position)
    const list = byVerse.get(verse)
    if (list === undefined) byVerse.set(verse, [{ form: word.form, strong: word.strong }])
    else list.push({ form: word.form, strong: word.strong })
  })
  for (const { item } of sourceRows(rows, book, res, 'links')) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const concept = typeof record.twLink === 'string' ? conceptOfTwLink(record.twLink) : null
    if (concept === null || !concept.startsWith('tw:')) continue
    const where = FIRST_VERSE.exec(typeof record.reference === 'string' ? record.reference : '')
    if (where === null) continue
    const words = byVerse.get(verseId(book, Number(where[1]), /^\d+$/.test(where[2]) ? Number(where[2]) : 0)) ?? []
    const occurrence = Number(record.occurrence) || 1
    const chosen: number[] = []
    let all = true
    for (const piece of (typeof record.origWords === 'string' ? record.origWords : '').split('&')) {
      const quote = piece.trim().split(/[\s־]+/).filter((w) => w !== '' && w !== '׀')
      let run: [number, number][] | undefined
      for (const norm of [fold, loose]) {
        const q = quote.map(norm)
        const starts = runs(words.map((w) => norm(w.form)), q)
        if (starts.length > 0 && occurrence === -1) run = starts.map((i) => [i, q.length])
        else if (starts.length > 0 && occurrence >= 1 && occurrence <= starts.length) run = [[starts[occurrence - 1], q.length]]
        if (run !== undefined) break
      }
      if (run === undefined) {
        all = false
        break
      }
      for (const [start, length] of run) for (let k = start; k < start + length; k++) chosen.push(k)
    }
    if (!all || chosen.length === 0) continue
    for (const k of chosen) {
      const strong = words[k].strong
      if (strong === undefined || strong === '') continue
      let set = into.get(concept)
      if (set === undefined) into.set(concept, (set = new Set()))
      set.add(strongKey(strong))
    }
  }
}

/** The `strongs` table of the xmap: keys and values sorted by code point, concepts with no key left out. */
export function strongsRecord(m: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const concept of [...m.keys()].sort(compareCodePoints)) {
    const set = m.get(concept)
    if (set === undefined || set.size === 0) continue
    out[concept] = [...set].sort(compareCodePoints)
  }
  return out
}
