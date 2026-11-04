import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { main as publish } from './publish-v3'
import { main as verify } from './verify-v3'
import { testKey } from './testKey'

const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const PYTHON = process.env.LP3_PYTHON
const needsPython = PYTHON === undefined || PYTHON === ''

const temps: string[] = []
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-v3-'))
  temps.push(dir)
  return dir
}

/** What a fake server can do wrong, per request path. */
type Faults = {
  /** Replaces the bytes of a path. */
  mutate?: (path: string, bytes: Uint8Array) => Uint8Array
  /** Extra headers (and a gzip body when `content-encoding` is set) for a path. */
  encode?: (path: string) => boolean
  /** Answers 200 to a conditional request. */
  ignoreConditional?: boolean
}

const etagOf = (bytes: Uint8Array): string => `"${createHash('sha256').update(bytes).digest('hex')}"`

/** A server on 127.0.0.1 that follows spec/serving.md over a bucket folder (`v3/catalog/*.seg`, `v3/seg/*.seg`). Local to this test: C1 has not asked for it. */
function fakeV3Server(bucket: string, faults: Faults = {}) {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const catalog = /^\/v3\/packs\/([a-z0-9-]+)\/catalog$/.exec(url.pathname)
      const segment = /^\/v3\/packs\/seg\/([0-9a-f]{64})$/.exec(url.pathname)
      const file = catalog !== null && catalog[1] !== 'seg' ? join(bucket, 'v3', 'catalog', `${catalog[1]}.seg`) : segment !== null ? join(bucket, 'v3', 'seg', `${segment[1]}.seg`) : undefined
      if (file === undefined) return Response.json({ error: 'bad pack path' }, { status: 400, headers: cors })
      if (!existsSync(file)) return Response.json({ error: segment === null ? 'catalog not found' : 'segment not found' }, { status: 404, headers: cors })
      let bytes: Uint8Array = new Uint8Array(readFileSync(file))
      if (faults.mutate !== undefined) bytes = faults.mutate(url.pathname, bytes)
      const etag = etagOf(bytes)
      const headers: Record<string, string> = {
        ...cors,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': segment === null ? 'no-cache, no-transform' : 'public, max-age=31536000, immutable, no-transform',
        ETag: etag,
        ...(segment === null ? {} : { 'Accept-Ranges': 'bytes' }),
      }
      const none = request.headers.get('if-none-match')
      if (!faults.ignoreConditional && none !== null && (none === '*' || none.split(',').map((t) => t.trim().replace(/^W\//, '')).includes(etag))) return new Response(null, { status: 304, headers })
      const range = segment === null ? null : /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
      if (range !== null) {
        const a = Number(range[1])
        const b = range[2] === '' ? bytes.length - 1 : Math.min(Number(range[2]), bytes.length - 1)
        return new Response(bytes.slice(a, b + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${a}-${b}/${bytes.length}` } })
      }
      if (faults.encode?.(url.pathname)) return new Response(gzipSync(bytes), { headers: { ...headers, 'Content-Encoding': 'gzip' } })
      return new Response(bytes, { headers })
    },
  })
  return { base: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) }
}

let bucket = ''
let built = ''

beforeAll(async () => {
  bucket = temp()
  const work = temp()
  const code = await publish(
    ['--lang', 'en', '--list', join(DATA, 'en', 'list.json'), '--originals', join(DATA, 'originals', 'list.json'), '--parts', join(DATA, 'parts'), '--work', work, '--bucket-dir', bucket],
    {},
    { log: () => {}, error: () => {}, out: () => {} },
  )
  expect(code).toBe(0)
  built = join(work, 'v3-out')
})
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

type Run = { code: number; lines: string[]; result: { ok: boolean; segments: number; bytes: number; failures: string[] } | undefined }

async function run(base: string, extra: string[] = [], out = temp(), env: Record<string, string | undefined> = {}): Promise<Run & { out: string }> {
  const lines: string[] = []
  const stdout: string[] = []
  const code = await verify(['--base', base, '--lang', 'en', '--out', out, ...extra], { ...process.env, ...env }, { log: (l) => lines.push(l), error: (l) => lines.push(l), out: (l) => stdout.push(l) })
  return { code, lines, out, result: stdout.length > 0 ? JSON.parse(stdout[stdout.length - 1]) : undefined }
}

async function withServer<T>(faults: Faults, fn: (base: string) => Promise<T>): Promise<T> {
  const server = fakeV3Server(bucket, faults)
  try {
    return await fn(server.base)
  } finally {
    server.stop()
  }
}

const python = needsPython ? [] : ['--python', PYTHON!]
const segmentPath = (): string => {
  const id = readdirSync(join(built, 'segments')).sort()[0].replace(/\.seg$/, '')
  return `/v3/packs/seg/${id}`
}

describe('verify-v3', () => {
  test.skipIf(needsPython)('exits 2 on a usage error or an unreachable base', async () => {
    const down = await run('http://127.0.0.1:1', python)
    expect(down.code).toBe(2)
    expect(down.lines.join(' ')).toContain('cannot reach')
    const lines: string[] = []
    expect(await verify(['--lang', 'en'], {}, { log: (l) => lines.push(l), error: (l) => lines.push(l), out: (l) => lines.push(l) })).toBe(2)
    expect(await verify(['--base', 'http://x', '--lang', 'en', '--out', temp(), '--pubkey', 'ab'], {}, { log: () => {}, error: () => {}, out: () => {} })).toBe(2)
  })

  test.skipIf(needsPython)('passes on a correct publication', async () => {
    await withServer({}, async (base) => {
      const r = await run(base, [...python, '--built', built])
      expect(r.lines.filter((l) => l.startsWith('FAIL'))).toEqual([])
      expect(r.code).toBe(0)
      expect(r.result).toMatchObject({ ok: true, failures: [] })
      expect(r.result!.segments).toBeGreaterThan(3)
      expect(existsSync(join(r.out, 'catalog-en.seg'))).toBe(true)
      expect(existsSync(join(r.out, 'catalog-common.seg'))).toBe(true)
      // The folder is a build-v3 folder: the same files as the build.
      for (const name of readdirSync(join(built, 'segments'))) expect(readFileSync(join(r.out, 'segments', name))).toEqual(readFileSync(join(built, 'segments', name)))
      expect(r.lines.some((l) => l.includes('304'))).toBe(true)
      expect(r.lines.some((l) => l.includes('206'))).toBe(true)
    })
  })

  test.skipIf(needsPython)('fails on a segment whose body was altered', async () => {
    const target = segmentPath()
    await withServer(
      { mutate: (p, b) => (p === target ? Uint8Array.from(b, (v, i) => (i === b.length - 3 ? v ^ 1 : v)) : b) },
      async (base) => {
        const r = await run(base, python)
        expect(r.code).toBe(1)
        expect(r.result!.ok).toBe(false)
        expect(r.result!.failures[0]).toStartWith('segment ' + target.slice(-64))
        expect(r.result!.failures.join(' ')).toMatch(/E_[A-Z]+/)
      },
    )
  })

  test.skipIf(needsPython)('fails on a wrong length', async () => {
    const target = segmentPath()
    await withServer({ mutate: (p, b) => (p === target ? Uint8Array.from([...b, 0]) : b) }, async (base) => {
      const r = await run(base, python)
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toMatch(/length is/)
    })
  })

  test.skipIf(needsPython)('fails on Content-Encoding', async () => {
    const target = segmentPath()
    await withServer({ encode: (p) => p === target }, async (base) => {
      const r = await run(base, python)
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toContain('Content-Encoding')
    })
  })

  test.skipIf(needsPython)('fails on a byte difference with --built', async () => {
    const copy = temp()
    cpSync(built, copy, { recursive: true })
    const name = readdirSync(join(copy, 'segments')).sort()[0]
    const file = join(copy, 'segments', name)
    const bytes = new Uint8Array(readFileSync(file))
    bytes[bytes.length - 1] ^= 1
    writeFileSync(file, bytes)
    await withServer({}, async (base) => {
      const r = await run(base, [...python, '--built', copy])
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toContain(name)
    })
  })

  test.skipIf(needsPython)('fails on a 200 where a 304 is due', async () => {
    await withServer({ ignoreConditional: true }, async (base) => {
      const r = await run(base, python)
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toContain('304')
    })
  })

  test.skipIf(needsPython)('fails when the readers disagree', async () => {
    const dir = temp()
    const reader = join(dir, 'stub.py')
    writeFileSync(reader, 'import sys\nprint(\'{"stub": 1}\')\n')
    await withServer({}, async (base) => {
      const r = await run(base, [...python, '--reader', reader])
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toContain('readers')
    })
  })

  test.skipIf(needsPython)('does not ask a fixed query whose books the catalog lacks', async () => {
    await withServer({}, async (base) => {
      const r = await run(base, python)
      expect(r.lines.join('\n')).toMatch(/queries: 0 asked/)
    })
  })

})

describe('verify-v3 fixed queries', () => {
  // The fixture holds Titus only, so the fixed queries of the spec are out; these two are written by hand for it.
  const titus = {
    book: 'tit',
    coverage: { 'unfoldingWord/el-x-koine/ugnt': 'whole', 'unfoldingWord/en/tn': 'whole', 'unfoldingWord/en/twl': 'whole' },
    kind: 'book',
    tables: { links: { keys: 93, unit: 'links' }, notes: { keys: 28, unit: 'notes' }, strong: { keys: 300, unit: 'occurrences' } },
  }
  const queriesWith = (expected: unknown): string => {
    const dir = temp()
    writeFileSync(join(dir, 'tit.json'), JSON.stringify({ query: { kind: 'book', book: 'tit' }, expected }))
    return dir
  }

  test.skipIf(needsPython)('a query whose book is in the catalog is asked and passes', async () => {
    await withServer({}, async (base) => {
      const r = await run(base, python, temp(), { LP3_VERIFY_QUERIES: queriesWith(titus) })
      expect(r.code).toBe(0)
      expect(r.lines.join('\n')).toMatch(/fixed queries: 1 asked/)
    })
  })

  test.skipIf(needsPython)('a query with a wrong expected fails', async () => {
    await withServer({}, async (base) => {
      const r = await run(base, python, temp(), { LP3_VERIFY_QUERIES: queriesWith({ ...titus, tables: {} }) })
      expect(r.code).toBe(1)
      expect(r.result!.failures.join('\n')).toContain('fixed queries')
    })
  })
})

describe('verify-v3 --pubkey', () => {
  let signedBucket = ''
  let key: ReturnType<typeof testKey>
  beforeAll(async () => {
    key = testKey()
    temps.push(key.dir)
    signedBucket = temp()
    const code = await publish(
      ['--lang', 'en', '--list', join(DATA, 'en', 'list.json'), '--originals', join(DATA, 'originals', 'list.json'), '--parts', join(DATA, 'parts'), '--work', temp(), '--bucket-dir', signedBucket, '--sign-key', key.pem],
      {},
      { log: () => {}, error: () => {}, out: () => {} },
    )
    expect(code).toBe(0)
  })
  const against = async (dir: string, extra: string[]) => {
    const server = fakeV3Server(dir)
    try {
      return await run(server.base, [...python, ...extra])
    } finally {
      server.stop()
    }
  }

  test.skipIf(needsPython)('passes on a publication signed by the key, with both readers', async () => {
    const r = await against(signedBucket, ['--pubkey', key.publicHex])
    expect(r.lines.filter((l) => l.startsWith('FAIL'))).toEqual([])
    expect(r.code).toBe(0)
    expect(r.lines.some((l) => l.startsWith('ok   catalog signatures'))).toBe(true)
  })

  test.skipIf(needsPython)('fails on an unsigned publication', async () => {
    const r = await against(bucket, ['--pubkey', key.publicHex])
    expect(r.code).toBe(1)
    expect(r.result!.failures.join(' ')).toContain('catalog signatures')
    expect(r.result!.failures.join(' ')).toContain('signature is not accepted')
  })

  test.skipIf(needsPython)('fails on a publication signed by another key', async () => {
    const other = testKey()
    temps.push(other.dir)
    const r = await against(signedBucket, ['--pubkey', other.publicHex])
    expect(r.code).toBe(1)
    expect(r.result!.failures.join(' ')).toContain('catalog signatures')
  })

  test.skipIf(needsPython)('without --pubkey a signed publication still passes', async () => {
    const r = await against(signedBucket, [])
    expect(r.code).toBe(0)
  })
})
