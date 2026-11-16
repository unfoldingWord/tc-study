import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { verseId } from '../../ids'
import type { Event, OrigModel, TextModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import type { Row } from '../../source/rows'
import { extractText } from '../bookTexts'
import { OrigIndex } from '../orig'
import { chunksOfText, chunksTable } from './chunks'

const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
const ULT = 'unfoldingWord/en/ult'

async function ultText(book: string): Promise<TextModel> {
  const source = await partsSource({ list: join(DATA, 'en', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  const rows: Row[] = []
  for (const layer of ['sot', 'quote']) for await (const row of source.rows({ lang: 'en', book, resource: ULT, layer })) rows.push(row)
  const empty: OrigModel = { book, key: 'x', stamp: 'x', words: [], pieces: [], events: [] }
  return extractText(rows, book, ULT, new OrigIndex(empty), [])
}

/** The verses the events of a text name, as the original would list them. */
function versesOfEvents(text: TextModel, book: string): number[] {
  const out: number[] = []
  let chapter = 0
  for (const [, kind, arg] of text.events) {
    if (kind === 'chapter') chapter = parseInt(arg, 10)
    else if (kind === 'verse' && chapter > 0 && parseInt(arg, 10) > 0) out.push(verseId(book, chapter, parseInt(arg, 10)))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

const synthetic = (events: Event[]): TextModel => ({ events }) as unknown as TextModel
const V = (c: number, v: number) => verseId('rut', c, v)

describe('chunksOfText: the ULT', () => {
  test('Ruth: 38 chunks, the first five', async () => {
    const text = await ultText('rut')
    const verses = versesOfEvents(text, 'rut')
    const chunks = chunksOfText(text, 'rut', verses)
    expect(chunks.length).toBe(38)
    expect(chunks.slice(0, 5)).toEqual([[8001001, 8001002], [8001003, 8001005], [8001006, 8001007], [8001008, 8001010], [8001011, 8001013]])
    expect(chunks[0][0]).toBe(verses[0])
    expect(chunks[chunks.length - 1][1]).toBe(verses[verses.length - 1])
    for (let i = 1; i < chunks.length; i++) expect(chunks[i][0]).toBe(verses[verses.indexOf(chunks[i - 1][1]) + 1])
    for (const [a, b] of chunks) expect(a <= b).toBe(true)
  })

  test('Titus: 23 chunks, the first is 1:1-3', async () => {
    const text = await ultText('tit')
    const verses = versesOfEvents(text, 'tit')
    const chunks = chunksOfText(text, 'tit', verses)
    expect(chunks.length).toBe(23)
    expect(chunks[0]).toEqual([56001001, 56001003])
    expect(chunks[0][0]).toBe(verses[0])
    expect(chunks[chunks.length - 1][1]).toBe(verses[verses.length - 1])
    for (let i = 1; i < chunks.length; i++) expect(chunks[i][0]).toBe(verses[verses.indexOf(chunks[i - 1][1]) + 1])
  })
})

describe('chunksOfText: rules', () => {
  const list = [V(1, 1), V(1, 2), V(1, 3), V(1, 4), V(2, 1), V(2, 2)]
  const base: Event[] = [
    [0, 'chapter', '1'],
    [0, 'verse', '1'],
    [1, 'verse', '2'],
    [2, 'verse', '3'],
    [3, 'verse', '4'],
    [4, 'chapter', '2'],
    [4, 'verse', '1'],
    [5, 'verse', '2'],
  ]
  test('two ms:ts at the same verse give one break', () => {
    const events: Event[] = [[0, 'open', 'ms:ts'], ...base.slice(0, 3), [2, 'open', 'ms:ts'], [2, 'open', 'ms:ts'], ...base.slice(3)]
    expect(events.filter((e) => e[1] === 'open' && e[2] === 'ms:ts').length).toBe(3)
    expect(chunksOfText(synthetic(events), 'rut', list)).toEqual([[V(1, 1), V(1, 2)], [V(1, 3), V(2, 2)]])
  })
  test('a ts before the first verse is the start of the first chunk', () => {
    const events: Event[] = [[0, 'chapter', '1'], [0, 'open', 'ms:ts'], ...base.slice(1)]
    expect(chunksOfText(synthetic(events), 'rut', list)).toEqual([[V(1, 1), V(2, 2)]])
  })
  test('a ts after the last verse is no break: the book has no entry', () => {
    const events: Event[] = [...base, [6, 'open', 'ms:ts']]
    expect(chunksOfText(synthetic(events), 'rut', list)).toEqual([])
    const withBreak: Event[] = [...base.slice(0, 5), [4, 'open', 'ms:ts'], ...base.slice(5), [6, 'open', 'ms:ts']]
    expect(chunksOfText(synthetic(withBreak), 'rut', list)).toEqual([[V(1, 1), V(1, 4)], [V(2, 1), V(2, 2)]])
  })
  test('a chunk ends at the end of the chapter and starts the next', () => {
    const events: Event[] = [...base.slice(0, 5), [4, 'open', 'ms:ts'], ...base.slice(5)]
    expect(chunksOfText(synthetic(events), 'rut', list)).toEqual([[V(1, 1), V(1, 4)], [V(2, 1), V(2, 2)]])
  })
  test('no ms:ts gives []', () => {
    expect(chunksOfText(synthetic(base), 'rut', list)).toEqual([])
  })
  test('a bridge counts as its first number', () => {
    const events: Event[] = [[0, 'chapter', '1'], [0, 'verse', '1-2'], [1, 'open', 'ms:ts'], [1, 'verse', '3'], [2, 'verse', '4']]
    expect(chunksOfText(synthetic(events), 'rut', list.slice(0, 4))).toEqual([[V(1, 1), V(1, 2)], [V(1, 3), V(1, 4)]])
  })
  test('verse 0 is in no chunk', () => {
    const events: Event[] = [[0, 'chapter', '1'], [0, 'verse', '0'], [0, 'open', 'ms:ts'], [1, 'verse', '1'], [2, 'verse', '2']]
    expect(chunksOfText(synthetic(events), 'rut', [V(1, 0), V(1, 1), V(1, 2)])).toEqual([[V(1, 1), V(1, 2)]])
  })
})

describe('chunksTable', () => {
  test('sorts by book code, drops empty books, checks the shape', () => {
    const t = chunksTable(new Map([['tit', [[56001001, 56001003]]], ['rut', [[8001001, 8001002]]], ['gen', []]]))
    expect(Object.keys(t)).toEqual(['rut', 'tit'])
    expect(() => chunksTable(new Map([['rut', [[8001003, 8001001]]]]))).toThrow()
    expect(() => chunksTable(new Map([['rut', [[8001001, 8001003], [8001002, 8001004]]]]))).toThrow()
    expect(() => chunksTable(new Map([['rut', [[56001001, 56001002]]]]))).toThrow()
  })
})
