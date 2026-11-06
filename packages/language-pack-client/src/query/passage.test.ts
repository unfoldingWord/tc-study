import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, retitleTw, rewordTitusNote, type Sample } from '../../test/sample'
import { verifyCatalogFile } from '../verify'

let sample: Sample
let sample2: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  // Both the Titus notes and the tW titles change: the book and the map are new in revision 2.
  sample2 = await buildSample({ revision: 2, tweak: { row: (r, f) => retitleTw().row!(rewordTitusNote().row!(r, f), f) } })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

function setup(content: Sample = sample) {
  server?.stop()
  server = startFakeServer(content, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  return { client, server }
}

describe('passage', () => {
  test('texts, notes in range, cites and coverage', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    const a = await r.passage('tit 1:1-2')
    expect(a.query).toBe('passage')
    expect(a.data!.texts.map((t) => t.res)).toEqual(['es-419_gl/es-419/glt', 'es-419_gl/es-419/gst'])
    for (const t of a.data!.texts) expect(t.text.length).toBeGreaterThan(10)
    const one = await r.passage('tit 1:1')
    expect(one.data!.texts[0]!.text.length).toBeLessThan(a.data!.texts[0]!.text.length)
    expect(a.data!.notes.length).toBeGreaterThan(0)
    for (const n of [...a.data!.notes, ...a.data!.questions, ...a.data!.links]) {
      expect(n.to).toBeGreaterThanOrEqual(56001001)
      expect(n.from).toBeLessThanOrEqual(56001002)
    }
    expect(a.cites).toContainEqual({ res: 'es-419_gl/es-419/glt', release: 'v42', ref: 'tit 1:1-2' })
    expect(a.cites).toContainEqual({ res: 'es-419_gl/es-419/tn', release: 'v66', id: a.data!.notes[0]!.id, ref: a.data!.notes[0]!.ref })
    expect(a.revision).toEqual({ lang: 1, common: 1, units: { 'book:tit': 1, map: 1 } })
    expect(a.coverage).toEqual({ 'es-419_gl/es-419/tn': 'count', 'es-419_gl/es-419/tq': 'count', 'es-419_gl/es-419/twl': 'count' })
    expect(a.notInstalled).toEqual([])
  })

  test('a book that is not installed: data null and the catalog size', async () => {
    const { client } = setup()
    await client.install('es-419', { books: [] })
    const r = await client.open('es-419')
    const a = await r.passage('tit 1:1')
    expect(a.data).toBeNull()
    const cat = await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' })
    const unit = cat.catalog.units.find((u) => u.id === 'book:tit')!
    const bytes = unit.segments.reduce((n, i) => n + cat.catalog.segments[i]!.size, 0)
    expect(bytes).toBeGreaterThan(0)
    expect(a.notInstalled).toEqual([{ book: 'tit', unit: 'book:tit', bytes }])
    const rom = await r.passage('rom 4:1')
    expect(rom.data).toBeNull()
    expect(rom.notInstalled).toEqual([{ book: 'rom', unit: 'book:rom', bytes: 0 }])
  })

  test('a bad reference is E_ARG', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    for (const bad of ['xyz 1:1', 'tit', 'tit 0:0', 'tit 2:5-1', '']) await expect(r.passage(bad)).rejects.toMatchObject({ code: 'E_ARG' })
  })

  test('mixed revisions: the book stays at 1 while the map is 2', async () => {
    const { client, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    server.set(sample2)
    await client.refresh('es-419')
    await client.install('es-419', { units: ['map'] })
    const r = await client.open('es-419')
    const a = await r.passage('tit 1:1')
    expect(a.revision.units).toEqual({ 'book:tit': 1, map: 2 })
  })
})
