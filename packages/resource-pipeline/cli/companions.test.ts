import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addLexicons, addMacula, lexiconOwnerOf, lexiconRowPath, lexiconStamps, maculaCatalogRows } from './companions'

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
function door43(repos: Record<string, Record<string, { sha: string; created?: string; commit?: { committer?: { date?: string } } }>>) {
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

  test("a commit without `created` is dated by its committer's date, its offset kept as Door43 wrote it", async () => {
    const byCommitter = { sha: uhl.sha, commit: { committer: { date: '2026-07-01T02:00:00+02:00' } } }
    const { fetchFn } = door43({ 'es-419_gl/es-419_uhl': { master: byCommitter } })
    expect(await lexiconStamps({ language: 'es-419', owner: 'es-419_gl', ref: 'master', fetch: fetchFn })).toEqual({
      'es-419_gl/es-419/uhl': '6cca967498#2026-07-01T02_00_00+02_00',
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

describe('the licences of the lexicons and MACULA', () => {
  const commit = { sha: '6cca967498146d8ebe12c1fe9124f56baa309e27', created: '2026-10-19T19:52:42-04:00' }

  /** The catalog rows `addLexicons` writes for es-419's Greek lexicon, its archive holding `manifest`. */
  async function lexiconRows(manifest: string) {
    const archive = tarGz({ 'es-419_ugl/manifest.yaml': manifest, 'es-419_ugl/content/G1.json': '{}' })
    const { fetchFn: api } = door43({ 'es-419_gl/es-419_ugl': { master: commit } })
    const fetchFn = async (url: string) => (url.endsWith(`/es-419_gl/es-419_ugl/archive/${commit.sha}.tar.gz`) ? new Response(archive) : api(url))
    const rows = new Map<string, Record<string, unknown>>()
    const catalog = { set: async (key: string, value: never) => void rows.set(key, value) }
    await addLexicons({ putRawMany: async () => {}, set: async () => {} } as never, catalog as never, 'es-419', 'es-419_gl', 'master', fetchFn)
    return rows
  }

  test("a lexicon's catalog row carries the licence its manifest's rights name", async () => {
    // As es-419_ugl's manifest has it: the language's title and the rights in dublin_core.
    const manifest = "dublin_core:\n  language:\n    identifier: 'es-419'\n    title: 'Español Latinoamericano'\n  rights: 'CC BY-SA 4.0'\n  subject: 'Greek Lexicon'\n"
    const rows = await lexiconRows(manifest)
    expect(rows.get('es-419_gl/es-419/ugl')?.license).toEqual({ id: 'CC BY-SA 4.0' })
  })

  test('a lexicon whose manifest names no rights gets no licence', async () => {
    const rows = await lexiconRows('dublin_core:\n  title: Léxico griego\n')
    expect(rows.get('es-419_gl/es-419/ugl')).toBeDefined()
    expect('license' in rows.get('es-419_gl/es-419/ugl')!).toBe(false)
  })

  /**
   * A MACULA folder as Taller has it: one book in each part, and an `index.json` in each naming `licenses[part]`, or
   * holding `raw[part]` as it is.
   */
  function maculaWith(licenses: { trees?: string; referents?: string }, raw: { trees?: string; referents?: string } = {}) {
    const folder = mkdtempSync(join(tmpdir(), 'macula-'))
    for (const part of ['trees', 'referents'] as const) {
      mkdirSync(join(folder, part))
      writeFileSync(join(folder, part, 'RUT.json'), '{}')
      writeFileSync(join(folder, part, 'TIT.json'), '{}')
      const license = licenses[part]
      if (license) writeFileSync(join(folder, part, 'index.json'), JSON.stringify({ source: 'MACULA, Biblica', license, books: ['RUT', 'TIT'] }))
      if (raw[part] !== undefined) writeFileSync(join(folder, part, 'index.json'), raw[part]!)
    }
    return folder
  }

  const STAMP = { version: 'f1e2d3c4b5', publishedAt: '2026-10-01T14:00:00.000Z' }

  async function maculaRows(folder: string, warn?: (line: string) => void) {
    const rows = new Map<string, Record<string, unknown>>()
    const catalog = { set: async (key: string, value: never) => void rows.set(key, value) }
    await addMacula({ putRawMany: async () => {}, set: async () => {} } as never, catalog as never, folder, STAMP, warn)
    return rows
  }

  test("MACULA's catalog rows carry the licence its index.json files name, from addMacula and from maculaCatalogRows", async () => {
    const folder = maculaWith({ trees: 'CC BY 4.0', referents: 'CC BY 4.0' })
    const rows = await maculaRows(folder)
    for (const key of ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula']) expect(rows.get(key)?.license).toEqual({ id: 'CC BY 4.0' })
    // What a parts build whose shared unit was carried writes in their place.
    expect(maculaCatalogRows(folder, STAMP)).toEqual([...rows.values()] as never)
  })

  test('one index.json naming the licence is enough', async () => {
    const rows = await maculaRows(maculaWith({ trees: 'CC BY 4.0' }))
    expect(rows.get('Biblica/hbo/macula')?.license).toEqual({ id: 'CC BY 4.0' })
  })

  test('a MACULA folder that names no licence gives rows without one', async () => {
    const folder = maculaWith({})
    const rows = await maculaRows(folder)
    expect([...rows.values()].some((row) => 'license' in row)).toBe(false)
    expect(maculaCatalogRows(folder, STAMP).some((row) => 'license' in row)).toBe(false)
  })

  test('index.json files that name different licences fail, naming both', async () => {
    const folder = maculaWith({ trees: 'CC BY 4.0', referents: 'CC BY-SA 4.0' })
    await expect(maculaRows(folder)).rejects.toThrow(/CC BY 4\.0.*CC BY-SA 4\.0/)
    expect(() => maculaCatalogRows(folder, STAMP)).toThrow(/CC BY 4\.0.*CC BY-SA 4\.0/)
  })

  const BROKEN_INDEXES = {
    truncated: '{"source":"MACULA, Biblica","license":"CC BY 4.0","books":["RUT",',
    'with a trailing comma': '{"license":"CC BY 4.0",}',
  }

  for (const [how, raw] of Object.entries(BROKEN_INDEXES)) {
    test(`an index.json ${how} names no licence: the build goes on, and its log names the file`, async () => {
      const folder = maculaWith({}, { trees: raw })
      const warned: string[] = []
      const rows = await maculaRows(folder, (line) => warned.push(line))
      expect(rows.size).toBe(2)
      expect([...rows.values()].some((row) => 'license' in row)).toBe(false)
      expect(maculaCatalogRows(folder, STAMP, (line) => warned.push(line)).some((row) => 'license' in row)).toBe(false)
      expect(warned).toHaveLength(2)
      for (const line of warned) expect(line).toContain(join(folder, 'trees', 'index.json'))
    })

    test(`an index.json ${how} beside a readable one: the rows carry the readable one's licence`, async () => {
      const folder = maculaWith({ referents: 'CC BY 4.0' }, { trees: raw })
      const warned: string[] = []
      const rows = await maculaRows(folder, (line) => warned.push(line))
      for (const key of ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula']) expect(rows.get(key)?.license).toEqual({ id: 'CC BY 4.0' })
      expect(maculaCatalogRows(folder, STAMP, (line) => warned.push(line))).toEqual([...rows.values()] as never)
      expect(warned).toHaveLength(2)
      for (const line of warned) expect(line).toContain(join(folder, 'trees', 'index.json'))
    })
  }
})
