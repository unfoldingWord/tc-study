/**
 * fetchRepoTreePaths reads every page of a large tree. Door43 answers `git/trees?recursive=1` 12 000 entries at a time
 * with `truncated: true` until the last page; es-419_tq v38 keeps its books on page 2, after an `_old/` folder.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createDoor43ApiClient } from './Door43ApiClient'

const realFetch = globalThis.fetch

function answer(pages: Array<{ tree: Array<{ path: string; type: string }>; truncated: boolean }>) {
  const asked: string[] = []
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input)
    asked.push(url)
    const page = Number(new URL(url).searchParams.get('page') ?? '1')
    const body = pages[page - 1] ?? { tree: [], truncated: false }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return asked
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('fetchRepoTreePaths', () => {
  test('sigue las páginas mientras Door43 dice que el árbol está cortado', async () => {
    const asked = answer([
      { tree: [{ path: '_old/a.tsv', type: 'blob' }, { path: '_old', type: 'tree' }], truncated: true },
      { tree: [{ path: 'tq_TIT.tsv', type: 'blob' }, { path: 'manifest.yaml', type: 'blob' }], truncated: false },
    ])
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const paths = await client.fetchRepoTreePaths('es-419_gl', 'es-419_tq', 'v38')
    expect([...paths].sort()).toEqual(['_old/a.tsv', 'manifest.yaml', 'tq_TIT.tsv'])
    expect(asked.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2'])
  })

  test('un árbol de una sola página se pide una sola vez', async () => {
    const asked = answer([{ tree: [{ path: './tn_TIT.tsv', type: 'blob' }], truncated: false }])
    const client = createDoor43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    expect([...(await client.fetchRepoTreePaths('es-419_gl', 'es-419_tn', 'v66'))]).toEqual(['tn_TIT.tsv'])
    expect(asked.length).toBe(1)
  })
})
