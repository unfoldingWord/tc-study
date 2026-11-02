import { describe, expect, test } from 'bun:test'
import { type BuiltSegment, buildCatalog, builtSegment } from './build/catalog'
import { origSegment, extractOrig } from './build/orig'
import { type CborValue, decodeCbor, encodeDeterministic } from './codec/cbor'
import { hex, readHeader, readSegment } from './codec/container'
import { FormatError } from './codec/errors'
import type { About } from './model'
import { partsSource } from './node/partsSource'
import { BOOK_TABLES } from './read/book'
import { CATALOG_TABLES, catalogView } from './read/catalog'
import { readTransfer, writeTransfer } from './transfer'

// The data is a sample of real files (spec/tests/data/README.md) and the container examples (spec/tests/container/).
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', 'spec', 'tests', 'data')
const minimalBytes = new Uint8Array(await Bun.file(new URL('../spec/tests/container/minimal.seg', import.meta.url)).arrayBuffer())

const MADE = '2026-11-01T10:00:00Z'
const BY = 'bt-synergy test 0.1.0'
const about: About = { format: '3.0', catalog: 'es-419', publisher: 'unfoldingWord', origin: 'published', revision: 4, built: MADE, builder: BY }

const fingerprint = (n: number): string => n.toString(16).padStart(64, '0')
const bytesOfHex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
const sha256Hex = async (data: Uint8Array): Promise<string> => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)))

/** Case 1 of the conformance suite: Titus 1:1 in a book segment. */
const minimal: BuiltSegment = await (async () => {
  const { seg, id } = await readSegment(minimalBytes, { known: BOOK_TABLES })
  return { seg, bytes: minimalBytes, id, inputs: fingerprint(1) }
})()

/** The Titus original: a segment large enough to cut inside. It stands for case 4 (see the report of Task 11). */
const orig: BuiltSegment = await (async () => {
  const src = await partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  return builtSegment(origSegment(await extractOrig(src, 'tit')), fingerprint(2))
})()

const needs = (s: BuiltSegment): string[] => (s.seg.h.class === 'book' ? ['orig:tit'] : [])
/** A small catalog over the two segments: the units `book:tit` and `orig:tit`. */
const catalog = await buildCatalog({ about, resources: [], segments: [minimal, orig], needs })

const complementBytes = new TextEncoder().encode('a classifier, opaque to the format')
const complement = { id: await sha256Hex(complementBytes), bytes: complementBytes, kind: 'complement' as const }

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof FormatError) return error.code
    throw error
  }
  return 'none'
}

// Files made apart from writeTransfer, to have the defects it would not write.

type Spec = { id: string; kind?: 'segment' | 'complement'; class?: string; bytes: Uint8Array; size?: number }

/** Index bytes and entry bytes in a transfer file. */
function assemble(index: Uint8Array, entries: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(12 + index.length + entries.reduce((sum, e) => sum + e.length, 0))
  out.set([0x89, 0x54, 0x4c, 0x50, 3, 0, 2, 0])
  new DataView(out.buffer).setUint32(8, index.length)
  out.set(index, 12)
  let at = 12 + index.length
  for (const entry of entries) {
    out.set(entry, at)
    at += entry.length
  }
  return out
}

/** The first `catalogs` specs are the catalogs; `tweak` may change the index before it is encoded. */
function craft(specs: Spec[], tweak: (index: Record<string, any>) => void = () => {}, catalogs = 1): Uint8Array {
  let offset = 0
  const entries = specs.map((spec) => {
    const size = spec.size ?? spec.bytes.length
    const entry: Record<string, any> = { id: bytesOfHex(spec.id), kind: spec.kind ?? 'segment', offset, size }
    if (spec.class !== undefined) entry.class = spec.class
    offset += size
    return entry
  })
  const index: Record<string, any> = { mode: 'full', catalogs: specs.slice(0, catalogs).map((spec) => bytesOfHex(spec.id)), entries, made: MADE, by: BY }
  tweak(index)
  return assemble(encodeDeterministic(index as CborValue), specs.map((spec) => spec.bytes))
}

const specOf = (built: BuiltSegment): Spec => ({ id: built.id, class: built.seg.h.class, bytes: built.bytes })
const CATALOG = specOf(catalog)
const MINIMAL = specOf(minimal)
const ORIG = specOf(orig)
const COMPLEMENT: Spec = { id: complement.id, kind: 'complement', bytes: complementBytes }

/** A copy of `bytes` with the byte at `at` changed. */
const flipped = (bytes: Uint8Array, at: number): Uint8Array => {
  const out = bytes.slice()
  out[at] ^= 0xff
  return out
}

/** A copy of a segment file whose deflate stream cannot be inflated: the first block is of the reserved type 3 (`E_INFLATE`). */
const damaged = (bytes: Uint8Array): Uint8Array => {
  const out = bytes.slice()
  out[readHeader(bytes).headerEnd] = 0x07
  return out
}

/** An obs segment with two tables no reader knows: `future-x` (required, version 9) and `future-y` (optional). */
const futureObs = await builtSegment({ h: { class: 'obs', v: 1, tables: { 'future-x': [9, true], 'future-y': [3, false] }, lang: 'es-419' }, t: { 'future-x': [], 'future-y': [] } }, fingerprint(6))
/** An obs segment with an optional table no reader knows and nothing else. */
const optionalObs = await builtSegment({ h: { class: 'obs', v: 1, tables: { 'future-y': [3, false] }, lang: 'es-419' }, t: { 'future-y': [] } }, fingerprint(7))
/** The catalog with these tables added (or changed, for a table it has) in its header: its own tables stay as they are. */
const catalogWith = (tables: Record<string, [number, boolean]>, t: Record<string, CborValue>, n: number): Promise<BuiltSegment> =>
  builtSegment({ h: { ...catalog.seg.h, tables: { ...catalog.seg.h.tables, ...tables } }, t: { ...catalog.seg.t, ...t } }, fingerprint(n))

const full = () => writeTransfer({ mode: 'full', catalogs: [catalog], entries: [minimal, orig, complement], made: MADE, by: BY })

describe('writeTransfer', () => {
  test('the first 8 bytes are those of a segment file with kind 2, then I, the index and the entries', () => {
    const bytes = full()
    expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x54, 0x4c, 0x50, 3, 0, 2, 0])
    expect(Array.from(minimal.bytes.subarray(0, 8))).toEqual([0x89, 0x54, 0x4c, 0x50, 3, 0, 1, 0])
    const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8)
    const index = decodeCbor(bytes.subarray(12, 12 + length)) as Record<string, any>
    // The index is deterministic CBOR: encoding what was decoded gives the same bytes.
    expect(encodeDeterministic(index)).toEqual(bytes.subarray(12, 12 + length))
    expect(Object.keys(index).sort()).toEqual(['by', 'catalogs', 'entries', 'made', 'mode'])
    expect(index.mode).toBe('full')
    expect(index.made).toBe(MADE)
    expect(index.by).toBe(BY)
    expect(index.catalogs).toEqual([bytesOfHex(catalog.id)])

    // The entries: catalogs first, then in the order given; offsets count from 12 + I; no gaps; the file ends with the last.
    const sizes = [catalog.bytes.length, minimal.bytes.length, orig.bytes.length, complementBytes.length]
    expect(index.entries.map((e: any) => hex(e.id))).toEqual([catalog.id, minimal.id, orig.id, complement.id])
    expect(index.entries.map((e: any) => e.kind)).toEqual(['segment', 'segment', 'segment', 'complement'])
    expect(index.entries.map((e: any) => e.class)).toEqual(['catalog', 'book', 'orig', undefined])
    expect(index.entries.map((e: any) => e.size)).toEqual(sizes)
    expect(index.entries.map((e: any) => e.offset)).toEqual([0, sizes[0], sizes[0] + sizes[1], sizes[0] + sizes[1] + sizes[2]])
    expect(bytes.length).toBe(12 + length + sizes.reduce((a, b) => a + b))
    expect(bytes.subarray(12 + length, 12 + length + sizes[0])).toEqual(catalog.bytes)
    expect(bytes.subarray(bytes.length - sizes[3])).toEqual(complementBytes)
  })

  test('the same files give the same bytes', () => {
    expect(full()).toEqual(full())
  })

  test('catalogs come first, in the order given, whatever the order of the other entries', async () => {
    const other = await buildCatalog({ about: { ...about, catalog: 'common' }, resources: [], segments: [orig] })
    const bytes = writeTransfer({ mode: 'full', catalogs: [other, catalog], entries: [complement, orig, minimal], made: MADE, by: BY })
    const length = new DataView(bytes.buffer).getUint32(8)
    const index = decodeCbor(bytes.subarray(12, 12 + length)) as Record<string, any>
    expect(index.entries.map((e: any) => hex(e.id))).toEqual([other.id, catalog.id, complement.id, orig.id, minimal.id])
    expect(index.catalogs.map(hex)).toEqual([other.id, catalog.id])
  })

  test('an update file has its base', async () => {
    const bytes = writeTransfer({ mode: 'update', catalogs: [catalog], entries: [minimal], base: [['es-419', 3], ['common', 1]], made: MADE, by: BY })
    const length = new DataView(bytes.buffer).getUint32(8)
    const index = decodeCbor(bytes.subarray(12, 12 + length)) as Record<string, any>
    expect(index.mode).toBe('update')
    expect(index.base).toEqual([['es-419', 3], ['common', 1]])
  })

  test('a file may have only its catalog', async () => {
    const bytes = writeTransfer({ mode: 'full', catalogs: [catalog], entries: [], made: MADE, by: BY })
    const read = await readTransfer(bytes)
    expect(read.entries.map((e) => e.status)).toEqual(['ok'])
  })

  describe('throws Error for', () => {
    const base = { mode: 'full' as const, catalogs: [catalog], entries: [minimal], made: MADE, by: BY }
    test('an update without base, and a full file with one', () => {
      expect(() => writeTransfer({ ...base, mode: 'update' })).toThrow('base')
      expect(() => writeTransfer({ ...base, base: [['es-419', 1]] })).toThrow('base')
    })
    test('a mode that is neither', () => {
      expect(() => writeTransfer({ ...base, mode: 'partial' as never })).toThrow('mode')
    })
    test('a base that is not a list of [catalog, revision]', () => {
      expect(() => writeTransfer({ ...base, mode: 'update', base: [['es-419', -1]] })).toThrow('base')
      expect(() => writeTransfer({ ...base, mode: 'update', base: [[1, 1] as never] })).toThrow('base')
      expect(() => writeTransfer({ ...base, mode: 'update', base: [['a', 1, 2] as never] })).toThrow('base')
    })
    test('no catalog', () => {
      expect(() => writeTransfer({ ...base, catalogs: [] })).toThrow('catalog')
    })
    test('a catalog that is not of class catalog, and a catalog among the entries', () => {
      expect(() => writeTransfer({ ...base, catalogs: [minimal] })).toThrow('not a catalog')
      expect(() => writeTransfer({ ...base, entries: [catalog] })).toThrow('catalogs')
    })
    test('an id twice', () => {
      expect(() => writeTransfer({ ...base, entries: [minimal, minimal] })).toThrow('twice')
      expect(() => writeTransfer({ ...base, catalogs: [catalog, catalog] })).toThrow('twice')
      expect(() => writeTransfer({ ...base, entries: [{ ...complement, id: minimal.id }, minimal] })).toThrow('twice')
    })
    test('an id that is not 64 lowercase hex digits', () => {
      expect(() => writeTransfer({ ...base, entries: [{ ...complement, id: 'abc' }] })).toThrow('id')
      expect(() => writeTransfer({ ...base, entries: [{ ...complement, id: complement.id.toUpperCase() }] })).toThrow('id')
    })
    test('a segment whose file has another id', () => {
      expect(() => writeTransfer({ ...base, entries: [{ ...minimal, id: orig.id }] })).toThrow('another id')
    })
    test('made or by that is not text', () => {
      expect(() => writeTransfer({ ...base, made: undefined as never })).toThrow('made')
      expect(() => writeTransfer({ ...base, by: 3 as never })).toThrow('by')
    })
  })

  test('a complement carries the id it is given: the sender vouches, the receiver checks', async () => {
    const bytes = writeTransfer({ mode: 'full', catalogs: [catalog], entries: [{ id: fingerprint(77), bytes: complementBytes, kind: 'complement' }], made: MADE, by: BY })
    const read = await readTransfer(bytes)
    expect(read.entries[1].id).toBe(fingerprint(77))
    expect(read.entries[1].status).toBe('E_ID')
  })
})

describe('readTransfer', () => {
  test('a full file: the index, every entry ok with its bytes, and nothing missing', async () => {
    const bytes = full()
    const read = await readTransfer(bytes)
    const sizes = [catalog.bytes.length, minimal.bytes.length, orig.bytes.length, complementBytes.length]
    expect(read.index).toEqual({
      mode: 'full',
      catalogs: [catalog.id],
      entries: [
        { id: catalog.id, kind: 'segment', class: 'catalog', offset: 0, size: sizes[0] },
        { id: minimal.id, kind: 'segment', class: 'book', offset: sizes[0], size: sizes[1] },
        { id: orig.id, kind: 'segment', class: 'orig', offset: sizes[0] + sizes[1], size: sizes[2] },
        { id: complement.id, kind: 'complement', offset: sizes[0] + sizes[1] + sizes[2], size: sizes[3] },
      ],
      made: MADE,
      by: BY,
      extra: {},
    })
    expect(read.entries.map((e) => [e.id, e.kind, e.class, e.status])).toEqual([
      [catalog.id, 'segment', 'catalog', 'ok'],
      [minimal.id, 'segment', 'book', 'ok'],
      [orig.id, 'segment', 'orig', 'ok'],
      [complement.id, 'complement', undefined, 'ok'],
    ])
    expect(read.entries[0].bytes).toEqual(catalog.bytes)
    expect(read.entries[1].bytes).toEqual(minimal.bytes)
    expect(read.entries[2].bytes).toEqual(orig.bytes)
    expect(read.entries[3].bytes).toEqual(complementBytes)
    expect(read.missing).toEqual([])
    // The catalog inside reads as a catalog, and lists the two segments.
    const inside = await readSegment(read.entries[0].bytes!, { known: CATALOG_TABLES, expectedId: catalog.id })
    expect(catalogView(inside.seg).units.map((u) => u.id)).toEqual(['book:tit', 'orig:tit'])
  })

  test('an update file: the base is in the index', async () => {
    const bytes = writeTransfer({ mode: 'update', catalogs: [catalog], entries: [minimal], base: [['es-419', 3]], made: MADE, by: BY })
    const read = await readTransfer(bytes)
    expect(read.index.mode).toBe('update')
    expect(read.index.base).toEqual([['es-419', 3]])
    expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok'])
  })

  test('the entries are views of the file, and the file is not changed', async () => {
    const bytes = full()
    const copy = bytes.slice()
    const read = await readTransfer(bytes)
    expect(read.entries[1].bytes!.buffer).toBe(bytes.buffer)
    expect(bytes).toEqual(copy)
  })

  test('keys of the index it does not know are kept, a made and a by may be missing', async () => {
    const bytes = craft([CATALOG, MINIMAL], (index) => {
      index.future = { x: [1, 'a'] }
      delete index.made
      delete index.by
    })
    const read = await readTransfer(bytes)
    expect(read.index.extra).toEqual({ future: { x: [1, 'a'] } })
    expect(read.index.made).toBeUndefined()
    expect(read.index.by).toBeUndefined()
    expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok'])
  })

  test('a segment entry without class is fine; its class is the segment’s own', async () => {
    const read = await readTransfer(craft([CATALOG, { ...MINIMAL, class: undefined }]))
    expect(read.entries[1].class).toBeUndefined()
    expect(read.entries[1].status).toBe('ok')
  })

  describe('rejects the whole file with', () => {
    test('E_HEADER: an integer outside -(2^53 - 1) .. 2^53 - 1 in a key of the index it does not know', async () => {
      // The index of a file with a key "zz" holding 0 (0x62 0x7a 0x7a 0x00), the 0 replaced by the bytes of the integer.
      const good = craft([CATALOG, MINIMAL], (index) => void (index.zz = 0))
      const length = new DataView(good.buffer).getUint32(8)
      const index = good.subarray(12, 12 + length)
      const at = index.findIndex((_, i) => index[i] === 0x62 && index[i + 1] === 0x7a && index[i + 2] === 0x7a && index[i + 3] === 0x00)
      expect(at).toBeGreaterThan(0)
      const withValue = (value: number[]) => assemble(Uint8Array.from([...index.subarray(0, at + 3), ...value, ...index.subarray(at + 4)]), [CATALOG.bytes, MINIMAL.bytes])
      expect(await codeOf(readTransfer(withValue([0x1b, 0x10, 0, 0, 0, 0, 0, 0, 0])))).toBe('E_HEADER') // 2^60
      expect(await codeOf(readTransfer(withValue([0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])))).toBe('E_HEADER') // -2^53
      expect((await readTransfer(withValue([0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe]))).index.extra).toEqual({ zz: -(2 ** 53 - 1) })
    })

    test('E_MAGIC, E_VERSION and E_KIND, in the order of the container', async () => {
      const bytes = full()
      expect(await codeOf(readTransfer(flipped(bytes, 0)))).toBe('E_MAGIC')
      expect(await codeOf(readTransfer(Uint8Array.from([0x89, 0x54, 0x4c, 0x51])))).toBe('E_MAGIC')
      const version = bytes.slice()
      version[4] = 2
      expect(await codeOf(readTransfer(version))).toBe('E_VERSION')
      // A segment file (kind 1) and a kind that does not exist; the kind is known from byte 6, before the file is complete.
      expect(await codeOf(readTransfer(minimal.bytes))).toBe('E_KIND')
      expect(await codeOf(readTransfer(minimal.bytes.subarray(0, 8)))).toBe('E_KIND')
      const kind = bytes.slice()
      kind[6] = 3
      expect(await codeOf(readTransfer(kind))).toBe('E_KIND')
      // The first defect wins.
      const two = bytes.slice()
      two[4] = 9
      two[6] = 9
      expect(await codeOf(readTransfer(two))).toBe('E_VERSION')
    })

    test('E_TRUNCATED when the file ends inside the first 12 bytes or inside the index', async () => {
      const bytes = full()
      const length = new DataView(bytes.buffer).getUint32(8)
      for (const cut of [0, 3, 4, 5, 7, 8, 11, 12, 12 + 1, 12 + length - 1]) {
        expect(await codeOf(readTransfer(bytes.subarray(0, cut)))).toBe('E_TRUNCATED')
      }
    })

    test('E_TRUNCATED when the file ends before the end of its catalog', async () => {
      const bytes = full()
      const length = new DataView(bytes.buffer).getUint32(8)
      const catalogEnd = 12 + length + catalog.bytes.length
      for (const cut of [12 + length, 12 + length + 1, catalogEnd - 1]) {
        expect(await codeOf(readTransfer(bytes.subarray(0, cut)))).toBe('E_TRUNCATED')
      }
      // At the end of the catalog it is a file cut between entries, and not rejected.
      expect((await readTransfer(bytes.subarray(0, catalogEnd))).missing).toEqual([minimal.id, orig.id, complement.id])
    })

    test('E_TRUNCATED when the index names a catalog beyond the end of the file', async () => {
      const bytes = craft([{ ...CATALOG, size: CATALOG.bytes.length + 1000 }, MINIMAL])
      expect(await codeOf(readTransfer(bytes))).toBe('E_TRUNCATED')
      // A catalog after the first is a catalog too.
      const second = await buildCatalog({ about: { ...about, catalog: 'common' }, resources: [], segments: [orig] })
      const two = craft([CATALOG, { ...specOf(second), size: second.bytes.length + 1 }], undefined, 2)
      expect(await codeOf(readTransfer(two))).toBe('E_TRUNCATED')
    })

    test('E_TRAILING when bytes follow the last entry of a complete file', async () => {
      const bytes = full()
      const longer = new Uint8Array(bytes.length + 1)
      longer.set(bytes)
      expect(await codeOf(readTransfer(longer))).toBe('E_TRAILING')
      // Bytes after the catalog, in a file that is only its catalog.
      const only = writeTransfer({ mode: 'full', catalogs: [catalog], entries: [], made: MADE, by: BY })
      const trailing = new Uint8Array(only.length + 5)
      trailing.set(only)
      expect(await codeOf(readTransfer(trailing))).toBe('E_TRAILING')
    })

    test('E_LIMIT when the index is nested deeper than 64 levels', async () => {
      const deep = new Uint8Array(71).fill(0x81)
      deep[70] = 0
      expect(await codeOf(readTransfer(assemble(deep, [])))).toBe('E_LIMIT')
    })

    const header: [string, (index: Record<string, any>) => void][] = [
      ['an index that is not a map', () => {}],
      ['no mode', (i) => void delete i.mode],
      ['a mode that is neither full nor update', (i) => void (i.mode = 'partial')],
      ['a mode that is a number', (i) => void (i.mode = 1)],
      ['no catalogs', (i) => void delete i.catalogs],
      ['an empty list of catalogs', (i) => void (i.catalogs = [])],
      ['catalogs that is not a list', (i) => void (i.catalogs = bytesOfHex(CATALOG.id))],
      ['a catalog id of 31 bytes', (i) => void (i.catalogs = [new Uint8Array(31)])],
      ['a catalog id that is text', (i) => void (i.catalogs = [CATALOG.id])],
      ['a catalog twice in catalogs', (i) => void (i.catalogs = [bytesOfHex(CATALOG.id), bytesOfHex(CATALOG.id)])],
      ['a catalog that is not among the entries', (i) => void (i.catalogs = [bytesOfHex(fingerprint(5))])],
      ['a catalog that is not among the first entries', (i) => void (i.catalogs = [bytesOfHex(MINIMAL.id)])],
      ['a catalog entry that is a complement', (i) => void (i.entries[0].kind = 'complement')],
      ['a catalog entry of another class', (i) => void (i.entries[0].class = 'book')],
      ['a catalog entry without class', (i) => void delete i.entries[0].class],
      ['no entries', (i) => void delete i.entries],
      ['an empty list of entries', (i) => void (i.entries = [])],
      ['entries that is not a list', (i) => void (i.entries = {})],
      ['an entry that is not a map', (i) => void (i.entries[1] = 5)],
      ['an entry id of 33 bytes', (i) => void (i.entries[1].id = new Uint8Array(33))],
      ['an entry without id', (i) => void delete i.entries[1].id],
      ['an entry id twice', (i) => void (i.entries[1].id = i.entries[0].id)],
      ['an entry kind that is neither segment nor complement', (i) => void (i.entries[1].kind = 'file')],
      ['an entry without kind', (i) => void delete i.entries[1].kind],
      ['a class that is not a class', (i) => void (i.entries[1].class = 'video')],
      ['a class that is not text', (i) => void (i.entries[1].class = 4)],
      ['a complement with a class', (i) => void ((i.entries[1].kind = 'complement'), (i.entries[1].class = 'book'))],
      ['an offset that is text', (i) => void (i.entries[1].offset = '0')],
      ['an offset with a gap', (i) => void (i.entries[1].offset += 1)],
      ['an offset with an overlap', (i) => void (i.entries[1].offset -= 1)],
      ['a first offset that is not 0', (i) => void (i.entries[0].offset = 1)],
      ['offsets out of order', (i) => void ([i.entries[0].offset, i.entries[1].offset] = [i.entries[1].offset, i.entries[0].offset])],
      ['an entry without size', (i) => void delete i.entries[1].size],
      ['a size that is text', (i) => void (i.entries[1].size = '10')],
      ['base that is not a list', (i) => void (i.base = 'es-419')],
      ['a base item that is not [catalog, revision]', (i) => void (i.base = [['es-419']])],
      ['a base revision that is text', (i) => void (i.base = [['es-419', '3']])],
      ['a made that is not text', (i) => void (i.made = 3)],
      ['a by that is not text', (i) => void (i.by = [])],
    ]
    for (const [name, change] of header) {
      test(`E_HEADER: ${name}`, async () => {
        const bytes =
          name === 'an index that is not a map'
            ? assemble(encodeDeterministic([1, 2] as CborValue), [])
            : craft([CATALOG, MINIMAL], change)
        expect(await codeOf(readTransfer(bytes))).toBe('E_HEADER')
      })
    }

    test('E_HEADER: an index that is a byte string, a number or text', async () => {
      for (const value of [new Uint8Array(3), 7, 'index'] as CborValue[]) {
        expect(await codeOf(readTransfer(assemble(encodeDeterministic(value), [])))).toBe('E_HEADER')
      }
    })

    test('E_HEADER: an index that is not CBOR, or has bytes after the map', async () => {
      expect(await codeOf(readTransfer(assemble(Uint8Array.from([0xff, 0xff]), [])))).toBe('E_HEADER')
      expect(await codeOf(readTransfer(assemble(Uint8Array.from([...encodeDeterministic({}), 0]), [])))).toBe('E_HEADER')
    })

    test('E_BODY: a catalog whose own header class is not catalog, before its tables and after its id', async () => {
      // The index says class catalog; the file is a book (its required tables are not those of a catalog: E_TABLE without the check),
      // an obs with only an optional table no reader knows (it would be read as a catalog), and an orig.
      const asCatalog = (built: BuiltSegment): Spec => ({ id: built.id, class: 'catalog', bytes: built.bytes })
      for (const other of [minimal, optionalObs, orig]) {
        expect(await codeOf(readTransfer(craft([asCatalog(other), COMPLEMENT])))).toBe('E_BODY')
      }
      // Its id comes first, then the class.
      expect(await codeOf(readTransfer(craft([{ ...asCatalog(minimal), id: fingerprint(3) }, ORIG])))).toBe('E_ID')
      // Only the catalogs are held to it: any other entry may be of any class its own header says.
      const read = await readTransfer(craft([CATALOG, MINIMAL, ORIG]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'ok'])
      // A second catalog is a catalog too.
      const second = await buildCatalog({ about: { ...about, catalog: 'common' }, resources: [], segments: [orig] })
      expect(await codeOf(readTransfer(craft([CATALOG, specOf(second), ORIG], undefined, 2)))).toBe('none')
      expect(await codeOf(readTransfer(craft([CATALOG, asCatalog(minimal), ORIG], undefined, 2)))).toBe('E_BODY')
    })

    test('the status of a catalog that is not whole: its own error, nothing else is returned', async () => {
      // A catalog with another id in the index, with the body changed, and one that is not a segment file at all.
      const wrongId = craft([{ ...CATALOG, id: fingerprint(3) }, MINIMAL])
      expect(await codeOf(readTransfer(wrongId))).toBe('E_ID')
      expect(await codeOf(readTransfer(craft([{ ...CATALOG, bytes: damaged(CATALOG.bytes) }, MINIMAL])))).toBe('E_INFLATE')
      expect(await codeOf(readTransfer(craft([{ ...CATALOG, bytes: new Uint8Array(40).fill(7) }, MINIMAL])))).toBe('E_MAGIC')
    })
  })

  describe('a file cut short keeps the entries that are whole', () => {
    test('case 10: a cut inside the original lists it as missing, and the catalog and the book are ok', async () => {
      const bytes = writeTransfer({ mode: 'full', catalogs: [catalog], entries: [minimal, orig], made: MADE, by: BY })
      const origStart = bytes.length - orig.bytes.length
      expect(orig.bytes.length).toBeGreaterThan(1000)
      for (const cut of [origStart + 1, origStart + Math.floor(orig.bytes.length / 2), bytes.length - 1]) {
        const read = await readTransfer(bytes.subarray(0, cut))
        expect(read.entries.map((e) => [e.id, e.status])).toEqual([
          [catalog.id, 'ok'],
          [minimal.id, 'ok'],
          [orig.id, 'missing'],
        ])
        expect(read.missing).toEqual([orig.id])
        expect(read.entries[0].bytes).toEqual(catalog.bytes)
        expect(read.entries[1].bytes).toEqual(minimal.bytes)
        expect(read.entries[2].bytes).toBeUndefined()
        expect(read.index.entries).toHaveLength(3)
      }
      // The same file, whole.
      expect((await readTransfer(bytes)).missing).toEqual([])
    })

    test('a cut inside the third entry keeps the first two and lists the third and the later ones as missing', async () => {
      const bytes = full()
      const third = bytes.length - complementBytes.length - orig.bytes.length
      const read = await readTransfer(bytes.subarray(0, third + 10))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'missing', 'missing'])
      expect(read.missing).toEqual([orig.id, complement.id])
      expect(read.entries.filter((e) => e.status === 'ok').map((e) => e.id)).toEqual([catalog.id, minimal.id])
    })

    test('a cut exactly between two entries loses only the later ones', async () => {
      const bytes = full()
      const read = await readTransfer(bytes.subarray(0, bytes.length - complementBytes.length))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'ok', 'missing'])
      expect(read.missing).toEqual([complement.id])
    })

    test('an index that names an entry beyond the end of the file: missing when it is not a catalog', async () => {
      const bytes = craft([CATALOG, MINIMAL, { ...ORIG, size: ORIG.bytes.length + 1000 }, COMPLEMENT])
      const read = await readTransfer(bytes)
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'missing', 'missing'])
      expect(read.missing).toEqual([orig.id, complement.id])
    })
  })

  describe('an entry that fails loses only itself', () => {
    test('a deflate stream that cannot be inflated: E_INFLATE, and the others are ok', async () => {
      const read = await readTransfer(craft([CATALOG, MINIMAL, { ...ORIG, bytes: damaged(ORIG.bytes) }, COMPLEMENT]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'E_INFLATE', 'ok'])
      expect(read.entries[2].bytes).toBeUndefined()
      expect(read.missing).toEqual([])
    })

    test('a body that is not the one of the id the file header and the index agree on: E_ID', async () => {
      // The id is changed in the file header and in the index alike (as bad-id.seg does for a file): the body hashes to another id.
      const at = Buffer.from(ORIG.bytes).indexOf(bytesOfHex(orig.id))
      const altered = flipped(ORIG.bytes, at)
      const read = await readTransfer(craft([CATALOG, { ...ORIG, id: hex(altered.subarray(at, at + 32)), bytes: altered }, MINIMAL]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_ID', 'ok'])
    })

    test('an entry with two defects gives the first of the container: E_INFLATE comes before E_ID', async () => {
      // The index gives another id to the entry, and its deflate stream is damaged.
      const read = await readTransfer(craft([CATALOG, { ...MINIMAL, id: fingerprint(4), bytes: damaged(MINIMAL.bytes) }, ORIG]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_INFLATE', 'ok'])
      // The same entry with an intact stream gives E_ID.
      const intact = await readTransfer(craft([CATALOG, { ...MINIMAL, id: fingerprint(4) }, ORIG]))
      expect(intact.entries[1].status).toBe('E_ID')
    })

    test('the id in the file header is not the index’s: E_ID', async () => {
      const at = Buffer.from(ORIG.bytes).indexOf(bytesOfHex(orig.id))
      expect(at).toBeGreaterThan(12)
      const read = await readTransfer(craft([CATALOG, { ...ORIG, bytes: flipped(ORIG.bytes, at) }, MINIMAL]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_ID', 'ok'])
    })

    test('the index gives another id to the entry: E_ID', async () => {
      const read = await readTransfer(craft([CATALOG, { ...MINIMAL, id: fingerprint(4) }, ORIG]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_ID', 'ok'])
    })

    test('the first bytes: E_MAGIC, E_VERSION, E_KIND', async () => {
      const wrongMagic = flipped(MINIMAL.bytes, 0)
      const wrongVersion = MINIMAL.bytes.slice()
      wrongVersion[4] = 4
      const wrongKind = MINIMAL.bytes.slice()
      wrongKind[6] = 2
      const read = await readTransfer(
        craft([CATALOG, { ...MINIMAL, bytes: wrongMagic }, { ...ORIG, bytes: wrongVersion }, { ...MINIMAL, id: fingerprint(8), bytes: wrongKind }]),
      )
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_MAGIC', 'E_VERSION', 'E_KIND'])
    })

    test('an entry whose file is shorter or longer than the size says: E_TRUNCATED, E_TRAILING', async () => {
      const read = await readTransfer(
        craft([CATALOG, { ...MINIMAL, bytes: MINIMAL.bytes.subarray(0, MINIMAL.bytes.length - 10) }, { ...ORIG, bytes: new Uint8Array([...ORIG.bytes, 1, 2, 3]) }, COMPLEMENT]),
      )
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'E_TRUNCATED', 'E_TRAILING', 'ok'])
    })

    describe('the tables of the entries', () => {
      const statuses = async (specs: Spec[], opts?: Parameters<typeof readTransfer>[1]) => (await readTransfer(craft(specs), opts)).entries.map((e) => e.status)

      test('without known an entry is read with the tables its own header lists: structure only, no E_TABLE', async () => {
        expect(await statuses([CATALOG, specOf(futureObs), specOf(optionalObs)])).toEqual(['ok', 'ok', 'ok'])
      })

      test('with known, an entry with a required table the class does not know has the status E_TABLE', async () => {
        expect(await statuses([CATALOG, specOf(futureObs), MINIMAL], { known: { obs: {}, book: BOOK_TABLES } })).toEqual(['ok', 'E_TABLE', 'ok'])
        // Known, but not in that version.
        expect(await statuses([CATALOG, specOf(futureObs)], { known: { obs: { 'future-x': [1], 'future-y': [3] } } })).toEqual(['ok', 'E_TABLE'])
      })

      test('with known, a class missing from known has no known tables', async () => {
        expect(await statuses([CATALOG, specOf(futureObs)], { known: {} })).toEqual(['ok', 'E_TABLE'])
        expect(await statuses([CATALOG, MINIMAL, ORIG], { known: { book: BOOK_TABLES } })).toEqual(['ok', 'ok', 'E_TABLE'])
        expect(await statuses([CATALOG, MINIMAL], { known: {} })).toEqual(['ok', 'E_TABLE'])
      })

      test('with known, the tables of the class are the ones that count', async () => {
        expect(await statuses([CATALOG, specOf(futureObs)], { known: { obs: { 'future-x': [9] } } })).toEqual(['ok', 'ok'])
        expect(await statuses([CATALOG, MINIMAL], { known: { book: BOOK_TABLES } })).toEqual(['ok', 'ok'])
      })

      test('with known, an optional table that is not known is skipped: ok, if the class has some table the receiver knows', async () => {
        expect(await statuses([CATALOG, specOf(optionalObs)], { known: { obs: { 'future-x': [9] } } })).toEqual(['ok', 'ok'])
        expect(await statuses([CATALOG, specOf(optionalObs)])).toEqual(['ok', 'ok'])
      })

      test('with known, a class the receiver knows no table of is E_TABLE even when all its tables are optional (step 5)', async () => {
        expect(await statuses([CATALOG, specOf(optionalObs)], { known: { obs: {} } })).toEqual(['ok', 'E_TABLE'])
        expect(await statuses([CATALOG, specOf(optionalObs)], { known: {} })).toEqual(['ok', 'E_TABLE'])
        const map = await builtSegment({ h: { class: 'map', v: 1, tables: { 'future-y': [3, false] }, lang: 'es-419' }, t: { 'future-y': [] } }, fingerprint(12))
        expect(await statuses([CATALOG, specOf(map), MINIMAL], { known: { book: BOOK_TABLES, map: {} } })).toEqual(['ok', 'E_TABLE', 'ok'])
        // Without known the entry is read with the tables its own header lists: structure only.
        expect(await statuses([CATALOG, specOf(map), MINIMAL])).toEqual(['ok', 'ok', 'ok'])
        // A defect of the container comes before it: step 4 before step 5.
        const flippedMap = { ...specOf(map), bytes: flipped(map.bytes, map.bytes.length - 2) }
        expect(await statuses([CATALOG, flippedMap], { known: {} })).toEqual(['ok', expect.stringMatching(/^E_(INFLATE|ID)$/)])
      })

      test('known does not change what a catalog is read with: always the tables of catalogView', async () => {
        expect(await statuses([CATALOG], { known: {} })).toEqual(['ok'])
        expect(await statuses([CATALOG], { known: { catalog: {} } })).toEqual(['ok'])
      })

      test('a catalog with a required table catalogView does not know throws E_TABLE, whatever known says', async () => {
        const future = await catalogWith({ 'future-z': [1, true] }, { 'future-z': [] }, 30)
        expect(await codeOf(readTransfer(craft([specOf(future), MINIMAL])))).toBe('E_TABLE')
        expect(await codeOf(readTransfer(craft([specOf(future), MINIMAL]), { known: { catalog: { 'future-z': [1] } } }))).toBe('E_TABLE')
      })

      test('a catalog with a required table in a version catalogView does not know throws E_TABLE', async () => {
        const future = await catalogWith({ about: [2, true] }, {}, 31)
        expect(await codeOf(readTransfer(craft([specOf(future), MINIMAL])))).toBe('E_TABLE')
      })

      test('a catalog with an optional table catalogView does not know is ok', async () => {
        const future = await catalogWith({ 'future-z': [1, false] }, { 'future-z': [] }, 32)
        const read = await readTransfer(craft([specOf(future), MINIMAL]))
        expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok'])
      })
    })

    describe('an index with sizes at the limit of the integers', () => {
      const MAX = Number.MAX_SAFE_INTEGER

      test('a last entry that ends at 2^53 - 1 is missing', async () => {
        const read = await readTransfer(craft([CATALOG, { ...MINIMAL, size: MAX - CATALOG.bytes.length }]))
        expect(read.entries.map((e) => e.status)).toEqual(['ok', 'missing'])
        expect(read.missing).toEqual([minimal.id])
      })

      test('sizes that add up to more than 2^53 - 1 are E_HEADER', async () => {
        expect(await codeOf(readTransfer(craft([CATALOG, { ...MINIMAL, size: MAX - CATALOG.bytes.length + 1 }])))).toBe('E_HEADER')
        expect(await codeOf(readTransfer(craft([{ ...CATALOG, size: MAX }, MINIMAL])))).toBe('E_HEADER')
      })

      test('a catalog of 2^53 - 1 bytes is E_TRUNCATED', async () => {
        expect(await codeOf(readTransfer(craft([{ ...CATALOG, size: MAX }])))).toBe('E_TRUNCATED')
      })
    })

    test('a complement: ok when its sha256 is the id, E_ID when a byte changed', async () => {
      const ok = await readTransfer(craft([CATALOG, COMPLEMENT]))
      expect(ok.entries[1].status).toBe('ok')
      expect(ok.entries[1].bytes).toEqual(complementBytes)
      const altered = await readTransfer(craft([CATALOG, { ...COMPLEMENT, bytes: flipped(complementBytes, 3) }, MINIMAL]))
      expect(altered.entries.map((e) => e.status)).toEqual(['ok', 'E_ID', 'ok'])
      expect(altered.entries[1].bytes).toBeUndefined()
    })

    test('an empty complement is a complement: the sha256 of nothing', async () => {
      const empty = new Uint8Array(0)
      const id = await sha256Hex(empty)
      const read = await readTransfer(craft([CATALOG, { id, kind: 'complement', bytes: empty }, MINIMAL]))
      expect(read.entries.map((e) => e.status)).toEqual(['ok', 'ok', 'ok'])
    })
  })

  test('300 small entries are read in well under a second', async () => {
    const small: BuiltSegment[] = []
    for (let i = 0; i < 300; i++) {
      small.push(await builtSegment({ h: { class: 'lex', v: 1, tables: {}, lang: 'es-419', group: `G${i}` }, t: {} }, fingerprint(1000 + i)))
    }
    const bytes = writeTransfer({ mode: 'full', catalogs: [catalog], entries: small, made: MADE, by: BY })
    const started = performance.now()
    const read = await readTransfer(bytes)
    const elapsed = performance.now() - started
    expect(read.entries).toHaveLength(301)
    expect(read.entries.every((e) => e.status === 'ok')).toBe(true)
    expect(elapsed).toBeLessThan(1000)

    // A cut in the middle: the first half is ok, the rest missing, in the order of the index.
    const dataStart = 12 + new DataView(bytes.buffer).getUint32(8)
    const half = await readTransfer(bytes.subarray(0, Math.floor((dataStart + bytes.length) / 2)))
    const firstMissing = half.entries.findIndex((e) => e.status === 'missing')
    expect(firstMissing).toBeGreaterThan(1)
    expect(half.entries.slice(0, firstMissing).every((e) => e.status === 'ok')).toBe(true)
    expect(half.entries.slice(firstMissing).every((e) => e.status === 'missing')).toBe(true)
    expect(half.missing).toEqual(half.entries.slice(firstMissing).map((e) => e.id))
  })
})
