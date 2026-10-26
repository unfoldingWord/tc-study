import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
import { IMMUTABLE, memoryBucket, publishLanguage, r2Bucket, type PackBucket } from './publishLanguage'

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

const SUBJECTS: Record<string, string> = {
  'es-419_gl/es-419/glt': 'Aligned Bible',
  'es-419_gl/es-419/gst': 'Aligned Bible',
  'es-419_obt/es-419/tw': 'Translation Words',
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
    resources: keys.map((key) => ({ key, role: kind === 'originals' ? 'original' : 'language', stamp: 's', subject: SUBJECTS[key], rows: { sot: 1 } }) as never),
  }
}

const LANGUAGE_KEYS = ['es-419_gl/es-419/glt', 'es-419_obt/es-419/tw']
const ORIGINAL_KEYS = ['unfoldingWord/hbo/uhb', 'unfoldingWord/el-x-koine/ugnt', 'Biblica/hbo/macula', 'Biblica/el-x-koine/macula']

type FakePacks = { languageKeys?: string[]; originalKeys?: string[]; skipped?: Array<{ key: string; why: string }> }

/**
 * A prepareAndPack that packs nothing real: two tiny packs, the originals one named for the language as the real one
 * is. By default the language pack holds every language key of STAMPS, and the originals pack UHB, UGNT and MACULA.
 */
function fakeBuild(over: FakePacks = {}) {
  const calls: unknown[] = []
  const build = (async (o: unknown) => {
    calls.push(o)
    return {
      language: {
        file: 'es-419.langpack.zip',
        bytes: new Uint8Array([1, 2, 3]),
        manifest: manifestOf('es-419', 'language', over.languageKeys ?? LANGUAGE_KEYS),
        skipped: over.skipped ?? [{ key: 'es-419_gl/es-419/gst', why: 'no tiene est' }],
      },
      originals: {
        file: 'originals.langpack.zip',
        bytes: new Uint8Array([4, 5]),
        manifest: manifestOf('es-419', 'originals', over.originalKeys ?? ORIGINAL_KEYS),
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
  const pack = { path: `packs/${compat}/${language}/stored.langpack.zip`, bytes: 1, sha256: 'stored' }
  return { language, compat, build: { id: await buildIdOf(build), ...build }, pack } as PackCatalogEntry
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

  test('force: the same build id is built and published again, for a builder fix no stamp shows', async () => {
    const stored = await storedEntry('es-419', { generator: 'g1', macula: M, lexicons: 'v3', stamps: STAMPS })
    const bucket = memoryBucket({ [catalogPath(compat, 'es-419')]: stored })
    const { build, calls } = fakeBuild()
    const { options } = base(bucket, { build, force: true })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('published')
    expect(calls).toHaveLength(1)
    expect(result.entry!.build.id).toBe(stored.build.id)
    expect(result.entry!.build.generator).toBe('g2')
    expect(bucket.puts.map((p) => p.key)).toContain(catalogPath(compat, 'es-419'))
  })

  test('a new tc-study commit alone is unchanged: nothing is built and nothing is put', async () => {
    const stored = await storedEntry('es-419', { generator: 'g1', macula: M, lexicons: 'v3', stamps: STAMPS })
    const bucket = memoryBucket({ [catalogPath(compat, 'es-419')]: stored })
    const { options } = base(bucket, { build: neverBuild, generator: 'g2' })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts).toEqual([])
  })

  test('an entry stored with the old id (the generator inside) is rebuilt once', async () => {
    const stored = await storedEntry('es-419', { generator: 'g1', macula: M, lexicons: 'v3', stamps: STAMPS })
    const bucket = memoryBucket({ [catalogPath(compat, 'es-419')]: { ...stored, build: { ...stored.build, id: '0123456789abcdef' } } })
    const { build } = fakeBuild()
    const { options } = base(bucket, { build })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('published')
    expect(result.entry!.build.generator).toBe('g2')
  })

  test('a new Door43 stamp publishes: pack, then views, then originals.json, then the language entry last', async () => {
    // What the stored packs were built from: an older UHB, so both the language and the originals changed.
    const OLD_UHB = { 'unfoldingWord/hbo/uhb': 'v2.1.30#2024-06-01T00_00_00Z' }
    const bucket = memoryBucket({
      [catalogPath(compat, 'es-419')]: await storedEntry('es-419', { generator: 'g1', macula: M, lexicons: 'v3', stamps: { ...STAMPS, ...OLD_UHB } }),
      [catalogPath(compat, 'originals')]: await storedEntry('originals', { generator: 'g1', macula: M, stamps: { ...ORIGINAL_STAMPS, ...OLD_UHB } }),
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
    // The language names the originals it was just built with.
    expect(entry.originals).toEqual({ build: originals.build.id, path: originals.pack.path, bytes: 2, sha256: originals.pack.sha256 })
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

  test('originals unchanged: the language entry names the stored originals build and pack', async () => {
    const stored = {
      ...(await storedEntry('originals', { generator: 'g2', macula: M, stamps: ORIGINAL_STAMPS })),
      pack: { path: `packs/${compat}/originals/abc.langpack.zip`, bytes: 22_000_000, sha256: 'abc' },
    }
    const bucket = memoryBucket({ [catalogPath(compat, 'originals')]: stored })
    const { options } = base(bucket, { build: fakeBuild().build })

    const result = await publishLanguage(options)

    expect(result.entry!.originals).toEqual({ build: stored.build.id, path: stored.pack.path, bytes: 22_000_000, sha256: 'abc' })
    expect(bucket.json<PackCatalogEntry>(catalogPath(compat, 'es-419'))!.originals).toEqual(result.entry!.originals!)
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

    expect(result).toEqual({ language: 'es-419', outcome: 'would-publish', originals: 'would-publish' })
    expect(bucket.puts).toEqual([])
    expect(lines.join('\n')).toContain('dry run')
  })

  test('no upload: it builds the packs and the views into the work folder, and puts nothing', async () => {
    const bucket = memoryBucket()
    const { build, calls } = fakeBuild()
    const { options } = base(bucket, { build, noUpload: true })

    const result = await publishLanguage(options)

    expect(result.outcome).toBe('built')
    expect(result.originals).toBe('built')
    expect(result.entry?.pack.bytes).toBe(3)
    expect(bucket.puts).toEqual([])
    expect(calls).toEqual([expect.objectContaining({ outDir: join(options.workDir, 'packs') })])
    expect(existsSync(join(options.workDir, 'views', 'v1/es-419/index.json'))).toBe(true)
  })

  describe('a build that is not whole is never published', () => {
    const refused = async (packs: FakePacks, why: string | RegExp) => {
      const bucket = memoryBucket()
      const { options } = base(bucket, { build: fakeBuild(packs).build })
      await expect(publishLanguage(options)).rejects.toThrow(why)
      expect(bucket.puts).toEqual([])
    }

    test('a resource whose download failed (left out with a download reason)', async () => {
      await refused(
        {
          languageKeys: ['es-419_gl/es-419/glt'],
          skipped: [{ key: 'es-419_obt/es-419/tw', why: 'su descarga no terminó, o es de otra versión' }],
        },
        'es-419_obt/es-419/tw'
      )
    })

    test('an original missing from the originals pack, though nothing says so', async () => {
      await refused({ originalKeys: ORIGINAL_KEYS.filter((k) => k !== 'unfoldingWord/hbo/uhb') }, 'unfoldingWord/hbo/uhb')
    })

    test('MACULA missing from the originals pack', async () => {
      await refused({ originalKeys: ORIGINAL_KEYS.filter((k) => k !== 'Biblica/el-x-koine/macula') }, 'Biblica/el-x-koine/macula')
    })

    test('a resource Door43 lists that is neither packed nor left out for good', async () => {
      await refused({ languageKeys: ['es-419_gl/es-419/glt'], skipped: [] }, 'es-419_obt/es-419/tw')
    })

    test('a language pack without an aligned literal text', async () => {
      await refused({ languageKeys: ['es-419_obt/es-419/tw'], skipped: [{ key: 'es-419_gl/es-419/glt', why: 'no tiene tit' }] }, /literal/)
    })
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

describe('memoryBucket', () => {
  test('stat: when each key was put by its clock (a seed at creation), or null; getBytes: the bytes put', async () => {
    let now = new Date('2026-07-01T00:00:00Z')
    const bucket = memoryBucket({ 'catalog/c/seed.json': { a: 1 } }, { now: () => now })
    now = new Date('2026-07-05T00:00:00Z')
    await bucket.put('parts/x.part.gz', new Uint8Array([1, 2]), { contentType: 'application/gzip', cacheControl: IMMUTABLE })

    expect(await bucket.stat('catalog/c/seed.json')).toEqual({ uploaded: new Date('2026-07-01T00:00:00Z') })
    expect(await bucket.stat('parts/x.part.gz')).toEqual({ uploaded: new Date('2026-07-05T00:00:00Z') })
    expect(await bucket.stat('parts/missing.part.gz')).toBeNull()
    expect(await bucket.getBytes('parts/x.part.gz')).toEqual(new Uint8Array([1, 2]))
    expect(await bucket.getBytes('parts/missing.part.gz')).toBeNull()
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

  test('a failed put throws with the status, and a 403 is not retried', async () => {
    let requests = 0
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        requests++
        return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's', retryDelaysMs: [0, 0] })
      await expect(bucket.put('k', 'x', { contentType: 'application/json', cacheControl: 'no-cache' })).rejects.toThrow('403')
      expect(requests).toBe(1)
    } finally {
      server.stop(true)
    }
  })

  /** A server that answers each request with the next status of the list, then 200. */
  function answering(statuses: number[]) {
    const seen: Array<{ method: string; body: string }> = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ method: req.method, body: await req.text() })
        const status = statuses[seen.length - 1] ?? 200
        if (status !== 200) return new Response('<Error><Code>SlowDown</Code></Error>', { status })
        return req.method === 'GET' ? Response.json({ ok: 1 }) : new Response('')
      },
    })
    const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's', retryDelaysMs: [0, 0] })
    return { server, bucket, seen }
  }

  test('a put that gets a 503 is retried with the same body, and succeeds', async () => {
    const { server, bucket, seen } = answering([503])
    try {
      await bucket.put('catalog/c/es-419.json', '{"x":1}', { contentType: 'application/json', cacheControl: 'no-cache' })
      expect(seen).toEqual([
        { method: 'PUT', body: '{"x":1}' },
        { method: 'PUT', body: '{"x":1}' },
      ])
    } finally {
      server.stop(true)
    }
  })

  test('a 429 and then a 500 are retried too', async () => {
    const { server, bucket, seen } = answering([429, 500])
    try {
      await bucket.put('k', new Uint8Array([1, 2]), { contentType: 'application/zip', cacheControl: 'immutable' })
      expect(seen.length).toBe(3)
    } finally {
      server.stop(true)
    }
  })

  test('three 503s in a row fail the put with the status', async () => {
    const { server, bucket, seen } = answering([503, 503, 503])
    try {
      await expect(bucket.put('k', 'x', { contentType: 'application/json', cacheControl: 'no-cache' })).rejects.toThrow('503')
      expect(seen.length).toBe(3)
    } finally {
      server.stop(true)
    }
  })

  test('a read is retried on a 503, and a 404 is null at once', async () => {
    const { server, bucket, seen } = answering([503])
    try {
      expect(await bucket.getJson('catalog/c/there.json')).toEqual({ ok: 1 })
      expect(seen.length).toBe(2)
    } finally {
      server.stop(true)
    }
    const missing = answering([404])
    try {
      expect(await missing.bucket.getJson('catalog/c/missing.json')).toBeNull()
      expect(missing.seen.length).toBe(1)
    } finally {
      missing.server.stop(true)
    }
  })

  test('has: a HEAD of the key, 200 is there and 404 is not', async () => {
    const seen: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname
        seen.push(`${req.method} ${path}`)
        return new Response(null, { status: path.endsWith('/there.part.gz') ? 200 : 404 })
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's', retryDelaysMs: [0, 0] })
      expect(await bucket.has('parts/there.part.gz')).toBe(true)
      expect(await bucket.has('parts/missing.part.gz')).toBe(false)
      expect(seen).toEqual(['HEAD /packs/parts/there.part.gz', 'HEAD /packs/parts/missing.part.gz'])
    } finally {
      server.stop(true)
    }
  })

  test('has: a 503 is asked again, and another status is an error, never a no', async () => {
    const { server, bucket, seen } = answering([503])
    try {
      expect(await bucket.has('parts/x.part.gz')).toBe(true)
      expect(seen.map((s) => s.method)).toEqual(['HEAD', 'HEAD'])
    } finally {
      server.stop(true)
    }
    const denied = answering([403])
    try {
      await expect(denied.bucket.has('parts/x.part.gz')).rejects.toThrow('403')
      expect(denied.seen.length).toBe(1)
    } finally {
      denied.server.stop(true)
    }
  })

  test('stat: a HEAD of the key, its upload time from Last-Modified; 404 is null, another status an error', async () => {
    const seen: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname
        seen.push(`${req.method} ${path}`)
        if (path.endsWith('/there.part.gz')) return new Response(null, { headers: { 'last-modified': 'Wed, 01 Jul 2026 10:20:30 GMT' } })
        if (path.endsWith('/undated.part.gz')) return new Response(null)
        if (path.endsWith('/denied.part.gz')) return new Response(null, { status: 403 })
        return new Response(null, { status: 404 })
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's', retryDelaysMs: [0, 0] })
      expect(await bucket.stat('parts/there.part.gz')).toEqual({ uploaded: new Date('2026-07-01T10:20:30Z') })
      expect(await bucket.stat('parts/missing.part.gz')).toBeNull()
      // An answer that does not say when is taken as old: refreshing costs a put, trusting it could lose the part.
      expect(await bucket.stat('parts/undated.part.gz')).toEqual({ uploaded: new Date(0) })
      await expect(bucket.stat('parts/denied.part.gz')).rejects.toThrow('403')
      expect(seen.slice(0, 2)).toEqual(['HEAD /packs/parts/there.part.gz', 'HEAD /packs/parts/missing.part.gz'])
    } finally {
      server.stop(true)
    }
  })

  test('getBytes: the object as it is stored, and a missing key as null', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        if (req.method !== 'GET') return new Response(null, { status: 405 })
        return new URL(req.url).pathname.endsWith('/there.part.gz') ? new Response(new Uint8Array([31, 139, 8, 0])) : new Response('<Error/>', { status: 404 })
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's', retryDelaysMs: [0, 0] })
      expect(await bucket.getBytes('parts/there.part.gz')).toEqual(new Uint8Array([31, 139, 8, 0]))
      expect(await bucket.getBytes('parts/missing.part.gz')).toBeNull()
    } finally {
      server.stop(true)
    }
  })

  test('a part is put as gzip with the immutable cache control, and no content encoding', async () => {
    const seen: Array<{ type: string | null; cache: string | null; encoding: string | null; bytes: number }> = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ type: req.headers.get('content-type'), cache: req.headers.get('cache-control'), encoding: req.headers.get('content-encoding'), bytes: (await req.arrayBuffer()).byteLength })
        return new Response('')
      },
    })
    try {
      const bucket = r2Bucket({ endpoint: `http://127.0.0.1:${server.port}`, bucket: 'packs', accessKeyId: 'a', secretAccessKey: 's' })
      await bucket.put('parts/x.part.gz', new Uint8Array([31, 139, 8]), { contentType: 'application/gzip', cacheControl: IMMUTABLE })
      expect(seen).toEqual([{ type: 'application/gzip', cache: 'public, max-age=31536000, immutable', encoding: null, bytes: 3 }])
    } finally {
      server.stop(true)
    }
  })

  test('a network error is retried, and the last one goes up', async () => {
    // A port nothing listens on any more.
    const gone = Bun.serve({ port: 0, fetch: () => new Response('') })
    const port = gone.port
    gone.stop(true)
    const retries: string[] = []
    const bucket = r2Bucket({
      endpoint: `http://127.0.0.1:${port}`,
      bucket: 'packs',
      accessKeyId: 'a',
      secretAccessKey: 's',
      retryDelaysMs: [0, 0],
      log: (line) => retries.push(line),
    })
    await expect(bucket.put('k', 'x', { contentType: 'application/json', cacheControl: 'no-cache' })).rejects.toThrow()
    expect(retries.length).toBe(2)
  })
})
