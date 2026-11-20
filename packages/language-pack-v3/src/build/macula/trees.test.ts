import { describe, expect, test } from 'bun:test'
import type { Event, OrigModel, Piece } from '../../model'
import { sentenceTree, sentencesAt, verseRange } from '../../read/macula'
import { buildMaculaTrees, maculaTreeIssues, verseSpans } from './trees'

/** A book of chapters of verses, each verse with the given number of words: its pieces and events, as `readDocument` makes them. */
function book(chapters: Record<number, number[]>): { pieces: Piece[]; events: Event[]; words: number } {
  const pieces: Piece[] = []
  const events: Event[] = []
  let words = 0
  for (const [chapter, verses] of Object.entries(chapters)) {
    events.push([pieces.length, 'chapter', chapter])
    verses.forEach((count, i) => {
      events.push([pieces.length, 'verse', String(i + 1)])
      for (let n = 0; n < count; n++, words++) pieces.push([`w${words}`, true], [' ', false])
    })
  }
  return { pieces, events, words }
}

const model = (b: ReturnType<typeof book>): OrigModel => ({
  book: 'x',
  key: 'k',
  stamp: 's',
  words: Array.from({ length: b.words }, (_, i) => ({ form: `w${i}`, lemma: '', strong: '', morph: '' })),
  pieces: b.pieces,
  events: b.events,
})

describe('verseSpans', () => {
  test('the first word and the number of words of each verse, as verseRange finds them', () => {
    const b = book({ 1: [3, 0, 2], 2: [4] })
    const spans = verseSpans(b.pieces, b.events)
    expect([...spans]).toEqual([
      ['1:1', { first: 0, words: 3 }],
      ['1:3', { first: 3, words: 2 }],
      ['2:1', { first: 5, words: 4 }],
    ])
    for (const [key, { first, words }] of spans) {
      const [c, v] = key.split(':').map(Number)
      expect(verseRange(model(b), c, v)).toEqual([first, first + words - 1])
    }
  })
})

describe('buildMaculaTrees', () => {
  test('Ruth 2:3: ids become positions and a piece of a Hebrew word keeps its text and its word', () => {
    // Ruth 2:1 has 3 words (0-2) and 2:2 has 2 (3-4), so 2:3 starts at 5. Hand-built from the v1 shape of the published trees.
    const b = book({ 2: [3, 2, 5] })
    const published = {
      sentences: [['*', ['v', 2003001], ['s', 2003002, [2003003, 'ה']], ['adv', ['&', [2003004, 'ו']], 2003005]]],
      words: { '2:3': 5 },
    }
    const { trees, counts } = buildMaculaTrees(published, b.pieces, b.events)
    expect(counts).toEqual({ leaves: 0, parts: 0, sentences: 0, deep: 0 })
    expect(trees.lo).toEqual([5])
    expect(trees.span).toEqual([4])
    expect(sentenceTree(trees, 0, b.words)).toEqual([
      '*',
      ['v', 5],
      ['s', 6, [7, 'ה']],
      ['adv', ['&', [8, 'ו']], 9],
    ])
    expect(trees.pieces.slice().sort()).toEqual(['ה', 'ו'])
    expect(trees.labels).toEqual(['&', '*', 'adv', 's', 'v'])
  })

  test('Titus 1:1-4: one sentence across verses is found from each of its verses, once', () => {
    const b = book({ 1: [3, 2, 3, 2, 2] })
    const published = {
      sentences: [
        ['*', ['s', 1001001, 1001002, 1001003], ['v*', 1002001, 1002002], ['o', 1003001, 1003003], ['adv', 1004001, 1004002]],
        ['*', ['v', 1005001], ['o', 1005002]],
      ],
    }
    const { trees } = buildMaculaTrees(published, b.pieces, b.events)
    // Verse starts: 1:1 at 0, 1:2 at 3, 1:3 at 5, 1:4 at 8, 1:5 at 10.
    expect(trees.lo).toEqual([0, 10])
    expect(trees.span).toEqual([9, 1])
    expect(sentenceTree(trees, 0, b.words)).toEqual(['*', ['s', 0, 1, 2], ['v*', 3, 4], ['o', 5, 7], ['adv', 8, 9]])
    expect(sentenceTree(trees, 1, b.words)).toEqual(['*', ['v', 10], ['o', 11]])
    const m = model(b)
    for (const [verse, want] of [[1, [0]], [2, [0]], [3, [0]], [4, [0]], [5, [1]]] as const) {
      const [first, last] = verseRange(m, 1, verse)!
      expect(sentencesAt(trees, first, last)).toEqual(want)
    }
  })

  test('labels and pieces are tables, most used first, ties by code point; sentences keep the published order', () => {
    const b = book({ 1: [4] })
    const published = {
      sentences: [
        ['s*', ['v', 1001001], ['v', 1001002]],
        ['*', ['o', 1001004], ['v', 1001003]],
      ],
    }
    const { trees } = buildMaculaTrees(published, b.pieces, b.events)
    expect(trees.labels).toEqual(['v', '*', 'o', 's*'])
    expect(trees.lo).toEqual([0, 2])
    expect(sentenceTree(trees, 1, b.words)).toEqual(['*', ['o', 3], ['v', 2]])
  })

  test('a leaf whose verse is not in the book, or whose word is past the verse, is dropped and counted; so are empty parts and sentences', () => {
    const b = book({ 1: [2, 2] })
    const published = {
      sentences: [
        ['*', ['s', 1001001, 9009001, 1001003], ['o', 1002003, [1007001, 'x']], ['v', 1002002]],
        ['*', ['s', 5001001], 1001000],
        ['*', ['s', 1001002]],
      ],
    }
    const { trees, counts } = buildMaculaTrees(published, b.pieces, b.events)
    // Dropped leaves: 9009001, 1001003 (verse 1 has 2 words), 1002003, [1007001,'x'], 5001001, 1001000 (word 0 is none).
    expect(counts).toEqual({ leaves: 6, parts: 2, sentences: 1, deep: 0 })
    expect(trees.lo).toEqual([0, 1])
    expect(sentenceTree(trees, 0, b.words)).toEqual(['*', ['s', 0], ['v', 3]])
    expect(sentenceTree(trees, 1, b.words)).toEqual(['*', ['s', 1]])
    expect(trees.pieces).toEqual([])
    expect(maculaTreeIssues(counts)).toHaveLength(3)
    expect(maculaTreeIssues({ leaves: 0, parts: 0, sentences: 0, deep: 0 })).toEqual([])
  })

  test('a sentence of 64 levels is kept and reads back; one of 65 is left out and counted', () => {
    const b = book({ 1: [2] })
    // A chain of parts ending in a leaf: the root is level 1 and the leaf is the last level.
    const chain = (levels: number, leaf: number): unknown => (levels === 1 ? leaf : ['p', chain(levels - 1, leaf)])
    const published = { sentences: [chain(64, 1001001), chain(65, 1001002), ['*', ['s', 1001002]]] }
    const { trees, counts } = buildMaculaTrees(published, b.pieces, b.events)
    expect(counts).toEqual({ leaves: 0, parts: 0, sentences: 0, deep: 1 })
    expect(trees.lo).toEqual([0, 1])
    const read = sentenceTree(trees, 0, b.words)
    let levels = 1
    for (let n: unknown = read; Array.isArray(n) && typeof n[0] === 'string'; n = n[1]) levels++
    expect(levels).toBe(64)
    expect(sentenceTree(trees, 1, b.words)).toEqual(['*', ['s', 1]])
    expect(maculaTreeIssues(counts)).toEqual(['MACULA trees: 1 sentence(s) deeper than 64 levels: left out of the trees'])
  })

  test('the depth is of the kept tree: leaves dropped make a deep sentence shallow', () => {
    const b = book({ 1: [1] })
    const chain = (levels: number): unknown => (levels === 1 ? 9009001 : ['p', chain(levels - 1)])
    const { counts } = buildMaculaTrees({ sentences: [['*', chain(70), 1001001]] }, b.pieces, b.events)
    expect(counts.deep).toBe(0)
  })

  test('a bridged verse (13-14): the words of the bridge are found through verse 13', () => {
    // The verse event label is "13-14": the verse number is the leading one.
    const pieces: Piece[] = [['a', true], [' ', false], ['b', true], [' ', false], ['c', true]]
    const events: Event[] = [[0, 'chapter', '1'], [0, 'verse', '13-14'], [4, 'verse', '15']]
    const { trees, counts } = buildMaculaTrees({ sentences: [['*', ['s', 1013001, 1013002, 1013003], ['o', 1014001]]] }, pieces, events)
    expect(counts).toEqual({ leaves: 2, parts: 1, sentences: 0, deep: 0 })
    expect(sentenceTree(trees, 0, 3)).toEqual(['*', ['s', 0, 1]])
  })

  test('a verse that comes in two runs uses the first', () => {
    const b = book({ 1: [1, 1] })
    // Verse 1, then 2, then a stray run of verse 1 again: its words are not the verse's.
    const pieces: Piece[] = [...b.pieces, ['x', true]]
    const events: Event[] = [...b.events, [b.pieces.length, 'verse', '1']]
    expect(verseSpans(pieces, events).get('1:1')).toEqual({ first: 0, words: 1 })
    const { trees, counts } = buildMaculaTrees({ sentences: [['*', ['s', 1001001, 1001002]]] }, pieces, events)
    expect(counts.leaves).toBe(1)
    expect(sentenceTree(trees, 0, 3)).toEqual(['*', ['s', 0]])
  })

  test('a value that is not the published shape throws', () => {
    const b = book({ 1: [1] })
    expect(() => buildMaculaTrees({}, b.pieces, b.events)).toThrow()
    expect(() => buildMaculaTrees({ sentences: [1001001] }, b.pieces, b.events)).toThrow()
    expect(() => buildMaculaTrees({ sentences: [['*', 'x']] }, b.pieces, b.events)).toThrow()
    expect(() => buildMaculaTrees({ sentences: [['*', 1.5]] }, b.pieces, b.events)).toThrow()
  })
})
