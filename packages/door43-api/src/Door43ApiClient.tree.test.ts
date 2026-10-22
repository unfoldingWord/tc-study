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

afterEach(() => {
  globalThis.fetch = realFetch
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

  test('fetchRepoTreePaths still answers the set of blob paths', async () => {
    answer(twoPages)
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const paths = await client.fetchRepoTreePaths('es-419_gl', 'es-419_tn', 'v66')
    expect(paths instanceof Set).toBe(true)
    expect([...paths].sort()).toEqual(['manifest.yaml', 'tn_RUT.tsv'])
  })
})
