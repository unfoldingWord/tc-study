import { describe, expect, test } from 'bun:test'
import type { BookModel, ObsModel } from '@bt-synergy/language-pack-v3'
import { memoryIndex, tokenizer } from './memory'

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

const obs: ObsModel = {
  lang: 'xx',
  res: [['r/obs', 'v1']],
  stories: [
    { res: 'r/obs', n: 1, title: 'La creación', frames: [{ n: 1, text: 'Dios creó el mundo.' }] },
    { res: 'r/obs', n: 2, title: '', frames: [{ n: 1, text: 'La serpiente engañó.' }] },
  ],
  notes: { res: 'r/obs-tn', rows: [{ id: 'n1', ref: '1:1', frame: 101, cols: { quote: 'creó', note: 'Una metáfora' } }] },
  questions: { res: 'r/obs-tq', rows: [{ id: 'q1', ref: '1:1', frame: 101, cols: { question: '¿Quién creó?', response: 'Dios' } }] },
}

describe('memoryIndex with OBS', () => {
  test('rows of obs: title, frame, note and question, book obs; an empty title has no row', async () => {
    const ix = memoryIndex()
    await ix.addObs('xx', obs, 'o1')
    const t = await ix.search('xx', 'creación', { kinds: ['title'] })
    expect(t.map((h) => [h.kind, h.book, h.ref, h.res])).toEqual([['title', 'obs', '01:0', 'r/obs']])
    expect((await ix.search('xx', 'creó', { kinds: ['text'] })).map((h) => [h.book, h.ref])).toEqual([['obs', '01:01']])
    const n = await ix.search('xx', 'metáfora')
    expect(n.map((h) => [h.kind, h.id, h.ref, h.res])).toEqual([['note', 'n1', '01:01', 'r/obs-tn']])
    expect((await ix.search('xx', 'creó', { kinds: ['note'] })).length).toBe(1)
    expect((await ix.search('xx', 'dios', { kinds: ['question'] })).map((h) => h.id)).toEqual(['q1'])
    expect(await ix.search('xx', 'story', { kinds: ['title'] })).toEqual([])
    expect((await ix.search('xx', 'serpiente')).map((h) => h.kind)).toEqual(['text'])
    expect((await ix.search('xx', 'serpiente', { kinds: ['title'] })).length).toBe(0)
  })
  test('removing the obs segment removes its rows', async () => {
    const ix = memoryIndex()
    await ix.addObs('xx', obs, 'o1')
    expect(await ix.has('o1')).toBe(true)
    await ix.removeSegment('o1')
    expect(await ix.has('o1')).toBe(false)
    expect(await ix.search('xx', 'creación')).toEqual([])
  })
})

describe('memoryIndex stems', () => {
  test('a stem finds other forms; the snippet marks the original word; other languages need the exact word', async () => {
    const ix = memoryIndex()
    await ix.addBook('es-419', book('rut', 'Las gracias de Dios'), 's1')
    await ix.addBook('en', book('rut', 'he blessed them'), 's2')
    await ix.addBook('fr', book('rut', 'les graces et les gracias'), 's3')
    const es = await ix.search('es-419', 'gracia')
    expect(es.length).toBeGreaterThan(0)
    expect(es[0]!.snippet).toContain('«gracias»')
    expect((await ix.search('en', 'bless')).length).toBeGreaterThan(0)
    expect(await ix.search('fr', 'gracia')).toEqual([])
    expect((await ix.search('fr', 'GRACIAS')).length).toBeGreaterThan(0)
  })
  test('article sections are rows of kind section', async () => {
    const ix = memoryIndex()
    await ix.addArticles(
      'es-419',
      [
        {
          id: 'tw:kt/grace',
          res: 'r/tw',
          title: 'Gracia',
          sections: [
            { sid: 'definicion', level: 2, role: 'definition', title: 'Definición', lang: 'es-419', md: 'El favor inmerecido de Dios.' },
            { sid: 'sugerencias', level: 2, role: 'translation', lang: 'es-419', md: 'Se puede traducir así.' },
            { sid: 'vacio', level: 2, role: 'other', lang: 'es-419', md: '  ' },
          ],
        },
      ],
      'a1',
    )
    const hits = await ix.search('es-419', 'gracia', { kinds: ['section'] })
    expect(hits.map((h) => h.id).sort()).toEqual(['tw:kt/grace#definicion', 'tw:kt/grace#sugerencias'])
    expect(hits[0]).toMatchObject({ kind: 'section', book: '', ref: '', res: 'r/tw' })
    expect(hits.map((h) => h.role).sort()).toEqual(['definition', 'translation'])
    expect(await ix.search('es-419', 'inmerecido', { kinds: ['note'] })).toEqual([])
    await ix.removeSegment('a1')
    expect(await ix.search('es-419', 'gracia')).toEqual([])
  })
})

describe('memoryIndex interning', () => {
  test('two tokens with the same word in the same language share the same stem array; another language does not', () => {
    const tok = tokenizer()
    const a = tok('Las gracias de Dios', 'es-419')
    const b = tok('la gracia y gracias', 'es-419')
    const c = tok('gracias', 'en')
    const x = a.find((t) => t.t === 'gracias')!
    const y = b.find((t) => t.t === 'gracias')!
    expect(x.s).toBe(y.s)
    expect(c[0]!.s).not.toBe(x.s)
  })
})
