/** Test helper: a small signed sample (es-419 Titus, and the common build) made once per process from the spec's test data. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILDER,
  buildCommon,
  buildLanguage,
  keyId,
  parseTipnr,
  publicKeyOf,
  signCatalog,
  xtopicsView,
  type BuiltSegment,
} from '@bt-synergy/language-pack-v3'
import { partsSource } from '../../language-pack-v3/src/node/partsSource'
import type { XtopicsCore } from '../../language-pack-v3/src/model'

export type Sample = {
  segments: Map<string, Uint8Array>
  langCatalog: Uint8Array
  commonCatalog: Uint8Array
  /** `publicKey` is lowercase hex of the 32 raw bytes; `privateKey` is the PKCS#8 form, made at run time. */
  keys: { keyId: string; publicKey: string; privateKey: Uint8Array }
}

const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const ES = 'es-419'
const about = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER } as const
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

let memo: Promise<Sample> | undefined

export function buildSample(): Promise<Sample> {
  memo ??= make()
  return memo
}

async function make(): Promise<Sample> {
  const parts = join(DATA, 'parts')
  const originals = join(DATA, 'originals', 'list.json')
  const source = (lang: string) => partsSource({ list: join(DATA, lang, 'list.json'), partsDir: parts, originals })
  const read = (path: string) => readFileSync(join(DATA, 'topics', path), 'utf8')
  const obs = new Map<number, string>()
  let n = 0
  for (const line of read('obs-refs.txt').split(/\r?\n/)) {
    const h = /^=== (\d+)$/.exec(line)
    if (h) obs.set((n = Number(h[1])), '')
    else if (n > 0) obs.set(n, `${obs.get(n)}${line}\n`)
  }
  const theo = (name: string) => read(`theographic-subset/${name}.json`)
  const tipnr = read('tipnr-subset.txt')

  const common = await buildCommon({
    source: await source('en'),
    about,
    mapLang: 'en',
    topics: { tipnr, theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs },
  })
  const core = xtopicsView(common.segments.find((s) => s.seg.h.class === 'xtopics' && s.seg.h.part === 'core')!.seg) as XtopicsCore
  const records = parseTipnr(tipnr, [])
  const lang = await buildLanguage({ source: await source(ES), lang: ES, registry: {}, about, topics: { xtopics: core, records }, aligned: true })

  const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)

  const segments = new Map<string, Uint8Array>()
  for (const s of [...common.segments, ...lang.segments] as BuiltSegment[]) segments.set(s.id, s.bytes)
  return {
    segments,
    langCatalog: await signCatalog(lang.catalog.bytes, pkcs8),
    commonCatalog: await signCatalog(common.catalog.bytes, pkcs8),
    keys: { keyId: keyId(publicKey), publicKey: hex(publicKey), privateKey: pkcs8 },
  }
}
