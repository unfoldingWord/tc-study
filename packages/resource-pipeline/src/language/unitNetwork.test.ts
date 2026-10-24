import { describe, expect, test } from 'bun:test'
import { cacheOnlyNetwork, recordingFetch } from './unitNetwork'

const API = 'https://git.door43.org/api/v1/repos/o/r'
const ARCHIVE = 'https://git.door43.org/o/r/archive/abc.tar.gz'

/** A Door43 of three methods, counting what reaches it. */
function client() {
  const reached: string[] = []
  return {
    reached,
    async downloadZipball(owner: string, repo: string, ref?: string) {
      reached.push(`zip ${owner}/${repo}@${ref}`)
      return new ArrayBuffer(1)
    },
    async findRepository(owner: string, repo: string) {
      reached.push(`find ${owner}/${repo}`)
      return { release: { tag_name: 'v2' } }
    },
    async fetchTextContent(owner: string, repo: string, path: string) {
      reached.push(`text ${owner}/${repo}/${path}`)
      return 'x'
    },
  }
}

async function stepOne() {
  const fetched: string[] = []
  const fetchFn = async (url: string) => {
    fetched.push(url)
    return url === API ? Response.json({ full_name: 'o/r' }, { headers: { 'x-a': '1' } }) : url === ARCHIVE ? new Response('tar') : new Response('no', { status: 404 })
  }
  const recorded = recordingFetch(fetchFn)
  expect(await (await recorded.fetch(API)).json()).toEqual({ full_name: 'o/r' })
  expect(await (await recorded.fetch(ARCHIVE)).text()).toBe('tar')
  expect((await recorded.fetch('https://git.door43.org/api/v1/repos/o/none')).status).toBe(404)
  return { fetchFn, fetched, recorded }
}

describe("a unit's network", () => {
  test("serves the zips step 1 kept, and refuses another tag, a repository lookup or a file read, recording each", async () => {
    const c = client()
    const { fetchFn, recorded } = await stepOne()
    const net = cacheOnlyNetwork({ unit: 'book rut', client: c, kept: (o, r, ref) => `${o}/${r}@${ref}` === 'o/r@v1', fetchFn, recorded })
    await net.client.downloadZipball('o', 'r', 'v1')
    await expect(net.client.downloadZipball('o', 'r', 'v2')).rejects.toThrow(/^book rut: downloadZipball\(o, r, v2\) would read Door43 again/)
    await expect(net.client.findRepository('o', 'r')).rejects.toThrow('findRepository(o, r)')
    await expect(net.client.fetchTextContent('o', 'r', '01-GEN.usfm')).rejects.toThrow('fetchTextContent(o, r, 01-GEN.usfm)')
    expect(c.reached).toEqual(['zip o/r@v1'])
    expect(net.calls).toEqual(['downloadZipball(o, r, v2)', 'findRepository(o, r)', 'fetchTextContent(o, r, 01-GEN.usfm)'])
  })

  test('lets through what `allow` names (OBS stories), and nothing else', async () => {
    const c = client()
    const { fetchFn, recorded } = await stepOne()
    const net = cacheOnlyNetwork({ unit: 'shared', client: c, kept: () => false, fetchFn, recorded, allow: (method, args) => method === 'fetchTextContent' && args[1] === 'r' })
    expect(await net.client.fetchTextContent('o', 'r', 'content/01.md')).toBe('x')
    await expect(net.client.fetchTextContent('o', 'other', 'a.md')).rejects.toThrow()
    expect(net.calls).toEqual(['fetchTextContent(o, other, a.md)'])
  })

  test("answers step 1's API calls again as they came, archives through the caching fetch, and refuses any other URL", async () => {
    const { fetchFn, fetched, recorded } = await stepOne()
    const net = cacheOnlyNetwork({ unit: 'shared', client: client(), kept: () => false, fetchFn, recorded })
    const again = await net.fetch(API)
    expect(await again.json()).toEqual({ full_name: 'o/r' })
    expect(again.headers.get('x-a')).toBe('1')
    // A body reads once: each answer is a new one.
    expect(await (await net.fetch(API)).json()).toEqual({ full_name: 'o/r' })
    expect((await net.fetch('https://git.door43.org/api/v1/repos/o/none')).status).toBe(404)
    expect(await (await net.fetch(ARCHIVE)).text()).toBe('tar')
    await expect(net.fetch('https://git.door43.org/api/v1/repos/o/r/commits?sha=master')).rejects.toThrow()
    await expect(net.fetch(API, { method: 'POST' })).rejects.toThrow()
    // Only the archive went to the caching fetch again (it reads it from <work>/zips).
    expect(fetched.slice(3)).toEqual([ARCHIVE])
    expect(net.calls).toEqual(['fetch GET https://git.door43.org/api/v1/repos/o/r/commits?sha=master', `fetch POST ${API}`])
  })

  test("refuses the process's fetch, which a loader calls for a raw URL", async () => {
    const { fetchFn, recorded } = await stepOne()
    const net = cacheOnlyNetwork({ unit: 'book jon', client: client(), kept: () => false, fetchFn, recorded })
    await expect(net.global('https://git.door43.org/o/r/raw/tag/v1/tn_JON.tsv')).rejects.toThrow('book jon: fetch GET https://git.door43.org/o/r/raw/tag/v1/tn_JON.tsv')
    expect(net.calls).toEqual(['fetch GET https://git.door43.org/o/r/raw/tag/v1/tn_JON.tsv'])
  })
})
