import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogView, hex, KNOWN, readSegment, verifyCatalog } from '@bt-synergy/language-pack-v3'
import { IMMUTABLE, NO_CACHE, type PackBucket } from './publishLanguage'

/** The only keys format 3 writes (`spec/serving.md`). */
export const V3_KEYS = {
  seg: (id: string) => `v3/seg/${id}.seg`,
  /** A complement, under the sha256 (hex) of its bytes as downloaded (`spec/serving.md`). */
  complement: (id: string) => `v3/complement/${id}`,
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

/** Whether two catalogs (their bytes) are equal apart from `about`: what decides that a build has nothing new to put. */
export async function sameCatalogContent(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  return content((await readCatalog(a)).model) === content((await readCatalog(b)).model)
}

/** Whether a published catalog carries a signature of the key `signer` (its id and raw public key) that verifies. */
export async function signedBy(bytes: Uint8Array, signer: { keyId: string; publicKey: Uint8Array }): Promise<boolean> {
  try {
    await verifyCatalog(bytes, { [signer.keyId]: signer.publicKey })
    return true
  } catch {
    return false
  }
}

/**
 * Whether a published catalog already is what a build says: equal apart from `about` and, when a signer is given, signed by it. A catalog
 * equal apart from `about` but unsigned (or signed by another key only) is not the same publication when this run signs.
 */
export async function sameAsPublished(published: Uint8Array, built: Uint8Array, signer?: { keyId: string; publicKey: Uint8Array }): Promise<boolean> {
  if (!(await sameCatalogContent(published, built))) return false
  return signer === undefined || (await signedBy(published, signer))
}

type Planned = { name: string; bytes: Uint8Array; model: Model; id: string }

/** A complement `kind` is a file extension in the build folder (`complements/<id>.<kind>`): a name that cannot leave that folder. */
const KIND = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * The complements the catalogs `models` list, put to `v3/complement/<id>` when the bucket lacks them (the same id is put once). The file is
 * `<outDir>/complements/<id>.<kind>`, where the builder wrote it; its length must be the `size` the catalog says and its sha256 the `id`,
 * and a file that is not is never uploaded. Returns the keys put and the keys that were already there, each in id order.
 */
export async function putComplements(o: { bucket: PackBucket; outDir: string; models: Model[]; log: (line: string) => void }): Promise<{ uploaded: string[]; skipped: string[] }> {
  const wanted = new Map<string, { kind: string; size: number }>()
  for (const model of o.models) {
    for (const c of model.complements ?? []) {
      const id = hex(c.id)
      const before = wanted.get(id)
      if (before !== undefined && (before.kind !== c.kind || before.size !== c.size)) throw new Error(`The complement ${id} is listed with two kinds or sizes`)
      wanted.set(id, { kind: c.kind, size: c.size })
    }
  }
  const uploaded: string[] = []
  const skipped: string[] = []
  for (const id of [...wanted.keys()].sort()) {
    const key = V3_KEYS.complement(id)
    if (await o.bucket.has(key)) {
      skipped.push(key)
      continue
    }
    const { kind, size } = wanted.get(id)!
    if (!KIND.test(kind)) throw new Error(`The complement ${id} has the kind ${JSON.stringify(kind)}, which is not a file extension`)
    const file = join(o.outDir, 'complements', `${id}.${kind}`)
    if (!existsSync(file)) throw new Error(`The complement ${id} is named by a catalog and is neither in the bucket nor at ${file}; the catalog that lists it (the common catalog, when it is not the one built here) was published without it: build and publish that catalog again`)
    const bytes = new Uint8Array(readFileSync(file))
    if (bytes.length !== size) throw new Error(`${file} has ${bytes.length} bytes and the catalog says the complement ${id} has ${size}`)
    // The id of a complement is the sha256 of its file as downloaded (catalog.md): a file that does not hash to its name is never uploaded.
    if (createHash('sha256').update(bytes).digest('hex') !== id) throw new Error(`${file} does not hash to the id ${id}`)
    await o.bucket.put(key, bytes, { contentType: 'application/octet-stream', cacheControl: IMMUTABLE })
    if (!(await o.bucket.has(key))) throw new Error(`The complement ${id} is not in the bucket after its upload`)
    uploaded.push(key)
  }
  if (wanted.size > 0) o.log(`complements: ${uploaded.length} uploaded, ${skipped.length} already there`)
  return { uploaded, skipped }
}

/** Uploads the folder `build-v3` wrote: segments first, then the registry, then the catalogs (common before the language); nothing outside the key shapes of `V3_KEYS`. */
export async function publishV3(o: {
  bucket: PackBucket
  outDir: string
  lang: string
  publishCommon: boolean
  /** The key this run signs with: a published catalog not signed by it is not `unchanged`. */
  signer?: { keyId: string; publicKey: Uint8Array }
  log: (line: string) => void
}): Promise<{ outcome: 'published' | 'unchanged'; uploaded: string[]; skipped: string[] }> {
  const { bucket, outDir, lang, log } = o
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(lang) || lang === 'common') throw new Error(`Not a language for a format 3 upload: ${JSON.stringify(lang)}`)
  const uploaded: string[] = []
  const skipped: string[] = []
  const file = (name: string): string => join(outDir, name)
  const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(file(name)))

  const published = await readPublishedV3(bucket, lang)
  const planned: Planned[] = []
  const unchangedModels: Model[] = []
  for (const name of o.publishCommon ? ['common', lang] : [lang]) {
    const path = `catalog-${name}.seg`
    if (!existsSync(file(path))) {
      throw new Error(`The build folder has no ${path}`)
    }
    const bytes = bytesOf(path)
    const { model, id } = await readCatalog(bytes)
    const before = name === 'common' ? published.common : published.lang
    if (before !== undefined && (await sameAsPublished(before.bytes, bytes, o.signer))) {
      log(`catalog ${name}: unchanged (revision ${before.revision})`)
      unchangedModels.push((await readCatalog(before.bytes)).model)
      continue
    }
    if (o.signer !== undefined && !(await signedBy(bytes, o.signer))) {
      throw new Error(`The catalog ${name} in ${outDir} does not verify against the signing key ${o.signer.keyId}: nothing was uploaded`)
    }
    planned.push({ name, bytes, model, id })
  }

  const registryFile = `registry-${lang}.json`
  let registry: string | undefined
  if (existsSync(file(registryFile))) {
    const text = readFileSync(file(registryFile), 'utf8')
    if (published.registry === undefined || canonical(JSON.parse(text)) !== canonical(published.registry)) registry = text
    else log(`registry ${lang}: unchanged`)
  }

  if (planned.length === 0 && registry === undefined) {
    // A catalog an older publisher put may list complements the bucket lacks: they are put now (the files are in the build folder), so "unchanged" never leaves a catalog that points nowhere.
    const repaired = await putComplements({ bucket, outDir, models: unchangedModels, log })
    return { outcome: 'unchanged', uploaded: repaired.uploaded, skipped: repaired.skipped }
  }

  // The segments the catalogs to put name, in id order.
  const classes = new Map<string, string>()
  for (const { model } of planned) for (const entry of model.segments) classes.set(hex(entry.id), entry.class)
  // The language catalog must require the common catalog that will be in the bucket: the one put in this run, or else the published one
  // (which then needs its segments in the bucket too).
  const commonIds: string[] = []
  const language = planned.find(({ name }) => name === lang)
  if (language !== undefined) {
    const putCommon = planned.find(({ name }) => name === 'common')
    const there = putCommon !== undefined ? { revision: putCommon.model.about.revision, id: putCommon.id } : published.common
    if (there === undefined) throw new Error('The common catalog is not published; the language catalog requires it and none was put')
    const required = language.model.requires?.find(([name]) => name === 'common')
    if (required === undefined) throw new Error(`The catalog ${lang} does not require the common catalog`)
    if (required[1] !== there.revision || hex(required[2]) !== there.id) {
      throw new Error(`The catalog ${lang} requires common revision ${required[1]} id ${hex(required[2])}, and the common catalog of the bucket after this run is revision ${there.revision} id ${there.id}`)
    }
    // A signed language catalog must not stand on a common catalog another key (or none) signed.
    if (o.signer !== undefined && putCommon === undefined && !(await signedBy(published.common!.bytes, o.signer))) {
      throw new Error(`The catalog ${lang} requires the published common catalog (revision ${there.revision}), which is not signed by the signing key ${o.signer.keyId}: nothing was uploaded`)
    }
    if (putCommon === undefined) for (const entry of (await readCatalog(published.common!.bytes)).model.segments) commonIds.push(hex(entry.id))
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

  // The complements the catalogs to put list (a language catalog over the published common catalog stands on that one's too), before any catalog.
  const publishedCommon = language !== undefined && !planned.some(({ name }) => name === 'common') ? [(await readCatalog(published.common!.bytes)).model] : []
  const complements = await putComplements({ bucket, outDir, models: [...planned.map(({ model }) => model), ...unchangedModels, ...publishedCommon], log })
  uploaded.push(...complements.uploaded)
  skipped.push(...complements.skipped)

  // A catalog is only put when every segment it names is in the bucket (a lost write must not leave a catalog that points nowhere).
  for (const id of [...ids, ...commonIds]) {
    if (!(await bucket.has(V3_KEYS.seg(id)))) throw new Error(`Segment ${id} is not in the bucket after its upload; no catalog was put`)
  }

  // The registry goes before the catalogs: one that is ahead of its catalog only reserves section numbers, while a catalog whose registry
  // was lost could let a later run give a published number to another section (sections.ts).
  if (registry !== undefined) {
    await bucket.put(V3_KEYS.registry(lang), registry, { contentType: 'application/json', cacheControl: NO_CACHE })
    uploaded.push(V3_KEYS.registry(lang))
  }
  for (const { name, bytes } of planned) {
    const key = V3_KEYS.catalog(name)
    await bucket.put(key, bytes, { contentType: 'application/octet-stream', cacheControl: NO_CACHE })
    uploaded.push(key)
    log(`catalog ${name}: put`)
  }
  return { outcome: 'published', uploaded, skipped }
}

/** What the bucket has of one catalog by name (a catalog that is neither common nor the registry's language), or undefined. */
export async function readPublishedCatalog(bucket: PackBucket, name: string): Promise<Published | undefined> {
  return publishedCatalog(bucket, name)
}

/**
 * Uploads a catalog that requires nothing (`zxx-obsimg`): the segments the bucket lacks, in id order, then the catalog, from the folder
 * `build-v3` wrote (`catalog-<name>.seg`, `segments/`). No common catalog, no registry. A catalog equal to the published one apart from
 * `about` (and signed by `signer` when one is given) is `unchanged` and nothing is put. A catalog is only put when every segment it names
 * is in the bucket.
 */
export async function publishStandalone(o: {
  bucket: PackBucket
  outDir: string
  name: string
  signer?: { keyId: string; publicKey: Uint8Array }
  log: (line: string) => void
}): Promise<{ outcome: 'published' | 'unchanged'; uploaded: string[]; skipped: string[] }> {
  const { bucket, outDir, name, log } = o
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name === 'common') throw new Error(`Not a catalog name for a standalone upload: ${JSON.stringify(name)}`)
  const uploaded: string[] = []
  const skipped: string[] = []
  const catalogFile = join(outDir, `catalog-${name}.seg`)
  if (!existsSync(catalogFile)) throw new Error(`The build folder has no catalog-${name}.seg`)
  const bytes = new Uint8Array(readFileSync(catalogFile))
  const { model } = await readCatalog(bytes)
  if (model.about.catalog !== name) throw new Error(`catalog-${name}.seg is the catalog ${JSON.stringify(model.about.catalog)}`)
  if ((model.requires ?? []).length > 0) throw new Error(`The catalog ${name} requires other catalogs; a standalone upload is for a catalog that requires nothing`)

  const before = await publishedCatalog(bucket, name)
  if (before !== undefined && (await sameAsPublished(before.bytes, bytes, o.signer))) {
    log(`catalog ${name}: unchanged (revision ${before.revision})`)
    const repaired = await putComplements({ bucket, outDir, models: [model], log })
    return { outcome: 'unchanged', uploaded: repaired.uploaded, skipped: repaired.skipped }
  }
  if (o.signer !== undefined && !(await signedBy(bytes, o.signer))) {
    throw new Error(`The catalog ${name} in ${outDir} does not verify against the signing key ${o.signer.keyId}: nothing was uploaded`)
  }

  const classes = new Map<string, string>()
  for (const entry of model.segments) classes.set(hex(entry.id), entry.class)
  const ids = [...classes.keys()].sort()
  for (const id of ids) {
    const key = V3_KEYS.seg(id)
    if (await bucket.has(key)) {
      skipped.push(key)
      continue
    }
    const path = join(outDir, 'segments', `${id}.seg`)
    if (!existsSync(path)) throw new Error(`Segment ${id} is named by the catalog and is neither in the bucket nor in ${outDir}`)
    const segBytes = new Uint8Array(readFileSync(path))
    // The id is the sha256 of the decompressed body; a file that does not hash to its name is never uploaded.
    await readSegment(segBytes, { known: KNOWN[classes.get(id) as keyof typeof KNOWN] ?? {}, expectedId: id })
    await bucket.put(key, segBytes, { contentType: 'application/octet-stream', cacheControl: IMMUTABLE })
    uploaded.push(key)
  }
  log(`segments: ${uploaded.length} uploaded, ${skipped.length} already there`)
  const complements = await putComplements({ bucket, outDir, models: [model], log })
  uploaded.push(...complements.uploaded)
  skipped.push(...complements.skipped)
  for (const id of ids) {
    if (!(await bucket.has(V3_KEYS.seg(id)))) throw new Error(`Segment ${id} is not in the bucket after its upload; no catalog was put`)
  }
  await bucket.put(V3_KEYS.catalog(name), bytes, { contentType: 'application/octet-stream', cacheControl: NO_CACHE })
  uploaded.push(V3_KEYS.catalog(name))
  log(`catalog ${name}: put`)
  return { outcome: 'published', uploaded, skipped }
}
