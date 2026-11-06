import { describe, expect, test } from 'bun:test'
import type { BookModel } from '@bt-synergy/language-pack-v3'
import { memoryIndex } from './memory'

const book = (name: string, text: string): BookModel => ({
  lang: 'xx',
  book: name,
  orig: ['o', 'v1'],
  res: [['r/t', 'v1']],
  texts: [{ res: 'r/t', pieces: [[text, false]], events: [[0, 'chapter', '1'], [0, 'verse', '1']] }],
  notes: { res: 'r/tn', rows: [{ id: 'n1', ref: '1:1', from: 1, to: 1, cols: { note: 'La casa de Noemí' } }] },
})

describe('memoryIndex', () => {
  test('words are phrases of their own, all must match; accent and case do not matter', async () => {
    const ix = memoryIndex()
    await ix.init()
    await ix.addBook('xx', book('rut', 'Noemí volvió a Belén'), 's1')
    expect((await ix.search('xx', 'noemi belen')).length).toBe(1)
    expect((await ix.search('xx', 'NOEMÍ')).map((h) => h.kind).sort()).toEqual(['note', 'text'])
    expect(await ix.search('xx', 'noemi zzz')).toEqual([])
    expect(await ix.search('xx', '"*')).toEqual([])
    expect(await ix.search('yy', 'noemi')).toEqual([])
  })
  test('has, remove and re-add by segment', async () => {
    const ix = memoryIndex()
    await ix.addBook('xx', book('rut', 'Noemí'), 's1')
    expect(await ix.has('s1')).toBe(true)
    await ix.addBook('xx', book('rut', 'Noemí'), 's1')
    expect((await ix.search('xx', 'noemi')).length).toBe(2)
    await ix.removeSegment('s1')
    expect(await ix.has('s1')).toBe(false)
    expect(await ix.search('xx', 'noemi')).toEqual([])
  })
})
