import { describe, expect, test } from 'bun:test'
import { deflateRaw, Inflate, inflateRaw } from 'pako'
import minimal from '../../spec/tests/container/minimal.expected.json'
import { type CborValue, decodeCbor, encodeDeterministic, MAX_DEPTH } from './cbor'
import { encodeUvarints } from './columns'
import {
  hex,
  MAX_COMPRESSED_BYTES,
  MAX_HEADER_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  readHeader,
  readSegment,
  type Segment,
  writeSegment,
} from './container'
import { FORMAT_ERROR_CODES, FormatError, type FormatErrorCode } from './errors'

// The test files are read with Bun, not with a Node module: nothing under src/ imports one.
declare const Bun: { file(path: URL): { arrayBuffer(): Promise<ArrayBuffer> } }

async function readSeg(name: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(new URL(`../../spec/tests/container/${name}`, import.meta.url)).arrayBuffer())
}

const minimalSeg = await readSeg('minimal.seg')
const truncatedSeg = await readSeg('truncated.seg')
const badIdSeg = await readSeg('bad-id.seg')

const MINIMAL_ID = '644fd73e8b75f16563e6adf91301f5f7727339f3e405ab9ce9ebf3dfe7e52ea7'
const KNOWN = { strings: [1], texts: [1] }

type CborMap = { [key: string]: CborValue }

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

/** The code of the FormatError a promise rejects with, or 'no error'. Any other error is rethrown. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof FormatError) return error.code
    throw error
  }
  return 'no error'
}

/** The same for a function that is not async. */
function syncCode(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof FormatError) return error.code
    throw error
  }
  return 'no error'
}

const read = (bytes: Uint8Array, known: Record<string, number[]> = KNOWN) => readSegment(bytes, { known })

/** The same sorted, for objects whose keys come in the order of the file. */
const keys = (value: object) => Object.keys(value).sort()

// A file in parts, so that each test changes one thing and re-assembles the rest as it was.

interface Parts {
  /** Magic, major, minor, kind, reserved: the first 8 bytes. */
  fixed: Uint8Array
  /** The header: a map to encode, or its exact bytes. */
  header: CborMap | Uint8Array
  /** The value of the length field, when it is not the length of the header. */
  headerLength?: number
  compressed: Uint8Array
}

function split(file: Uint8Array): Parts & { header: CborMap; body: Uint8Array } {
  const length = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(8)
  const header = decodeCbor(file.subarray(12, 12 + length)) as CborMap
  const compressed = file.slice(12 + length)
  return { fixed: file.slice(0, 8), header, compressed, body: inflateRaw(compressed) }
}

function assemble(parts: Parts): Uint8Array {
  const header = parts.header instanceof Uint8Array ? parts.header : encodeDeterministic(parts.header)
  const out = new Uint8Array(12 + header.length + parts.compressed.length)
  out.set(parts.fixed, 0)
  new DataView(out.buffer).setUint32(8, parts.headerLength ?? header.length)
  out.set(header, 12)
  out.set(parts.compressed, 12 + header.length)
  return out
}

const original = split(minimalSeg)

/** minimal.seg with a change in its first 8 bytes or in its header map; the body is untouched. */
function mutate(change: { fixed?: (fixed: Uint8Array) => void; header?: (header: CborMap) => void }): Uint8Array {
  const fixed = original.fixed.slice()
  change.fixed?.(fixed)
  const header = structuredClone(original.header)
  change.header?.(header)
  return assemble({ fixed, header, compressed: original.compressed })
}

/** A valid file for any body bytes, with the header's `h` and the lengths and id of that body. */
async function fileFromBody(
  body: Uint8Array,
  h: CborMap = original.header.h as CborMap,
  header: (map: CborMap) => void = () => {},
): Promise<Uint8Array> {
  const compressed = deflateRaw(body, { level: 9 })
  const map: CborMap = { h, codec: 'deflate-raw', clen: compressed.length, ulen: body.length, id: await sha256(body) }
  header(map)
  return assemble({ fixed: original.fixed, header: map, compressed })
}

const cborBytes = (...parts: Array<number[] | Uint8Array>) => Uint8Array.from(parts.flatMap((p) => Array.from(p)))
const text = (s: string) => [0x60 + s.length, ...new TextEncoder().encode(s)]

/** A body that is the map {h, t} with these already encoded values. */
const bodyOf = (h: Uint8Array, t: Uint8Array) => cborBytes([0xa2], text('h'), h, text('t'), t)

const goodH = encodeDeterministic(original.header.h)
const goodT = encodeDeterministic((decodeCbor(original.body) as CborMap).t)

describe('the examples of the specification', () => {
  test('minimal.seg gives its id and its logical header', async () => {
    const result = await read(minimalSeg)
    expect(result.id).toBe(MINIMAL_ID)
    expect(result.id).toBe(minimal.id)
    expect(result.seg.h).toEqual(minimal.h as unknown as Segment['h'])
    expect(result.skipped).toEqual([])
    expect(keys(result.seg.t)).toEqual(['strings', 'texts'])
    expect(result.header.codec).toBe('deflate-raw')
    expect(result.header.id).toEqual(await sha256(original.body))
  })

  test('truncated.seg is E_TRUNCATED', async () => {
    expect(await codeOf(read(truncatedSeg))).toBe('E_TRUNCATED')
  })

  test('bad-id.seg is E_ID', async () => {
    expect(await codeOf(read(badIdSeg))).toBe('E_ID')
  })

  test('the parts of minimal.seg put back together are minimal.seg', () => {
    expect(assemble(original)).toEqual(minimalSeg)
  })
})

describe('writeSegment', () => {
  // The same table contents that make_examples.py writes, built here by hand.
  const strings = [' ', '1', ', ', 'Dios', 'Pablo', 'de', 'para:p', 'siervo']
  const pieces = [9, 4, 15, 0, 11, 0, 7] // string number * 2, plus 1 for a word
  const events = [0, 0, 1, 0, 2, 6, 0, 1, 1, 7, 3, 0] // position delta, code, string number
  const seg: Segment = {
    h: original.header.h as unknown as Segment['h'],
    t: { strings, texts: [{ res: 0, tok: encodeUvarints(pieces), ev: encodeUvarints(events) }] },
  }

  test('gives the id of minimal.seg for the same {h, t}', async () => {
    const written = await writeSegment(seg)
    expect(written.id).toBe(MINIMAL_ID)
    expect(written.body).toEqual(original.body)
  })

  test('the file reads back to the same {h, t}', async () => {
    const written = await writeSegment(seg)
    const result = await read(written.bytes)
    expect(result.id).toBe(written.id)
    expect(result.seg).toEqual(seg)
    // The fixed bytes are those of the container (minimal.seg is the reference). The compressed bytes may differ from
    // Python's, so clen may too; the rest of the header does not.
    expect(written.bytes.slice(0, 8)).toEqual(minimalSeg.slice(0, 8))
    const length = new DataView(written.bytes.buffer).getUint32(8)
    const header = decodeCbor(written.bytes.subarray(12, 12 + length)) as CborMap
    expect(header).toEqual({ ...original.header, clen: header.clen })
    expect(written.bytes.length).toBe(12 + length + (header.clen as number))
  })

  test('two builds of the same content give the same bytes', async () => {
    const a = await writeSegment(seg)
    const b = await writeSegment(structuredClone(seg))
    expect(a.bytes).toEqual(b.bytes)
  })

  test('writes the signatures of the catalog in the header', async () => {
    const s = new Uint8Array(64).fill(7)
    const written = await writeSegment(seg, { sig: [{ key: 'k1', alg: 'ed25519', s }] })
    const result = await read(written.bytes)
    expect(result.header.sig).toEqual([{ key: 'k1', alg: 'ed25519', s }])
    expect(result.id).toBe(MINIMAL_ID) // the signatures are not part of the body
  })

  test('refuses an empty signature list', async () => {
    await expect(writeSegment(seg, { sig: [] })).rejects.toThrow(Error)
  })

  test('refuses tables that differ from h.tables, in either direction', async () => {
    const extra = { ...seg, t: { ...seg.t, 'future-x': [1] } }
    await expect(writeSegment(extra)).rejects.toThrow(Error)
    const { texts: _texts, ...withoutTexts } = seg.t
    await expect(writeSegment({ ...seg, t: withoutTexts })).rejects.toThrow(Error)
  })

  test('refuses a logical header its own reader would reject with E_BODY', async () => {
    const bad: [string, (h: Record<string, unknown>) => void][] = [
      ['a class that does not exist', (h) => (h.class = 'chapter')],
      ['a version that is not a count', (h) => (h.v = -1)],
      ['a table entry that is not [version, required]', (h) => (h.tables = { strings: [1] })],
      ['a table name with capitals', (h) => (h.tables = { Strings: [1, true], texts: [1, true] })],
      ['a lang that is not text', (h) => (h.lang = 7)],
      ['an orig that is not a pair of texts', (h) => (h.orig = ['a'])],
      ['a res that is not a list of pairs', (h) => (h.res = [['a', 'b', 'c']])],
    ]
    for (const [, change] of bad) {
      const h = structuredClone(seg.h) as unknown as Record<string, unknown>
      change(h)
      expect(await codeOf(writeSegment({ ...seg, h: h as unknown as Segment['h'] }))).toBe('E_BODY')
    }
  })

  test('refuses a header over 65 536 bytes with E_LIMIT', async () => {
    const big: Segment = { ...seg, h: { ...seg.h, res: [['r'.repeat(MAX_HEADER_BYTES), 'v1']] } }
    expect(await codeOf(writeSegment(big))).toBe('E_LIMIT')
  })

  test('refuses a body over 64 MiB with E_LIMIT', async () => {
    const big: Segment = { ...seg, t: { ...seg.t, strings: new Uint8Array(MAX_UNCOMPRESSED_BYTES) } }
    expect(await codeOf(writeSegment(big))).toBe('E_LIMIT')
  })
})

describe('the fixed bytes', () => {
  test('E_MAGIC: the first byte changed', async () => {
    expect(await codeOf(read(mutate({ fixed: (f) => (f[0] = 0x3f) })))).toBe('E_MAGIC')
  })

  test('E_MAGIC: any of the four magic bytes', async () => {
    for (let i = 0; i < 4; i++) {
      expect(await codeOf(read(mutate({ fixed: (f) => (f[i] ^= 0x01) })))).toBe('E_MAGIC')
    }
  })

  test('a file shorter than 4 bytes is E_TRUNCATED if it starts like the magic, E_MAGIC if not', async () => {
    expect(await codeOf(read(new Uint8Array(0)))).toBe('E_TRUNCATED')
    expect(await codeOf(read(minimalSeg.slice(0, 1)))).toBe('E_TRUNCATED')
    expect(await codeOf(read(minimalSeg.slice(0, 3)))).toBe('E_TRUNCATED')
    expect(await codeOf(read(Uint8Array.of(0x89, 0x55)))).toBe('E_MAGIC')
    expect(await codeOf(read(Uint8Array.of(0x00)))).toBe('E_MAGIC')
  })

  test('E_VERSION: major 4', async () => {
    expect(await codeOf(read(mutate({ fixed: (f) => (f[4] = 4) })))).toBe('E_VERSION')
    expect(await codeOf(read(mutate({ fixed: (f) => (f[4] = 2) })))).toBe('E_VERSION')
  })

  test('E_MAGIC comes before E_VERSION, E_VERSION before E_KIND, and none waits for the whole file', async () => {
    expect(await codeOf(read(mutate({ fixed: (f) => ((f[0] = 0), (f[4] = 4)) })))).toBe('E_MAGIC')
    const fixed = mutate({ fixed: (f) => ((f[4] = 4), (f[6] = 2)) })
    expect(await codeOf(read(fixed))).toBe('E_VERSION')
    expect(await codeOf(read(fixed.slice(0, 5)))).toBe('E_VERSION')
  })

  test('any minor version is read, and so is a reserved byte that is not 0', async () => {
    const result = await read(mutate({ fixed: (f) => ((f[5] = 7), (f[7] = 0xff)) }))
    expect(result.id).toBe(MINIMAL_ID)
  })

  test('E_KIND: kind 2, a transfer file, where a segment is expected', async () => {
    expect(await codeOf(read(mutate({ fixed: (f) => (f[6] = 2) })))).toBe('E_KIND')
  })

  test('E_KIND: kind 0 and kind 3', async () => {
    expect(await codeOf(read(mutate({ fixed: (f) => (f[6] = 0) })))).toBe('E_KIND')
    expect(await codeOf(read(mutate({ fixed: (f) => (f[6] = 3) })))).toBe('E_KIND')
  })

  test('E_KIND comes before the limit on H: a transfer file has a header of any length', async () => {
    const fixed = original.fixed.slice()
    fixed[6] = 2
    expect(await codeOf(read(assemble({ ...original, fixed, headerLength: 70_000 })))).toBe('E_KIND')
  })

  test('E_TRUNCATED: a file cut inside the first 12 bytes', async () => {
    for (const n of [4, 5, 6, 7, 8, 11]) {
      expect(await codeOf(read(minimalSeg.slice(0, n)))).toBe('E_TRUNCATED')
    }
  })
})

describe('readHeader', () => {
  const headerEnd = 12 + new DataView(minimalSeg.buffer).getUint32(8)

  test('reads the header of a segment without inflating anything', () => {
    const result = readHeader(minimalSeg)
    expect(result.kind).toBe(1)
    expect(result.headerEnd).toBe(headerEnd)
    expect(result.header).toEqual(original.header)
    // A body of garbage does not matter.
    const noBody = minimalSeg.slice(0, headerEnd)
    expect(readHeader(noBody).header).toEqual(original.header)
  })

  const fixedOfKind = (kind: number) => {
    const fixed = original.fixed.slice()
    fixed[6] = kind
    return fixed
  }

  test('reads the index of a transfer file (kind 2) with no segment checks', () => {
    const index = encodeDeterministic({ entries: [1, 2], anything: 'goes' })
    const file = assemble({ fixed: fixedOfKind(2), header: index, compressed: new Uint8Array(0) })
    const result = readHeader(file)
    expect(result.kind).toBe(2)
    expect(result.header).toEqual({ entries: [1, 2], anything: 'goes' })
    expect(result.headerEnd).toBe(12 + index.length)
  })

  test('a header of a transfer file over 65 536 bytes is not a limit of readHeader', () => {
    const index = encodeDeterministic({ pad: 'x'.repeat(MAX_HEADER_BYTES + 1) })
    const file = assemble({ fixed: fixedOfKind(2), header: index, compressed: new Uint8Array(0) })
    expect(readHeader(file).kind).toBe(2)
  })

  test('the keys of a segment header are checked for kind 1 and not for kind 2', () => {
    const header = encodeDeterministic({ h: {}, codec: 'deflate-raw' })
    const segment = assemble({ fixed: fixedOfKind(1), header, compressed: new Uint8Array(0) })
    expect(syncCode(() => readHeader(segment))).toBe('E_HEADER')
    const transfer = assemble({ fixed: fixedOfKind(2), header, compressed: new Uint8Array(0) })
    expect(readHeader(transfer).kind).toBe(2)
  })

  test('a segment header over 65 536 bytes is E_LIMIT', () => {
    const file = assemble({ ...original, headerLength: MAX_HEADER_BYTES + 1 })
    expect(syncCode(() => readHeader(file))).toBe('E_LIMIT')
  })

  test('the checks of the fixed bytes', () => {
    expect(syncCode(() => readHeader(mutate({ fixed: (f) => (f[0] = 0) })))).toBe('E_MAGIC')
    expect(syncCode(() => readHeader(mutate({ fixed: (f) => (f[4] = 4) })))).toBe('E_VERSION')
    expect(syncCode(() => readHeader(mutate({ fixed: (f) => (f[6] = 3) })))).toBe('E_KIND')
    expect(syncCode(() => readHeader(mutate({ fixed: (f) => (f[6] = 0) })))).toBe('E_KIND')
    expect(syncCode(() => readHeader(minimalSeg.slice(0, 10)))).toBe('E_TRUNCATED')
    expect(syncCode(() => readHeader(minimalSeg.slice(0, headerEnd - 1)))).toBe('E_TRUNCATED')
    expect(syncCode(() => readHeader(new Uint8Array(0)))).toBe('E_TRUNCATED')
  })

  test('E_HEADER when the header is not a map, for a segment and for a transfer file', () => {
    const array = encodeDeterministic([1, 2, 3])
    for (const kind of [1, 2]) {
      const file = assemble({ fixed: fixedOfKind(kind), header: array, compressed: new Uint8Array(0) })
      expect(syncCode(() => readHeader(file))).toBe('E_HEADER')
    }
  })
})

describe('the header', () => {
  test('E_HEADER: the header is a CBOR array', async () => {
    const file = assemble({ ...original, header: encodeDeterministic([1, 2, 3]) })
    expect(await codeOf(read(file))).toBe('E_HEADER')
  })

  test('E_HEADER: the header is empty, undecodable or has bytes after the map', async () => {
    expect(await codeOf(read(assemble({ ...original, header: new Uint8Array(0) })))).toBe('E_HEADER')
    expect(await codeOf(read(assemble({ ...original, header: Uint8Array.of(0xa1, 0x61) })))).toBe('E_HEADER')
    expect(await codeOf(read(assemble({ ...original, header: Uint8Array.of(0xf9, 0x3c, 0x00) })))).toBe('E_HEADER')
    const withTail = cborBytes(encodeDeterministic(original.header), [0x00])
    expect(await codeOf(read(assemble({ ...original, header: withTail })))).toBe('E_HEADER')
  })

  test('E_HEADER: each of h, codec, clen, ulen and id missing', async () => {
    for (const key of ['h', 'codec', 'clen', 'ulen', 'id']) {
      const file = mutate({ header: (h) => delete h[key] })
      expect(await codeOf(read(file))).toBe('E_HEADER')
    }
  })

  test('E_HEADER: a key of the wrong type', async () => {
    const wrong: Array<[string, CborValue]> = [
      ['h', [1]],
      ['h', 'book'],
      ['codec', 7],
      ['clen', 'x'],
      ['clen', -1],
      ['ulen', true],
      ['id', 'abc'],
      ['id', new Uint8Array(31)],
      ['id', new Uint8Array(33)],
    ]
    for (const [key, value] of wrong) {
      const file = mutate({ header: (h) => (h[key] = value) })
      expect(await codeOf(read(file))).toBe('E_HEADER')
    }
  })

  test('header keys a reader does not know are ignored, and given back', async () => {
    const result = await read(mutate({ header: (h) => ((h.future = [1, 'x']), (h.sig = [])) }))
    expect(result.id).toBe(MINIMAL_ID)
    expect(result.header.future).toEqual([1, 'x'])
  })

  test('E_CODEC: zstd', async () => {
    expect(await codeOf(read(mutate({ header: (h) => (h.codec = 'zstd') })))).toBe('E_CODEC')
    expect(await codeOf(read(mutate({ header: (h) => (h.codec = 'Deflate-Raw') })))).toBe('E_CODEC')
  })
})

describe('the lengths', () => {
  test('E_TRAILING: one byte appended', async () => {
    const file = new Uint8Array(minimalSeg.length + 1)
    file.set(minimalSeg)
    expect(await codeOf(read(file))).toBe('E_TRAILING')
  })

  test('E_TRUNCATED: one byte fewer', async () => {
    expect(await codeOf(read(minimalSeg.slice(0, -1)))).toBe('E_TRUNCATED')
  })

  test('E_TRUNCATED: the header is cut', async () => {
    expect(await codeOf(read(minimalSeg.slice(0, 40)))).toBe('E_TRUNCATED')
  })

  test('E_TRUNCATED: a header length beyond the file', async () => {
    const file = assemble({ ...original, headerLength: 5000 })
    expect(await codeOf(read(file))).toBe('E_TRUNCATED')
  })

  test('E_TRAILING is judged on clen, not on the real body', async () => {
    expect(await codeOf(read(mutate({ header: (h) => ((h.clen as number) -= 1) })))).toBe('E_TRAILING')
    expect(await codeOf(read(mutate({ header: (h) => ((h.clen as number) += 1) })))).toBe('E_TRUNCATED')
  })
})

describe('the limits', () => {
  test('E_LIMIT: a real file whose header is over 65 536 bytes', async () => {
    const file = await fileFromBody(original.body, undefined, (map) => (map.padding = 'x'.repeat(MAX_HEADER_BYTES)))
    expect(new DataView(file.buffer).getUint32(8)).toBeGreaterThan(MAX_HEADER_BYTES)
    expect(await codeOf(read(file))).toBe('E_LIMIT')
  })

  test('a header of exactly 65 536 bytes is read', async () => {
    // Pad until the encoded header is exactly the limit: a text of n bytes costs n + 3 bytes of overhead for the key
    // "padding" and the head of the text; find n from a first try.
    const probe = await fileFromBody(original.body, undefined, (map) => (map.padding = 'x'.repeat(60000)))
    const probeLength = new DataView(probe.buffer).getUint32(8)
    const n = 60000 + (MAX_HEADER_BYTES - probeLength)
    const file = await fileFromBody(original.body, undefined, (map) => (map.padding = 'x'.repeat(n)))
    expect(new DataView(file.buffer).getUint32(8)).toBe(MAX_HEADER_BYTES)
    expect((await read(file)).id).toBe(MINIMAL_ID)
  })

  test('E_LIMIT: H above the limit comes before the file is found short', async () => {
    const file = assemble({ ...original, headerLength: 70_000 })
    expect(await codeOf(read(file))).toBe('E_LIMIT')
    expect(await codeOf(read(assemble({ ...original, headerLength: 2 ** 32 - 1 })))).toBe('E_LIMIT')
  })

  test('E_LIMIT: clen and ulen above 64 MiB', async () => {
    expect(await codeOf(read(mutate({ header: (h) => (h.clen = MAX_COMPRESSED_BYTES + 1) })))).toBe('E_LIMIT')
    expect(await codeOf(read(mutate({ header: (h) => (h.ulen = MAX_UNCOMPRESSED_BYTES + 1) })))).toBe('E_LIMIT')
  })

  test('a ulen of exactly 64 MiB is not a limit (the inflate finds it wrong)', async () => {
    expect(await codeOf(read(mutate({ header: (h) => (h.ulen = MAX_UNCOMPRESSED_BYTES) })))).toBe('E_INFLATE')
  })

  test('E_LIMIT: nesting of MAX_DEPTH + 1 levels in the header and in the body', async () => {
    // Header: the map (1) and MAX_DEPTH arrays (2..MAX_DEPTH + 1). Body: the map (1), t (2) and MAX_DEPTH - 1 arrays
    // (3..MAX_DEPTH + 1).
    const deepHeader = cborBytes([0xa1], text('h'), new Array(MAX_DEPTH - 1).fill(0x81), [0x80])
    expect(await codeOf(read(assemble({ ...original, header: deepHeader })))).toBe('E_LIMIT')
    const deepT = cborBytes([0xa1], text('x'), new Array(MAX_DEPTH - 2).fill(0x81), [0x80])
    expect(await codeOf(read(await fileFromBody(bodyOf(goodH, deepT))))).toBe('E_LIMIT')
  })

  test('nesting of exactly MAX_DEPTH levels in the body is not a limit', async () => {
    // The body map (1), t (2) and MAX_DEPTH - 2 arrays (3..MAX_DEPTH).
    const t = cborBytes([0xa1], text('x'), new Array(MAX_DEPTH - 3).fill(0x81), [0x80])
    const h = encodeDeterministic({ ...(original.header.h as CborMap), tables: { x: [1, true] } })
    const result = await read(await fileFromBody(bodyOf(h, t), decodeCbor(h) as CborMap), { x: [1] })
    expect(keys(result.seg.t)).toEqual(['x'])
  })
})

describe('inflate', () => {
  test('E_INFLATE: 3 garbage bytes after the deflate stream, clen adjusted', async () => {
    const compressed = cborBytes(original.compressed, [0xde, 0xad, 0xbe])
    const header = { ...original.header, clen: compressed.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed })))).toBe('E_INFLATE')
  })

  test('E_INFLATE: a deflate stream cut short, clen adjusted', async () => {
    const compressed = original.compressed.slice(0, -5)
    const header = { ...original.header, clen: compressed.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed })))).toBe('E_INFLATE')
  })

  test('E_INFLATE: all of ulen came out but the deflate stream has no end', async () => {
    // 128 KiB + 8 of zeros: the inflater hands out two full chunks (128 KiB) before it reads the end of the stream.
    // With the last byte of the stream cut and ulen 128 KiB, the output has the right length and the stream is not done.
    const full = deflateRaw(new Uint8Array(128 * 1024 + 8), { level: 9 })
    const compressed = full.slice(0, -1)
    const header = { ...original.header, clen: compressed.length, ulen: 128 * 1024 }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed })))).toBe('E_INFLATE')
  })

  test('a stream that fills more than one output chunk is read whole (pako stalls on it with Z_FINISH)', async () => {
    // 64 KiB + 1 of zeros is 79 bytes of deflate. The control has the right ulen and stops at the id, not before.
    const zeros = new Uint8Array(64 * 1024 + 1)
    const compressed = deflateRaw(zeros, { level: 9 })
    const header = { ...original.header, clen: compressed.length, ulen: zeros.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed })))).toBe('E_ID')
    const big = new Uint8Array(3 * 64 * 1024 + 1)
    const bigCompressed = deflateRaw(big, { level: 9 })
    const bigHeader = { ...original.header, clen: bigCompressed.length, ulen: big.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header: bigHeader, compressed: bigCompressed })))).toBe('E_ID')
  })

  test('E_INFLATE: an empty body, and a body that is not deflate at all', async () => {
    const empty = { ...original.header, clen: 0 }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header: empty, compressed: new Uint8Array(0) })))).toBe('E_INFLATE')
    const garbage = new Uint8Array(100).fill(0xff)
    const header = { ...original.header, clen: garbage.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed: garbage })))).toBe('E_INFLATE')
  })

  test('E_INFLATE: the output is not ulen bytes, whichever way', async () => {
    expect(await codeOf(read(mutate({ header: (h) => ((h.ulen as number) += 1) })))).toBe('E_INFLATE')
    expect(await codeOf(read(mutate({ header: (h) => ((h.ulen as number) -= 1) })))).toBe('E_INFLATE')
    expect(await codeOf(read(mutate({ header: (h) => (h.ulen = 0) })))).toBe('E_INFLATE')
  })

  test('a ulen that is too small stops the inflate instead of allocating the output', async () => {
    // 8 MiB of zeros are 8 KiB of deflate. With ulen 100 the reader must stop at the first chunk past 100 bytes: pako
    // gives chunks of 64 KiB, so no more than that is ever produced.
    const big = new Uint8Array(8 * 1024 * 1024)
    const compressed = deflateRaw(big, { level: 9 })
    const header = { ...original.header, clen: compressed.length, ulen: 100 }
    const file = assemble({ fixed: original.fixed, header, compressed })

    // Count what the inflater hands out, by wrapping the push of the Inflate that readSegment creates.
    const push = Inflate.prototype.push
    let produced = 0
    Inflate.prototype.push = function (this: { onData(chunk: Uint8Array): void }, data: Uint8Array, mode?: boolean) {
      const inner = this.onData
      this.onData = (chunk: Uint8Array) => {
        produced += chunk.length
        inner.call(this, chunk)
      }
      return push.call(this as never, data, mode)
    } as typeof push
    try {
      expect(await codeOf(read(file))).toBe('E_INFLATE')
    } finally {
      Inflate.prototype.push = push
    }
    expect(produced).toBeGreaterThan(100)
    expect(produced).toBeLessThanOrEqual(64 * 1024)
  })

  test('E_INFLATE comes before E_ID: a wrong id is not looked at while the body is broken', async () => {
    const file = mutate({ header: (h) => ((h.ulen as number) += 1) })
    expect(await codeOf(readSegment(file, { known: KNOWN, expectedId: '00'.repeat(32) }))).toBe('E_INFLATE')
  })
})

describe('the identity', () => {
  test('E_ID: the id in the header is not the sha256 of the body', async () => {
    expect(await codeOf(read(mutate({ header: (h) => (h.id = new Uint8Array(32)) })))).toBe('E_ID')
  })

  test('E_ID: a body that is changed and a header that is not', async () => {
    const other = encodeDeterministic({ h: original.header.h, t: { strings: [], texts: [] } })
    const compressed = deflateRaw(other, { level: 9 })
    const header = { ...original.header, clen: compressed.length, ulen: other.length }
    expect(await codeOf(read(assemble({ fixed: original.fixed, header, compressed })))).toBe('E_ID')
  })

  test('the id the catalog gives: a match reads, another id is E_ID', async () => {
    const good = await readSegment(minimalSeg, { known: KNOWN, expectedId: MINIMAL_ID })
    expect(good.id).toBe(MINIMAL_ID)
    const wrong = MINIMAL_ID.replace(/^6/, '7')
    expect(await codeOf(readSegment(minimalSeg, { known: KNOWN, expectedId: wrong }))).toBe('E_ID')
  })

  test('the id the catalog gives is compared ignoring case', async () => {
    const upper = MINIMAL_ID.toUpperCase()
    expect((await readSegment(minimalSeg, { known: KNOWN, expectedId: upper })).id).toBe(MINIMAL_ID)
    expect(await codeOf(readSegment(minimalSeg, { known: KNOWN, expectedId: upper.replace(/^6/, '7') }))).toBe('E_ID')
  })

  test('hex gives lowercase hex with two digits per byte', () => {
    expect(hex(Uint8Array.of(0, 1, 15, 16, 171, 255))).toBe('00010f10abff')
    expect(hex(new Uint8Array(0))).toBe('')
  })
})

describe('the body', () => {
  test('E_BODY: not a map, or a map without h or without t', async () => {
    const bodies: Uint8Array[] = [
      encodeDeterministic([1, 2]),
      encodeDeterministic('body'),
      cborBytes([0xa1], text('h'), goodH),
      cborBytes([0xa1], text('t'), goodT),
      cborBytes([0xa2], text('h'), goodH, text('u'), goodT),
      cborBytes([0xa3], text('h'), goodH, text('u'), goodT, text('x'), [0x00]),
      new Uint8Array(0),
    ]
    for (const body of bodies) expect(await codeOf(read(await fileFromBody(body)))).toBe('E_BODY')
  })

  test('a body with a root key besides h and t reads: the key is ignored and is not in seg', async () => {
    // `container.md`, "Body": a later minor version may add keys; h and t are the only ones a reader needs. Keys are sorted: h, t, x.
    const body = cborBytes([0xa3], text('h'), goodH, text('t'), goodT, text('x'), encodeDeterministic({ later: [1, 'two', true] }))
    const result = await read(await fileFromBody(body))
    expect(Object.keys(result.seg).sort()).toEqual(['h', 't'])
    expect(result.seg.h).toEqual(minimal.h as unknown as Segment['h'])
    expect(result.seg.t).toEqual((decodeCbor(original.body) as CborMap).t as Segment['t'])
    // The identity is the sha256 of the body as it is, so the extra key changes it.
    expect(result.id).not.toBe(MINIMAL_ID)
  })

  test('E_BODY: an extra root key is decoded too (a float in it)', async () => {
    const body = cborBytes([0xa3], text('h'), goodH, text('t'), goodT, text('x'), [0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0])
    expect(await codeOf(read(await fileFromBody(body)))).toBe('E_BODY')
  })

  test('E_BODY: an extra root key is decoded too (an integer out of range in it)', async () => {
    for (const value of [[0x1b, 0x10, 0, 0, 0, 0, 0, 0, 0], [0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]]) {
      const body = cborBytes([0xa3], text('h'), goodH, text('t'), goodT, text('x'), value)
      expect(await codeOf(read(await fileFromBody(body)))).toBe('E_BODY')
    }
    // The ends of the range are fine.
    const edge = cborBytes([0xa3], text('h'), goodH, text('t'), goodT, text('x'), [0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe])
    expect((await read(await fileFromBody(edge))).seg.h.class).toBe('book')
  })

  // `container.md`, "What a reader accepts": what is rejected anywhere, and what only builders are bound by.
  const unacceptable: [string, number[]][] = [
    ['an indefinite array', [0x9f, 0x01, 0xff]],
    ['an indefinite map', [0xbf, 0x61, 0x61, 0x01, 0xff]],
    ['an indefinite byte string', [0x5f, 0x41, 0x01, 0xff]],
    ['an indefinite text', [0x7f, 0x61, 0x61, 0xff]],
    ['an indefinite integer head', [0x1f]],
    ['a float', [0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0]],
    ['a half float', [0xf9, 0x3c, 0x00]],
    ['a tag', [0xc1, 0x00]],
    ['null', [0xf6]],
    ['undefined', [0xf7]],
    ['another simple value', [0xf0]],
    ['a map key that is not text', [0xa1, 0x01, 0x02]],
    ['a map with a key twice', [0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02]],
    ['an integer above 2^53 - 1 (2^60)', [0x1b, 0x10, 0, 0, 0, 0, 0, 0, 0]],
    ['-2^53, one below -(2^53 - 1)', [0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
  ]

  test('E_BODY: every kind of CBOR the format does not use is rejected inside an unknown optional table', async () => {
    // The body is decoded as a whole before any table is skipped.
    const base = original.header.h as CborMap
    const h = { ...base, tables: { ...(base.tables as CborMap), 'future-x': [1, false] } }
    const t = (decodeCbor(original.body) as CborMap).t as CborMap
    for (const [, value] of unacceptable) {
      const tables = cborBytes([0xa3], text('future-x'), value, text('strings'), encodeDeterministic(t.strings), text('texts'), encodeDeterministic(t.texts))
      const body = cborBytes([0xa2], text('h'), encodeDeterministic(h), text('t'), tables)
      expect(await codeOf(read(await fileFromBody(body, h)))).toBe('E_BODY')
    }
  })

  test('E_HEADER: the same, anywhere in the header, also in a key it does not know', async () => {
    const head = encodeDeterministic(original.header)
    expect(head[0]).toBe(0xa5)
    for (const [, value] of unacceptable) {
      const header = cborBytes([0xa6], head.subarray(1), text('x'), value)
      expect(await codeOf(read(assemble({ ...original, header })))).toBe('E_HEADER')
    }
  })

  test('a reader accepts integers that are not in the shortest form and keys that are not sorted', async () => {
    // Header: a sixth key `x` after the five (it sorts before them), holding 1 as 0x18 0x01. Body: the same in a root key, and
    // the root keys in the order t, h. The id is the sha256 of the body as it is.
    const head = encodeDeterministic(original.header)
    const header = cborBytes([0xa6], head.subarray(1), text('x'), [0x18, 0x01])
    expect((await read(assemble({ ...original, header }))).id).toBe(MINIMAL_ID)
    const body = cborBytes([0xa3], text('t'), goodT, text('h'), goodH, text('x'), [0x19, 0x00, 0x01])
    const result = await read(await fileFromBody(body))
    expect(Object.keys(result.seg).sort()).toEqual(['h', 't'])
    expect(result.seg.t).toEqual((decodeCbor(original.body) as CborMap).t as Segment['t'])
  })

  test('E_BODY: h or t is not a map', async () => {
    expect(await codeOf(read(await fileFromBody(bodyOf(encodeDeterministic([1]), goodT))))).toBe('E_BODY')
    expect(await codeOf(read(await fileFromBody(bodyOf(goodH, encodeDeterministic([1])))))).toBe('E_BODY')
  })

  test('E_BODY: a column error in the CBOR (float, null, tag, cut short, bytes after it)', async () => {
    const floatT = cborBytes([0xa1], text('x'), [0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0])
    const nullT = cborBytes([0xa1], text('x'), [0xf6])
    const tagT = cborBytes([0xa1], text('x'), [0xc1, 0x00])
    for (const t of [floatT, nullT, tagT]) expect(await codeOf(read(await fileFromBody(bodyOf(goodH, t))))).toBe('E_BODY')
    const cut = bodyOf(goodH, goodT).slice(0, -3)
    expect(await codeOf(read(await fileFromBody(cut)))).toBe('E_BODY')
    const tail = cborBytes(bodyOf(goodH, goodT), [0x00])
    expect(await codeOf(read(await fileFromBody(tail)))).toBe('E_BODY')
  })

  test('E_BODY: h.tables malformed', async () => {
    const base = original.header.h as CborMap
    const badTables: CborValue[] = [
      [],
      'tables',
      { strings: 1, texts: [1, true] },
      { strings: [1], texts: [1, true] },
      { strings: [1, true, 0], texts: [1, true] },
      { strings: ['1', true], texts: [1, true] },
      { strings: [-1, true], texts: [1, true] },
      { strings: [1, 1], texts: [1, true] },
      { Strings: [1, true], texts: [1, true] },
      { '1strings': [1, true], texts: [1, true] },
      { strings: [1, true], texts: [1, true], '': [1, true] },
    ]
    for (const tables of badTables) {
      const h = { ...base, tables }
      // t has a table for every name, so the shape of h.tables is the only defect.
      const isMap = typeof tables === 'object' && !Array.isArray(tables)
      const t = isMap ? Object.fromEntries(Object.keys(tables).map((name) => [name, []])) : {}
      expect(await codeOf(read(await fileFromBody(encodeDeterministic({ h, t }), h)))).toBe('E_BODY')
    }
    const noTables: CborMap = { ...base }
    delete noTables.tables
    expect(await codeOf(read(await fileFromBody(encodeDeterministic({ h: noTables, t: {} }), noTables)))).toBe('E_BODY')
  })

  test('E_BODY: a table in h.tables that is not in t, and the reverse', async () => {
    const base = original.header.h as CborMap
    const t = (decodeCbor(original.body) as CborMap).t as CborMap
    const missing = { ...t }
    delete missing.texts
    expect(await codeOf(read(await fileFromBody(encodeDeterministic({ h: base, t: missing }))))).toBe('E_BODY')
    const extra = { ...t, extra: [1] }
    expect(await codeOf(read(await fileFromBody(encodeDeterministic({ h: base, t: extra }))))).toBe('E_BODY')
  })

  test('E_BODY: a class that does not exist, or a v that is not a number', async () => {
    const base = original.header.h as CborMap
    const t = (decodeCbor(original.body) as CborMap).t
    for (const change of [{ class: 'future' }, { class: 3 }, { v: 'one' }, { v: -1 }, { lang: 5 }, { orig: ['a'] }, { res: [['a']] }]) {
      const h = { ...base, ...change }
      expect(await codeOf(read(await fileFromBody(encodeDeterministic({ h, t }), h)))).toBe('E_BODY')
    }
  })

  test('E_BODY comes before E_HMISMATCH and E_TABLE', async () => {
    const base = original.header.h as CborMap
    const t = (decodeCbor(original.body) as CborMap).t
    const h = { ...base, tables: { strings: [1, true], texts: 'x' } }
    const file = await fileFromBody(encodeDeterministic({ h, t }), base)
    expect(await codeOf(read(file, {}))).toBe('E_BODY')
  })

  test('E_HMISMATCH: only the h of the header differs; the body and the id are untouched', async () => {
    const file = mutate({ header: (h) => ((h.h as CborMap).lang = 'pt-419') })
    expect(file.length).toBe(minimalSeg.length)
    expect(await codeOf(read(file))).toBe('E_HMISMATCH')
  })

  test('E_HMISMATCH: a key in one h and not in the other, a list in another order', async () => {
    expect(await codeOf(read(mutate({ header: (h) => delete (h.h as CborMap).lang })))).toBe('E_HMISMATCH')
    expect(await codeOf(read(mutate({ header: (h) => ((h.h as CborMap).part = 'core') })))).toBe('E_HMISMATCH')
    expect(await codeOf(read(mutate({ header: (h) => (h.h as CborMap).orig = ['g987ab2025a', 'unfoldingWord/el-x-koine/ugnt'] })))).toBe('E_HMISMATCH')
    expect(await codeOf(read(mutate({ header: (h) => ((h.h as CborMap).v = 2) })))).toBe('E_HMISMATCH')
  })

  test('E_HMISMATCH comes before E_TABLE', async () => {
    const file = mutate({ header: (h) => ((h.h as CborMap).lang = 'pt-419') })
    expect(await codeOf(read(file, {}))).toBe('E_HMISMATCH')
  })

  test('the comparison is on decoded values: the order of the keys of h in the header does not matter', async () => {
    const h = original.header.h as CborMap
    const reversed = cborBytes(
      [0xa0 + Object.keys(h).length],
      ...Object.entries(h)
        .reverse()
        .map(([key, value]) => cborBytes(text(key), encodeDeterministic(value))),
    )
    const { h: _h, ...rest } = original.header
    const header = cborBytes(
      [0xa0 + 1 + Object.keys(rest).length],
      text('h'),
      reversed,
      ...Object.entries(rest).map(([key, value]) => cborBytes(text(key), encodeDeterministic(value))),
    )
    const file = assemble({ ...original, header })
    expect(file).not.toEqual(minimalSeg)
    expect((await read(file)).id).toBe(MINIMAL_ID)
  })
})

describe('tables', () => {
  /** A segment with the tables of minimal.seg and these others (name → [version, required]). */
  async function withExtraTables(extra: Record<string, [number, boolean]>): Promise<Uint8Array> {
    const seg: Segment = (await read(minimalSeg)).seg
    const tables = { ...seg.h.tables, ...extra }
    const t: Record<string, CborValue> = { ...seg.t }
    for (const name of Object.keys(extra)) t[name] = [1, 2, 3]
    return (await writeSegment({ h: { ...seg.h, tables }, t })).bytes
  }

  test('E_TABLE: known lacks texts', async () => {
    expect(await codeOf(read(minimalSeg, { strings: [1] }))).toBe('E_TABLE')
  })

  test('E_TABLE: known has another version of a required table', async () => {
    expect(await codeOf(read(minimalSeg, { strings: [1], texts: [2] }))).toBe('E_TABLE')
    expect(await codeOf(read(minimalSeg, { strings: [1], texts: [] }))).toBe('E_TABLE')
    expect((await read(minimalSeg, { strings: [1], texts: [2, 1, 3] })).id).toBe(MINIMAL_ID)
  })

  test('E_TABLE: known is empty', async () => {
    expect(await codeOf(read(minimalSeg, {}))).toBe('E_TABLE')
  })

  test('an optional table future-x is skipped: in skipped, not in seg.t, still in seg.h', async () => {
    const file = await withExtraTables({ 'future-x': [1, false] })
    const result = await read(file)
    expect(result.skipped).toEqual(['future-x'])
    expect(keys(result.seg.t)).toEqual(['strings', 'texts'])
    expect(result.seg.h.tables['future-x']).toEqual([1, false])
    expect(keys(result.seg.h.tables)).toEqual(['future-x', 'strings', 'texts'])
  })

  test('an optional table is read when the caller knows it', async () => {
    const file = await withExtraTables({ 'future-x': [1, false] })
    const result = await read(file, { ...KNOWN, 'future-x': [1] })
    expect(result.skipped).toEqual([])
    expect(result.seg.t['future-x']).toEqual([1, 2, 3])
  })

  test('an optional table in a version the caller does not know is skipped', async () => {
    const file = await withExtraTables({ 'future-x': [2, false] })
    const result = await read(file, { ...KNOWN, 'future-x': [1] })
    expect(result.skipped).toEqual(['future-x'])
    expect(result.seg.t['future-x']).toBeUndefined()
  })

  test('only the unknown optional tables are skipped: a known one stays in seg.t', async () => {
    const seg = (await read(minimalSeg)).seg
    const file = (
      await writeSegment({
        h: { ...seg.h, tables: { strings: [1, true], texts: [1, true], 'future-x': [1, false], 'future-z': [1, false] } },
        t: { ...seg.t, 'future-x': [1], 'future-z': [2] },
      })
    ).bytes
    const result = await read(file, { ...KNOWN, 'future-z': [1] })
    expect(result.skipped).toEqual(['future-x'])
    expect(keys(result.seg.t)).toEqual(['future-z', 'strings', 'texts'])
  })

  test('E_TABLE: a required table future-y that the caller does not know rejects the whole file', async () => {
    const file = await withExtraTables({ 'future-y': [1, true] })
    expect(await codeOf(read(file))).toBe('E_TABLE')
    expect(await codeOf(read(file, { ...KNOWN, 'future-y': [2] }))).toBe('E_TABLE')
    expect((await read(file, { ...KNOWN, 'future-y': [1] })).id).toMatch(/^[0-9a-f]{64}$/)
  })

  test('table names are looked up as own keys of known: "constructor" is not known by inheritance', async () => {
    const required = await withExtraTables({ constructor: [1, true] })
    expect(await codeOf(read(required))).toBe('E_TABLE')
    const optional = await withExtraTables({ constructor: [1, false] })
    const result = await read(optional)
    expect(result.skipped).toEqual(['constructor'])
    expect(keys(result.seg.t)).toEqual(['strings', 'texts'])
  })

  test('an empty required table is a table', async () => {
    const seg = (await read(minimalSeg)).seg
    const file = (await writeSegment({ h: seg.h, t: { ...seg.t, strings: [] } })).bytes
    const result = await read(file)
    expect(result.seg.t.strings).toEqual([])
  })
})

describe('FormatError', () => {
  test('the codes are exactly the 13 of container.md', () => {
    expect([...FORMAT_ERROR_CODES]).toEqual([
      'E_MAGIC',
      'E_VERSION',
      'E_KIND',
      'E_TRUNCATED',
      'E_TRAILING',
      'E_HEADER',
      'E_CODEC',
      'E_INFLATE',
      'E_ID',
      'E_BODY',
      'E_HMISMATCH',
      'E_TABLE',
      'E_LIMIT',
    ])
  })

  test('has a code, a message and is an Error', () => {
    const error = new FormatError('E_ID', 'the id is wrong')
    const code: FormatErrorCode = error.code
    expect(code).toBe('E_ID')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('the id is wrong')
  })
})

describe('the limits are named constants', () => {
  test('values', () => {
    expect(MAX_HEADER_BYTES).toBe(65_536)
    expect(MAX_COMPRESSED_BYTES).toBe(67_108_864)
    expect(MAX_UNCOMPRESSED_BYTES).toBe(67_108_864)
  })
})
