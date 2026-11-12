import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { memoryStore } from '@bt-synergy/language-pack-client'
import { createPacksV3 } from '../client'
import { buildSample, fakeFetch } from '../testing/sample'
import { helpsRows } from './helpsRows'
import type { Row } from './scriptureRows'

const DATA = join(import.meta.dir, '..', '..', '..', '..', '..', '..', 'packages', 'language-pack-v3', 'spec', 'tests', 'data')

/** The `tn:`, `tq:` or `twl:` rows the Door43 loader and the cache adapter wrote for a resource's book (phase 0 test data). */
function door43Rows(resource: string, book: string): Row[] {
  const list = JSON.parse(readFileSync(join(DATA, 'es-419', 'list.json'), 'utf8'))
  const part = list.parts.find((p: { resource: string; book: string; kind: string }) => p.resource === resource && p.book === book && p.kind === 'book')
  const lines = gunzipSync(readFileSync(join(DATA, 'parts', `${part.sha256}.part.gz`))).toString().split('\n').filter(Boolean)
  return lines.map((l) => JSON.parse(l)).filter((r) => r.layer === 'sot').map((r) => ({ key: r.key, value: r.value }))
}

/** `processingDate` is the one thing left out of the comparison. */
function withoutDate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDate)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'processingDate').map(([k, v]) => [k, withoutDate(v)]))
  }
  return value
}

/** Where two values first differ, as a short path (a failing deep equality of a whole chapter prints too much). */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (typeof a === 'string' && typeof b === 'string' && a !== b) {
    let i = 0
    while (a[i] === b[i]) i++
    return `${path} at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 30), i + 60))} vs ${JSON.stringify(b.slice(Math.max(0, i - 30), i + 60))}`
  }
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)?.slice(0, 160)} vs ${JSON.stringify(b)?.slice(0, 160)}`
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`)
    if (d) return d
  }
  return null
}

let cached: Promise<Row[]> | undefined
function rows(): Promise<Row[]> {
  cached ??= (async () => {
    const sample = await buildSample()
    const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.install('es-419', { books: ['tit'] })
    const reader = (await client.open('es-419'))!
    return helpsRows(reader, 'tit')
  })()
  return cached
}

function expectSameAsDoor43(mine: Row[], resource: string, prefix: string) {
  const mineOf = new Map(mine.filter((r) => r.key.startsWith(`${prefix}:${resource}:`)).map((r) => [r.key, withoutDate(r.value)]))
  const theirs = new Map(door43Rows(resource, 'tit').filter((r) => r.key.startsWith(`${prefix}:`)).map((r) => [r.key, withoutDate(r.value)]))
  expect([...mineOf.keys()].sort()).toEqual([...theirs.keys()].sort())
  for (const [key, value] of theirs) expect(`${key} ${firstDiff(mineOf.get(key), value)}`).toBe(`${key} null`)
}

describe('helps rows', () => {
  it('es-419 tN Titus equals the rows Door43 wrote, introductions included', async () => {
    const mine = await rows()
    expectSameAsDoor43(mine, 'es-419_gl/es-419/tn', 'tn')
    const ch1 = mine.find((r) => r.key === 'tn:es-419_gl/es-419/tn:tit:1')!.value as { content: { notes: { isIntro: boolean; supportReference: string; quote: string; occurrence: string; tags: string }[] } }
    expect(ch1.content.notes.filter((n) => n.isIntro).length).toBe(2)
    expect(ch1.content.notes.some((n) => n.supportReference.startsWith('rc://*/ta/man/') && n.quote !== '' && n.occurrence === '1')).toBe(true)
  }, 60_000)

  it('es-419 tQ Titus equals the rows Door43 wrote', async () => {
    expectSameAsDoor43(await rows(), 'es-419_gl/es-419/tq', 'tq')
  }, 60_000)

  it('es-419 tWL Titus equals the row Door43 wrote, with the category of each link', async () => {
    const mine = await rows()
    expectSameAsDoor43(mine, 'es-419_gl/es-419/twl', 'twl')
    const book = mine.find((r) => r.key === 'twl:es-419_gl/es-419/twl:tit')!.value as { links: { twLink: string; articlePath: string }[] }
    for (const l of book.links) expect(l.twLink).toMatch(/^rc:\/\/\*\/tw\/dict\/bible\/(kt|names|other)\/[^/]+$/)
  }, 60_000)

  it('has no rows for a book the language lacks', async () => {
    const sample = await buildSample()
    const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.install('es-419', { books: ['tit'] })
    expect(await helpsRows((await client.open('es-419'))!, 'gen')).toEqual([])
  }, 60_000)
})
