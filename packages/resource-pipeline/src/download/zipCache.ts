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

/**
 * `client` with `downloadZipball` answered from `dir`: the first call per (owner, repo, ref) downloads and saves the
 * zip, later calls (in this run or a later one over the same folder) read the file. Everything else is the client's.
 */
export function zipCachingClient<T extends ZipballClient>(client: T, dir: string): T {
  const pending = new Map<string, Promise<ArrayBuffer>>()

  const fetchOnce = async (owner: string, repo: string, ref: string, onProgress?: Parameters<ZipballClient['downloadZipball']>[3]) => {
    const path = zipCachePath(dir, owner, repo, ref)
    try {
      const bytes = await readFile(path)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    } catch {
      // Not saved yet.
    }
    const zip = await client.downloadZipball(owner, repo, ref, onProgress)
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
