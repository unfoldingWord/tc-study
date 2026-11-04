import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogView, hex, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { IMMUTABLE, NO_CACHE, type PackBucket } from './publishLanguage'

/** The only keys format 3 writes (`spec/serving.md`). */
export const V3_KEYS = {
  seg: (id: string) => `v3/seg/${id}.seg`,
  catalog: (name: string) => `v3/catalog/${name}.seg`,
  registry: (lang: string) => `v3/registry/${lang}.json`,
}

type Published = { revision: number; id: string; bytes: Uint8Array }

async function readCatalog(bytes: Uint8Array) {
  const { seg, id } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
  return { id, model: catalogView(seg) }
}

async function publishedCatalog(bucket: PackBucket, name: string): Promise<Published | undefined> {
  const bytes = await bucket.getBytes(V3_KEYS.catalog(name))
  if (bytes === null) return undefined
  const { id, model } = await readCatalog(bytes)
  return { revision: model.about.revision, id, bytes }
}

/** What the bucket has of the common catalog, the language's catalog and the language's registry. */
export async function readPublishedV3(bucket: PackBucket, lang: string): Promise<{ common?: Published; lang?: Published; registry?: unknown }> {
  const common = await publishedCatalog(bucket, 'common')
  const language = await publishedCatalog(bucket, lang)
  const registry = await bucket.getJson<unknown>(V3_KEYS.registry(lang))
  return { ...(common ? { common } : {}), ...(language ? { lang: language } : {}), ...(registry !== null ? { registry } : {}) }
}

/** A JSON text with sorted keys and bytes as hex, so equal contents give equal texts. */
function canonical(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (v instanceof Uint8Array) return `bytes:${hex(v)}`
    if (Array.isArray(v)) return v.map(sorted)
    if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return Object.fromEntries(entries.map(([k, x]) => [k, sorted(x)]))
    }
    return v
  }
  return JSON.stringify(sorted(value))
}

type Model = ReturnType<typeof catalogView>
/** Everything of a catalog but `about` (its revision and previous id change on every build). */
const content = (m: Model): string => canonical({ resources: m.resources, segments: m.segments, units: m.units, requires: m.requires ?? null, complements: m.complements ?? null })

type Planned = { name: string; bytes: Uint8Array; model: Model }

/** Uploads the folder `build-v3` wrote: segments first, then the catalogs, then the registry; nothing outside the three key shapes. */
export async function publishV3(o: {
  bucket: PackBucket
  outDir: string
  lang: string
  publishCommon: boolean
  log: (line: string) => void
}): Promise<{ outcome: 'published' | 'unchanged'; uploaded: string[]; skipped: string[] }> {
  const { bucket, outDir, lang, log } = o
  if (!/^[a-z0-9-]+$/.test(lang) || lang === 'common') throw new Error(`Not a language for a format 3 upload: ${JSON.stringify(lang)}`)
  const uploaded: string[] = []
  const skipped: string[] = []
  const file = (name: string): string => join(outDir, name)
  const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(file(name)))

  const published = await readPublishedV3(bucket, lang)
  const planned: Planned[] = []
  for (const name of o.publishCommon ? ['common', lang] : [lang]) {
    const path = `catalog-${name}.seg`
    if (!existsSync(file(path))) {
      throw new Error(`The build folder has no ${path}`)
    }
    const bytes = bytesOf(path)
    const { model } = await readCatalog(bytes)
    const before = name === 'common' ? published.common : published.lang
    if (before !== undefined && content((await readCatalog(before.bytes)).model) === content(model)) {
      log(`catalog ${name}: unchanged (revision ${before.revision})`)
      continue
    }
    planned.push({ name, bytes, model })
  }

  const registryFile = `registry-${lang}.json`
  let registry: string | undefined
  if (existsSync(file(registryFile))) {
    const text = readFileSync(file(registryFile), 'utf8')
    if (published.registry === undefined || canonical(JSON.parse(text)) !== canonical(published.registry)) registry = text
    else log(`registry ${lang}: unchanged`)
  }

  if (planned.length === 0 && registry === undefined) return { outcome: 'unchanged', uploaded, skipped }

  // The segments the catalogs to put name, in id order.
  const classes = new Map<string, string>()
  for (const { model } of planned) for (const entry of model.segments) classes.set(hex(entry.id), entry.class)
  // The common catalog this run does not put must already be published, be the one the language catalog requires, and have its segments.
  const commonIds: string[] = []
  const language = planned.find(({ name }) => name === lang)
  if (!o.publishCommon && language !== undefined) {
    if (published.common === undefined) throw new Error('The common catalog is not published; the language catalog requires it and none was put')
    const required = language.model.requires?.find(([name]) => name === 'common')
    if (required === undefined) throw new Error(`The catalog ${lang} does not require the common catalog`)
    if (required[1] !== published.common.revision || hex(required[2]) !== published.common.id) {
      throw new Error(`The catalog ${lang} requires common revision ${required[1]} id ${hex(required[2])}, and the published one is revision ${published.common.revision} id ${published.common.id}`)
    }
    for (const entry of (await readCatalog(published.common.bytes)).model.segments) commonIds.push(hex(entry.id))
  }
  const ids = [...classes.keys()].sort()
  for (const id of ids) {
    const key = V3_KEYS.seg(id)
    if (await bucket.has(key)) {
      skipped.push(key)
      continue
    }
    const path = join('segments', `${id}.seg`)
    if (!existsSync(file(path))) throw new Error(`Segment ${id} is named by a catalog and is neither in the bucket nor in ${outDir}`)
    const bytes = bytesOf(path)
    // The id is the sha256 of the decompressed body; a file that does not hash to its name is never uploaded.
    await readSegment(bytes, { known: KNOWN[classes.get(id) as keyof typeof KNOWN] ?? {}, expectedId: id })
    await bucket.put(key, bytes, { contentType: 'application/octet-stream', cacheControl: IMMUTABLE })
    uploaded.push(key)
  }
  log(`segments: ${uploaded.length} uploaded, ${skipped.length} already there`)

  // A catalog is only put when every segment it names is in the bucket (a lost write must not leave a catalog that points nowhere).
  for (const id of [...ids, ...commonIds]) {
    if (!(await bucket.has(V3_KEYS.seg(id)))) throw new Error(`Segment ${id} is not in the bucket after its upload; no catalog was put`)
  }

  for (const { name, bytes } of planned) {
    const key = V3_KEYS.catalog(name)
    await bucket.put(key, bytes, { contentType: 'application/octet-stream', cacheControl: NO_CACHE })
    uploaded.push(key)
    log(`catalog ${name}: put`)
  }
  if (registry !== undefined) {
    await bucket.put(V3_KEYS.registry(lang), registry, { contentType: 'application/json', cacheControl: NO_CACHE })
    uploaded.push(V3_KEYS.registry(lang))
  }
  return { outcome: 'published', uploaded, skipped }
}
