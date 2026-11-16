/**
 * The MACULA trees of a book as `macula` v2 (`spec/cddl/orig.cddl`, "Builder rules"): the published v1 trees, whose leaves are
 * ids `CCCVVVWWW`, become word positions of the book. Builders import this; it uses no Node module.
 */
import { encodeUvarints, stringTable } from '../../codec/columns'
import type { Event, MaculaTrees, Piece } from '../../model'

/** What was left out, per book, for the build report. */
export type MaculaTreeCounts = {
  /** Leaves (words or pieces) whose verse is not in the book or whose word number is past the verse's words. */
  leaves: number
  /** Parts left with no word or piece after the leaves went (not counting a sentence's root: that is a dropped sentence). */
  parts: number
  /** Sentences left with no word or piece. */
  sentences: number
}

/** A verse of the book: the position of its first word and its number of words. */
export type VerseSpan = { first: number; words: number }

function leading(label: string): number {
  const match = /^[0-9]+/.exec(label)
  return match === null ? 0 : Number(match[0])
}

/**
 * The verses of a book by `"C:V"` (the numbers of the book's own `chapter` and `verse` events; a label starts with its number),
 * with the first word position and the number of words of the first run of words in that verse. Verses with no word are absent.
 */
export function verseSpans(pieces: Piece[], events: Event[]): Map<string, VerseSpan> {
  const spans = new Map<string, VerseSpan>()
  let ch = 0
  let vs = 0
  let event = 0
  let word = 0
  let open: VerseSpan | undefined
  let openKey = ''
  const closed = new Set<string>()
  for (let at = 0; at < pieces.length; at++) {
    for (; event < events.length && events[event][0] <= at; event++) {
      const [, kind, arg] = events[event]
      if (kind === 'chapter') {
        ch = leading(arg)
        vs = 0
      } else if (kind === 'verse') {
        vs = leading(arg)
      }
    }
    if (!pieces[at][1]) continue
    const key = `${ch}:${vs}`
    if (open !== undefined && openKey !== key) {
      closed.add(openKey)
      open = undefined
    }
    if (open === undefined && !closed.has(key) && !spans.has(key)) {
      open = { first: word, words: 0 }
      openKey = key
      spans.set(key, open)
    }
    if (open !== undefined && openKey === key) open.words++
    word++
  }
  return spans
}

type Kept = number | [position: number, text: string] | { label: string; children: Kept[] }

const isPart = (node: unknown): node is [string, ...unknown[]] => Array.isArray(node) && typeof node[0] === 'string'

/**
 * Turns the published v1 value `{sentences: [tree, ...], words}` into `MaculaTrees` of this book, and counts what it left out.
 * A leaf id `CCCVVVWWW` becomes the position of word `WWW` (from 1) of verse `C:V`; `[id, text]` becomes a piece of that word.
 * A leaf whose verse is not in the book, or whose word is past the verse's words, is dropped; so is a part left with no leaf,
 * and a sentence left with none. Sentences stay in published order. Throws `Error` for a value that is not the published shape.
 */
export function buildMaculaTrees(published: unknown, pieces: Piece[], events: Event[]): { trees: MaculaTrees; counts: MaculaTreeCounts } {
  const sentences = (published as { sentences?: unknown } | null)?.sentences
  if (!Array.isArray(sentences)) throw new Error('macula trees: the published value has no list of sentences')
  const verses = verseSpans(pieces, events)
  const counts: MaculaTreeCounts = { leaves: 0, parts: 0, sentences: 0 }

  const position = (id: unknown): number | undefined => {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) throw new Error(`macula trees: ${JSON.stringify(id)} is not a leaf id`)
    const verse = verses.get(`${Math.floor(id / 1_000_000)}:${Math.floor(id / 1000) % 1000}`)
    const word = id % 1000
    if (verse === undefined || word < 1 || word > verse.words) return undefined
    return verse.first + word - 1
  }

  const keep = (node: unknown, root = false): Kept | undefined => {
    if (typeof node === 'number') {
      const at = position(node)
      if (at === undefined) counts.leaves++
      return at
    }
    if (isPart(node)) {
      const children: Kept[] = []
      for (let i = 1; i < node.length; i++) {
        const child = keep(node[i])
        if (child !== undefined) children.push(child)
      }
      if (children.length === 0) {
        if (!root) counts.parts++
        return undefined
      }
      return { label: node[0], children }
    }
    if (Array.isArray(node) && node.length === 2 && typeof node[1] === 'string') {
      const at = position(node[0])
      if (at === undefined) {
        counts.leaves++
        return undefined
      }
      return [at, node[1]]
    }
    throw new Error(`macula trees: ${JSON.stringify(node)} is not a part, a leaf or a piece of a word`)
  }

  const kept: { root: { label: string; children: Kept[] }; lo: number; hi: number }[] = []
  for (const sentence of sentences) {
    if (!isPart(sentence)) throw new Error('macula trees: a sentence does not start with a label')
    const root = keep(sentence, true)
    if (root === undefined) {
      counts.sentences++
      continue
    }
    let lo = Infinity
    let hi = -Infinity
    const walk = (n: Kept): void => {
      if (typeof n === 'number') (lo = Math.min(lo, n)), (hi = Math.max(hi, n))
      else if (Array.isArray(n)) (lo = Math.min(lo, n[0])), (hi = Math.max(hi, n[0]))
      else n.children.forEach(walk)
    }
    walk(root)
    kept.push({ root: root as { label: string; children: Kept[] }, lo, hi })
  }

  const labelUses: string[] = []
  const pieceUses: string[] = []
  const count = (n: Kept): void => {
    if (typeof n === 'number') return
    if (Array.isArray(n)) pieceUses.push(n[1])
    else (labelUses.push(n.label), n.children.forEach(count))
  }
  kept.forEach((s) => count(s.root))
  const labels = stringTable(labelUses)
  const pieceTable = stringTable(pieceUses)

  const trees: MaculaTrees = { labels: labels.list, pieces: pieceTable.list, lo: [], span: [], nodes: [] }
  for (const { root, lo, hi } of kept) {
    const out: number[] = []
    const write = (n: Kept): void => {
      if (typeof n === 'number') out.push(1 + 3 * (n - lo))
      else if (Array.isArray(n)) out.push(2 + 3 * (n[0] - lo), pieceTable.index.get(n[1])!)
      else {
        out.push(3 * labels.index.get(n.label)!, n.children.length)
        n.children.forEach(write)
      }
    }
    write(root)
    trees.lo.push(lo)
    trees.span.push(hi - lo)
    trees.nodes.push(encodeUvarints(out))
  }
  return { trees, counts }
}

/** The report lines for what {@link buildMaculaTrees} left out (none when nothing was), to go with the book's other issues. */
export function maculaTreeIssues(counts: MaculaTreeCounts): string[] {
  const lines: string[] = []
  if (counts.leaves > 0) lines.push(`MACULA trees: ${counts.leaves} word(s) whose place is not in this book's words: left out of the trees`)
  if (counts.parts > 0) lines.push(`MACULA trees: ${counts.parts} part(s) left with no word: left out of the trees`)
  if (counts.sentences > 0) lines.push(`MACULA trees: ${counts.sentences} sentence(s) left with no word: left out of the trees`)
  return lines
}
