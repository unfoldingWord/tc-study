/**
 * A Door43 client that keeps each release zipball on disk. The book-by-book build runs every loader once per book,
 * each time in a fresh database; without this every run would download the whole zip again. Node only.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type ZipballClient = {
  downloadZipball(
    owner: string,
    repo: string,
    ref?: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<ArrayBuffer>
}

const safe = (part: string) => part.replace(/[^A-Za-z0-9._-]/g, '_')

/** The file a release's zip is kept in: `${dir}/${owner}__${repo}__${ref}.zip`. */
export function zipCachePath(dir: string, owner: string, repo: string, ref: string): string {
  return join(dir, `${safe(owner)}__${safe(repo)}__${safe(ref)}.zip`)
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50

/**
 * The file names a zip's central directory lists, or null when the bytes are not a whole zip (a truncated download,
 * an error page). Reads only the directory, so a release's file list costs no decompression.
 */
export function zipFileNames(input: Uint8Array | ArrayBuffer): string[] | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end record is 22 bytes plus a comment of at most 65535.
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) {
      end = at
      break
    }
  }
  if (end < 0) return null
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const names: string[] = []
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL_ENTRY) return null
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    names.push(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)))
    at += 46 + nameLength + extraLength + commentLength
  }
  return names
}

/**
 * `client` with `downloadZipball` answered from `dir`: the first call per (owner, repo, ref) downloads and saves the
 * zip, later calls (in this run or a later one over the same folder) read the file. Only a whole zip is saved, and a
 * saved file that is not one is downloaded again. Everything else is the client's.
 */
export function zipCachingClient<T extends ZipballClient>(client: T, dir: string): T {
  const pending = new Map<string, Promise<ArrayBuffer>>()

  const fetchOnce = async (owner: string, repo: string, ref: string, onProgress?: Parameters<ZipballClient['downloadZipball']>[3]) => {
    const path = zipCachePath(dir, owner, repo, ref)
    const saved = await readFile(path).catch(() => null)
    if (saved && zipFileNames(saved)) {
      const whole = saved.byteOffset === 0 && saved.byteLength === saved.buffer.byteLength
      return (whole ? saved.buffer : saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength)) as ArrayBuffer
    }
    if (saved) await rm(path, { force: true })
    const zip = await client.downloadZipball(owner, repo, ref, onProgress)
    // Kept, it would be read again on every later run; the loaders' own fallbacks handle a bad download.
    if (!zipFileNames(zip)) throw new Error(`${owner}/${repo}@${ref}: Door43 sent something that is not a whole zip`)
    await mkdir(dir, { recursive: true })
    // Written aside and renamed, so a run stopped mid-write never leaves a truncated zip to be read later.
    const partial = `${path}.${process.pid}.partial`
    try {
      await writeFile(partial, new Uint8Array(zip))
      await rename(partial, path)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
    return zip
  }

  const downloadZipball: ZipballClient['downloadZipball'] = (owner, repo, ref = 'master', onProgress) => {
    const id = zipCachePath(dir, owner, repo, ref)
    let answer = pending.get(id)
    if (!answer) {
      answer = fetchOnce(owner, repo, ref, onProgress)
      pending.set(id, answer)
      // Settled answers come from the file, so memory never holds more than the zips being read.
      answer.then(
        () => pending.delete(id),
        () => pending.delete(id)
      )
    }
    return answer
  }

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'downloadZipball') return downloadZipball
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
