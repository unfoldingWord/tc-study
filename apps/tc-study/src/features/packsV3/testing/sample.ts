/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Test helper over language-pack-v3's builders (Bun tests only).
// es-419 Titus over the spec test data, signed with a key made now. Ruth is not in that data.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILDER, buildCommon, buildLanguage, keyId, publicKeyOf, signCatalog } from '@bt-synergy/language-pack-v3'
import type { ResourceRef, Row, RowSource } from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'
import { NotesProcessor, QuestionsProcessor, WordsLinksProcessor } from '@bt-synergy/resource-parsers'
import { ObsLoader } from '@bt-synergy/resource-pipeline'

export type Sample = {
  segments: Map<string, Uint8Array>
  langCatalog: Uint8Array
  commonCatalog: Uint8Array
  keyId: string
  publicKey: Uint8Array
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..')
const DATA = join(ROOT, 'packages', 'language-pack-v3', 'spec', 'tests', 'data')
const aboutOf = (revision: number) => ({ format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision, built: '2026-11-01T10:00:00Z', builder: BUILDER })

/** The tA the spec data lacks: es-419, in the form the TA loader caches (`# title`, `## subtitle`, then `01.md`). */
export const TA_RESOURCE = 'es-419_gl/es-419/ta'
const TA_STAMP = 'v4#2024-07-17T20_15_35Z'
export const TA_SOURCE: Record<string, { title: string; md: string }> = {
  'translate/figs-metaphor': {
    title: 'Metáfora',
    md: [
      '# Metáfora',
      '## ¿Qué es una metáfora y cómo la traduzco?',
      '### Descripción',
      'Una metáfora compara dos cosas. Mira también [[rc://*/ta/man/translate/figs-simile]] y [[rc://es-419/tw/dict/bible/kt/grace]].',
      '### Ejemplos de la Biblia',
      'Vea [Tito 1:1](rc://*/tn/help/tit/01/01) y [la nota](../01/02.md).',
      '### Estrategias de traducción',
      '1. Usar la metáfora.',
      '2. Usar una comparación.',
    ].join('\n\n'),
  },
  'translate/figs-simile': {
    title: 'Símil',
    md: ['# Símil', '## ¿Qué es un símil?', '### Descripción', 'Un símil usa «como». Es parecido a una metáfora.'].join('\n\n'),
  },
}
function withTa(base: RowSource): RowSource {
  const ref: ResourceRef = { key: TA_RESOURCE, stamp: TA_STAMP, kind: 'Translation Academy', books: [] }
  return {
    resources: async (lang) => [...(await base.resources(lang)), ...(lang === 'es-419' ? [ref] : [])],
    rows(f) {
      if (f.resource !== TA_RESOURCE) return base.rows(f)
      const rows: Row[] = []
      for (const [path, a] of Object.entries(TA_SOURCE)) {
        if (f.layer === undefined || f.layer === 'sot') rows.push({ layer: 'sot', key: `${TA_RESOURCE}/${path}`, value: a.md })
        if (f.layer === undefined || f.layer === 'text') rows.push({ layer: 'text', key: `helps-text:ta-title:${TA_RESOURCE}@${TA_STAMP}:${path}`, value: { content: a.title, version: 1 } })
      }
      return (async function* () { yield* rows })()
    },
  }
}

/**
 * Open Bible Stories 1 and 2 of es-419 with their notes, questions and word links, as the Door43 loaders write them: the
 * stories by `ObsLoader` itself (over a fake Door43 client and an in-memory cache), the helps by the parsers of the TSV
 * loaders. `OBS_DOOR43` holds those rows (`resolvedSrc` and `timestamp` included) for the tests to compare with.
 */
export const OBS_RES = { stories: 'es-419_gl/es-419/obs', notes: 'es-419_gl/es-419/obs-tn', questions: 'es-419_gl/es-419/obs-tq', links: 'es-419_gl/es-419/obs-twl' }
const OBS_STAMP = 'v9#2024-03-01T10_00_00Z'
const IMG = (n: string, f: string) => `https://cdn.door43.org/obs/jpg/360px/obs-en-${n}-${f}.jpg`
export const OBS_STORIES_MD: Record<string, string> = {
  '01': [
    '# 1. La creación',
    `![OBS Image](${IMG('01', '01')})`,
    'Dios creó el mundo en seis días.',
    `![OBS Image](${IMG('01', '02')})`,
    'Luego Dios dijo: «Que haya luz».',
    '_Una historia de la Biblia: Génesis 1-2_',
  ].join('\n\n'),
  '02': [
    '# 2. El pecado entra en el mundo',
    `![OBS Image](${IMG('02', '01')})`,
    'Dios puso al hombre y a la mujer en un jardín.',
    `![OBS Image](${IMG('02', '02')})`,
    'La serpiente engañó a la mujer.',
    `![OBS Image](${IMG('02', '03')})`,
    'Ellos comieron del fruto.',
    '_Una historia de la Biblia: Génesis 2-3_',
  ].join('\n\n'),
}
const T = '\t'
const tsv = (lines: string[][]) => lines.map((l) => l.join(T)).join('\n')
const OBS_TN_TSV = tsv([
  ['Reference', 'ID', 'Tags', 'SupportReference', 'Quote', 'Occurrence', 'Note'],
  ['1:1', 'ab12', '', 'rc://*/ta/man/translate/figs-metaphor', 'seis días', '1', 'Una nota.\\nVea [[rc://es-419/ta/man/translate/figs-simile]].'],
  ['1:2', 'cd34', '', '', '', '0', 'Otra nota.'],
  ['2:3', 'ef56', '', '', 'fruto', '1', 'Nota de la historia 2.'],
])
const OBS_TQ_TSV = tsv([
  ['Reference', 'ID', 'Tags', 'Quote', 'Occurrence', 'Question', 'Response'],
  ['1:1', 'qa01', '', '', '0', '¿Qué creó Dios?', 'El mundo.'],
  ['2:2', 'qb02', '', '', '0', '¿Quién engañó a la mujer?', 'La serpiente.'],
])
const OBS_TWL_TSV = tsv([
  ['Reference', 'ID', 'Tags', 'OrigWords', 'Occurrence', 'TWLink'],
  ['1:1', 'wl01', 'keyterm', 'Dios', '1', 'rc://*/tw/dict/bible/kt/god'],
  ['2:2', 'wl02', 'keyterm', 'serpiente', '1', 'rc://*/tw/dict/bible/other/serpent'],
])
export type ObsDoor43 = { stories: Row[]; notes: Row[]; questions: Row[]; links: Row[] }
type Processed = { notesByChapter: Record<string, unknown[]>; questionsByChapter: Record<string, unknown[]>; metadata: unknown }
let obsDoor43: Promise<ObsDoor43> | undefined
export function OBS_DOOR43(): Promise<ObsDoor43> {
  return (obsDoor43 ??= (async () => {
    const cache = new Map<string, unknown>()
    const loader = new ObsLoader({
      cacheAdapter: { get: async (k: string) => (cache.get(k) as { content?: unknown }) ?? null, set: async (k: string, v: unknown) => void cache.set(k, v) },
      catalogAdapter: { get: async () => ({ contentMetadata: { ingredients: Object.keys(OBS_STORIES_MD).map((n) => ({ identifier: n, path: `./content/${n}.md` })) } }) },
      door43Client: {
        findRepository: async () => ({ release: { tag_name: 'v9' } }),
        fetchTextContent: async (_o: string, _r: string, path: string) => OBS_STORIES_MD[/(\d+)\.md$/.exec(path)![1]],
      },
    })
    for (const n of Object.keys(OBS_STORIES_MD)) await loader.loadContent(OBS_RES.stories, n)
    const stories = [...cache].map(([key, value]) => ({ key, value }))
    const chunk = (prefix: string, res: string, field: string, by: Record<string, unknown[]>, metadata: unknown): Row[] =>
      Object.entries(by).map(([chapter, list]) => ({ key: `${prefix}:${res}:obs:${chapter}`, value: { content: { [field]: list }, metadata } }))
    const tn: Processed = Object.assign({}, await new NotesProcessor().processNotes(OBS_TN_TSV, 'obs', 'obs'))
    const tq: Processed = Object.assign({}, await new QuestionsProcessor().processQuestions(OBS_TQ_TSV, 'obs', 'obs'))
    const twl = await new WordsLinksProcessor().processWordsLinks(OBS_TWL_TSV, 'obs', 'obs')
    return {
      stories,
      notes: chunk('tn', OBS_RES.notes, 'notes', tn.notesByChapter, tn.metadata),
      questions: chunk('tq', OBS_RES.questions, 'questions', tq.questionsByChapter, tq.metadata),
      links: [{ key: `twl:${OBS_RES.links}:obs`, value: twl }],
    }
  })())
}
async function withObs(base: RowSource): Promise<RowSource> {
  const d = await OBS_DOOR43()
  const parts: [string, string, Row[]][] = [
    [OBS_RES.stories, 'Open Bible Stories', d.stories],
    [OBS_RES.notes, 'TSV OBS Translation Notes', d.notes],
    [OBS_RES.questions, 'TSV OBS Translation Questions', d.questions],
    [OBS_RES.links, 'TSV OBS Translation Words Links', d.links],
  ]
  return {
    resources: async (lang) => [...(await base.resources(lang)), ...(lang === 'es-419' ? parts.map(([key, kind]): ResourceRef => ({ key, stamp: OBS_STAMP, kind, books: [] })) : [])],
    rows(f) {
      const part = parts.find(([key]) => key === f.resource)
      if (!part) return base.rows(f)
      const rows = f.layer === undefined || f.layer === 'sot' ? part[2].map((r) => ({ layer: 'sot', ...r })) : []
      return (async function* () { yield* rows })()
    },
  }
}

const memo = new Map<number, Promise<Sample>>()
/** The sample as its catalogs' `revision` says (the same content, signed with a key made for each revision). */
export function buildSample(revision = 1): Promise<Sample> {
  let made = memo.get(revision)
  if (!made) memo.set(revision, (made = make(aboutOf(revision))))
  return made
}

async function make(about: ReturnType<typeof aboutOf>): Promise<Sample> {
  const parts = join(DATA, 'parts')
  const originals = join(DATA, 'originals', 'list.json')
  const source = (lang: string) => partsSource({ list: join(DATA, lang, 'list.json'), partsDir: parts, originals })
  const common = await buildCommon({ source: await source('en'), about, mapLang: 'en' })
  const lang = await buildLanguage({
    source: await withObs(withTa(await source('es-419'))),
    lang: 'es-419',
    registry: {},
    about,
    requires: [['common', about.revision, common.catalog.id]],
  })
  const { privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)
  const segments = new Map<string, Uint8Array>()
  for (const s of [...common.segments, ...lang.segments]) segments.set(s.id, s.bytes)
  return {
    segments,
    langCatalog: await signCatalog(lang.catalog.bytes, pkcs8),
    commonCatalog: await signCatalog(common.catalog.bytes, pkcs8),
    keyId: keyId(publicKey),
    publicKey,
  }
}

/** A `fetch` that answers like the packs Worker (`spec/serving.md`) from the sample, and remembers what was asked. */
export function fakeFetch(sample: Sample): typeof fetch & { urls: string[] } {
  const urls: string[] = []
  const answer = (bytes: Uint8Array | undefined, what: string) =>
    bytes
      ? new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      : new Response(JSON.stringify({ error: `${what} not found` }), { status: 404 })
  const fn = async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    const path = new URL(url).pathname
    const seg = /^\/v3\/packs\/seg\/([0-9a-f]{64})$/.exec(path)
    if (seg) return answer(sample.segments.get(seg[1]), 'segment')
    const cat = /^\/v3\/packs\/([^/]+)\/catalog$/.exec(path)
    if (cat?.[1] === 'common') return answer(sample.commonCatalog, 'catalog')
    if (cat?.[1] === 'es-419') return answer(sample.langCatalog, 'catalog')
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  }
  return Object.assign(fn, { urls })
}

