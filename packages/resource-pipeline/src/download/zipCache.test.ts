import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipCachingClient, zipFileNames } from './zipCache'
import { storedZip } from './zipFixture'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), 'zip-cache-'))
  dirs.push(dir)
  return dir
}

/** A Door43 client whose zipball is the bytes of `owner/repo@ref`, counting downloads. */
function fakeDoor43() {
  const downloads: string[] = []
  return {
    downloads,
    baseUrl: 'https://git.door43.org',
    async downloadZipball(owner: string, repo: string, ref: string): Promise<ArrayBuffer> {
      downloads.push(`${owner}/${repo}@${ref}`)
      return storedZip({ [`zip of ${owner}/${repo}@${ref}`]: 'x' })
    },
    async fetchRepoTreePaths(this: { baseUrl: string }, owner: string) {
      return new Set([`${this.baseUrl}/${owner}`])
    },
  }
}

/** What the fake zip says it is: its one file's name. */
const text = (bytes: ArrayBuffer) => zipFileNames(bytes)?.[0]

describe('zipCachingClient', () => {
  test('downloads a release zip once and reads it from disk afterwards', async () => {
    const dir = freshDir()
    const door43 = fakeDoor43()
    const client = zipCachingClient(door43, dir)

    const first = await client.downloadZipball('unfoldingWord', 'en_tn', 'v86')
    const second = await client.downloadZipball('unfoldingWord', 'en_tn', 'v86')

    expect(door43.downloads).toEqual(['unfoldingWord/en_tn@v86'])
    expect(text(first)).toBe('zip of unfoldingWord/en_tn@v86')
    expect(text(second)).toBe(text(first))
    const saved = join(dir, 'unfoldingWord__en_tn__v86.zip')
    expect(text(new Uint8Array(await readFile(saved)).buffer as ArrayBuffer)).toBe(text(first))
  })

  test('a later run over the same folder downloads nothing', async () => {
    const dir = freshDir()
    await zipCachingClient(fakeDoor43(), dir).downloadZipball('unfoldingWord', 'en_ult', 'v88')
    const door43 = fakeDoor43()

    const bytes = await zipCachingClient(door43, dir).downloadZipball('unfoldingWord', 'en_ult', 'v88')

    expect(door43.downloads).toEqual([])
    expect(text(bytes)).toBe('zip of unfoldingWord/en_ult@v88')
  })

  test('two books asking at the same time share one download', async () => {
    const door43 = fakeDoor43()
    const client = zipCachingClient(door43, freshDir())

    await Promise.all([
      client.downloadZipball('unfoldingWord', 'en_tn', 'v86'),
      client.downloadZipball('unfoldingWord', 'en_tn', 'v86'),
    ])

    expect(door43.downloads).toEqual(['unfoldingWord/en_tn@v86'])
  })

  test('each release is its own file, and a failed download leaves none behind', async () => {
    const dir = freshDir()
    const door43 = fakeDoor43()
    const client = zipCachingClient(door43, dir)
    await client.downloadZipball('unfoldingWord', 'en_tn', 'v86')
    await client.downloadZipball('unfoldingWord', 'en_tn', 'v87')
    expect(door43.downloads).toEqual(['unfoldingWord/en_tn@v86', 'unfoldingWord/en_tn@v87'])

    const failing = zipCachingClient(
      { downloadZipball: async () => Promise.reject(new Error('502 Bad Gateway')) },
      dir
    )
    await expect(failing.downloadZipball('unfoldingWord', 'en_twl', 'v85')).rejects.toThrow('502')
    expect(existsSync(join(dir, 'unfoldingWord__en_twl__v85.zip'))).toBe(false)
  })

  test('a download that is not a whole zip is refused and not kept', async () => {
    const dir = freshDir()
    const broken = zipCachingClient({ downloadZipball: async () => new TextEncoder().encode('<html>502</html>').buffer as ArrayBuffer }, dir)
    await expect(broken.downloadZipball('unfoldingWord', 'en_tn', 'v86')).rejects.toThrow('not a whole zip')
    expect(existsSync(join(dir, 'unfoldingWord__en_tn__v86.zip'))).toBe(false)
  })

  test('a saved file that is not a whole zip is downloaded again', async () => {
    const dir = freshDir()
    await writeFile(join(dir, 'unfoldingWord__en_tn__v86.zip'), 'truncated')
    const door43 = fakeDoor43()

    const bytes = await zipCachingClient(door43, dir).downloadZipball('unfoldingWord', 'en_tn', 'v86')

    expect(door43.downloads).toEqual(['unfoldingWord/en_tn@v86'])
    expect(text(bytes)).toBe('zip of unfoldingWord/en_tn@v86')
    expect(text(new Uint8Array(await readFile(join(dir, 'unfoldingWord__en_tn__v86.zip'))).buffer as ArrayBuffer)).toBe(text(bytes))
  })

  test('zipFileNames lists what the central directory names', () => {
    expect(zipFileNames(storedZip({ 'en_ult/08-RUT.usfm': 'a', 'en_ult/manifest.yaml': 'b' }))).toEqual(['en_ult/08-RUT.usfm', 'en_ult/manifest.yaml'])
    expect(zipFileNames(new Uint8Array(10))).toBeNull()
  })

  test('every other method is the client’s own', async () => {
    const client = zipCachingClient(fakeDoor43(), freshDir())
    expect([...(await client.fetchRepoTreePaths('unfoldingWord'))]).toEqual(['https://git.door43.org/unfoldingWord'])
    expect(client.baseUrl).toBe('https://git.door43.org')
  })
})
