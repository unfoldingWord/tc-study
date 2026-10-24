/**
 * A resource's files and their git blob shas, from the bytes the parts build holds (a release zip, a lexicon
 * archive, MACULA's folder), and a check of them against Door43's tree.
 *
 * The shas come from the bytes, never from the tree: what the build hashes is what it built from. The Worker
 * (delivery 3) will compute the same fingerprints from the tree, so a path or a sha that differs between the two
 * would make it ask for builds forever: `treeCheck` turns such a difference into a failure before anything is
 * published.
 *
 * What a Door43 (Gitea) zip can hold that its tree does not, and how it shows:
 * - Gitea makes the zip with `git archive`, which applies the repository's `.gitattributes`: `export-ignore` leaves
 *   files out, `export-subst` and `ident` rewrite `$Format:…$` / `$Id$`, `text`/`eol` rules can turn LF into CRLF.
 *   Each gives a file whose bytes (or presence) differ from the tree's blob: a mismatch, never a silent difference.
 * - Symlinks are stored in the zip as their target path, which is also their blob in git: same sha.
 * - Submodules are `commit` entries, not blobs, in the tree, and an empty folder (or nothing) in the zip: neither side.
 * - An LFS pointer is a blob in the tree; if Door43 ever served the LFS object instead, its bytes differ: a mismatch.
 */

import { spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { gitBlobSha } from '@bt-synergy/language-pack'
import JSZip from 'jszip'
import { lexiconRowPath, lexiconTitleOf, untar } from '../../cli/companions'
import { zipFileNames } from '../download/zipCache'

export type InputFiles = { files: Map<string, string>; manifest?: string }

/**
 * Every file of a Door43 zipball, keyed by its repository path (the zip's single top folder taken off, as Door43's
 * tree names it), with the git blob sha of its bytes exactly as stored. Directory entries are skipped. Entries are
 * read and hashed one at a time, so memory holds the zip and one file. `manifest`: `manifest.yaml`'s text; `readme`:
 * `README.md`'s (the root files discovery reads too).
 *
 * A zip without one top folder throws (its paths could not be the repository's), and so does an entry whose bytes do
 * not match their CRC (a damaged zip would give shas of bytes nobody published).
 */
export async function zipInputs(zip: Uint8Array | ArrayBuffer): Promise<InputFiles & { readme?: string }> {
  const archive = await JSZip.loadAsync(zip, { checkCRC32: true })
  const names = Object.keys(archive.files)
  const tops = new Set(names.map((name) => (name.includes('/') ? name.slice(0, name.indexOf('/')) : '')))
  const [top] = tops
  if (tops.size !== 1 || !top) {
    throw new Error(`A Door43 zip has one top folder; this one has ${tops.has('') ? 'files at its root' : `${tops.size}`}`)
  }
  const files = new Map<string, string>()
  let manifest: string | undefined
  let readme: string | undefined
  for (const name of names.sort()) {
    const entry = archive.files[name]
    if (entry.dir || name.endsWith('/')) continue
    const path = name.slice(top.length + 1)
    const bytes = await entry.async('uint8array')
    files.set(path, await gitBlobSha(bytes))
    if (path === 'manifest.yaml') manifest = new TextDecoder().decode(bytes)
    if (path === 'README.md') readme = new TextDecoder().decode(bytes)
  }
  return { files, manifest, readme }
}

/**
 * A lexicon's files from its Door43 archive (`.tar.gz`), read with `untar` as the lexicons are added to the store:
 * only the files `lexiconRowPath` makes rows of, keyed by that row path (`content/H1961.json`), with the git blob sha
 * of their bytes. When two files give one row path the last wins, as it does in the store. `manifest`: the
 * repository's own `manifest.yaml` (at its root), never a file input; `title`: the one `addLexicons` gives it.
 *
 * To check these against a tree, map the tree's paths through `lexiconRowPath` first.
 */
export async function lexiconInputs(tarGz: Uint8Array): Promise<InputFiles & { title?: string }> {
  const files = new Map<string, string>()
  let manifest: string | undefined
  const entries = untar(tarGz)
  for (const file of entries) {
    const inside = file.path.split('/').slice(1).join('/')
    if (inside === 'manifest.yaml') manifest = new TextDecoder().decode(file.bytes)
    const row = lexiconRowPath(inside)
    if (row) files.set(row, await gitBlobSha(file.bytes))
  }
  return { files, manifest, title: lexiconTitleOf(entries) }
}

/**
 * The files of `parts` (MACULA's `trees`, `referents`) in `folder`, keyed `<part>/<name>` with the git blob sha of
 * each. The files read are those `addMacula` reads (a three-character book name, with or without `.json`), so none of
 * its rows comes from a file left out. A missing part folder throws, as `addMacula` does.
 */
export async function folderInputs(folder: string, parts: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const part of parts) {
    const entries = await readdir(join(folder, part), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!entry.isFile() || !isBookFile(entry.name)) continue
      files.set(`${part}/${entry.name}`, await gitBlobSha(new Uint8Array(await readFile(join(folder, part, entry.name)))))
    }
  }
  return files
}

/** A file of MACULA's part folders that `addMacula` reads: a three-character book name, with or without `.json`. */
const isBookFile = (name: string) => /^[1-3A-Z]{3}$/.test(name.replace(/\.json$/, ''))

/**
 * `parts` of `folder` as git has them at `commit` (`git ls-tree -r`, run in `folder`, so paths are `<part>/<name>`):
 * the tree the Worker reads MACULA's fingerprints from (Taller's `public/trees` and `public/referents` at the MACULA
 * commit), selected as `folderInputs` selects files (a regular blob directly in a part folder, named as a book), so
 * `treeCheck` against `folderInputs` says whether the files read are that commit's. No tree, and why, when git cannot
 * be run, `folder` is in no repository or the commit is not in it: the check is `unverified`.
 */
export function folderGitTree(
  folder: string,
  commit: string,
  parts: readonly string[],
  o: { git?: string } = {}
): { tree: { blobs: Map<string, string>; complete: boolean }; why?: undefined } | { tree: null; why: string } {
  // A commit is hex: anything else could be read by git as an option.
  if (!/^[0-9a-f]{4,64}$/i.test(commit)) return { tree: null, why: `${JSON.stringify(commit)} is not a commit` }
  const run = spawnSync(o.git ?? 'git', ['-C', folder, 'ls-tree', '-r', '-z', commit, '--', ...parts], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.error) return { tree: null, why: `git could not be run: ${run.error.message}` }
  if (run.status !== 0) return { tree: null, why: `git ls-tree ${commit} in ${folder}: ${(run.stderr || '').trim() || `exit ${run.status}`}` }
  const blobs = new Map<string, string>()
  for (const line of run.stdout.split('\0')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    const [mode, type, sha] = line.slice(0, tab).split(' ')
    const path = line.slice(tab + 1)
    const [part, name, ...deeper] = path.split('/')
    // Regular files only (100644/100755): folderInputs reads files, never a symlink or a submodule.
    if (type !== 'blob' || !mode.startsWith('100') || deeper.length || !name || !parts.includes(part) || !isBookFile(name)) continue
    blobs.set(path, sha)
  }
  return { tree: { blobs, complete: true } }
}

export type TreeCheck = { state: 'match' | 'mismatch' | 'unverified'; differing: string[] }

/**
 * The build's files against Door43's tree of the same release.
 *
 * - `mismatch` (with the paths, sorted): a path both have with another sha; a path the tree has and the files lack
 *   (an `export-ignore`d file: the Worker would count it, the build would not); a path the files have and a complete
 *   tree lacks.
 * - `unverified`: no tree, an incomplete one (a path it lacks may be on a page not read), or a tree entry without a
 *   sha, and nothing differs.
 * - `match`: every path and every sha the same.
 */
export function treeCheck(
  files: ReadonlyMap<string, string>,
  tree: { blobs: ReadonlyMap<string, string>; complete: boolean } | null
): TreeCheck {
  if (!tree) return { state: 'unverified', differing: [] }
  const differing: string[] = []
  let unknown = !tree.complete
  for (const [path, sha] of files) {
    const theirs = tree.blobs.get(path)
    if (theirs === undefined) {
      if (tree.complete) differing.push(path)
    } else if (!theirs) {
      unknown = true
    } else if (theirs.toLowerCase() !== sha) {
      differing.push(path)
    }
  }
  for (const path of tree.blobs.keys()) if (!files.has(path)) differing.push(path)
  differing.sort()
  if (differing.length) return { state: 'mismatch', differing }
  return { state: unknown ? 'unverified' : 'match', differing: [] }
}

const safe = (part: string) => part.replace(/[^A-Za-z0-9._-]/g, '_')

/** Whether saved bytes are a whole archive: a zip's central directory, or a gzip stream that inflates. */
function wholeArchive(bytes: Uint8Array): boolean {
  if (zipFileNames(bytes)) return true
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return false
  try {
    gunzipSync(bytes)
    return true
  } catch {
    return false
  }
}

type AnyFetch = (input: any, init?: any) => Promise<Response>

/**
 * `fetchFn` with every GET of a `/archive/` URL kept in `dir`: the first one downloads and saves the archive (only a
 * 200 with a whole zip or gzip), later ones, in this run or a later one over the same folder, read the file. This is
 * what `zipCachingClient` does for zipballs, for the lexicon archives `addLexicons` reads
 * (`https://git.door43.org/{owner}/{repo}/archive/{commit}.tar.gz`): the catalog step hashes them and the shared unit
 * adds them from one download. Everything else (the API calls that resolve the commit) goes to `fetchFn` every time.
 */
export function archiveCachingFetch<F extends AnyFetch>(fetchFn: F, dir: string): F {
  const pending = new Map<string, Promise<Uint8Array<ArrayBuffer> | Response>>()

  const fetchOnce = async (url: URL, input: unknown, init: unknown): Promise<Uint8Array<ArrayBuffer> | Response> => {
    const path = join(dir, [url.host, ...url.pathname.split('/').filter(Boolean)].map(safe).join('__') + (url.search ? `__${safe(url.search)}` : ''))
    const saved = await readFile(path).catch(() => null)
    if (saved && wholeArchive(saved)) return new Uint8Array(saved)
    if (saved) await rm(path, { force: true })
    const res = await fetchFn(input, init)
    if (res.status !== 200) return res
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!wholeArchive(bytes)) throw new Error(`${url.href}: Door43 sent something that is not a whole archive`)
    await mkdir(dir, { recursive: true })
    // Written aside and renamed, so a run stopped mid-write never leaves a truncated archive to be read later.
    const partial = `${path}.${process.pid}.partial`
    try {
      await writeFile(partial, bytes)
      await rename(partial, path)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
    return bytes
  }

  const cached = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = input instanceof Request ? input.url : String(input)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = new URL(href)
    if (method !== 'GET' || !url.pathname.includes('/archive/')) return fetchFn(input, init)
    let answer = pending.get(url.href)
    const first = !answer
    if (!answer) {
      answer = fetchOnce(url, input, init)
      pending.set(url.href, answer)
      // Settled answers come from the file, so memory never holds more than the archives being read.
      answer.then(
        () => pending.delete(url.href),
        () => pending.delete(url.href)
      )
    }
    const got = await answer
    // A failed answer goes to the caller that asked as it came; one that shared it asks again (a body reads once).
    if (got instanceof Response) return first ? got : fetchFn(input, init)
    return new Response(got)
  }

  return cached as unknown as F
}
