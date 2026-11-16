import { describe, expect, test } from 'bun:test'
import { origSegment } from '../build/orig'
import { encodeUvarints } from '../codec/columns'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { MaculaReferents, MaculaTrees, OrigModel } from '../model'
import { referentsAt, sentenceTree, sentencesAt, verseRange } from './macula'
import { ORIG_TABLES, origView } from './orig'
import { KNOWN } from './output'

const bytes = (...n: number[]) => encodeUvarints(n)

/** Four words in two verses of chapter 1: 0 and 1 in verse 1, 2 and 3 in verse 2. */
function base(): OrigModel {
  const forms = ['a', 'b', 'c', 'd']
  return {
    book: 'jon',
    key: 'x/hbo/uhb',
    stamp: 'v1',
    words: forms.map((form) => ({ form, lemma: form, strong: 'H1', morph: '' })),
    pieces: forms.map((form): [string, boolean] => [form, true]),
    events: [
      [0, 'chapter', '1'],
      [0, 'verse', '1'],
      [2, 'verse', '2'],
    ],
  }
}

const trees = (): MaculaTrees => ({
  labels: ['*', 'v'],
  pieces: ['x'],
  lo: [0, 2],
  span: [1, 1],
  // 0: part "*" with the words 0 and 1. 1: part "v" with a piece of word 2 and the word 3.
  nodes: [bytes(0, 2, 1, 4), bytes(3, 2, 2, 0, 4)],
})

const referents = (): MaculaReferents => ({
  ents: [
    ['a', 'H1'],
    ['b', ''],
  ],
  kinds: ['r', 's'],
  pieces: ['', 'x'],
  word: [1, 1, 3],
  kind: [0, 1, 0],
  piece: [0, 1, 0],
  ent: [0, 1, 1],
  ch: [1, 1, 1],
  vs: [1, 1, 2],
  ante: [1, 0, 3],
})

const v2 = (m: Partial<{ trees: MaculaTrees; referents: MaculaReferents }> = { trees: trees(), referents: referents() }): OrigModel => ({
  ...base(),
  macula: { release: 'r1', v: 2, ...m },
})

async function roundTrip(m: OrigModel): Promise<OrigModel> {
  const { bytes: file } = await writeSegment(origSegment(m))
  const { seg } = await readSegment(file, { known: ORIG_TABLES })
  return origView(seg)
}

/** The view of the segment of `m` after `change` has altered the decoded tables. */
function viewAfter(m: OrigModel, change: (macula: any) => void): OrigModel {
  const seg = structuredClone(origSegment(m)) as Segment
  change(seg.t.macula)
  return origView(seg)
}

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof FormatError ? error.code : `other: ${String(error)}`
  }
  return undefined
}
const body = (fn: () => unknown) => expect(code(fn)).toBe('E_BODY')

describe('macula v2 in the original segment', () => {
  test('round trip: the model comes back, and h.tables says v2', async () => {
    const m = v2()
    expect(origSegment(m).h.tables.macula).toEqual([2, false])
    expect(await roundTrip(m)).toEqual(m)
  })

  test('trees only, referents only, release only', async () => {
    for (const part of [{ trees: trees() }, { referents: referents() }, {}]) {
      const m = v2(part)
      expect(await roundTrip(m)).toEqual(m)
    }
  })

  test('the same model gives the same bytes', async () => {
    expect((await writeSegment(origSegment(v2()))).id).toBe((await writeSegment(origSegment(v2()))).id)
  })

  test('v1 is still written and read, and the reader says v: 1', async () => {
    const old: OrigModel = { ...base(), macula: { release: 'r1', trees: { s: [1] }, referents: { r: [2] } } }
    expect(origSegment(old).h.tables.macula).toEqual([1, false])
    expect((await roundTrip(old)).macula).toEqual({ release: 'r1', v: 1, trees: { s: [1] }, referents: { r: [2] } })
  })

  test('an old reader (macula: [1]) skips v2 and gives a model without macula', async () => {
    const { bytes: file } = await writeSegment(origSegment(v2()))
    const { seg, skipped } = await readSegment(file, { known: { words: [1], text: [1], macula: [1] } })
    expect(skipped).toEqual(['macula'])
    const m = origView(seg)
    expect(m.macula).toBeUndefined()
    expect(m.words).toEqual(base().words)
  })

  test('KNOWN lists macula 1 and 2', () => {
    expect(KNOWN.orig.macula).toEqual([1, 2])
  })

  test('the writer refuses columns of different lengths and rows out of order', () => {
    const t = trees()
    t.span.pop()
    expect(() => origSegment(v2({ trees: t }))).toThrow()
    const r = referents()
    r.word = [3, 1, 1]
    expect(() => origSegment(v2({ referents: r }))).toThrow()
  })
})

describe('the view checks the columns', () => {
  const tamper: [string, (macula: any) => void][] = [
    ['lo, span and nodes of different lengths', (m) => (m.trees.nodes = [m.trees.nodes[0]])],
    ['span above n - 1', (m) => (m.trees.span = bytes(4, 1))],
    ['lo above n - 1 - span', (m) => (m.trees.span = bytes(1, 2))],
    ['nodes that are not bytes', (m) => (m.trees.nodes = ['x', 'y'])],
    ['referent columns of unequal length', (m) => (m.referents.cols.ch = bytes(1))],
    ['a kind outside kinds', (m) => (m.referents.cols.kind = bytes(0, 2, 0))],
    ['a piece outside pieces', (m) => (m.referents.cols.piece = bytes(0, 0, 2))],
    ['an ent outside ents', (m) => (m.referents.cols.ent = bytes(0, 1, 2))],
    ['a word outside the book', (m) => (m.referents.cols.word = bytes(1, 0, 3))],
    ['ch of 0', (m) => (m.referents.cols.ch = bytes(1, 0, 1))],
    ['vs of 0', (m) => (m.referents.cols.vs = bytes(1, 1, 0))],
    ['ante above n', (m) => (m.referents.cols.ante = bytes(1, 0, 5))],
    ['release that is not text', (m) => (m.release = 1)],
  ]
  for (const [name, change] of tamper) test(name, () => body(() => viewAfter(v2(), change)))

  test('ante equal to n is valid', () => {
    expect(() => viewAfter(v2(), (m) => (m.referents.cols.ante = bytes(1, 0, 4)))).not.toThrow()
  })
})

describe('sentenceTree', () => {
  const tree = (nodes: Uint8Array, lo = 0, span = 3) => {
    const t: MaculaTrees = { labels: ['*', 'v'], pieces: ['x'], lo: [lo], span: [span], nodes: [nodes] }
    return () => sentenceTree(t, 0, 4)
  }

  test('decodes parts, words and pieces', () => {
    const t = trees()
    expect(sentenceTree(t, 0, 4)).toEqual(['*', 0, 1])
    expect(sentenceTree(t, 1, 4)).toEqual(['v', [2, 'x'], 3])
    expect(() => sentenceTree(t, 2, 4)).toThrow(RangeError)
  })

  test('nested parts', () => {
    expect(tree(bytes(0, 2, 3, 1, 1, 7))()).toEqual(['*', ['v', 0], 2])
  })

  const cases: [string, Uint8Array][] = [
    ['a tree cut short', bytes(0, 2, 1)],
    ['a tree cut short after a part', bytes(0)],
    ['bytes left after the root', bytes(0, 1, 1, 1)],
    ['a second root', bytes(0, 1, 1, 0, 1, 1)],
    ['a word as root', bytes(1)],
    ['a piece as root', bytes(2, 0)],
    ['a part with 0 children', bytes(0, 0)],
    ['a nested part with 0 children', bytes(0, 1, 3, 0)],
    ['an empty list', bytes()],
    ['a label outside labels', bytes(6, 1, 1)],
    ['a piece outside pieces', bytes(0, 1, 2, 1)],
    ['a word above lo + span', bytes(0, 1, 13)],
    ['a piece above lo + span', bytes(0, 1, 14, 0)],
    ['a number that is not minimal', Uint8Array.from([0x80, 0x00, 1, 1])],
  ]
  for (const [name, nodes] of cases) test(name, () => body(tree(nodes)))

  test('a sentence outside the words', () => body(tree(bytes(0, 1, 1), 2, 3)))

  test('depth: 64 levels pass, 65 do not', () => {
    const chain = (parts: number) => {
      const out: number[] = []
      for (let i = 0; i < parts; i++) out.push(0, 1)
      out.push(1)
      return bytes(...out)
    }
    expect(tree(chain(63))()).toBeDefined() // 63 parts and a word: 64 levels
    body(tree(chain(64)))
  })
})

describe('lookups', () => {
  test('sentencesAt: the sentences whose span meets the range', () => {
    const t = trees()
    expect(sentencesAt(t, 0, 0)).toEqual([0])
    expect(sentencesAt(t, 1, 2)).toEqual([0, 1])
    expect(sentencesAt(t, 3, 9)).toEqual([1])
    expect(sentencesAt(t, 4, 9)).toEqual([])
  })

  test('referentsAt: the rows of the words, in order, ante absent when 0', () => {
    const r = referents()
    expect(referentsAt(r, 0, 0)).toEqual([])
    expect(referentsAt(r, 1, 1)).toEqual([
      { word: 1, kind: 'r', piece: '', form: 'a', strong: 'H1', ch: 1, vs: 1, ante: 0 },
      { word: 1, kind: 's', piece: 'x', form: 'b', strong: '', ch: 1, vs: 1 },
    ])
    expect(referentsAt(r, 2, 9).map((row) => row.word)).toEqual([3])
  })

  test('verseRange: the first and last word of a verse, null when it has none', () => {
    const m = base()
    expect(verseRange(m, 1, 1)).toEqual([0, 1])
    expect(verseRange(m, 1, 2)).toEqual([2, 3])
    expect(verseRange(m, 1, 3)).toBeNull()
    expect(verseRange(m, 2, 1)).toBeNull()
  })
})
