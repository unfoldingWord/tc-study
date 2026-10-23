import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { VOLATILE_FIELDS, partPath, readPart, stableJson, stripVolatile, writePart, type PartRow } from './partFile'

const ROWS: PartRow[] = [
  { layer: 'text', key: 'helps-text:ta-title:unfoldingWord/en/ta@v1:translate/figs-metaphor', value: { title: 'Metaphor' } },
  { layer: 'sot', key: 'tn:unfoldingWord/en/tn:rut:1', value: { b: 2, a: 1 } },
  { layer: 'align', key: 'helps-align:unfoldingWord/en/tn@s:unfoldingWord/hbo/uhb@g1+2:ult:rut:1', value: { rows: [1, 2] } },
  { layer: 'prepared', key: 'prepared:full:unfoldingWord/en/ult:rut:1', value: { verses: ['a'] } },
  { layer: 'quote', key: 'helps-quote:unfoldingWord/en/tn@s:unfoldingWord/hbo/uhb@g1+2:rut:1', value: { q: 1 } },
  { layer: 'sot', key: 'tn:unfoldingWord/en/tn:rut', value: { chapters: [1] } },
]

describe('a part file', () => {
  test('has the same sha256 whatever order its rows come in', async () => {
    const a = await writePart(ROWS)
    const b = await writePart([...ROWS].reverse())
    expect(b.sha256).toBe(a.sha256)
    expect(a.rows).toBe(ROWS.length)
  })

  test('two writes of the same rows give the same bytes, and sha256 is the bytes’ own', async () => {
    const a = await writePart(ROWS)
    const b = await writePart(ROWS.map((r) => ({ ...r })))
    expect(Buffer.from(b.bytes).equals(Buffer.from(a.bytes))).toBe(true)
    expect(a.sha256).toBe(createHash('sha256').update(a.bytes).digest('hex'))
  })

  test('ignores volatile fields at the top level and nested in the value', async () => {
    const dated: PartRow[] = ROWS.map((r, i) => ({
      ...r,
      value: { ...(r.value as object), timestamp: 1000 + i, expiresAt: '2030-01-01T00:00:00.000Z', nested: { cachedAt: i, keep: true, list: [{ processingDate: 'x', v: 1 }] } },
    }))
    const plain: PartRow[] = ROWS.map((r) => ({ ...r, value: { ...(r.value as object), nested: { keep: true, list: [{ v: 1 }] } } }))
    expect((await writePart(dated)).sha256).toBe((await writePart(plain)).sha256)
  })

  test('is read back as the stripped rows, sorted by layer (sot, prepared, quote, align, text) then key', async () => {
    const dated = ROWS.map((r) => ({ ...r, value: { ...(r.value as object), timestamp: 5 } }))
    const back = await readPart((await writePart(dated)).bytes)
    expect(back.map((r) => [r.layer, r.key])).toEqual([
      ['sot', 'tn:unfoldingWord/en/tn:rut'],
      ['sot', 'tn:unfoldingWord/en/tn:rut:1'],
      ['prepared', 'prepared:full:unfoldingWord/en/ult:rut:1'],
      ['quote', 'helps-quote:unfoldingWord/en/tn@s:unfoldingWord/hbo/uhb@g1+2:rut:1'],
      ['align', 'helps-align:unfoldingWord/en/tn@s:unfoldingWord/hbo/uhb@g1+2:ult:rut:1'],
      ['text', 'helps-text:ta-title:unfoldingWord/en/ta@v1:translate/figs-metaphor'],
    ])
    expect(back[1].value).toEqual({ a: 1, b: 2 })
    expect(back.every((r) => !('timestamp' in (r.value as object)))).toBe(true)
  })

  test('writes value keys in a stable order', async () => {
    const a = await writePart([{ layer: 'sot', key: 'k', value: { b: { y: 1, x: 2 }, a: 1 } }])
    const b = await writePart([{ layer: 'sot', key: 'k', value: { a: 1, b: { x: 2, y: 1 } } }])
    expect(b.sha256).toBe(a.sha256)
  })

  test('is gzip with no file name, mtime 0 and a fixed OS byte', async () => {
    const { bytes } = await writePart(ROWS)
    expect([...bytes.slice(0, 4)]).toEqual([0x1f, 0x8b, 8, 0]) // magic, deflate, no FNAME/FEXTRA/FCOMMENT
    expect([...bytes.slice(4, 8)]).toEqual([0, 0, 0, 0]) // mtime
    expect(bytes[9]).toBe(255) // OS "unknown", so Windows and Linux builds agree
  })

  test('a fixed set of rows always gives the same bytes (golden: any compressor drift fails here)', async () => {
    // Same answer under Bun and Node, Linux and Windows: the hash names the file on the server.
    const { bytes, sha256 } = await writePart(ROWS)
    expect(sha256).toBe('427f235276f9d4e60ba06edbda20e323b6496c1ce68f31b2c8dc14b38bd831e7')
    expect(bytes.length).toBe(242)
  })

  test('refuses receipts and a key given twice in one layer', async () => {
    await expect(writePart([{ layer: 'receipt', key: 'resource:a/b/c', value: {} }])).rejects.toThrow()
    await expect(writePart([ROWS[1], { ...ROWS[1], value: {} }])).rejects.toThrow()
  })

  test('lives at parts/<sha256>.part.gz', () => {
    expect(partPath('ab12')).toBe('parts/ab12.part.gz')
  })
})

describe('stripVolatile', () => {
  test('removes the six volatile fields and copies the rest', () => {
    expect([...VOLATILE_FIELDS].sort()).toEqual(['cachedAt', 'catalogedAt', 'downloadCompletedAt', 'expiresAt', 'processingDate', 'timestamp'])
    const value = { a: 1, timestamp: 2, inner: [{ catalogedAt: 3, b: 4 }], downloadCompletedAt: 5 }
    const out = stripVolatile(value)
    expect(out).toEqual({ a: 1, inner: [{ b: 4 }] })
    expect(value.timestamp).toBe(2)
  })
})

describe('stableJson', () => {
  test('honours toJSON as JSON.stringify does (a Date is its ISO text)', () => {
    const at = new Date('2026-01-01T00:00:00.000Z')
    expect(stableJson({ at })).toBe(JSON.stringify({ at }))
    expect(stableJson({ v: { toJSON: () => ({ b: 1, a: 2 }) } })).toBe('{"v":{"a":2,"b":1}}')
    expect(stripVolatile({ at })).toEqual({ at: '2026-01-01T00:00:00.000Z' })
  })
})
