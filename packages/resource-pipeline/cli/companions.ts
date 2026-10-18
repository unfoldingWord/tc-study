/**
 * Resources an app may read beside tc-study's, added to the store before it is packed, as resources like any other
 * (a catalog row, a receipt, their rows), so they travel in the same packs:
 *
 * - The lexicons of a language (`{owner}/{lang}_uhl` and `{owner}/{lang}_ugl` on Door43, one entry a Strong
 *   number): resources of the language, kept by entry, so they go in its `language` and `base` packs.
 * - What MACULA says of the originals (Biblica, CC BY 4.0), as Taller builds it (`public/trees`, `public/referents`):
 *   how each sentence is put together, and whom each word refers to, one file a book. Resources beside the originals,
 *   so they go in the `originals` pack.
 *
 * Their rows are the files as they are, under the resource's key (`{key}/content/1.json`, `{key}/trees/JON`), the way
 * articles are kept; nothing in the pack format changes.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIngestReceiptFromCatalog, ingestSchemaForResourceType } from '@bt-synergy/resource-catalog'

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

/** A resource's catalog row, receipt and rows, written into the store as a finished download would leave them. */
async function addResource(
  cache: Store,
  catalog: Catalog,
  resource: { key: string; owner: string; language: string; resourceId: string; subject: string; title: string; type: string; version: string; publishedAt: string; books?: string[] },
  rows: Array<{ key: string; entry: unknown }>
) {
  const metadata = {
    resourceKey: resource.key,
    server: 'git.door43.org',
    owner: resource.owner,
    language: resource.language,
    resourceId: resource.resourceId,
    subject: resource.subject,
    version: resource.version,
    title: resource.title,
    type: resource.type,
    format: 'json',
    contentType: 'application/json',
    contentStructure: 'entry',
    availability: { online: true, offline: true, bundled: false, partial: false },
    locations: [],
    release: { tag_name: resource.version, published_at: resource.publishedAt },
    contentMetadata: resource.books ? { books: resource.books } : {},
  }
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

/**
 * The lexicons of a language, from Door43: `{owner}/{lang}_uhl` (Hebrew) and `{owner}/{lang}_ugl` (Greek), whole
 * (each entry with the verses of every book). Returns what was added, and why a lexicon was not.
 */
export async function addLexicons(cache: Store, catalog: Catalog, language: string, owner: string): Promise<Array<{ key: string; entries?: number; why?: string }>> {
  const done: Array<{ key: string; entries?: number; why?: string }> = []
  for (const [id, subject, title] of [
    ['uhl', 'Hebrew Lexicon', 'Léxico hebreo'],
    ['ugl', 'Greek Lexicon', 'Léxico griego'],
  ] as const) {
    const repo = `${owner}/${language}_${id}`
    const key = `${owner}/${language}/${id}`
    const info = await fetch(`${HOST}/api/v1/repos/${repo}`)
    if (!info.ok) {
      done.push({ key, why: `${repo} no está en Door43` })
      continue
    }
    const { default_branch: branch = 'master', updated_at: updatedAt = '' } = (await info.json()) as { default_branch?: string; updated_at?: string }
    const commit = (await (await fetch(`${HOST}/api/v1/repos/${repo}/commits?sha=${branch}&limit=1`)).json()) as Array<{ sha: string; created?: string }>
    const archive = await fetch(`${HOST}/${repo}/archive/${branch}.tar.gz`)
    if (!archive.ok) {
      done.push({ key, why: `no se pudo bajar ${repo}` })
      continue
    }
    const files = untar(new Uint8Array(await archive.arrayBuffer()))
    const rows: Array<{ key: string; entry: unknown }> = []
    let entries = 0
    for (const file of files) {
      const inside = file.path.split('/').slice(1).join('/')
      if (!/^(content|domains)\/.+\.json$/.test(inside)) continue
      rows.push({ key: `${key}/${inside}`, entry: JSON.parse(new TextDecoder().decode(file.bytes)) })
      if (inside.startsWith('content/')) entries++
    }
    const manifest = files.find((f) => /\/manifest\.yaml$/.test(f.path))
    const named = manifest ? new TextDecoder().decode(manifest.bytes).match(/^\s*title:\s*['"]?(.+?)['"]?\s*$/m)?.[1] : undefined
    await addResource(
      cache,
      catalog,
      {
        key,
        owner,
        language,
        resourceId: id,
        subject,
        title: named ?? title,
        type: 'lexicon',
        version: commit[0]?.sha.slice(0, 10) ?? branch,
        publishedAt: commit[0]?.created ?? updatedAt,
      },
      rows
    )
    done.push({ key, entries })
  }
  return done
}

const NEW_TESTAMENT = new Set(['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'])

/** The MACULA resources: one for the Hebrew, one for the Greek, as `--macula` names them. */
export const MACULA_KEYS = ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula'] as const

/**
 * What MACULA says of the originals, from a folder with Taller's `trees/` and `referents/` (one `{BOOK}.json` each):
 * the Old Testament's books to the Hebrew resource, the New's to the Greek. Returns the books of each.
 */
export async function addMacula(cache: Store, catalog: Catalog, folder: string, builtAt: string): Promise<Array<{ key: string; books: number }>> {
  const byKey = new Map<string, { rows: Array<{ key: string; entry: unknown }>; books: Set<string> }>(MACULA_KEYS.map((k) => [k, { rows: [], books: new Set() }]))
  for (const part of ['trees', 'referents'] as const) {
    for (const name of readdirSync(join(folder, part))) {
      const book = name.replace(/\.json$/, '')
      if (!/^[1-3A-Z]{3}$/.test(book)) continue
      const key = NEW_TESTAMENT.has(book) ? MACULA_KEYS[1] : MACULA_KEYS[0]
      const target = byKey.get(key)!
      target.rows.push({ key: `${key}/${part}/${book}`, entry: JSON.parse(readFileSync(join(folder, part, name), 'utf8')) })
      target.books.add(book.toLowerCase())
    }
  }
  const done: Array<{ key: string; books: number }> = []
  for (const [key, { rows, books }] of byKey) {
    if (!rows.length) continue
    const [owner, language] = key.split('/')
    await addResource(
      cache,
      catalog,
      {
        key,
        owner,
        language,
        resourceId: 'macula',
        subject: 'Original Language Syntax',
        title: language === 'hbo' ? 'MACULA hebreo: oraciones y referentes' : 'MACULA griego: oraciones y referentes',
        type: 'original-syntax',
        version: builtAt.slice(0, 10),
        publishedAt: builtAt,
        books: [...books].sort(),
      },
      rows
    )
    done.push({ key, books: books.size })
  }
  return done
}
