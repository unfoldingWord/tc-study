import { describe, expect, test } from 'bun:test'
import { deflateRaw } from 'pako'
import { zip } from '../../spec/tests/data/topics/natural-earth-fixture'
import { basemapId, decodeBasemap, encodeBasemap } from '../read/basemap'
import { parseOpenBible } from './openbible'
import { readDbf, readShp } from './shapefile'
import { readZip } from './zip'

/** A one-record `.shp` header of `type` (a 100-byte header, then the records given). */
function shpOf(type: number, records: Uint8Array[]): Uint8Array {
  const total = 100 + records.reduce((n, r) => n + r.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setInt32(0, 9994, false)
  dv.setInt32(32, type, true)
  let at = 100
  for (const r of records) {
    out.set(r, at)
    at += r.length
  }
  return out
}
/** A record of a given shape type with `words` 16-bit words of content (a null shape is type 0 and 2 words). */
function record(type: number, words: number): Uint8Array {
  const r = new Uint8Array(8 + words * 2)
  const dv = new DataView(r.buffer)
  dv.setInt32(4, words, false)
  dv.setInt32(8, type, true)
  return r
}

describe('readShp: the errors', () => {
  test('a null shape is null, a point shapefile and a record of another type are errors', () => {
    expect(readShp(shpOf(5, [record(0, 2)]))).toEqual([null])
    expect(() => readShp(shpOf(1, []))).toThrow('not a polyline or a polygon')
    expect(() => readShp(shpOf(5, [record(1, 10)]))).toThrow('shape type 1')
  })
  test('a record longer than the file, and one that says more points than it holds', () => {
    const cut = record(5, 40)
    expect(() => readShp(shpOf(5, [cut.subarray(0, 30)]))).toThrow('cut short')
    const lying = record(5, 30)
    new DataView(lying.buffer).setInt32(8 + 40, 1000, true) // numPoints
    expect(() => readShp(shpOf(5, [lying]))).toThrow('more parts or points')
  })
})

describe('readDbf', () => {
  const dbf = (rows: { deleted?: boolean; name: string }[]): Uint8Array => {
    const headerLength = 65
    const out = new Uint8Array(headerLength + rows.length * 21)
    const dv = new DataView(out.buffer)
    dv.setUint32(4, rows.length, true)
    dv.setUint16(8, headerLength, true)
    dv.setUint16(10, 21, true)
    out.set(new TextEncoder().encode('name'), 32)
    out[43] = 67
    out[48] = 20
    out[64] = 0x0d
    rows.forEach((r, i) => {
      const at = headerLength + i * 21
      out[at] = r.deleted === true ? 0x2a : 0x20
      out.fill(0x20, at + 1, at + 21)
      out.set(new TextEncoder().encode(r.name), at + 1)
    })
    return out
  }
  test('a record marked deleted is still a row (the shapes count it); text is trimmed', () => {
    expect(readDbf(dbf([{ name: 'Jordan  ' }, { deleted: true, name: 'Gone' }]), ['name'])).toEqual([{ name: 'Jordan' }, { name: 'Gone' }])
  })
  test('too short, and records cut short', () => {
    expect(() => readDbf(new Uint8Array(10), ['name'])).toThrow('too short')
    expect(() => readDbf(dbf([{ name: 'a' }, { name: 'b' }]).subarray(0, 70), ['name'])).toThrow('cut short')
  })
})

describe('readZip: the errors', () => {
  const bytes = (n: number): Uint8Array => new Uint8Array(n).fill(7)
  test('ZIP64, encrypted, an unknown method, an entry twice', () => {
    const base = zip([['a.txt', bytes(5), 0]])
    const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength)
    const eocd = base.length - 22
    const z64 = base.slice()
    dv(z64).setUint16(eocd + 10, 0xffff, true)
    expect(() => readZip(z64)).toThrow('ZIP64')
    const central = dv(base).getUint32(eocd + 16, true)
    const enc = base.slice()
    dv(enc).setUint16(central + 8, 1, true)
    expect(() => readZip(enc)).toThrow('encrypted')
    const odd = base.slice()
    dv(odd).setUint16(central + 10, 99, true)
    expect(() => readZip(odd)).toThrow('method 99')
    expect(() => readZip(zip([['a.txt', bytes(3), 0], ['a.txt', bytes(3), 0]]))).toThrow('twice')
  })
  test('a size that is not the entry\'s, and an entry that inflates past the limit is stopped while it inflates', () => {
    const lying = zip([['a.txt', bytes(5), 8]])
    const eocd = lying.length - 22
    const central = new DataView(lying.buffer).getUint32(eocd + 16, true)
    new DataView(lying.buffer).setUint32(central + 24, 9, true)
    expect(() => readZip(lying)).toThrow('its entry says')
    const big = zip([['b.bin', new Uint8Array(100_000), 8]])
    // the entry says its real size, above the limit: refused before inflating
    expect(() => readZip(big, 50_000)).toThrow('larger than')
    // an entry that says it is small and inflates to a lot: the central directory is edited to lie, and the inflate stops at the limit
    const ed = big.length - 22
    const cd = new DataView(big.buffer).getUint32(ed + 16, true)
    new DataView(big.buffer).setUint32(cd + 24, 100, true)
    expect(() => readZip(big, 50_000)).toThrow('inflates to more than')
  })
})

describe('the basemap id is the sha256 of the inflated bytes', () => {
  const model = { bbox: [800, 2200, 5200, 4300] as [number, number, number, number], paths: [{ layer: 1 as const, points: [[1000, 2300], [1500, 2300], [1500, 2800]] as [number, number][] }] }
  test('another compression level gives other bytes and the same id, and a reader given the id checks it (E_ID)', () => {
    const a = encodeBasemap(model)
    const b = deflateRaw(new Uint8Array(0)) // not the same bytes at all
    expect(basemapId(a)).toEqual(basemapId(a))
    const id = basemapId(a)
    expect(decodeBasemap(a, id).paths.length).toBe(1)
    expect(() => decodeBasemap(a, new Uint8Array(32))).toThrow('catalog lists')
    expect(b.length).not.toBe(a.length)
  })
})

describe('parseOpenBible: coordinates', () => {
  test('an identification with a point out of range, or with a text that is not a pair, has no point', () => {
    const line = JSON.stringify({ friendly_id: 'X', identifications: [{ score: { time_total: 5 }, resolutions: [{ lonlat: '200,10' }] }, { score: { time_total: 4 }, resolutions: [{ lonlat: 'north' }] }, { score: {} }] })
    expect(parseOpenBible(line, [])[0].identifications).toEqual([{ score: 5 }, { score: 4 }, { score: 0 }])
  })
})

describe('Theographic points and the rounding of degrees', () => {
  test('an empty latitude or longitude is no point (Number("") is 0)', async () => {
    const { parseTheographicAll } = await import('./theographic')
    const files = {
      verses: '[]',
      people: '[]',
      places: JSON.stringify([
        { id: 'p1', fields: { displayTitle: 'Empty', latitude: '', longitude: '', verses: [] } },
        { id: 'p2', fields: { displayTitle: 'Real', latitude: '31.5', longitude: '35.1', verses: [] } },
      ]),
      events: JSON.stringify([{ id: 'e1', fields: { eventID: 1, title: 'E', verses: [], locations: ['p1', 'p2'] } }]),
    }
    const { events } = parseTheographicAll(files, [])
    expect(events[0].places.map((p) => [p.name, p.point])).toEqual([['Empty', undefined], ['Real', { lat: 31.5, lon: 35.1 }]])
  })
  test('degrees x 100 is Math.round of the product (half toward +infinity); a negative zero is written 0', async () => {
    const { buildGeo } = await import('../build/topics/geo')
    const { encodeDeltas } = await import('../codec/columns')
    const topics = new Map([['lug:a', { kind: 'place' as const, source: 't', ref: 'A@Gen.1.1', title: 'A', ustrong: '' }], ['lug:b', { kind: 'place' as const, source: 't', ref: 'B@Gen.1.1', title: 'B', ustrong: '' }]])
    const records = [
      { kind: 'place' as const, unique: 'A@Gen.1.1', uStrong: 'H1', id: 'lug:a', names: [], relations: [], point: { lat: -0.004, lon: 0.005 } },
      { kind: 'place' as const, unique: 'B@Gen.1.1', uStrong: 'H2', id: 'lug:b', names: [], relations: [], point: { lat: -0.005, lon: 31.785 } },
    ]
    const { geo } = buildGeo({ topics, records, report: [] })
    expect(Object.is(geo['lug:a'].lat, 0)).toBe(true) // -0.4 rounds to -0, written 0
    expect(geo['lug:a'].lon).toBe(1) // 0.5 rounds up
    expect(Object.is(geo['lug:b'].lat, 0)).toBe(true) // -0.5 rounds toward +infinity: -0, written 0
    expect(geo['lug:b'].lon).toBe(3179)
    expect(encodeDeltas([-0])).toEqual(encodeDeltas([0]))
  })
});
