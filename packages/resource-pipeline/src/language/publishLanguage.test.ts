import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  buildIdOf,
  catalogPath,
  compatKeyOf,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  type PackBuild,
  type PackCatalogEntry,
  type PackManifest,
} from '@bt-synergy/language-pack'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { PACK_VERSIONS } from './packVersions'
import { memoryBucket, publishLanguage, r2Bucket, type PackBucket } from './publishLanguage'

const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
// A commit whose hash sorts after a later one's: only the date may order them.
const macula = { folder: '/taller/public', commit: 'f1e2d3c4b5a69788f1e2d3c4b5a69788f1e2d3c4', date: '2026-10-01T09:00:00-05:00' }
const M = macula.commit
const lexiconsRef = 'v3'

const STAMPS = {
  'es-419_gl/es-419/glt': 'v42#2026-01-02T03_04_05Z',
  'es-419_obt/es-419/tw': 'v9#2026-01-02T03_04_05Z',
  'unfoldingWord/hbo/uhb': 'v2.1.31#2025-01-01T00_00_00Z',
  'unfoldingWord/el-x-koine/ugnt': 'v0.34#2025-01-01T00_00_00Z',
}
const ORIGINAL_STAMPS = {
  'unfoldingWord/hbo/uhb': STAMPS['unfoldingWord/hbo/uhb'],
  'unfoldingWord/el-x-koine/ugnt': STAMPS['unfoldingWord/el-x-koine/ugnt'],
}

function manifestOf(language: string, kind: 'language' | 'originals', keys: string[]): PackManifest {
  return {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    language,
    kind,
    createdAt: '2026-10-20T00:00:00.000Z',
    layers: ['sot'],
    versions: PACK_VERSIONS,
    resources: keys.map((key) => ({ key, role: 'source', stamp: 's', rows: { sot: 1 } }) as never),
  }
}

/** A prepareAndPack that packs nothing real: two tiny packs, the originals one named for the language as the real one is. */
function fakeBuild() {
  const calls: unknown[] = []
  const build = (async (o: unknown) => {
    calls.push(o)
    return {
      language: {
        file: 'es-419.langpack.zip',
        bytes: new Uint8Array([1, 2, 3]),
        manifest: manifestOf('es-419', 'language', ['es-419_gl/es-419/glt']),
        skipped: [{ key: 'es-419_gl/es-419/gst', why: 'no tiene est' }],
      },
      originals: {
        file: 'originals.langpack.zip',
        bytes: new Uint8Array([4, 5]),
        manifest: manifestOf('es-419', 'originals', ['unfoldingWord/hbo/uhb', 'unfoldingWord/el-x-koine/ugnt']),
        skipped: [],
      },
      report: {},
    }
  }) as never
  return { build, calls }
}

/** A writeMcpViews that writes two files where the real one would. */
function fakeViews() {
  return (async (o: { outDir: string }) => {
    const files = ['v1/es-419/index.json', 'v1/es-419/notes/TIT/1.json']
    for (const f of files) {
      mkdirSync(dirname(join(o.outDir, f)), { recursive: true })
      writeFileSync(join(o.outDir, f), '{"a":1}')
    }
    return { files, index: {} }
  }) as never
}

const neverBuild = (async () => {
  throw new Error('build must not run')
}) as never

async function storedEntry(language: string, build: Omit<PackBuild, 'id'>): Promise<PackCatalogEntry> {
  return { language, compat, build: { id: await buildIdOf(build), ...build } } as PackCatalogEntry
}

function base(bucket: PackBucket, over: Record<string, unknown> = {}) {
  const lines: string[] = []
  return {
    lines,
    options: {
      language: 'es-419',
      bucket,
      workDir: mkdtempSync(join(tmpdir(), 'publish-language-')),
      generator: 'g2',
      macula,
      lexiconsRef,
      stamps: async () => ({ ...STAMPS }),
      views: fakeViews(),
      log: (line: string) => lines.push(line),
      ...over,
    },
  }
}

describe('publishLanguage', () => {
  test('unchanged: the stored entry has the same build id, so nothing is built and nothing is put', async () => {
    const stored = await storedEntry('es-419', { generator: 'g2', macula: M, lexicons: 'v3', stamps: STAMPS })
    const bucket = memoryBucket({ [catalogPath(compat, 'es-419')]: stored })
    const { options } = base(bucket, { build: neverBuild })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts).toEqual([])
  })

  test('a new generator publishes: pack, then views, then originals.json, then the language entry last', async () => {
    const bucket = memoryBucket({
      [catalogPath(compat, 'es-419')]: await storedEntry('es-419', { generator: 'g1', macula: M, lexicons: 'v3', stamps: STAMPS }),
      [catalogPath(compat, 'originals')]: await storedEntry('originals', { generator: 'g1', macula: M, stamps: ORIGINAL_STAMPS }),
    })
    const { build, calls } = fakeBuild()
    const { options } = base(bucket, { build })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('published')
    expect(result.originals).toBe('published')
    const keys = bucket.puts.map((p) => p.key)
    expect(keys[0]).toMatch(new RegExp(`^packs/${compat}/es-419/[0-9a-f]{64}\\.langpack\\.zip$`))
    expect(keys[1]).toMatch(new RegExp(`^packs/${compat}/originals/[0-9a-f]{64}\\.langpack\\.zip$`))
    expect(keys.slice(2, 4).sort()).toEqual(['v1/es-419/index.json', 'v1/es-419/notes/TIT/1.json'])
    expect(keys.slice(4)).toEqual([catalogPath(compat, 'originals'), catalogPath(compat, 'es-419')])

    const meta = Object.fromEntries(bucket.puts.map((p) => [p.key, `${p.contentType} | ${p.cacheControl}`]))
    expect(meta[keys[0]]).toBe('application/zip | public, max-age=31536000, immutable')
    expect(meta['v1/es-419/index.json']).toBe('application/json | no-cache')
    expect(meta[catalogPath(compat, 'es-419')]).toBe('application/json | no-cache')

    // sha256 of [1, 2, 3], whole and lowercase.
    const sha = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    const entry = bucket.json<PackCatalogEntry>(catalogPath(compat, 'es-419'))!
    expect(entry).toEqual(result.entry!)
    expect(entry.pack).toEqual({ path: `packs/${compat}/es-419/${sha}.langpack.zip`, bytes: 3, sha256: sha })
    expect(entry.build.stamps).toMatchObject(ORIGINAL_STAMPS)
    expect(entry.build).toMatchObject({ generator: 'g2', macula: M, lexicons: 'v3' })
    expect(entry.build.id).toBe(await buildIdOf({ generator: 'g2', macula: M, lexicons: 'v3', stamps: STAMPS }))
    expect(entry.left).toEqual([{ key: 'es-419_gl/es-419/gst', why: 'no tiene est' }])
    expect(entry.views).toBe('v1/es-419/')

    const originals = bucket.json<PackCatalogEntry>(catalogPath(compat, 'originals'))!
    expect(originals.language).toBe('originals')
    expect(originals.pack.path).toBe(keys[1])
    expect(originals.build).toEqual({ id: await buildIdOf({ generator: 'g2', macula: M, stamps: ORIGINAL_STAMPS }), generator: 'g2', macula: M, stamps: ORIGINAL_STAMPS })

    expect(calls).toEqual([
      expect.objectContaining({ language: 'es-419', originals: true, macula: '/taller/public', maculaStamp: { version: 'f1e2d3c4b5', publishedAt: '2026-10-01T14:00:00.000Z' }, lexicons: { ref: 'v3' }, obs: false }),
    ])
  })

  test('a language whose originals did not change leaves the originals pack and entry alone', async () => {
    const bucket = memoryBucket({
      [catalogPath(compat, 'originals')]: await storedEntry('originals', { generator: 'g2', macula: M, stamps: ORIGINAL_STAMPS }),
    })
    const { options } = base(bucket, { build: fakeBuild().build })

    const result = await publishLanguage(options)

    expect(result.originals).toBe('unchanged')
    const keys = bucket.puts.map((p) => p.key)
    expect(keys.filter((k) => k.includes('originals'))).toEqual([])
    expect(keys.at(-1)).toBe(catalogPath(compat, 'es-419'))
  })

  test('cut short: a put that fails on the views leaves every catalog entry as it was, and the error goes up', async () => {
    const inner = memoryBucket()
    const bucket = {
      ...inner,
      async put(key: string, body: Uint8Array | string, o: { contentType: string; cacheControl: string }) {
        if (key.startsWith('v1/')) throw new Error('connection reset')
        return inner.put(key, body, o)
      },
    }
    const { options } = base(bucket, { build: fakeBuild().build })

    await expect(publishLanguage(options)).rejects.toThrow('connection reset')

    expect(inner.puts.length).toBeGreaterThan(0)
    expect(inner.puts.filter((p) => p.key.startsWith('catalog/'))).toEqual([])
  })

  test('dry run: it decides and says so, and builds and uploads nothing', async () => {
    const bucket = memoryBucket()
    const { options, lines } = base(bucket, { build: neverBuild, dryRun: true })

    const result = await publishLanguage(options)

    expect(result).toEqual({ language: 'es-419', outcome: 'published', originals: 'published' })
    expect(bucket.puts).toEqual([])
    expect(lines.join('\n')).toContain('dry run')
  })

  test("MACULA's stamp sorts by its commit date, never by its hash", async () => {
    const stampOf = async (m: { folder: string; commit: string; date: string }) => {
      const { build, calls } = fakeBuild()
      await publishLanguage(base(memoryBucket(), { build, macula: m }).options)
      const { version, publishedAt } = (calls[0] as { maculaStamp: { version: string; publishedAt: string } }).maculaStamp
      return resourceContentStamp({ version, release: { tag_name: version, published_at: publishedAt } } as never)
    }
    const older = await stampOf(macula)
    const newer = await stampOf({ folder: macula.folder, commit: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', date: '2026-10-15T08:00:00+02:00' })

    expect(older).toBe('f1e2d3c4b5#2026-10-01T14_00_00.000Z')
    expect(newer.split('#')[1] > older.split('#')[1]).toBe(true)
  })

  test('a MACULA date that is not a date is refused before anything runs', async () => {
    const { options } = base(memoryBucket(), { build: neverBuild, macula: { ...macula, date: 'yesterday' } })
    await expect(publishLanguage(options)).rejects.toThrow('yesterday')
  })

  test('a language code that could leave its folder is refused before anything runs', async () => {
    const { options } = base(memoryBucket(), {
      language: '../es-419',
      build: neverBuild,
      stamps: async () => {
        throw new Error('stamps must not run')
      },
    })
    await expect(publishLanguage(options)).rejects.toThrow('../es-419')
  })

  test('no Door43 stamps for the originals: refused, rather than publishing a pack built from nothing', async () => {
    const { options } = base(memoryBucket(), { build: neverBuild, stamps: async () => ({}) })
    await expect(publishLanguage(options)).rejects.toThrow('unfoldingWord/hbo/uhb')
  })

  test('log lines never carry a line break that came from Door43', async () => {
    const { options, lines } = base(memoryBucket(), {
      build: neverBuild,
      dryRun: true,
      stamps: async () => ({ ...STAMPS, 'es-419_gl/es-419/glt': 'v43\n::error::forged' }),
    })
    await publishLanguage(options)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.filter((l) => /[\r\n]/.test(l))).toEqual([])
  })
})

describe('r2Bucket', () => {
  test('puts with its content type and cache control, and reads a missing key as null', async () => {
    const seen: Array<{ method: string; path: string; type: string | null; cache: string | null; body: string }> = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname
        seen.push({ method: req.method, path, type: req.headers.get('content-type'), cache: req.headers.get('cache-control'), body: await req.text() })
        if (req.method === 'GET') return path.endsWith('/there.json') ? Response.json({ ok: 1 }) : new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
        return new Response('')
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's' })
      await bucket.put('catalog/c/es-419.json', '{"x":1}', { contentType: 'application/json', cacheControl: 'no-cache' })
      expect(await bucket.getJson('catalog/c/missing.json')).toBeNull()
      expect(await bucket.getJson('catalog/c/there.json')).toEqual({ ok: 1 })

      expect(seen[0]).toEqual({ method: 'PUT', path: '/packs/catalog/c/es-419.json', type: 'application/json', cache: 'no-cache', body: '{"x":1}' })
    } finally {
      server.stop(true)
    }
  })

  test('a failed put throws with the status', async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }) })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's' })
      await expect(bucket.put('k', 'x', { contentType: 'application/json', cacheControl: 'no-cache' })).rejects.toThrow('403')
    } finally {
      server.stop(true)
    }
  })
})
