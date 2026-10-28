/**
 * Resources an app may read beside tc-study's, added to the store before it is packed, as resources like any other
 * (a catalog row, a receipt, their rows), so they travel in the same packs:
 *
 * - The lexicons of a language (`{owner}/{lang}_uhl` and `{owner}/{lang}_ugl` on Door43, one entry a Strong
 *   number): resources of the language, kept by entry, so they go in its `language` and `base` packs.
 * - What MACULA says of the originals (Biblica, under the licence Taller's `index.json` files name), as Taller builds
 *   it (`public/trees`, `public/referents`): how each sentence is put together, and whom each word refers to, one
 *   file a book. Resources beside the originals, so they go in the `originals` pack.
 *
 * Their rows are the files as they are, under the resource's key (`{key}/content/1.json`, `{key}/trees/JON`), the way
 * articles are kept; nothing in the pack format changes.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { manifestRights } from '@bt-synergy/door43-api'
import { buildIngestReceiptFromCatalog, ingestSchemaForResourceType, resourceContentStamp } from '@bt-synergy/resource-catalog'

type Store = { set(key: string, entry: unknown): Promise<void>; putRawMany(rows: Array<{ key: string; entry: unknown }>): Promise<void> }
type Catalog = { set(key: string, metadata: never): Promise<void> }

const HOST = 'https://git.door43.org'

/** The files of a `.tar.gz` (ustar, as Door43 serves an archive): path and bytes. */
export function untar(gz: Uint8Array): Array<{ path: string; bytes: Uint8Array }> {
  const tar = Bun.gunzipSync(gz)
  const out: Array<{ path: string; bytes: Uint8Array }> = []
  const text = (from: number, length: number) => new TextDecoder().decode(tar.subarray(from, from + length)).replace(/\0.*$/s, '')
  let at = 0
  while (at + 512 <= tar.length) {
    const name = text(at, 100)
    if (!name) break
    const size = parseInt(text(at + 124, 12).trim() || '0', 8)
    const type = text(at + 156, 1)
    const prefix = text(at + 345, 155)
    const body = at + 512
    if (type === '0' || type === '') out.push({ path: prefix ? `${prefix}/${name}` : name, bytes: tar.slice(body, body + size) })
    at = body + Math.ceil(size / 512) * 512
  }
  return out
}

type CompanionResource = {
  key: string
  owner: string
  language: string
  resourceId: string
  subject: string
  title: string
  type: string
  version: string
  publishedAt: string
  books?: string[]
  /** The licence its source names, if it names one: never made up, since CC BY and CC BY-SA must be named. */
  license?: string
}

/**
 * The catalog row `addLexicons` and `addMacula` write for a resource. A parts build writes it in its catalog step too,
 * so a list whose shared unit was carried (not built, so neither ran) still names these resources as a build would.
 */
export function companionCatalogRow(resource: CompanionResource) {
  return {
    resourceKey: resource.key,
    server: 'git.door43.org',
    owner: resource.owner,
    language: resource.language,
    resourceId: resource.resourceId,
    subject: resource.subject,
    version: resource.version,
    title: resource.title,
    type: resource.type,
    // As a Door43 resource's row has it.
    ...(resource.license ? { license: { id: resource.license } } : {}),
    format: 'json',
    contentType: 'application/json',
    contentStructure: 'entry',
    availability: { online: true, offline: true, bundled: false, partial: false },
    locations: [],
    release: { tag_name: resource.version, published_at: resource.publishedAt },
    contentMetadata: resource.books ? { books: resource.books } : {},
  }
}

/** A resource's catalog row, receipt and rows, written into the store as a finished download would leave them. */
async function addResource(cache: Store, catalog: Catalog, resource: CompanionResource, rows: Array<{ key: string; entry: unknown }>) {
  const metadata = companionCatalogRow(resource)
  await catalog.set(resource.key, metadata as never)
  // As they are, in one go: thousands of entries, none to split by chapter.
  for (let i = 0; i < rows.length; i += 500) await cache.putRawMany(rows.slice(i, i + 500) as never)
  const receipt = buildIngestReceiptFromCatalog(metadata as never, {
    ingestSchema: ingestSchemaForResourceType(resource.type),
    entryCount: rows.length,
    downloadMethod: 'tar',
  })
  if (receipt) await cache.set(`resource:${resource.key}`, { metadata: receipt })
}

const LEXICONS = [
  ['uhl', 'Hebrew Lexicon', 'Léxico hebreo'],
  ['ugl', 'Greek Lexicon', 'Léxico griego'],
] as const

type Fetch = (url: string) => Promise<Response>

/** The lexicons a language may have from `owner`: their keys, Door43 repositories (`owner/name`) and subjects. */
export function lexiconRepos(language: string, owner: string): Array<{ key: string; owner: string; name: string; subject: string; title: string }> {
  return LEXICONS.map(([id, subject, title]) => ({ key: `${owner}/${language}/${id}`, owner, name: `${language}_${id}`, subject, title }))
}

/** Where `addLexicons` downloads a lexicon at a commit: one archive per commit, so a cache of it never goes stale. */
export const lexiconArchiveUrl = (repo: string, sha: string) => `${HOST}/${repo}/archive/${sha}.tar.gz`

/** Where a language's lexicons come from when not from its literal text's owner: translationCore reads English's there. */
export const LEXICON_OWNERS: Readonly<Record<string, string>> = { en: 'test_org' }

/** The Door43 owner of a language's lexicons: `LEXICON_OWNERS`', else its literal text's owner. */
export const lexiconOwnerOf = (language: string, literalOwner: string): string => LEXICON_OWNERS[language] ?? literalOwner

/**
 * A lexicon file's row path under the lexicon's key, from its path inside the repository, or null when it is not an
 * entry. Two layouts: `content/{n}.json` at the root (es-419's), and translationCore's, under a `…/v0/` folder
 * (`ugl/v0/content/1.json`, `resources/en/lexicons/uhl/v0/content/1.json`). Both end where Servos reads an entry.
 */
export function lexiconRowPath(inside: string): string | null {
  if (/^(content|domains)\/.+\.json$/.test(inside)) return inside
  const nested = inside.match(/(?:^|\/)v0\/(content|domains)\/([^/]+\.json)$/)
  return nested ? `${nested[1]}/${nested[2]}` : null
}

/**
 * The commit a lexicon repository has at `ref`, or null when Door43 has no such repository (most languages have no
 * lexicons: nothing to read, and nothing a rerun would change). A repository that exists without the ref, or a Door43
 * that fails, throws: a lexicon silently left out would be published as if the language had none.
 */
export async function resolveLexicon(repo: string, ref: string, fetchFn: Fetch = fetch): Promise<{ sha: string; date: string } | null> {
  const info = await fetchFn(`${HOST}/api/v1/repos/${repo}`)
  if (info.status === 404) return null
  if (!info.ok) throw new Error(`Door43 answered ${info.status} for ${repo}`)
  const res = await fetchFn(`${HOST}/api/v1/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&limit=1&stat=false&files=false&verification=false`)
  if (!res.ok) throw new Error(`${repo} has no ref ${JSON.stringify(ref)} (Door43 answered ${res.status})`)
  const [commit] = (await res.json()) as Array<{ sha?: string; created?: string; commit?: { committer?: { date?: string } } }>
  const date = commit?.created ?? commit?.commit?.committer?.date
  if (!commit?.sha || !date) throw new Error(`${repo} has no commit at ${JSON.stringify(ref)}`)
  return { sha: commit.sha, date }
}

/** A lexicon's stamp, as its catalog row gets it in `addLexicons`: the commit's first ten characters and its date. */
export const lexiconStampOf = (commit: { sha: string; date: string }) => {
  const version = commit.sha.slice(0, 10)
  return resourceContentStamp({ version, release: { tag_name: version, published_at: commit.date } } as never)
}

/**
 * The stamps of the lexicons `addLexicons` would read, `{owner}/{lang}/uhl` → `{sha10}#{date}`: a publisher puts them
 * in the build id, so a lexicon change is a change, and a bad ref fails before the hour-long build.
 */
export async function lexiconStamps(o: { language: string; owner: string; ref: string; fetch?: Fetch }): Promise<Record<string, string>> {
  const stamps: Record<string, string> = {}
  for (const { key, owner, name } of lexiconRepos(o.language, o.owner)) {
    const commit = await resolveLexicon(`${owner}/${name}`, o.ref, o.fetch)
    if (commit) stamps[key] = lexiconStampOf(commit)
  }
  return stamps
}

/** Bump when the rows `addLexicons` writes (their row paths or entries) change: it is in every part fingerprint. */
export const LEXICON_ROWS_VERSION = 1

type ArchiveFiles = ReadonlyArray<{ path: string; bytes: Uint8Array }>

/** The manifest a lexicon's archive names its title and licence in: the first `manifest.yaml` it holds. */
function lexiconManifestOf(files: ArchiveFiles): string | undefined {
  const manifest = files.find((f) => /\/manifest\.yaml$/.test(f.path))
  return manifest && new TextDecoder().decode(manifest.bytes)
}

/** The title `addLexicons` gives a lexicon: its archive's manifest's `title`, if any. */
export function lexiconTitleOf(files: ArchiveFiles): string | undefined {
  return lexiconManifestOf(files)?.match(/^\s*title:\s*['"]?(.+?)['"]?\s*$/m)?.[1]
}

/** The licence `addLexicons` gives a lexicon: its archive's manifest's `rights`, if any. */
export function lexiconLicenseOf(files: ArchiveFiles): string | undefined {
  const manifest = lexiconManifestOf(files)
  return manifest === undefined ? undefined : manifestRights(manifest)
}

/**
 * The resource `addLexicons` adds for a lexicon read at `commit`; `named` is `lexiconTitleOf` and `lexiconLicenseOf`
 * its archive's files.
 */
export function lexiconResourceOf(
  lexicon: { key: string; owner: string; subject: string; title: string },
  language: string,
  commit: { sha: string; date: string },
  named: { title?: string; license?: string }
): CompanionResource {
  return {
    key: lexicon.key,
    owner: lexicon.owner,
    language,
    resourceId: lexicon.key.split('/')[2],
    subject: lexicon.subject,
    title: named.title ?? lexicon.title,
    type: 'lexicon',
    version: commit.sha.slice(0, 10),
    publishedAt: commit.date,
    ...(named.license ? { license: named.license } : {}),
  }
}

/**
 * The lexicons of a language, from Door43: `{owner}/{lang}_uhl` (Hebrew) and `{owner}/{lang}_ugl` (Greek), whole
 * (each entry with the verses of every book), read from `ref` (a branch, tag or commit; `master` is what Door43 serves
 * them from today). The owner is `lexiconOwnerOf`'s; both layouts `lexiconRowPath` knows are read. Returns what was
 * added, and why a lexicon was not; a ref the repository lacks throws.
 */
export async function addLexicons(cache: Store, catalog: Catalog, language: string, owner: string, ref = 'master', fetchFn: Fetch = fetch): Promise<Array<{ key: string; entries?: number; why?: string }>> {
  const done: Array<{ key: string; entries?: number; why?: string }> = []
  for (const { key, name, subject, title } of lexiconRepos(language, owner)) {
    const repo = `${owner}/${name}`
    const commit = await resolveLexicon(repo, ref, fetchFn)
    if (!commit) {
      done.push({ key, why: `${repo} no está en Door43` })
      continue
    }
    // The commit, not the ref: what is read is what the stamp names, even if the branch moves meanwhile.
    const archive = await fetchFn(lexiconArchiveUrl(repo, commit.sha))
    if (!archive.ok) throw new Error(`Could not download ${repo} at ${commit.sha} (Door43 answered ${archive.status})`)
    const files = untar(new Uint8Array(await archive.arrayBuffer()))
    const rows: Array<{ key: string; entry: unknown }> = []
    let entries = 0
    for (const file of files) {
      const path = lexiconRowPath(file.path.split('/').slice(1).join('/'))
      if (!path) continue
      rows.push({ key: `${key}/${path}`, entry: JSON.parse(new TextDecoder().decode(file.bytes)) })
      if (path.startsWith('content/')) entries++
    }
    const named = { title: lexiconTitleOf(files), license: lexiconLicenseOf(files) }
    await addResource(cache, catalog, lexiconResourceOf({ key, owner, subject, title }, language, commit, named), rows)
    done.push({ key, entries })
  }
  return done
}

const NEW_TESTAMENT = new Set(['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'])

/** Bump when the rows `addMacula` writes (which files, their keys or entries) change: it is in every part fingerprint. */
export const MACULA_ROWS_VERSION = 1

/** The MACULA resources: one for the Hebrew, one for the Greek, as `--macula` names them. */
export const MACULA_KEYS = ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula'] as const

/** The MACULA resource a book's files go to (`RUT`, `tit`): the Greek for the New Testament, else the Hebrew. */
export const maculaKeyOf = (book: string): (typeof MACULA_KEYS)[number] => (NEW_TESTAMENT.has(book.toUpperCase()) ? MACULA_KEYS[1] : MACULA_KEYS[0])

/** MACULA's files in a folder, by resource (`maculaKeyOf`): those `addMacula` reads, and the books they give. */
function maculaFilesOf(folder: string): Map<string, { files: Array<{ part: 'trees' | 'referents'; name: string; book: string }>; books: Set<string> }> {
  const byKey = new Map<string, { files: Array<{ part: 'trees' | 'referents'; name: string; book: string }>; books: Set<string> }>(
    MACULA_KEYS.map((k) => [k, { files: [], books: new Set() }])
  )
  for (const part of ['trees', 'referents'] as const) {
    for (const name of readdirSync(join(folder, part))) {
      const book = name.replace(/\.json$/, '')
      if (!/^[1-3A-Z]{3}$/.test(book)) continue
      const target = byKey.get(maculaKeyOf(book))!
      target.files.push({ part, name, book })
      target.books.add(book.toLowerCase())
    }
  }
  return byKey
}

/**
 * The licence a MACULA folder names: the `license` of the `index.json` Taller keeps in its part folders (`trees/`,
 * `referents/`), if any. Two that differ throw: which one MACULA's rows carry is for a person to say.
 */
export function maculaLicenseOf(folder: string): string | undefined {
  const named = new Set<string>()
  for (const part of ['trees', 'referents']) {
    const path = join(folder, part, 'index.json')
    if (!existsSync(path)) continue
    const { license } = JSON.parse(readFileSync(path, 'utf8')) as { license?: unknown }
    if (typeof license === 'string' && license.trim()) named.add(license.trim())
  }
  if (named.size > 1) throw new Error(`MACULA's index.json files in ${folder} name different licences: ${[...named].join(', ')}`)
  return [...named][0]
}

function maculaResourceOf(key: string, books: Set<string>, stamp: { version: string; publishedAt: string }, license: string | undefined): CompanionResource {
  const [owner, language] = key.split('/')
  return {
    key,
    owner,
    language,
    resourceId: 'macula',
    subject: 'Original Language Syntax',
    title: language === 'hbo' ? 'MACULA hebreo: oraciones y referentes' : 'MACULA griego: oraciones y referentes',
    type: 'original-syntax',
    version: stamp.version,
    publishedAt: stamp.publishedAt,
    books: [...books].sort(),
    ...(license ? { license } : {}),
  }
}

/** The catalog rows `addMacula` writes for a folder, read from its file names and its `index.json` files alone. */
export function maculaCatalogRows(folder: string, stamp: { version: string; publishedAt: string }): Array<ReturnType<typeof companionCatalogRow>> {
  const license = maculaLicenseOf(folder)
  return [...maculaFilesOf(folder)]
    .filter(([, { files }]) => files.length)
    .map(([key, { books }]) => companionCatalogRow(maculaResourceOf(key, books, stamp, license)))
}

/**
 * What MACULA says of the originals, from a folder with Taller's `trees/` and `referents/` (one `{BOOK}.json` each):
 * the Old Testament's books to the Hebrew resource, the New's to the Greek. Returns the books of each.
 * `stamp.publishedAt` must be a date: apps order two stamps of a resource by it.
 */
export async function addMacula(
  cache: Store,
  catalog: Catalog,
  folder: string,
  stamp: { version: string; publishedAt: string }
): Promise<Array<{ key: string; books: number }>> {
  const done: Array<{ key: string; books: number }> = []
  const license = maculaLicenseOf(folder)
  for (const [key, { files, books }] of maculaFilesOf(folder)) {
    if (!files.length) continue
    const rows = files.map(({ part, name, book }) => ({ key: `${key}/${part}/${book}`, entry: JSON.parse(readFileSync(join(folder, part, name), 'utf8')) }))
    await addResource(cache, catalog, maculaResourceOf(key, books, stamp, license), rows)
    done.push({ key, books: books.size })
  }
  return done
}
