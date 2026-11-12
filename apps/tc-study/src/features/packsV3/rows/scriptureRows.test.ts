import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { memoryStore } from '@bt-synergy/language-pack-client'
import { createPacksV3 } from '../client'
import { buildSample, fakeFetch } from '../testing/sample'
import { origRows, scriptureRows, type Row } from './scriptureRows'

const DATA = join(import.meta.dir, '..', '..', '..', '..', '..', '..', 'packages', 'language-pack-v3', 'spec', 'tests', 'data')

/** The `scripture-usj:` rows the Door43 loader wrote for a resource's book, from the phase 0 test data. */
function door43Rows(resource: string, book: string): Row[] {
  const list = JSON.parse(readFileSync(join(DATA, 'es-419', 'list.json'), 'utf8'))
  const part = list.parts.find((p: { resource: string; book: string; kind: string }) => p.resource === resource && p.book === book && p.kind === 'book')
  const lines = gunzipSync(readFileSync(join(DATA, 'parts', `${part.sha256}.part.gz`))).toString().split('\n').filter(Boolean)
  return lines.map((l) => JSON.parse(l)).filter((r) => r.layer === 'sot').map((r) => ({ key: r.key, value: r.value }))
}

/** The processing timestamps (`timestamp`, `metadata.processingDate`) are the one thing left out of the comparison. */
function withoutStamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutStamps)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'timestamp' && k !== 'processingDate').map(([k, v]) => [k, withoutStamps(v)]))
  }
  return value
}
const noStamp = (rows: Row[]) => new Map(rows.map(({ key, value }) => [key, withoutStamps(value)]))

/** Where two values first differ, as a short path (a failing deep equality of a whole chapter prints too much). */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`)
    if (d) return d
  }
  return null
}

async function reader() {
  const sample = await buildSample()
  const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
  await client.install('es-419', { books: ['tit'] })
  return (await client.open('es-419'))!
}

describe('scripture rows', () => {
  it('es-419 GLT Titus equals the rows Door43 wrote, key by key and value by value', async () => {
    const rows = await scriptureRows(await reader(), 'tit')
    const mine = noStamp(rows.filter((r) => r.key.startsWith('scripture-usj:es-419_gl/es-419/glt:')))
    const theirs = noStamp(door43Rows('es-419_gl/es-419/glt', 'tit'))
    expect([...mine.keys()].sort()).toEqual([...theirs.keys()].sort())
    for (const [key, value] of theirs) expect(`${key} ${firstDiff(mine.get(key), value)}`).toBe(`${key} null`)
  }, 60_000)

  it('gives rows to every text of the book', async () => {
    const rows = await scriptureRows(await reader(), 'tit')
    for (const res of ['es-419_gl/es-419/glt', 'es-419_gl/es-419/gst']) {
      expect(rows.some((r) => r.key === `scripture-usj:${res}:tit`)).toBe(true)
      expect(rows.some((r) => r.key === `scripture-usj:${res}:tit:1`)).toBe(true)
    }
  }, 60_000)

  it('has no rows for a book the language lacks', async () => {
    expect(await scriptureRows(await reader(), 'gen')).toEqual([])
    expect(await origRows(await reader(), 'gen')).toEqual([])
  }, 60_000)

  it('UGNT Titus rows carry strong, lemma and morph on each word', async () => {
    const rows = await origRows(await reader(), 'tit')
    expect(rows.some((r) => r.key === 'scripture-usj:unfoldingWord/el-x-koine/ugnt:tit')).toBe(true)
    const words: Record<string, string>[] = []
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return
      const node = n as { marker?: string; content?: unknown[] }
      if (node.marker === 'w') words.push(node as Record<string, string>)
      node.content?.forEach(walk)
    }
    for (const r of rows.filter((r) => /:tit:\d+$/.test(r.key))) (r.value as { content: { usj: { content: unknown[] } } }).content.usj.content.forEach(walk)
    expect(words.length).toBeGreaterThan(100)
    for (const w of words) {
      expect(w.strong).toBeTruthy()
      expect(w.lemma).toBeTruthy()
      expect(w['x-morph'] ?? w.morph).toBeTruthy()
    }
  }, 60_000)
})
