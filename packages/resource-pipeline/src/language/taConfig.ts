/**
 * The `config.yaml` of each tA manual, which format 3 needs for the `related` of the articles (language-pack-v3, `build/related.ts`)
 * and the format 2.0 parts do not carry.
 *
 * - {@link fetchTaConfigs} takes them from the release zip a parts list names for each Translation Academy resource (the release the
 *   parts were built from) and writes them in a folder: `<dir>/<resource key>/<manual>/config.yaml`. The folder of a resource is
 *   made even when its release has no config, so that "none in the release" and "not fetched" differ.
 * - {@link readTaConfigs} reads that folder back for a build.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'

const TA_SUBJECT = 'Translation Academy'
const HOST = 'https://git.door43.org/'
const MANUAL = /^[a-z0-9_-]+$/

type ListResource = { key?: unknown; subject?: unknown; stamp?: unknown; metadata?: { release?: { tag_name?: unknown; zipball_url?: unknown } } }

/** The folder of a resource's configs: one folder per part of its key (`unfoldingWord/en/ta`). */
const folderOf = (dir: string, key: string): string => join(dir, ...key.split('/'))

/** The tA resources of a parts list, with the release zip each names. Throws for one whose release does not match its stamp. */
export function taReleases(list: { resources?: ListResource[] }): { key: string; tag: string; zip: string }[] {
  const out: { key: string; tag: string; zip: string }[] = []
  for (const resource of list.resources ?? []) {
    if (resource.subject !== TA_SUBJECT) continue
    const key = String(resource.key)
    if (!/^[^/\s.][^/\s]*\/[^/\s.][^/\s]*\/[^/\s.][^/\s]*$/.test(key)) throw new Error(`${JSON.stringify(key)} is not a resource key`)
    const tag = resource.metadata?.release?.tag_name
    const zip = resource.metadata?.release?.zipball_url
    if (typeof tag !== 'string' || typeof zip !== 'string') throw new Error(`${key}: the list names no release zip`)
    if (!zip.startsWith(HOST)) throw new Error(`${key}: the release zip ${JSON.stringify(zip)} is not on ${HOST}`)
    // The parts were built from the release of the stamp (`v91#…`): the config must be of that release.
    const stampTag = String(resource.stamp ?? '').split('#')[0]
    if (stampTag !== tag) throw new Error(`${key}: the release ${tag} is not the one of the stamp (${stampTag})`)
    out.push({ key, tag, zip })
  }
  return out
}

/** The `config.yaml` of each manual in a Door43 release zip (one top folder), by manual. */
export async function configsOfZip(zip: Uint8Array | ArrayBuffer): Promise<Map<string, string>> {
  const archive = await JSZip.loadAsync(zip, { checkCRC32: true })
  const tops = new Set(Object.keys(archive.files).map((name) => name.split('/')[0]))
  if (tops.size !== 1) throw new Error(`A Door43 zip has one top folder; this one has ${tops.size}`)
  const out = new Map<string, string>()
  for (const [name, entry] of Object.entries(archive.files)) {
    const parts = name.split('/')
    if (entry.dir || parts.length !== 3 || parts[2] !== 'config.yaml' || !MANUAL.test(parts[1])) continue
    out.set(parts[1], await entry.async('string'))
  }
  return out
}

/**
 * Writes the configs of every tA resource of the parts list `listFile` under `out` (emptied first). Throws when a release cannot
 * be fetched or read: a build without them would lose the ties of the configs and say nothing. Returns what it wrote, by key.
 */
export async function fetchTaConfigs(o: { listFile: string; out: string; fetchFn?: typeof fetch; log?: (line: string) => void }): Promise<Map<string, string[]>> {
  const fetchFn = o.fetchFn ?? fetch
  const list = JSON.parse(await readFile(o.listFile, 'utf8'))
  await rm(o.out, { recursive: true, force: true })
  await mkdir(o.out, { recursive: true })
  const written = new Map<string, string[]>()
  for (const { key, tag, zip } of taReleases(list)) {
    const response = await fetchFn(zip)
    if (!response.ok) throw new Error(`${key}: GET ${zip} gave ${response.status}`)
    const configs = await configsOfZip(await response.arrayBuffer())
    const folder = folderOf(o.out, key)
    await mkdir(folder, { recursive: true })
    for (const [manual, text] of configs) {
      await mkdir(join(folder, manual), { recursive: true })
      await writeFile(join(folder, manual, 'config.yaml'), text)
    }
    const manuals = [...configs.keys()].sort()
    written.set(key, manuals)
    o.log?.(`${key} ${tag}: ${manuals.length === 0 ? 'no config.yaml' : manuals.map((m) => `${m}/config.yaml`).join(', ')}`)
  }
  return written
}

/**
 * The configs `fetchTaConfigs` wrote under `dir`, for the resources `keys`: a resource whose folder is not there is left out (the
 * build reports it); one whose folder is empty has an empty map (its release has none).
 */
export function readTaConfigs(dir: string, keys: string[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  for (const key of keys) {
    const folder = folderOf(dir, key)
    if (!existsSync(folder) || !statSync(folder).isDirectory()) continue
    const manuals = new Map<string, string>()
    for (const manual of readdirSync(folder).sort()) {
      const file = join(folder, manual, 'config.yaml')
      if (MANUAL.test(manual) && existsSync(file)) manuals.set(manual, readFileSync(file, 'utf8'))
    }
    out.set(key, manuals)
  }
  return out
}
