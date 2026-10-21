import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addLexicons, addMacula, lexiconStamps } from './companions'

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
