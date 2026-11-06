/**
 * Opt-in end to end run against staging: `LP3_STAGING=1 bun test src/staging.e2e.test.ts`. Never in CI (no workflow sets the flag).
 * Revision 1 comes from a local copy of the bucket (`LP3_STAGING_REV1`) over the fake server; revision 2 from staging, with GET requests only.
 * The trusted key is read from the language-pack-v3 package at test time; the store is a temp folder, removed at the end.
 */
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from './client'
import { httpSource } from './source/http'
import { fsStore } from './node/fsStore'
import { startFakeServer } from '../test/fakeServer'

const STAGING = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'
const KEY_ID = '78d2e6299a2de4d0'
const REV1 = process.env.LP3_STAGING_REV1 ?? 'C:/Users/LENOVO/Git/Github/wt/lp3-staging/bucket-rev1'
const KEY_FILE = join(import.meta.dir, '../../language-pack-v3/keys', `${KEY_ID}.pub`)

test.skipIf(process.env.LP3_STAGING !== '1')(
  'es-419 with Ruth: revision 1 from the local bucket, then revision 2 from staging',
  async () => {
    const hex = readFileSync(KEY_FILE, 'utf8').trim()
    const trust = { trustedKeys: { [KEY_ID]: Uint8Array.from(hex.match(/../g)!, (p) => parseInt(p, 16)) } }
    const dir = mkdtempSync(join(tmpdir(), 'lp3-staging-'))
    const server = startFakeServer({ bucketDir: REV1 })
    try {
      const store = fsStore(dir)

      const one = createClient({ store, source: httpSource({ base: server.url }), trust })
      await one.install('es-419', { books: ['rut'] })
      const r1 = await (await one.open('es-419')).passage('rut 1:1')
      expect(r1.revision.lang).toBe(1)

      let bytes = 0
      const methods = new Set<string>()
      const hosts = new Set<string>()
      const counting: typeof fetch = async (input, init) => {
        methods.add(init?.method ?? 'GET')
        hosts.add(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin)
        const res = await fetch(input, init)
        bytes += (await res.clone().arrayBuffer()).byteLength
        return res
      }
      const two = createClient({ store, source: httpSource({ base: STAGING, fetch: counting }), trust })
      const refreshed = await two.refresh('es-419')
      const rev2 = refreshed.catalogs.find((c) => c.name === 'es-419')
      expect(rev2?.revision).toBe(2)
      expect(refreshed.updates.length).toBeGreaterThan(0)
      console.log('updates 1 -> 2:', JSON.stringify(refreshed.updates))

      const before = new Set(await store.ids())
      const report = await two.install('es-419', { books: ['rut'] })
      expect(report.fetched.some((id) => before.has(id))).toBe(false)
      const r2 = await (await two.open('es-419')).passage('rut 1:1')
      expect(r2.revision.lang).toBe(2)
      expect((await two.verify()).bad).toEqual([])

      expect([...methods]).toEqual(['GET'])
      expect([...hosts]).toEqual([STAGING])
      console.log(`bytes fetched from staging: ${bytes}`)
    } finally {
      server.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  },
  120_000,
)
