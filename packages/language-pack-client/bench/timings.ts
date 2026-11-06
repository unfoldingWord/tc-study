/**
 * Desktop timings of the reader over English Psalms. Not a test: it prints numbers and asserts nothing.
 *
 *   LP3_SAMPLE=<folder of the phase 0 sample> bun bench/timings.ts
 *
 * It builds English Psalms (and the common build) from the sample once, then measures, as the median of 20 runs on a fresh
 * reader each time: from the stored bytes to `book('psa')` readable; `passage('psa 23:1')` with its notes; `context('psa 23:1')`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILDER, buildCommon, buildLanguage, keyId, publicKeyOf, signCatalog, type BuiltSegment } from '@bt-synergy/language-pack-v3'
import { partsSource } from '../../language-pack-v3/src/node/partsSource'
import { openFromSegments } from '../src/reader'
import { verifyCatalogFile } from '../src/verify'

const sample = process.env.LP3_SAMPLE
if (sample === undefined) {
  console.log('LP3_SAMPLE is not set: nothing to measure. Point it at the phase 0 sample folder (the one with en/, parts/ and originals/).')
  process.exit(0)
}
const RUNS = 20
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

// The sample's English list names parts the sample does not carry: keep the ones it has (as the language-pack-v3 topics fixture does).
const list = JSON.parse(readFileSync(join(sample, 'en', 'list.json'), 'utf8')) as { parts: { sha256: string }[] }
list.parts = list.parts.filter((p) => existsSync(join(sample, 'parts', `${p.sha256}.part.gz`)))
const tmp = mkdtempSync(join(tmpdir(), 'lp3-bench-'))
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }))
const kept = join(tmp, 'list.json')
writeFileSync(kept, JSON.stringify(list))
const source = await partsSource({ list: kept, partsDir: join(sample, 'parts'), originals: join(sample, 'originals', 'list.json') })
const about = { format: '3.0' as const, publisher: 'unfoldingWord', origin: 'published' as const, revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER }

const t0 = performance.now()
const common = await buildCommon({ source, about, mapLang: 'en' })
const lang = await buildLanguage({ source, lang: 'en', books: ['psa'], registry: {}, about, requires: [['common', 1, common.catalog.id]] })
console.log(`built English Psalms in ${(performance.now() - t0).toFixed(0)} ms (not measured: a build is not a client operation)`)

const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
const publicKey = await publicKeyOf(pkcs8)
const trust = { trustedKeys: { [keyId(publicKey)]: publicKey } }
const stored = new Map<string, Uint8Array>()
for (const s of [...common.segments, ...lang.segments] as BuiltSegment[]) stored.set(s.id, s.bytes)
const langCatalog = await verifyCatalogFile(await signCatalog(lang.catalog.bytes, pkcs8), trust, { from: 'store' })
const commonCatalog = await verifyCatalogFile(await signCatalog(common.catalog.bytes, pkcs8), trust, { from: 'store' })
const fresh = () => openFromSegments({ lang: 'en', catalogs: [langCatalog, commonCatalog], get: async (id) => stored.get(id) })

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
async function measure(name: string, prepare: () => Promise<unknown>, run: (ctx: any) => Promise<unknown>): Promise<void> {
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const ctx = await prepare()
    const t = performance.now()
    await run(ctx)
    times.push(performance.now() - t)
  }
  console.log(`${name.padEnd(46)} median ${median(times).toFixed(2)} ms   (min ${Math.min(...times).toFixed(2)}, max ${Math.max(...times).toFixed(2)})`)
}

const check = fresh()
const book = await check.book('psa')
if (book === undefined) throw new Error('English Psalms did not read: the sample lacks it')
console.log(`psa: ${book.texts.length} text(s), notes ${book.notes?.rows.length ?? 0} rows`)

await measure("stored bytes -> book('psa') readable", async () => fresh(), (r) => r.book('psa'))
await measure("passage('psa 23:1') with its notes (book read)", async () => { const r = fresh(); await r.passage('psa 23:1'); return r }, (r) => r.passage('psa 23:1'))
await measure("context('psa 23:1') (book read)", async () => { const r = fresh(); await r.context('psa 23:1'); return r }, (r) => r.context('psa 23:1'))
