import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verseId } from '../../ids'
import type { BookModel, OrigModel, TextModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { parseTipnr, type TipnrRecord } from '../../source/tipnr'
import { extractBook } from '../bookHelps'
import { extractOrig } from '../orig'
import { alignedNames } from './alignedNames'

const record = (id: string, dStrong: string, verses: [number, string?][]): TipnrRecord => ({
  kind: id.startsWith('per') ? 'person' : 'place',
  unique: id,
  uStrong: dStrong,
  id,
  names: [{ name: id, dStrong, refs: verses.map(([verse, letter]) => (letter === undefined ? { verse } : { verse, letter })) }],
  relations: [],
})

// Titus of es-419 from the data folder (spec/tests/data/README.md): the GLT and the GST.
const DATA = join(import.meta.dir, '../../../spec/tests/data')
async function load(list: string, partsDir: string, originals: string, book: string) {
  const src = await partsSource({ list, partsDir, originals })
  const orig = await extractOrig(src, book)
  const model = await extractBook(src, 'es-419', book, orig, [])
  return { orig, model }
}

describe('alignedNames on es-419 Titus', () => {
  const titus = load(join(DATA, 'es-419', 'list.json'), join(DATA, 'parts'), join(DATA, 'originals', 'list.json'), 'tit')

  test('a person of Titus 1 gets the names the GLT and the GST align to it, with their counts', async () => {
    const { orig, model } = await titus
    const out = alignedNames({ records: [record('per:titus', 'G5103', [[verseId('tit', 1, 4)]])], books: [model], origs: new Map([['tit', orig]]), lang: 'es-419' }, [])
    expect(out.get('per:titus')).toEqual([
      { name: 'Te escribo a ti', count: 1, books: ['tit'], verses: [56001004] },
      { name: 'a Tito', count: 1, books: ['tit'], verses: [56001004] },
    ])
  })

  test('a Strong in a verse TIPNR does not list for the record adds nothing', async () => {
    const { orig, model } = await titus
    const origs = new Map([['tit', orig]])
    const listed = alignedNames({ records: [record('lug:crete', 'G2914', [[verseId('tit', 1, 5)]])], books: [model], origs, lang: 'es-419' }, [])
    expect(listed.get('lug:crete')?.map((v) => v.name)).toEqual(['Creta', 'en la isla de Creta'])
    const other = alignedNames({ records: [record('lug:crete', 'G2914', [[verseId('tit', 3, 15)]])], books: [model], origs, lang: 'es-419' }, [])
    expect(other.size).toBe(0)
  })

  test('another language, or a book without original, gives nothing', async () => {
    const { orig, model } = await titus
    const r = [record('per:titus', 'G5103', [[verseId('tit', 1, 4)]])]
    expect(alignedNames({ records: r, books: [model], origs: new Map([['tit', orig]]), lang: 'pt-BR' }, []).size).toBe(0)
    expect(alignedNames({ records: r, books: [model], origs: new Map(), lang: 'es-419' }, []).size).toBe(0)
  })
})

/** A book of one verse: the original words `strongs`, and one text of words with the alignment `align` (positions per word). */
function tiny(strongs: string[], words: string[], align: number[][], joiner: (i: number) => string = () => ' '): { orig: OrigModel; model: BookModel } {
  const orig: OrigModel = {
    book: 'rut',
    key: 'test/hbo/uhb',
    stamp: 's1',
    words: strongs.map((strong) => ({ form: 'x', lemma: '', strong, morph: '' })),
    pieces: strongs.map(() => ['x', true]),
    events: [[0, 'chapter', '1'], [0, 'verse', '1']],
  }
  const pieces: TextModel['pieces'] = []
  words.forEach((w, i) => {
    if (i > 0) pieces.push([joiner(i), false])
    pieces.push([w, true])
  })
  const text: TextModel = { res: 'test/es/glt', pieces, events: [[0, 'chapter', '1'], [0, 'verse', '1']], align }
  return { orig, model: { lang: 'es', book: 'rut', orig: [orig.key, orig.stamp], res: [], texts: [text] } }
}

describe('alignedNames, small cases', () => {
  const v = verseId('rut', 1, 1)
  test('one-to-many: the run with the first aligned word is the name, the rest goes to the issues', () => {
    const { orig, model } = tiny(['b:H0001', 'c:H4813'], ['la', 'Maria', 'misma', 'y', 'Maria'], [[], [1], [1], [], [1]], (i) => (i === 4 ? ', ' : ' '))
    const issues: string[] = []
    const out = alignedNames({ records: [record('per:mary', 'H4813', [[v]])], books: [model], origs: new Map([['rut', orig]]), lang: 'es' }, issues)
    expect(out.get('per:mary')).toEqual([{ name: 'Maria misma', count: 1, books: ['rut'], verses: [v] }])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('per:mary')
  })

  test('occurrence letters pick the nth word of the verse; a missing one is reported', () => {
    const { orig, model } = tiny(['H4813', 'H0002', 'H4813'], ['Ana', 'y', 'Ruth'], [[0], [1], [2]])
    const issues: string[] = []
    const run = (letter?: string) =>
      alignedNames({ records: [record('per:x', 'H4813', [[v, letter]])], books: [model], origs: new Map([['rut', orig]]), lang: 'es' }, issues).get('per:x')?.map((n) => n.name)
    expect(run('a')).toEqual(['Ana'])
    expect(run('b')).toEqual(['Ruth'])
    expect(run()).toEqual(['Ana', 'Ruth'])
    expect(run('c')).toBeUndefined()
    expect(issues.some((i) => i.includes('no such occurrence'))).toBe(true)
  })

  test('variants: NFC as published, most frequent first, ties by code point', () => {
    const { orig, model } = tiny(['H4813', 'H4813', 'H4813', 'H4813'], ['Zoe', 'Noemí', 'Noemí', 'Abc'], [[0], [1], [2], [3]], () => ', ')
    const out = alignedNames({ records: [record('per:n', 'H4813', [[v]])], books: [model], origs: new Map([['rut', orig]]), lang: 'es' }, [])
    expect(out.get('per:n')).toEqual([
      { name: 'Noemí', count: 2, books: ['rut'], verses: [v] },
      { name: 'Abc', count: 1, books: ['rut'], verses: [v] },
      { name: 'Zoe', count: 1, books: ['rut'], verses: [v] },
    ])
  })
})

// The sample of the phase 0 packages and the whole TIPNR are outside the repository.
const SAMPLE = process.env.LP3_SAMPLE
const SOURCES = process.env.LP3_SOURCES
const tipnrFile = (() => {
  if (!SOURCES || !existsSync(`${SOURCES}/tipnr`)) return null
  const name = readdirSync(`${SOURCES}/tipnr`).find((f) => f.startsWith('TIPNR') && f.endsWith('.txt'))
  return name === undefined ? null : `${SOURCES}/tipnr/${name}`
})()

describe('alignedNames on the real data', () => {
  if (!SAMPLE || !existsSync(`${SAMPLE}/es-419/list.json`) || tipnrFile === null) {
    test.skip('LP3_SAMPLE or LP3_SOURCES is not set: the check on Titus and Ruth is skipped', () => {})
    return
  }
  test('Titus and Ruth people and places get es-419 names', async () => {
    const records = parseTipnr(readFileSync(tipnrFile, 'utf8'), [])
    const books: BookModel[] = []
    const origs = new Map<string, OrigModel>()
    for (const b of ['tit', 'rut']) {
      const { orig, model } = await load(`${SAMPLE}/es-419/list.json`, `${SAMPLE}/parts`, `${SAMPLE}/originals/list.json`, b)
      books.push(model)
      origs.set(b, orig)
    }
    const issues: string[] = []
    const out = alignedNames({ records, books, origs, lang: 'es-419' }, issues)
    const show = (id: string) => `${id}: ${JSON.stringify(out.get(id)?.slice(0, 4).map((n) => [n.name, n.count]))}`
    const ids = [...out.keys()].filter((id) => /naomi|ruth|boaz|titus|bethlehem|moab|crete/.test(id))
    console.log(`aligned names: ${out.size} records, ${issues.length} issues\n${ids.map(show).join('\n')}`)
    expect(out.size).toBeGreaterThan(10)
  })
})
