import { describe, expect, test } from 'bun:test'
import { strongKey } from '../../ids'
import type { OrigModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { extractOrig } from '../orig'
import { strongTally } from './strong'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')

const synthetic = (strongs: string[]): OrigModel => ({
  book: 'tit',
  key: 'x/y/z',
  stamp: 'gx',
  words: strongs.map((strong) => ({ form: 'a', lemma: 'a', strong, morph: '' })),
  pieces: strongs.map((): [string, boolean] => ['a', true]),
  events: [[0, 'chapter', '1'], [0, 'verse', '1']],
})

describe('strongTally', () => {
  test('UGNT Titus', async () => {
    const src = await partsSource({ list: join(DATA, 'originals', 'list.json'), partsDir: join(DATA, 'parts') })
    const orig = await extractOrig(src, 'tit')
    const t = strongTally(orig)
    const rows = t.table().rows
    let total = 0
    for (const byBook of rows.values()) for (const [c] of byBook.values()) total += c
    expect(total).toBe(orig.words.filter((w) => w.strong !== '').length)
    expect([...rows.keys()].every((k) => k.startsWith('G'))).toBe(true)
    expect(rows.has(strongKey(orig.words[0].strong))).toBe(true)
    expect(t.verseLists('tit').get(strongKey(orig.words[0].strong))![0]).toBe(56001001)
  })
  test('a Strong three times in one verse', () => {
    expect(strongTally(synthetic(['G35880', 'G35880', 'G35880'])).table().rows.get('G35880')!.get('tit')).toEqual([3, 1])
  })
  test('a Hebrew Strong', () => {
    const t = strongTally(synthetic(['b:H7462b']))
    expect(t.table().rows.has('H7462b')).toBe(true)
  })
})
