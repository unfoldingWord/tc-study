/**
 * Publish one language to a bucket only when something it is built from changed: the Door43 releases (read in seconds
 * from the catalog), the generator's commit, MACULA's commit or the lexicons' ref. Those make the build id; a stored
 * catalog entry with the same id means the hour-long build is skipped.
 *
 * The upload order is what keeps a cut-short run harmless: the packs (named by content, so new keys), then the views,
 * then the originals' entry and the language's entry last. Until that entry is written the bucket names the previous
 * build, whose pack is still there.
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
} from '@bt-synergy/language-pack'
import { door43Stamps } from './door43Stamps'
import { PACK_VERSIONS } from './packVersions'
import { prepareAndPack } from './prepareAndPack'
import { writeMcpViews } from './writeMcpViews'

export interface PackBucket {
  getJson<T>(key: string): Promise<T | null>
  put(key: string, body: Uint8Array | string, o: { contentType: string; cacheControl: string }): Promise<void>
}

export type PublishResult = {
  language: string
  outcome: 'unchanged' | 'published'
  entry?: PackCatalogEntry
  originals?: 'unchanged' | 'published'
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'
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

/** Like Promise.all over a pool: stops starting uploads at the first failure, and rejects with it. */
async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
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
  dryRun?: boolean
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
  const stampsOf = o.stamps ?? ((l: string) => door43Stamps({ language: l, obs }))
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

  if (stored?.build?.id === languageBuild.id) {
    say(`${language}: sin cambios`)
    return { language, outcome: 'unchanged', entry: stored }
  }
  for (const change of changesSince(stored?.build, languageBase)) say(`  ${change}`)
  const originalsChanged = storedOriginals?.build?.id !== originalsBuild.id
  say(`originals: build ${originalsBuild.id} (guardado: ${storedOriginals?.build?.id ?? 'ninguno'})${originalsChanged ? ', se publica' : ', sin cambios'}`)

  if (o.dryRun) {
    say(`${language}: dry run, se publicaría; no se construye ni se sube nada`)
    return { language, outcome: 'published', originals: originalsChanged ? 'published' : 'unchanged' }
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

  const languageSha = await sha256Of(packs.language.bytes)
  const entry = catalogEntryOf({
    manifest: packs.language.manifest,
    compat,
    build: languageBuild,
    bytes: packs.language.bytes,
    sha256: languageSha,
    left: packs.language.skipped,
    views: `v1/${language}/`,
  })
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

  const viewsDir = join(o.workDir, 'views')
  const { files } = await views({ pack: packs.language.bytes, outDir: viewsDir, log: say })
  const prefix = `v1/${language}/`
  const stray = files.find((f) => !f.startsWith(prefix) || f.split('/').includes('..'))
  if (stray) throw new Error(`A view outside ${prefix}: ${stray}`)

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
} {
  const objects = new Map<string, string | Uint8Array>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]))
  const puts: Array<{ key: string; contentType: string; cacheControl: string; bytes: number }> = []
  const json = <T>(key: string): T | null => {
    const body = objects.get(key)
    if (body === undefined) return null
    return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body)) as T
  }
  return {
    puts,
    json,
    async getJson<T>(key: string) {
      return json<T>(key)
    },
    async put(key, body, m) {
      objects.set(key, body)
      puts.push({ key, ...m, bytes: typeof body === 'string' ? body.length : body.length })
    },
  }
}

type S3ClientLike = { presign(key: string, o: { method: 'GET' | 'PUT'; expiresIn: number }): string }

/**
 * Cloudflare R2 through Bun's S3 client, used only to sign: Bun 1.3's `write` sends no Cache-Control, so the request
 * is a plain fetch to a presigned URL that carries the headers itself.
 */
export function r2Bucket(o: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }): PackBucket {
  // Read from the global so the package still type-checks without Bun's types.
  const { S3Client } = (globalThis as unknown as { Bun: { S3Client: new (o: object) => S3ClientLike } }).Bun
  const client = new S3Client({ endpoint: o.endpoint, bucket: o.bucket, accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey })
  const failure = async (what: string, key: string, res: Response) =>
    new Error(`${what} ${key}: ${res.status} ${oneLine((await res.text().catch(() => '')).slice(0, 300))}`)
  return {
    async getJson<T>(key: string) {
      const res = await fetch(client.presign(key, { method: 'GET', expiresIn: 600 }))
      if (res.status === 404) return null
      if (!res.ok) throw await failure('GET', key, res)
      return (await res.json()) as T
    },
    async put(key, body, m) {
      const res = await fetch(client.presign(key, { method: 'PUT', expiresIn: 3600 }), {
        method: 'PUT',
        headers: { 'content-type': m.contentType, 'cache-control': m.cacheControl },
        body: body as BodyInit,
      })
      if (!res.ok) throw await failure('PUT', key, res)
    },
  }
}
