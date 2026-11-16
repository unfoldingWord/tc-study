import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { sectionsQuery } from './sections'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

async function open() {
  server?.stop()
  server = startFakeServer(sample, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  await client.install('es-419', { books: ['tit'] })
  return client.open('es-419')
}

/** The reader with the `xtopics` it reads changed by `edit` (or gone, when `edit` returns undefined). */
function withXtopics(r: PackReader, edit: (core: any) => any): PackReader {
  return {
    ...r,
    mapsOf: async (units, o) => {
      const m = await r.mapsOf(units, o)
      const x = m.xtopics === undefined ? undefined : edit(m.xtopics.core)
      return x === undefined ? { ...m, xtopics: undefined } : { ...m, xtopics: { ...m.xtopics!, core: x } }
    },
  }
}

describe('sections', () => {
  test('Titus: the sections of the English ULT in order, with references and verse ids', async () => {
    const r = await open()
    const a = await r.sections('tit')
    expect(a.query).toBe('sections')
    const d = a.data!
    expect(d.book).toBe('tit')
    expect(d.source).toBe('unfoldingWord/en/ult')
    expect(d.sections.length).toBeGreaterThan(1)
    expect(d.sections[0]).toEqual({ from: '1:1', to: '1:3', first: 56001001, last: 56001003 })
    for (let i = 1; i < d.sections.length; i++) expect(d.sections[i]!.first).toBeGreaterThan(d.sections[i - 1]!.last)
    expect(a.coverage).toEqual({ 'unfoldingWord/en/ult': 'count' })
    expect(a.cites[0]!.res).toBe('unfoldingWord/en/ult')
    expect(a.revision.units.xtopics).toBeGreaterThan(0)
    expect(a.notInstalled).toEqual([])
  })
  test('a section that crosses a chapter says both chapters', async () => {
    const r = withXtopics(await open(), (c) => ({ ...c, chunks: { tit: [[56001015, 56002003]] } }))
    const a = await sectionsQuery(r, 'tit')
    expect(a.data!.sections).toEqual([{ from: '1:15', to: '2:3', first: 56001015, last: 56002003 }])
  })
  test('xtopics not installed: data null and the unit in notInstalled', async () => {
    const r = withXtopics(await open(), () => undefined)
    const a = await sectionsQuery(r, 'tit')
    expect(a.data).toBeNull()
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['xtopics'])
  })
  test('xtopics without chunks: no sections, coverage none', async () => {
    const r = withXtopics(await open(), ({ chunks: _c, ...rest }) => rest)
    const a = await sectionsQuery(r, 'tit')
    expect(a.data).toEqual({ book: 'tit', sections: [], source: 'unfoldingWord/en/ult' })
    expect(a.coverage).toEqual({ 'unfoldingWord/en/ult': 'none' })
    expect(a.notInstalled).toEqual([])
  })
  test('a book with no entry: no sections, coverage none; a bad book is E_ARG', async () => {
    const r = await open()
    const a = await r.sections('rut')
    expect(a.data!.sections).toEqual([])
    expect(a.coverage).toEqual({ 'unfoldingWord/en/ult': 'none' })
    await expect(sectionsQuery(r, 'xyz')).rejects.toBeInstanceOf(ClientError)
  })
})
