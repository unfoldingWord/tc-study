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
  type RowSource,
} from '@bt-synergy/language-pack-v3'
import { partsSource } from '../../language-pack-v3/src/node/partsSource'
import type { Row, RowFilter } from '../../language-pack-v3/src/source/rows'
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

/** A change to the rows of a source (the idea of `invalidation.test.ts` in language-pack-v3). */
export type Tweak = { row?: (row: Row, f: RowFilter) => Row }

function tweaked(inner: RowSource, t: Tweak): RowSource {
  return {
    resources: (lang) => inner.resources(lang),
    async *rows(f) {
      for await (const row of inner.rows(f)) yield t.row === undefined ? row : t.row(row, f)
    },
  }
}

type Note = { note: string; supportReference: string; isIntro: boolean }
/** A tweak that rewords the first note of the es-419 translation notes of Titus: only `book:tit` and the catalog change. */
export function rewordTitusNote(): Tweak {
  let done = false
  return {
    row: (row) => {
      if (done || row.layer !== 'sot' || !/^tn:.*:tit:\d+$/.test(row.key) || !row.key.startsWith('tn:es-419_gl/es-419/tn:')) return row
      const value = JSON.parse(JSON.stringify(row.value))
      const target = (value.content?.notes as Note[] | undefined)?.find((n) => !n.isIntro && n.supportReference !== '')
      if (target === undefined) return row
      done = true
      target.note = `${target.note} (otra palabra)`
      return { ...row, value }
    },
  }
}

/** A tweak that changes the title text a tW title row holds: the articles and the map change, the books do not. */
export function retitleTw(): Tweak {
  return {
    row: (row) => {
      if (row.layer !== 'text' || !row.key.startsWith('helps-text:tw-title')) return row
      const value = JSON.parse(JSON.stringify(row.value))
      value.content = `${String(value.content)} (otro)`
      return { ...row, value }
    },
  }
}

type Built = { sample: Sample; common: Awaited<ReturnType<typeof buildCommon>>; source: (lang: string) => Promise<RowSource>; pkcs8: Uint8Array; core: XtopicsCore; records: ReturnType<typeof parseTipnr> }
let memo: Promise<Built> | undefined

/**
 * The sample. With no option it is the same object each time. `revision` and `tweak` build another revision of the language
 * catalog only (same key, same common catalog); `commonRevision` builds a common catalog of another id (the language catalog
 * still requires the first one).
 */
export async function buildSample(o: { revision?: number; tweak?: Tweak; commonRevision?: number; requireNewCommon?: boolean } = {}): Promise<Sample> {
  memo ??= make()
  const base = await memo
  if (o.revision === undefined && o.tweak === undefined && o.commonRevision === undefined) return base.sample
  let { langCatalog, commonCatalog } = base.sample
  const segments = new Map(base.sample.segments)
  // `requireNewCommon` (with `commonRevision`): the language catalog requires that common catalog instead of the first one.
  let required: [string, number, string] = ['common', about.revision, base.common.catalog.id]
  if (o.commonRevision !== undefined) {
    const common = await buildCommon({ source: await base.source('en'), about: { ...about, revision: o.commonRevision }, mapLang: 'en' })
    commonCatalog = await signCatalog(common.catalog.bytes, base.pkcs8)
    if (o.requireNewCommon === true) required = ['common', o.commonRevision, common.catalog.id]
  }
  if (o.revision !== undefined || o.tweak !== undefined) {
    const lang = await buildLanguage({
      source: tweaked(await base.source(ES), o.tweak ?? {}),
      lang: ES,
      registry: {},
      about: { ...about, revision: o.revision ?? 1 },
      requires: [required],
      topics: { xtopics: base.core, records: base.records },
      aligned: true,
    })
    for (const s of lang.segments as BuiltSegment[]) segments.set(s.id, s.bytes)
    langCatalog = await signCatalog(lang.catalog.bytes, base.pkcs8)
  }
  return { ...base.sample, segments, langCatalog, commonCatalog }
}

async function make(): Promise<Built> {  const parts = join(DATA, 'parts')
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
  const lang = await buildLanguage({ source: await source(ES), lang: ES, registry: {}, about, requires: [['common', about.revision, common.catalog.id]], topics: { xtopics: core, records }, aligned: true })

  const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)

  const segments = new Map<string, Uint8Array>()
  for (const s of [...common.segments, ...lang.segments] as BuiltSegment[]) segments.set(s.id, s.bytes)
  const sample: Sample = {
    segments,
    langCatalog: await signCatalog(lang.catalog.bytes, pkcs8),
    commonCatalog: await signCatalog(common.catalog.bytes, pkcs8),
    keys: { keyId: keyId(publicKey), publicKey: hex(publicKey), privateKey: pkcs8 },
  }
  return { sample, common, source, pkcs8, core, records }
}
