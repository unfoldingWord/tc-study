/**
 * The trees and referents of `macula` v2 (`spec/cddl/orig.cddl`), read on demand from an {@link OrigModel} that
 * `origView` has checked. The view keeps `nodes` undecoded; {@link sentenceTree} decodes one sentence and applies the
 * `E_BODY` checks of a tree (`tests/README.md`, "orig"). It imports no builder code and no Node module.
 */
import { ColumnError, decodeUvarints } from '../codec/columns'
import { FormatError } from '../codec/errors'
import type { MaculaReferents, MaculaTrees, OrigModel } from '../model'

/** A tree of a sentence: a part `[label, ...children]`, a word (its position) or a piece of a word `[position, text]`. */
export type MaculaNode = number | [position: number, text: string] | MaculaTree
/** The root of a tree is always a part. */
export interface MaculaTree extends Array<string | MaculaNode> {
  0: string
}

/** One row of `referents`, as the reader outputs it; `ante` is the antecedent's position, absent when the rule could not fix it. */
export type MaculaRow = { word: number; kind: string; piece: string; form: string; strong: string; ch: number; vs: number; ante?: number }

/** The deepest a tree may go: a part or a leaf counts as a node, the root is level 1. */
const MAX_DEPTH = 64

function bad(what: string): never {
  throw new FormatError('E_BODY', `the original segment is malformed: ${what}`)
}

/** The indexes of the sentences whose `lo .. lo + span` meets `lo .. hi` (both ends included), in the file's order. */
export function sentencesAt(trees: MaculaTrees, lo: number, hi: number): number[] {
  const found: number[] = []
  for (let i = 0; i < trees.lo.length; i++) {
    if (trees.lo[i] <= hi && trees.lo[i] + trees.span[i] >= lo) found.push(i)
  }
  return found
}

/**
 * The tree of sentence `i`, decoded from its `nodes` entry. `words` is the number of words of the book. Throws
 * {@link FormatError} `E_BODY` for a tree that is cut short, has bytes left or a second root, whose root is not a part,
 * with a part of 0 children, a label or piece outside its table, a leaf outside `lo .. lo + span` or the book's words,
 * or deeper than 64 levels. `RangeError` for an `i` that is not a sentence.
 */
export function sentenceTree(trees: MaculaTrees, i: number, words: number): MaculaTree {
  if (!Number.isInteger(i) || i < 0 || i >= trees.nodes.length) throw new RangeError(`The sentence ${String(i)} does not exist`)
  let list: number[]
  try {
    list = decodeUvarints(trees.nodes[i])
  } catch (error) {
    if (error instanceof ColumnError) bad(`sentence ${i}: ${error.message}`)
    throw error
  }
  const first = trees.lo[i]
  const last = first + trees.span[i]
  if (first < 0 || last >= words) bad(`sentence ${i} is outside the book's ${words} words`)
  let at = 0
  const next = (): number => {
    if (at >= list.length) bad(`sentence ${i} is cut short`)
    return list[at++]
  }
  const position = (p: number): number => {
    if (p < first || p > last) bad(`sentence ${i} has a leaf at ${p}, outside ${first} .. ${last}`)
    return p
  }
  const node = (depth: number): MaculaNode => {
    if (depth > MAX_DEPTH) bad(`sentence ${i} is deeper than ${MAX_DEPTH} levels`)
    const t = next()
    switch (t % 3) {
      case 0: {
        const label = trees.labels[t / 3]
        if (label === undefined) bad(`sentence ${i} names the label ${t / 3}, and there are ${trees.labels.length}`)
        const count = next()
        if (count === 0) bad(`sentence ${i} has a part with 0 children`)
        const part: [string, ...MaculaNode[]] = [label]
        for (let c = 0; c < count; c++) part.push(node(depth + 1))
        return part
      }
      case 1:
        return position(first + (t - 1) / 3)
      default: {
        const word = position(first + (t - 2) / 3)
        const text = trees.pieces[next()]
        if (text === undefined) bad(`sentence ${i} names a piece outside the ${trees.pieces.length} of the table`)
        return [word, text]
      }
    }
  }
  if (list.length === 0) bad(`sentence ${i} is empty`)
  if (list[0] % 3 !== 0) bad(`sentence ${i} has a root that is not a part`)
  const root = node(1) as MaculaTree
  if (at !== list.length) bad(`sentence ${i} has bytes left after its root`)
  return root
}

/** The rows of the referents whose word is in `lo .. hi` (both included), in the file's order. */
export function referentsAt(refs: MaculaReferents, lo: number, hi: number): MaculaRow[] {
  // `word` never goes down: find the first row at or above `lo`.
  let a = 0
  let b = refs.word.length
  while (a < b) {
    const mid = (a + b) >> 1
    if (refs.word[mid] < lo) a = mid + 1
    else b = mid
  }
  const rows: MaculaRow[] = []
  for (let row = a; row < refs.word.length && refs.word[row] <= hi; row++) rows.push(rowOf(refs, row))
  return rows
}

/** Row `row` of the referents, as the reader outputs it. */
export function rowOf(refs: MaculaReferents, row: number): MaculaRow {
  const [form, strong] = refs.ents[refs.ent[row]]
  const out: MaculaRow = {
    word: refs.word[row],
    kind: refs.kinds[refs.kind[row]],
    piece: refs.pieces[refs.piece[row]],
    form,
    strong,
    ch: refs.ch[row],
    vs: refs.vs[row],
  }
  if (refs.ante[row] !== 0) out.ante = refs.ante[row] - 1
  return out
}

function leading(label: string): number {
  const match = /^[0-9]+/.exec(label)
  return match === null ? 0 : Number(match[0])
}

/**
 * The first and last word position of verse `verse` of chapter `chapter`, in the numbering of the book's own `chapter`
 * and `verse` events (a label starts with its number: `13-14` is 13), or `null` when no word is in it.
 */
export function verseRange(model: OrigModel, chapter: number, verse: number): [first: number, last: number] | null {
  let ch = 0
  let vs = 0
  let event = 0
  let word = 0
  let first = -1
  for (let at = 0; at < model.pieces.length; at++) {
    // An event is at the piece it comes before, so those at this position take effect before this piece.
    for (; event < model.events.length && model.events[event][0] <= at; event++) {
      const [, kind, arg] = model.events[event]
      if (kind === 'chapter') {
        ch = leading(arg)
        vs = 0
      } else if (kind === 'verse') {
        vs = leading(arg)
      }
    }
    if (!model.pieces[at][1]) continue
    if (ch === chapter && vs === verse) {
      if (first < 0) first = word
    } else if (first >= 0) {
      return [first, word - 1]
    }
    word++
  }
  return first < 0 ? null : [first, word - 1]
}
