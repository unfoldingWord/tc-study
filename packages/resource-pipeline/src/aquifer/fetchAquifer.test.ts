import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../../cli/fetch-aquifer'
import { bookOfFile, cutResourceMetadata } from './fetchAquifer'

const SHA = 'a'.repeat(40)
const files: Record<string, string> = {
  'hin/json/01.content.json': '[{"a":1}]',
  'hin/json/56.content.json': '[{"tit":1}]',
  'hin/json/001.content.json': '[{"manual":1}]',
}
let badSize = false
const metadata = '{"resource_metadata":{"title":"T","adaptation_notice":"x"},"scripture_burrito":{"big":"' + 'z'.repeat(40000) + '"}}'
const seen: { url: string; auth: string | null; enc: string | null }[] = []
let server: ReturnType<typeof Bun.serve>
let bases: { api: string; raw: string }

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const u = new URL(req.url)
      seen.push({ url: u.pathname, auth: req.headers.get('authorization'), enc: req.headers.get('accept-encoding') })
      const p = u.pathname
      if (p === '/repos/BibleAquifer/R') return Response.json({ default_branch: 'main' })
      if (p === '/repos/BibleAquifer/R/commits/main') return Response.json({ sha: SHA })
      if (p === `/repos/BibleAquifer/R/git/trees/${SHA}`)
        return Response.json({
          tree: [
            ...Object.entries(files).map(([path, c]) => ({ path, type: 'blob', size: Buffer.byteLength(c) + (badSize ? 1 : 0) })),
            { path: 'hin/metadata.json', type: 'blob', size: metadata.length },
            { path: 'hin/json', type: 'tree' },
          ],
        })
      const m = p.match(new RegExp(`^/BibleAquifer/R/${SHA}/(.+)$`))
      if (m && files[m[1]]) return new Response(files[m[1]])
      if (m && m[1] === 'hin/metadata.json') {
        if (req.headers.get('range') !== 'bytes=0-16383') return new Response('no range', { status: 400 })
        return new Response(metadata.slice(0, 16384), { status: 206 })
      }
      return new Response('no', { status: 404 })
    },
  })
  bases = { api: `http://127.0.0.1:${server.port}`, raw: `http://127.0.0.1:${server.port}` }
})
afterAll(() => server.stop(true))

const run = async (args: string[], token?: string) => {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (l) => out.push(l), error: (l) => err.push(l) }, bases, token)
  return { code, out, err }
}
const tmp = () => mkdtempSync(join(tmpdir(), 'aq-'))

describe('helpers', () => {
  test('book codes', () => {
    expect(bookOfFile('01.content.json')).toBe('gen')
    expect(bookOfFile('56.content.json')).toBe('tit')
    expect(bookOfFile('66.content.json')).toBe('rev')
    expect(bookOfFile('001.content.json')).toBeUndefined()
  })
  test('metadata cut', () => {
    expect(cutResourceMetadata('{\n "resource_metadata": {"a": {"b": 1}},\n "scripture_burrito": {"x"')).toEqual({ a: { b: 1 } })
    expect(() => cutResourceMetadata('{"resource_metadata":{}')).toThrow()
  })
})

describe('fetch-aquifer', () => {
  test('resolves the head commit, downloads pinned, writes manifest', async () => {
    seen.length = 0
    const out = tmp()
    const r = await run(['--repo', 'R', '--lang', 'hin', '--out', out], 'tok')
    expect(r.code).toBe(0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    expect(manifest.commit).toBe(SHA)
    expect(JSON.parse(r.out[0])).toEqual(manifest)
    expect(manifest.files).toHaveLength(3)
    const f = manifest.files.find((x: { path: string }) => x.path === 'hin/json/56.content.json')
    expect(f).toEqual({ path: 'hin/json/56.content.json', size: 11, sha256: createHash('sha256').update(files['hin/json/56.content.json']).digest('hex') })
    expect(readdirSync(join(out, 'json')).sort()).toEqual(['001.content.json', '01.content.json', '56.content.json'])
    expect(JSON.parse(readFileSync(join(out, 'resource_metadata.json'), 'utf8'))).toEqual({ title: 'T', adaptation_notice: 'x' })
    expect(seen.find((s) => s.url.endsWith('/commits/main'))?.auth).toBe('Bearer tok')
    const rawCalls = seen.filter((s) => s.url.startsWith(`/BibleAquifer/R/${SHA}/`))
    expect(rawCalls).toHaveLength(4)
    expect(rawCalls.every((s) => s.enc === 'identity')).toBe(true)
  })
  test('--commit skips the API lookup; anonymous without token', async () => {
    seen.length = 0
    const r = await run(['--repo', 'R', '--lang', 'hin', '--out', tmp(), '--commit', SHA, '--books', 'tit'])
    expect(r.code).toBe(0)
    expect(seen.some((s) => s.url.endsWith('/commits/main'))).toBe(false)
    expect(seen.every((s) => s.auth === null)).toBe(true)
  })
  test('--books filters by code and drops 3-digit names', async () => {
    const out = tmp()
    expect((await run(['--repo', 'R', '--lang', 'hin', '--out', out, '--books', 'gen,tit'])).code).toBe(0)
    expect(readdirSync(join(out, 'json')).sort()).toEqual(['01.content.json', '56.content.json'])
  })
  test('a size mismatch exits 1', async () => {
    badSize = true
    const r = await run(['--repo', 'R', '--lang', 'hin', '--out', tmp()])
    badSize = false
    expect(r.code).toBe(1)
    expect(r.err[0]).toContain('bytes')
  })
  test('bad arguments exit 2', async () => {
    expect((await run(['--repo', 'R'])).code).toBe(2)
    expect((await run(['--bogus', 'x'])).code).toBe(2)
  })
})
