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
import type { ResourceRef, Row, RowFilter } from '../../language-pack-v3/src/source/rows'
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
export type Tweak = { row?: (row: Row, f: RowFilter) => Row; omit?: (row: Row, f: RowFilter) => boolean }

function tweaked(inner: RowSource, t: Tweak): RowSource {
  return {
    resources: (lang) => inner.resources(lang),
    async *rows(f) {
      for await (const row of inner.rows(f)) {
        if (t.omit?.(row, f) === true) continue
        yield t.row === undefined ? row : t.row(row, f)
      }
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

// Open Bible Stories of the es-419 sample: two stories with titles, and a note, a question and a word link on story 1. The rows have the
// shape the loaders write (`obs:{res}:{NN}`, `tn:{res}:obs:{story}`, `tq:…`, `twl:{res}:obs`).
const OBS_RES = 'es-419_gl/es-419/obs'
const OBS_TN = 'es-419_gl/es-419/obs-tn'
const OBS_TQ = 'es-419_gl/es-419/obs-tq'
const OBS_TWL = 'es-419_gl/es-419/obs-twl'
const obsRef = (key: string, kind: string): ResourceRef => ({ key, stamp: 'v1#2026-01-01T00_00_00Z', kind, books: [] })
const OBS_REFS: ResourceRef[] = [
  obsRef(OBS_RES, 'Open Bible Stories'),
  obsRef(OBS_TN, 'TSV OBS Translation Notes'),
  obsRef(OBS_TQ, 'TSV OBS Translation Questions'),
  obsRef(OBS_TWL, 'TSV OBS Translation Words Links'),
]
const storyRow = (nn: string, content: Record<string, unknown>): Row => ({
  layer: 'sot',
  key: `obs:${OBS_RES}:${nn}`,
  value: { content, timestamp: 1, resourceKey: OBS_RES, storyId: nn },
})
const OBS_ROWS: Row[] = [
  storyRow('01', {
    storyNumber: 1,
    title: 'La creación',
    sourceReference: 'Una historia de la Biblia: Génesis 1-2',
    frames: [
      { frameNumber: 1, imageUrl: 'https://cdn.door43.org/obs/jpg/360px/obs-es-419-01-01.jpg', text: 'Dios creó el mundo.' },
      { frameNumber: 2, imageUrl: '', text: 'Dios creó al hombre y a la mujer.' },
    ],
  }),
  storyRow('02', { storyNumber: 2, title: 'El pecado entra al mundo', sourceReference: 'Una historia de la Biblia: Génesis 3', frames: [{ frameNumber: 1, imageUrl: '', text: 'La serpiente engañó a la mujer.' }] }),
  {
    layer: 'sot',
    key: `tn:${OBS_TN}:obs:1`,
    value: { content: { notes: [{ reference: '1:2', id: 'n001', tags: '', supportReference: 'rc://*/ta/man/translate/figs-metaphor', quote: 'creó', occurrence: '1', note: 'Una metáfora.' }] }, metadata: {} },
  },
  { layer: 'sot', key: `tq:${OBS_TQ}:obs:1`, value: { content: { questions: [{ reference: '1:1', id: 'q001', tags: '', quote: '', occurrence: '0', question: '¿Quién creó el mundo?', response: 'Dios.' }] } } },
  {
    layer: 'sot',
    key: `twl:${OBS_TWL}:obs`,
    value: { bookCode: 'obs', links: [{ reference: '1:1', id: 'l001', tags: 'kt', origWords: 'Dios', occurrence: '1', articlePath: 'bible/kt/god', twLink: 'rc://*/tw/dict/bible/kt/god' }] },
  },
]
const ownerOf = (key: string): string => (key.includes(OBS_TN) ? OBS_TN : key.includes(OBS_TQ) ? OBS_TQ : key.includes(OBS_TWL) ? OBS_TWL : OBS_RES)
const OBS_OWNERS = new Set(OBS_REFS.map((r) => r.key))

/** A source with the es-419 Open Bible Stories added to the rows of `inner`. */
function withObs(inner: RowSource): RowSource {
  return {
    async resources(lang) {
      return [...(await inner.resources(lang)), ...(lang === ES ? OBS_REFS : [])]
    },
    async *rows(f) {
      if (f.resource === undefined || !OBS_OWNERS.has(f.resource)) yield* inner.rows(f)
      if (f.lang !== ES && f.lang !== undefined) return
      for (const row of OBS_ROWS) {
        if ((f.resource === undefined || f.resource === ownerOf(row.key)) && (f.layer === undefined || f.layer === row.layer)) yield row
      }
    },
  }
}

type Built = { sample: Sample; common: Awaited<ReturnType<typeof buildCommon>>; source: (lang: string) => Promise<RowSource>; pkcs8: Uint8Array; core: XtopicsCore; records: ReturnType<typeof parseTipnr> }
let memo: Promise<Built> | undefined

/**
 * The sample. With no option it is the same object each time. `revision` and `tweak` build another revision of the language
 * catalog only (same key, same common catalog); `commonRevision` builds a common catalog of another id (the language catalog
 * still requires the first one). `books` builds the language catalog with those books only (`[]`: none).
 */
export async function buildSample(o: { revision?: number; tweak?: Tweak; commonRevision?: number; requireNewCommon?: boolean; books?: string[]; frames?: Map<string, string> } = {}): Promise<Sample> {
  // `frames` (bible-story-builder's OBS files): another sample, built afresh, whose common xtopics core has the obs-frames table
  if (o.frames !== undefined) return (await make(o.frames)).sample
  memo ??= make()
  const base = await memo
  if (o.revision === undefined && o.tweak === undefined && o.commonRevision === undefined && o.books === undefined) return base.sample
  let { langCatalog, commonCatalog } = base.sample
  const segments = new Map(base.sample.segments)
  // `requireNewCommon` (with `commonRevision`): the language catalog requires that common catalog instead of the first one.
  let required: [string, number, string] = ['common', about.revision, base.common.catalog.id]
  if (o.commonRevision !== undefined) {
    const common = await buildCommon({ source: await base.source('en'), about: { ...about, revision: o.commonRevision }, mapLang: 'en' })
    commonCatalog = await signCatalog(common.catalog.bytes, base.pkcs8)
    if (o.requireNewCommon === true) required = ['common', o.commonRevision, common.catalog.id]
  }
  if (o.revision !== undefined || o.tweak !== undefined || o.books !== undefined) {
    const lang = await buildLanguage({
      source: tweaked(await base.source(ES), o.tweak ?? {}),
      lang: ES,
      ...(o.books !== undefined ? { books: o.books } : {}),
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

async function make(frames?: Map<string, string>): Promise<Built> {  const parts = join(DATA, 'parts')
  const originals = join(DATA, 'originals', 'list.json')
  const source = async (lang: string) => {
    const inner = await partsSource({ list: join(DATA, lang, 'list.json'), partsDir: parts, originals })
    return lang === ES ? withObs(inner) : inner
  }
  const read = (path: string) => readFileSync(join(DATA, 'topics', path), 'utf8')
  const obs = new Map<number, string>()
  let n = 0
  for (const line of read('obs-refs.txt').split(/\r?\n/)) {
    const h = /^=== (\d+)$/.exec(line)
    if (h) obs.set((n = Number(h[1])), '')
    else if (n > 0) obs.set(n, `${obs.get(n)}${line}\n`)
  }
  const theo = (name: string) => read(`theographic-subset/${name}.json`)
  // The test data has no table of chapter lengths, so a closing line with whole chapters (`Genesis 1-2`) gives no range. Stories 1
  // and 10 get verses, and story 2 is added, so that a chapter lists two stories.
  obs.set(1, '_A Bible story from: Genesis 1:1-2:25_\n')
  obs.set(2, '_A Bible story from: Genesis 1:26-3:24_\n')
  obs.set(10, '_A Bible story from: Exodus 5:1-10:29_\n')
  const tipnr = read('tipnr-subset.txt')

  const common = await buildCommon({
    source: await source('en'),
    about,
    mapLang: 'en',
    topics: { tipnr, theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs, ...(frames !== undefined ? { frames } : {}) },
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
