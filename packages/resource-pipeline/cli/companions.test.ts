import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addLexicons, addMacula, lexiconOwnerOf, lexiconRowPath, lexiconStamps } from './companions'

describe('addMacula', () => {
  test('the catalog rows carry the version and the date it is given, not one cut from the other', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'macula-'))
    for (const part of ['trees', 'referents']) {
      mkdirSync(join(folder, part))
      writeFileSync(join(folder, part, 'TIT.json'), '{}')
      writeFileSync(join(folder, part, 'RUT.json'), '{}')
    }
    const rows = new Map<string, { version?: string; release?: { tag_name: string; published_at: string } }>()
    const catalog = { set: async (key: string, value: never) => void rows.set(key, value) }
    const cache = { putRawMany: async () => {}, set: async () => {} }

    await addMacula(cache as never, catalog as never, folder, { version: 'f1e2d3c4b5', publishedAt: '2026-10-01T14:00:00.000Z' })

    for (const key of ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula']) {
      expect(rows.get(key)?.version).toBe('f1e2d3c4b5')
      expect(rows.get(key)?.release).toEqual({ tag_name: 'f1e2d3c4b5', published_at: '2026-10-01T14:00:00.000Z' })
    }
  })
})

/** A Door43 that has the repositories given, each with the refs given (ref → commit). */
function door43(repos: Record<string, Record<string, { sha: string; created: string }>>) {
  const asked: string[] = []
  const fetchFn = async (url: string) => {
    asked.push(url)
    const u = new URL(url)
    const commits = u.pathname.match(/^\/api\/v1\/repos\/([^/]+\/[^/]+)\/commits$/)
    const repo = u.pathname.match(/^\/api\/v1\/repos\/([^/]+\/[^/]+)$/)
    if (repo) return repos[repo[1]] ? Response.json({ full_name: repo[1] }) : new Response('not found', { status: 404 })
    if (commits) {
      const commit = repos[commits[1]]?.[u.searchParams.get('sha') ?? '']
      return commit ? Response.json([commit]) : Response.json({ message: 'object does not exist' }, { status: 404 })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchFn, asked }
}

describe('lexiconStamps', () => {
  const uhl = { sha: '6cca967498146d8ebe12c1fe9124f56baa309e27', created: '2026-10-19T19:52:42-04:00' }
  const ugl = { sha: '0123456789abcdef0123456789abcdef01234567', created: '2026-09-01T10:00:00Z' }

  test('each lexicon repository at the ref gives its commit and date, as its catalog row will stamp it', async () => {
    const { fetchFn } = door43({ 'es-419_gl/es-419_uhl': { master: uhl }, 'es-419_gl/es-419_ugl': { master: ugl } })
    expect(await lexiconStamps({ language: 'es-419', owner: 'es-419_gl', ref: 'master', fetch: fetchFn })).toEqual({
      'es-419_gl/es-419/uhl': '6cca967498#2026-10-19T19_52_42-04_00',
      'es-419_gl/es-419/ugl': '0123456789#2026-09-01T10_00_00Z',
    })
  })

  test('a repository Door43 does not have gives no stamp: the language has no such lexicon', async () => {
    const { fetchFn } = door43({ 'es-419_gl/es-419_uhl': { master: uhl } })
    expect(await lexiconStamps({ language: 'es-419', owner: 'es-419_gl', ref: 'master', fetch: fetchFn })).toEqual({
      'es-419_gl/es-419/uhl': '6cca967498#2026-10-19T19_52_42-04_00',
    })
  })

  test('a repository without the ref fails, naming the repository and the ref', async () => {
    const { fetchFn } = door43({ 'es-419_gl/es-419_uhl': { master: uhl }, 'es-419_gl/es-419_ugl': { master: ugl } })
    await expect(lexiconStamps({ language: 'es-419', owner: 'es-419_gl', ref: 'main', fetch: fetchFn })).rejects.toThrow(
      /es-419_gl\/es-419_uhl.*"main"/
    )
  })

  test('a Door43 that fails is not read as «no lexicon»', async () => {
    const fetchFn = async () => new Response('bad gateway', { status: 502 })
    await expect(lexiconStamps({ language: 'es-419', owner: 'es-419_gl', ref: 'master', fetch: fetchFn })).rejects.toThrow('502')
  })

  test('addLexicons fails on a ref the repository lacks, instead of leaving the lexicon out', async () => {
    const { fetchFn } = door43({ 'es-419_gl/es-419_uhl': { master: uhl } })
    const store = { putRawMany: async () => {}, set: async () => {} }
    const catalog = { set: async () => {} }
    await expect(addLexicons(store as never, catalog as never, 'es-419', 'es-419_gl', 'main', fetchFn)).rejects.toThrow('"main"')
  })
})

/** A `.tar.gz` (ustar) of the files given, as Door43 serves an archive. */
function tarGz(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const [path, body] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(body)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    header.set(new TextEncoder().encode(bytes.length.toString(8).padStart(11, '0')), 124)
    header.set(new TextEncoder().encode('0'), 156)
    blocks.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  return Bun.gzipSync(Buffer.concat(blocks))
}

describe("lexicons in translationCore's layout", () => {
  test("lexiconRowPath reads the root layout and translationCore's", () => {
    expect(lexiconRowPath('content/1.json')).toBe('content/1.json')
    expect(lexiconRowPath('domains/12.json')).toBe('domains/12.json')
    expect(lexiconRowPath('ugl/v0/content/1.json')).toBe('content/1.json')
    expect(lexiconRowPath('resources/en/lexicons/uhl/v0/content/8674.json')).toBe('content/8674.json')
    for (const other of ['OldLexicon/lexicon.xml', 'package.json', 'README.md', 'ugl/v0/content/notes/x.json']) {
      expect(lexiconRowPath(other)).toBeNull()
    }
  })

  test('English lexicons come from test_org, other languages from their literal text', () => {
    expect(lexiconOwnerOf('en', 'unfoldingWord')).toBe('test_org')
    expect(lexiconOwnerOf('es-419', 'es-419_gl')).toBe('es-419_gl')
  })

  test('addLexicons stores translationCore entries where Servos reads them', async () => {
    const alpha = { brief: 'the first letter of the Greek alphabet', long: 'alpha; the first letter of the Greek alphabet.' }
    const commit = { sha: '5f1e2d3c4b5a69788796a5b4c3d2e1f001122334', created: '2021-09-14T19:21:29Z' }
    const archive = tarGz({ 'en_ugl/ugl/v0/content/1.json': JSON.stringify(alpha), 'en_ugl/package.json': '{}' })
    const { fetchFn: api } = door43({ 'test_org/en_ugl': { master: commit } })
    const fetchFn = async (url: string) =>
      url.endsWith(`/test_org/en_ugl/archive/${commit.sha}.tar.gz`) ? new Response(archive) : api(url)
    const rows = new Map<string, unknown>()
    const store = {
      putRawMany: async (list: Array<{ key: string; entry: unknown }>) => list.forEach((r) => rows.set(r.key, r.entry)),
      set: async () => {},
    }
    const done = await addLexicons(store as never, { set: async () => {} } as never, 'en', 'test_org', 'master', fetchFn)
    expect(rows.get('test_org/en/ugl/content/1.json')).toEqual(alpha)
    expect([...rows.keys()]).toEqual(['test_org/en/ugl/content/1.json'])
    expect(done).toContainEqual({ key: 'test_org/en/ugl', entries: 1 })
  })
})
