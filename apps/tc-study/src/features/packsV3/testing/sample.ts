/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Test helper over language-pack-v3's builders (Bun tests only).
// es-419 Titus over the spec test data, signed with a key made now. Ruth is not in that data.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILDER, buildCommon, buildLanguage, keyId, publicKeyOf, signCatalog } from '@bt-synergy/language-pack-v3'
import type { ResourceRef, Row, RowSource } from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'

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
    source: withTa(await source('es-419')),
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

