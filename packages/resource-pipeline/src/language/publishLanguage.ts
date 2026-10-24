/**
 * Publish one language to a bucket only when something it is built from changed: the Door43 releases (read in seconds
 * from the catalog), MACULA's commit or the lexicons' ref. Those make the build id; a stored catalog entry with the same
 * id means the hour-long build is skipped. The generator's commit is recorded in the entry but is not compared, so an
 * unrelated tc-study commit rebuilds nothing; a builder fix no stamp shows is republished with `force`.
 *
 * The upload order is what keeps a cut-short run harmless: the packs (named by content, so new keys), then the views,
 * then the originals' entry and the language's entry last. Until that entry is written the bucket names the previous
 * build, whose pack is still there.
 *
 * A build that is not whole is never published: the build id is made of what Door43 lists, so a resource dropped by a
 * failed download would otherwise be frozen out until Door43 publishes again.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildIdOf,
  catalogEntryOf,
  catalogPath,
  compatKeyOf,
  ORIGINAL_LANGUAGE_KEYS,
  PACK_FORMAT_VERSION,
  type PackBuild,
  type PackCatalogEntry,
  type PackManifest,
} from '@bt-synergy/language-pack'
import { MACULA_KEYS } from '../../cli/companions'
import { door43Stamps } from './door43Stamps'
import { PACK_VERSIONS } from './packVersions'
import { prepareAndPack } from './prepareAndPack'
import { writeMcpViews } from './writeMcpViews'

export interface PackBucket {
  getJson<T>(key: string): Promise<T | null>
  /** Whether the bucket has the key; an answer that is neither yes nor no throws. */
  has(key: string): Promise<boolean>
  put(key: string, body: Uint8Array | string, o: { contentType: string; cacheControl: string }): Promise<void>
}

/**
 * `would-publish`: a dry run found changes (nothing built). `built`: `noUpload` built the packs and views into the work
 * folder and put nothing.
 */
export type PublishOutcome = 'unchanged' | 'published' | 'would-publish' | 'built'

export type PublishResult = {
  language: string
  outcome: PublishOutcome
  entry?: PackCatalogEntry
  originals?: PublishOutcome
}

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const NO_CACHE = 'no-cache'
const VIEW_UPLOADS_AT_ONCE = 16

/** A language code safe to put in a bucket key or a folder name: `es-419`, `pt-br`, `zh-Hant-TW`. */
export function isLanguageCode(language: string): boolean {
  return /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(language)
}

/** The workflow prints these lines: a line break from Door43 could forge one of its own commands. */
export const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ')

async function sha256Of(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** What changed since the stored build, for the log. */
function changesSince(stored: PackBuild | undefined, next: Omit<PackBuild, 'id'>): string[] {
  if (!stored) return ['no hay entrada guardada']
  const out: string[] = []
  for (const field of ['generator', 'macula', 'lexicons'] as const) {
    if (stored[field] !== next[field]) out.push(`${field}: ${stored[field] ?? '—'} → ${next[field] ?? '—'}`)
  }
  for (const key of new Set([...Object.keys(stored.stamps ?? {}), ...Object.keys(next.stamps)])) {
    const before = stored.stamps?.[key]
    const after = next.stamps[key]
    if (before !== after) out.push(`${key}: ${before ?? '—'} → ${after ?? '—'}`)
  }
  return out
}

type PackLeft = Array<{ key: string; why: string }>

/** Reasons a resource is left out that a rebuild would not change: a book pack's book it does not have. */
const PERMANENT_LEFT = /^no tiene /

const resourceIdOf = (key: string) => key.split('/')[2] ?? ''

/**
 * Why a build must not be published, if anything: a resource left out by a failed download, an original or MACULA
 * missing from the originals pack, a resource Door43 lists that the pack neither carries nor leaves out for good, or no
 * aligned literal text (a language without one cannot be opened in Servos; the spec's eligibility rule).
 */
export function notWhole(
  packs: { language: { manifest: PackManifest; skipped: PackLeft }; originals: { manifest: PackManifest; skipped: PackLeft } },
  stamps: Record<string, string>,
  o: { obs: boolean }
): string[] {
  const out: string[] = []
  for (const { key, why } of [...packs.language.skipped, ...packs.originals.skipped]) {
    if (!PERMANENT_LEFT.test(why)) out.push(`${key}: ${why}`)
  }
  const inOriginals = new Set(packs.originals.manifest.resources.map((r) => r.key))
  for (const key of [...ORIGINAL_LANGUAGE_KEYS, ...MACULA_KEYS]) {
    if (!inOriginals.has(key)) out.push(`${key}: no está en el paquete de originales`)
  }
  const packed = new Set(packs.language.manifest.resources.map((r) => r.key))
  const leftForGood = new Set(packs.language.skipped.filter((s) => PERMANENT_LEFT.test(s.why)).map((s) => s.key))
  const originals = new Set<string>(ORIGINAL_LANGUAGE_KEYS)
  for (const key of Object.keys(stamps).sort()) {
    // The stamps carry OBS only when it is packed; with it, its own rules may leave parts out.
    if (originals.has(key) || (o.obs && /^obs/i.test(resourceIdOf(key)))) continue
    if (!packed.has(key) && !leftForGood.has(key) && !out.some((line) => line.startsWith(`${key}: `))) {
      out.push(`${key}: Door43 lo lista y el paquete no lo tiene`)
    }
  }
  const literal = packs.language.manifest.resources.some((r) => r.subject === 'Aligned Bible' && /lt$/.test(resourceIdOf(r.key)))
  if (!literal) out.push('el paquete no tiene texto literal alineado')
  return out
}

/** Like Promise.all over a pool: stops starting uploads at the first failure, and rejects with it. */
export async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch (e) {
        failed = true
        throw e
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function publishLanguage(o: {
  language: string
  bucket: PackBucket
  workDir: string
  generator: string
  /** `date`: the commit's date (ISO 8601), what apps order MACULA's stamps by; the commit alone makes the build id. */
  macula: { folder: string; commit: string; date: string }
  lexiconsRef: string
  /** Open Bible Stories and their helps in the pack; left out by default, as the published packs always were. */
  obs?: boolean
  stamps?: (language: string) => Promise<Record<string, string>>
  build?: typeof prepareAndPack
  views?: typeof writeMcpViews
  /**
   * Build and publish even when the build id matches the stored one, the language's and the originals': for a builder
   * fix no stamp shows and no compat key covers (which resources discovery takes, how lexicons are read).
   */
  force?: boolean
  /** Decide only: nothing is built or put. */
  dryRun?: boolean
  /** Decide, then build the packs and views into `workDir`, and put nothing (a measurement, a check). */
  noUpload?: boolean
  log?: (line: string) => void
}): Promise<PublishResult> {
  const { language, bucket } = o
  if (!isLanguageCode(language)) throw new Error(`Not a language code: ${JSON.stringify(language)}`)
  const maculaDate = new Date(o.macula.date)
  if (!/^\d{4}-\d{2}-\d{2}/.test(o.macula.date) || Number.isNaN(maculaDate.getTime())) {
    throw new Error(`Not an ISO 8601 date for MACULA's commit: ${JSON.stringify(o.macula.date)}`)
  }
  // In UTC: apps compare the dates as text, and two offsets would not sort.
  const maculaStamp = { version: o.macula.commit.slice(0, 10), publishedAt: maculaDate.toISOString() }
  const obs = o.obs ?? false
  const write = o.log ?? (() => {})
  const say = (line: string) => write(oneLine(line))
  const stampsOf = o.stamps ?? ((l: string) => door43Stamps({ language: l, obs, lexiconsRef: o.lexiconsRef }))
  const build = o.build ?? prepareAndPack
  const views = o.views ?? writeMcpViews

  const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
  const stamps = await stampsOf(language)
  // An empty answer from Door43 must not pass for «nothing to pack»: that would publish an empty pack over a good one.
  const missing = ORIGINAL_LANGUAGE_KEYS.filter((key) => !stamps[key])
  if (missing.length) throw new Error(`Door43 gave no stamp for ${missing.join(', ')}: not publishing ${language}`)
  const originalStamps = Object.fromEntries(ORIGINAL_LANGUAGE_KEYS.map((key) => [key, stamps[key]]))

  const languageBase = { generator: o.generator, macula: o.macula.commit, lexicons: o.lexiconsRef, stamps }
  const languageBuild: PackBuild = { id: await buildIdOf(languageBase), ...languageBase }
  const originalsBase = { generator: o.generator, macula: o.macula.commit, stamps: originalStamps }
  const originalsBuild: PackBuild = { id: await buildIdOf(originalsBase), ...originalsBase }

  const stored = await bucket.getJson<PackCatalogEntry>(catalogPath(compat, language))
  const storedOriginals = await bucket.getJson<PackCatalogEntry>(catalogPath(compat, 'originals'))
  say(`${language}: compat ${compat}, build ${languageBuild.id} (guardado: ${stored?.build?.id ?? 'ninguno'})`)

  if (stored?.build?.id === languageBuild.id && !o.force) {
    say(`${language}: sin cambios`)
    return { language, outcome: 'unchanged', entry: stored }
  }
  if (o.force) say(`${language}: forzado`)
  for (const change of changesSince(stored?.build, languageBase)) say(`  ${change}`)
  // An entry without its pack cannot be named by a language, so it is published again.
  const originalsChanged = Boolean(o.force) || storedOriginals?.build?.id !== originalsBuild.id || !storedOriginals?.pack?.path
  say(`originals: build ${originalsBuild.id} (guardado: ${storedOriginals?.build?.id ?? 'ninguno'})${originalsChanged ? ', se publica' : ', sin cambios'}`)

  if (o.dryRun) {
    say(`${language}: dry run, se publicaría; no se construye ni se sube nada`)
    return { language, outcome: 'would-publish', originals: originalsChanged ? 'would-publish' : 'unchanged' }
  }

  const packs = await build({
    language,
    outDir: join(o.workDir, 'packs'),
    originals: true,
    macula: o.macula.folder,
    maculaStamp,
    lexicons: { ref: o.lexiconsRef },
    obs,
    log: say,
  })
  if (!packs.originals) throw new Error('The build made no originals pack')
  for (const pack of [packs.language, packs.originals]) {
    const made = compatKeyOf(pack.manifest.formatVersion, pack.manifest.versions ?? {})
    if (made !== compat) throw new Error(`${pack.file} was made for ${made}, not ${compat}`)
  }
  if (packs.language.manifest.language !== language) {
    throw new Error(`${packs.language.file} is for ${packs.language.manifest.language}, not ${language}`)
  }
  const gaps = notWhole({ language: packs.language, originals: packs.originals }, stamps, { obs })
  if (gaps.length) throw new Error(`Not publishing ${language}, the build is not whole: ${gaps.join('; ')}`)

  const originalsSha = await sha256Of(packs.originals.bytes)
  // The originals pack is made inside a language's run and its manifest names that language; it is everyone's.
  const originalsEntry = catalogEntryOf({
    manifest: { ...packs.originals.manifest, language: 'originals' },
    compat,
    build: originalsBuild,
    bytes: packs.originals.bytes,
    sha256: originalsSha,
    left: packs.originals.skipped,
  })
  // Unchanged originals have the same build id, so the stored pack is what this language's rows were made against.
  const originalsNamed = originalsChanged ? originalsEntry : storedOriginals!
  const languageSha = await sha256Of(packs.language.bytes)
  const entry = catalogEntryOf({
    manifest: packs.language.manifest,
    compat,
    build: languageBuild,
    bytes: packs.language.bytes,
    sha256: languageSha,
    left: packs.language.skipped,
    views: `v1/${language}/`,
    originals: { build: originalsNamed.build.id, path: originalsNamed.pack.path, bytes: originalsNamed.pack.bytes, sha256: originalsNamed.pack.sha256 },
  })

  const viewsDir = join(o.workDir, 'views')
  const { files } = await views({ pack: packs.language.bytes, outDir: viewsDir, log: say })
  const prefix = `v1/${language}/`
  const stray = files.find((f) => !f.startsWith(prefix) || f.split('/').includes('..'))
  if (stray) throw new Error(`A view outside ${prefix}: ${stray}`)

  if (o.noUpload) {
    say(`${language}: --no-upload, paquetes en ${join(o.workDir, 'packs')} y ${files.length} vistas en ${viewsDir}; no se sube nada`)
    return { language, outcome: 'built', entry, originals: originalsChanged ? 'built' : 'unchanged' }
  }

  await bucket.put(entry.pack.path, packs.language.bytes, { contentType: 'application/zip', cacheControl: IMMUTABLE })
  say(`subido ${entry.pack.path}`)
  if (originalsChanged) {
    await bucket.put(originalsEntry.pack.path, packs.originals.bytes, { contentType: 'application/zip', cacheControl: IMMUTABLE })
    say(`subido ${originalsEntry.pack.path}`)
  }
  await eachLimit(files, VIEW_UPLOADS_AT_ONCE, (file) =>
    bucket.put(file, readFileSync(join(viewsDir, file)), { contentType: 'application/json', cacheControl: NO_CACHE })
  )
  say(`subidas ${files.length} vistas en ${prefix}`)
  if (originalsChanged) {
    await bucket.put(catalogPath(compat, 'originals'), JSON.stringify(originalsEntry), { contentType: 'application/json', cacheControl: NO_CACHE })
    say(`subido ${catalogPath(compat, 'originals')}`)
  }
  await bucket.put(catalogPath(compat, language), JSON.stringify(entry), { contentType: 'application/json', cacheControl: NO_CACHE })
  say(`subido ${catalogPath(compat, language)}`)

  return { language, outcome: 'published', entry, originals: originalsChanged ? 'published' : 'unchanged' }
}

/** A bucket in memory: for tests, and for a dry run with no bucket to read. */
export function memoryBucket(seed: Record<string, unknown> = {}): PackBucket & {
  puts: Array<{ key: string; contentType: string; cacheControl: string; bytes: number }>
  json<T>(key: string): T | null
  /** An object as text, or null. */
  text(key: string): string | null
  /** An object's bytes, or null. */
  bytes(key: string): Uint8Array | null
} {
  const objects = new Map<string, string | Uint8Array>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]))
  const puts: Array<{ key: string; contentType: string; cacheControl: string; bytes: number }> = []
  const json = <T>(key: string): T | null => {
    const body = objects.get(key)
    if (body === undefined) return null
    return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body)) as T
  }
  const bytes = (key: string): Uint8Array | null => {
    const body = objects.get(key)
    if (body === undefined) return null
    return typeof body === 'string' ? new TextEncoder().encode(body) : body
  }
  return {
    puts,
    json,
    text: (key) => {
      const body = bytes(key)
      return body && new TextDecoder().decode(body)
    },
    bytes,
    async getJson<T>(key: string) {
      return json<T>(key)
    },
    async has(key) {
      return objects.has(key)
    },
    async put(key, body, m) {
      objects.set(key, body)
      puts.push({ key, ...m, bytes: typeof body === 'string' ? body.length : body.length })
    },
  }
}

type S3ClientLike = { presign(key: string, o: { method: 'GET' | 'HEAD' | 'PUT'; expiresIn: number }): string }

const JSON_TIMEOUT_MS = 60_000
/** For anything but JSON: a whole pack, or a part (the largest are tens of MB). */
const PACK_TIMEOUT_MS = 10 * 60_000
/** Three tries in all: R2 answers 429 and 5xx now and then, and a run should not lose an hour's build to one. */
const RETRY_DELAYS_MS = [1_000, 4_000]

/** A status worth asking again for: R2 busy or failing, not a request that is wrong. */
const retryable = (status: number) => status === 429 || status >= 500

/**
 * Cloudflare R2 through Bun's S3 client, used only to sign: Bun 1.3's `write` sends no Cache-Control, so the request
 * is a plain fetch to a presigned URL that carries the headers itself. Each request has a timeout (ten minutes for a
 * pack or a part) and is tried again after a network error, a 429 or a 5xx. `has` is a presigned HEAD (Bun signs the
 * method, checked against SigV4 by hand), so asking costs no download.
 */
export function r2Bucket(o: {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** The waits before each retry; their number is the number of retries. */
  retryDelaysMs?: number[]
  log?: (line: string) => void
}): PackBucket {
  // Read from the global so the package still type-checks without Bun's types.
  const { S3Client } = (globalThis as unknown as { Bun: { S3Client: new (o: object) => S3ClientLike } }).Bun
  const client = new S3Client({ endpoint: o.endpoint, bucket: o.bucket, accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey })
  const delays = o.retryDelaysMs ?? RETRY_DELAYS_MS
  const say = (line: string) => (o.log ?? console.error)(oneLine(line))
  const failure = async (what: string, key: string, res: Response) =>
    new Error(`${what} ${key}: ${res.status} ${oneLine((await res.text().catch(() => '')).slice(0, 300))}`)

  /** The response of the last try: a good one, a 404, or one not worth retrying; a network error after the last try. */
  async function withRetries(what: string, key: string, send: () => Promise<Response>): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let why: string
      try {
        const res = await send()
        if (!retryable(res.status) || attempt >= delays.length) return res
        why = String(res.status)
        await res.body?.cancel().catch(() => {})
      } catch (e) {
        if (attempt >= delays.length) throw e
        why = e instanceof Error ? e.message : String(e)
      }
      say(`${what} ${key}: ${why}; otra vez en ${delays[attempt] / 1000} s`)
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }
  }

  return {
    async getJson<T>(key: string) {
      const res = await withRetries('GET', key, () =>
        fetch(client.presign(key, { method: 'GET', expiresIn: 600 }), { signal: AbortSignal.timeout(JSON_TIMEOUT_MS) })
      )
      if (res.status === 404) return null
      if (!res.ok) throw await failure('GET', key, res)
      return (await res.json()) as T
    },
    async has(key) {
      const res = await withRetries('HEAD', key, () =>
        fetch(client.presign(key, { method: 'HEAD', expiresIn: 600 }), { method: 'HEAD', signal: AbortSignal.timeout(JSON_TIMEOUT_MS) })
      )
      if (res.status === 200) return true
      if (res.status === 404) return false
      // A 403 or a 5xx after the retries is not «missing»: a part taken for missing is only uploaded again, but a list
      // must never be written on a guess.
      throw await failure('HEAD', key, res)
    },
    async put(key, body, m) {
      const timeout = m.contentType === 'application/json' ? JSON_TIMEOUT_MS : PACK_TIMEOUT_MS
      const res = await withRetries('PUT', key, () =>
        fetch(client.presign(key, { method: 'PUT', expiresIn: 3600 }), {
          method: 'PUT',
          headers: { 'content-type': m.contentType, 'cache-control': m.cacheControl },
          body: body as BodyInit,
          signal: AbortSignal.timeout(timeout),
        })
      )
      if (!res.ok) throw await failure('PUT', key, res)
    },
  }
}
