/**
 * fetchRepoTreeBlobs keeps each blob's sha: tc-study stamps a book's derived rows with its file's git blob sha, so a
 * release that did not touch a book leaves that book's rows valid.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createDoor43ApiClient } from './Door43ApiClient'

const realFetch = globalThis.fetch

type Page = { tree: Array<{ path: string; type: string; sha: string }>; truncated: boolean }

function answer(pages: Page[]) {
  globalThis.fetch = (async (input: string | URL) => {
    const page = Number(new URL(String(input)).searchParams.get('page') ?? '1')
    const body = pages[page - 1] ?? { tree: [], truncated: false }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

const twoPages: Page[] = [
  {
    truncated: true,
    tree: [
      { path: './tn_RUT.tsv', type: 'blob', sha: '3d230a0a1b2c3d4e5f60718293a4b5c6d7e8f901' },
      { path: '.github', type: 'tree', sha: 'x' },
    ],
  },
  { truncated: false, tree: [{ path: 'manifest.yaml', type: 'blob', sha: 'aa11bb22cc33dd44ee55ff66778899aabbccddee' }] },
]

/** Page `i` (from 0) of a large tree: one blob, and whether Door43 says more follow. */
const page = (i: number, truncated: boolean): Page => ({
  truncated,
  tree: [{ path: `_old/${i}.tsv`, type: 'blob', sha: i.toString(16).padStart(40, '0') }],
})

afterEach(() => {
  globalThis.fetch = realFetch
})

/**
 * The parts build checks the blob shas it computed from a zip against this tree. A tree cut short by the page cap
 * could not say "this file is not in the release", so it must say it is incomplete instead of looking whole.
 */
describe('fetchRepoTree', () => {
  test('a tree whose last page is not truncated is complete, with every blob of every page', async () => {
    answer([page(0, true), page(1, true), { truncated: false, tree: [...page(2, false).tree, { path: 'bible', type: 'tree', sha: 'x' }] }])
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const tree = await client.fetchRepoTree('es-419_gl', 'es-419_tq', 'v38')
    expect(tree.complete).toBe(true)
    expect([...tree.blobs.keys()].sort()).toEqual(['_old/0.tsv', '_old/1.tsv', '_old/2.tsv'])
    expect(tree.blobs.get('_old/2.tsv')).toBe('2'.padStart(40, '0'))
  })

  test('a single page that is not truncated is complete', async () => {
    answer(twoPages.slice(1))
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const tree = await client.fetchRepoTree('es-419_gl', 'es-419_tn', 'v66')
    expect(tree).toEqual({ blobs: new Map([['manifest.yaml', 'aa11bb22cc33dd44ee55ff66778899aabbccddee']]), complete: true })
  })

  test('50 truncated pages (the cap) make an incomplete tree, with the blobs read so far', async () => {
    const asked: number[] = []
    const pages = Array.from({ length: 60 }, (_, i) => page(i, true))
    globalThis.fetch = (async (input: string | URL) => {
      const n = Number(new URL(String(input)).searchParams.get('page'))
      asked.push(n)
      return Response.json(pages[n - 1])
    }) as typeof fetch
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const tree = await client.fetchRepoTree('es-419_gl', 'es-419_tq', 'v38')
    expect(tree.complete).toBe(false)
    expect(tree.blobs.size).toBe(50)
    expect(asked.length).toBe(50)
  })

  test('an empty page that still says truncated makes an incomplete tree', async () => {
    answer([page(0, true), { truncated: true, tree: [] }])
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const tree = await client.fetchRepoTree('es-419_gl', 'es-419_tq', 'v38')
    expect(tree.complete).toBe(false)
    expect([...tree.blobs.keys()]).toEqual(['_old/0.tsv'])
  })

  test('a failed page throws, as fetchRepoTreeBlobs does', async () => {
    globalThis.fetch = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    await expect(client.fetchRepoTree('es-419_gl', 'es-419_tq', 'v38')).rejects.toThrow('503')
  })
})

describe('fetchRepoTreeBlobs', () => {
  test('fetchRepoTreeBlobs maps each blob path to its sha, across truncated pages', async () => {
    answer(twoPages)
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const blobs = await client.fetchRepoTreeBlobs('es-419_gl', 'es-419_tn', 'v66')
    expect([...blobs.entries()].sort()).toEqual([
      ['manifest.yaml', 'aa11bb22cc33dd44ee55ff66778899aabbccddee'],
      ['tn_RUT.tsv', '3d230a0a1b2c3d4e5f60718293a4b5c6d7e8f901'],
    ])
  })

  test('fetchRepoTreeBlobs still answers the blobs of the first 50 pages when Door43 says there are more', async () => {
    answer(Array.from({ length: 51 }, (_, i) => page(i, true)))
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const blobs = await client.fetchRepoTreeBlobs('es-419_gl', 'es-419_tq', 'v38')
    expect(blobs.size).toBe(50)
  })

  test('fetchRepoTreePaths still answers the set of blob paths', async () => {
    answer(twoPages)
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const paths = await client.fetchRepoTreePaths('es-419_gl', 'es-419_tn', 'v66')
    expect(paths instanceof Set).toBe(true)
    expect([...paths].sort()).toEqual(['manifest.yaml', 'tn_RUT.tsv'])
  })
})
