import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { framesAtQuery, frameVersesQuery } from './obsFrames'

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

/** The reader with the `xtopics` core it reads changed by `edit` (or gone, when `edit` returns undefined). */
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

const SRC = 'bcv-commons/bible-story-builder'
const FRAMES = {
  '1:3': [[1_001_006, 1_001_008]],
  '1:4': [[1_001_009, 1_001_010]],
  '1:5': [[1_001_010, 1_001_011]],
  '21:1': [[1_001_001, 1_001_031]],
  '48:10': [[58_009_011, 58_009_014], [43_001_029, 43_001_029], [60_001_018, 60_001_019]],
}
const withFrames = (r: PackReader, frames: unknown = FRAMES) =>
  withXtopics(r, (c) => ({ ...c, res: [...c.res, [SRC, 'c07d4539']], obsFrames: frames }))

describe('frameVerses', () => {
  test('a frame: its ranges with book and reference, the source cited', async () => {
    const r = withFrames(await open())
    const a = await frameVersesQuery(r, 48, 10)
    expect(a.query).toBe('frameVerses')
    expect(a.data).toEqual({
      story: 48,
      frame: 10,
      ranges: [
        { book: 'heb', ref: '9:11-14', first: 58_009_011, last: 58_009_014 },
        { book: 'jhn', ref: '1:29', first: 43_001_029, last: 43_001_029 },
        { book: '1pe', ref: '1:18-19', first: 60_001_018, last: 60_001_019 },
      ],
      source: SRC,
    })
    expect(a.coverage).toEqual({ [SRC]: 'count' })
    expect(a.cites).toEqual([{ res: SRC, release: 'c07d4539' }])
    expect(a.revision.units.xtopics).toBeGreaterThan(0)
  })
  test('a frame that tells no verse: no range, count', async () => {
    const a = await frameVersesQuery(withFrames(await open()), 27, 11)
    expect(a.data!.ranges).toEqual([])
    expect(a.coverage).toEqual({ [SRC]: 'count' })
  })
  test('an older common catalog (no table): no range, coverage none, nothing cited', async () => {
    const r = withXtopics(await open(), ({ obsFrames: _f, ...rest }) => rest)
    const a = await frameVersesQuery(r, 1, 3)
    expect(a.data!.ranges).toEqual([])
    expect(a.coverage).toEqual({ [SRC]: 'none' })
    expect(a.cites).toEqual([])
  })
  test('xtopics not installed: data null and the unit in notInstalled; bad arguments are E_ARG', async () => {
    const a = await frameVersesQuery(withXtopics(await open(), () => undefined), 1, 3)
    expect(a.data).toBeNull()
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['xtopics'])
    const r = await open()
    for (const [s, f] of [[0, 1], [51, 1], [1, 0], [1, 100], [1.5, 1]]) await expect(r.frameVerses(s!, f!)).rejects.toBeInstanceOf(ClientError)
  })
})

describe('framesAt', () => {
  test('a verse: every frame that tells it, the most specific first', async () => {
    const r = withFrames(await open())
    const a = await framesAtQuery(r, 1_001_010)
    expect(a.query).toBe('framesAt')
    expect(a.data!.frames).toEqual([
      { story: 1, frame: 4, verses: 2 },
      { story: 1, frame: 5, verses: 2 },
      { story: 21, frame: 1, verses: 31 },
    ])
    expect(a.cites).toEqual([{ res: SRC, release: 'c07d4539' }])
  })
  test('a passage meets every frame that tells any of its verses; a verse no frame tells gives none', async () => {
    const r = withFrames(await open())
    expect((await framesAtQuery(r, 1_001_006, 1_001_009)).data!.frames.map((f) => `${f.story}:${f.frame}`)).toEqual(['1:4', '1:3', '21:1'])
    expect((await framesAtQuery(r, 43_001_029)).data!.frames).toEqual([{ story: 48, frame: 10, verses: 7 }])
    expect((await framesAtQuery(r, 56_001_001)).data!.frames).toEqual([])
  })
  test('the same core answers from the same index; a passage of two books or backwards is E_ARG', async () => {
    const r = withFrames(await open())
    expect((await framesAtQuery(r, 1_001_007)).data).toEqual((await framesAtQuery(r, 1_001_007)).data)
    await expect(framesAtQuery(r, 1_001_002, 2_001_001)).rejects.toBeInstanceOf(ClientError)
    await expect(framesAtQuery(r, 1_001_005, 1_001_001)).rejects.toBeInstanceOf(ClientError)
    await expect(framesAtQuery(r, 5)).rejects.toBeInstanceOf(ClientError)
  })
})
