/** The indexed `renderings` answers exactly as the scan it replaced, on every Strong key of the sample and on position queries. */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { renderingsQuery } from './renderings'
import { legacyRenderingsQuery } from './renderings.legacy'

let sample: Sample
let server: FakeServer | undefined
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
afterEach(() => server?.stop())
beforeAll(async () => {
  sample = await buildSample()
}, 120_000)

describe('renderings: indexed and scan agree', () => {
  test('every key of Titus, twice (the second call uses the index), and by position', async () => {
    server = startFakeServer(sample, {})
    const trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    const orig = (await reader.orig('tit'))!
    const keys = [...new Set(orig.words.map((w) => w.strong))]
    expect(keys.length).toBeGreaterThan(20)
    let nonEmpty = 0
    for (const strong of [...keys, 'G3972', 'G99999']) {
      const old = await legacyRenderingsQuery(reader, { strong })
      for (let pass = 0; pass < 2; pass++) {
        const now = await renderingsQuery(reader, { strong })
        expect(now).toEqual(old)
      }
      if (old.data!.renderings.length > 0) nonEmpty++
    }
    expect(nonEmpty).toBeGreaterThan(10)
    for (const word of [0, 1, 5, orig.words.length - 1]) {
      expect(await renderingsQuery(reader, { book: 'tit', word })).toEqual(await legacyRenderingsQuery(reader, { book: 'tit', word }))
    }
  })
})
