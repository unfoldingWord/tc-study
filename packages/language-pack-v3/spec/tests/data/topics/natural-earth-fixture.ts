/**
 * Test fixtures: Natural Earth style shapefiles and zips built by hand (a polygon or polyline `.shp`, a `.dbf` with a `name` field, a ZIP), for the tests of
 * `basemap.ts` and for the sample of `language-pack-client` (`naturalEarthFixture`). Not part of the build.
 */
import { deflateRaw } from 'pako'

type Pt = [number, number]

/** A polygon or polyline `.shp` (type 5 or 3) with one record per shape; each shape is a list of parts. */
export function shp(type: 3 | 5, shapes: Pt[][][]): Uint8Array {
  const records = shapes.map((parts, i) => {
    const points = parts.flat()
    const size = 44 + parts.length * 4 + points.length * 16
    const b = new DataView(new ArrayBuffer(8 + size))
    b.setInt32(0, i + 1, false)
    b.setInt32(4, size / 2, false)
    b.setInt32(8, type, true)
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    ;[Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((v, k) => b.setFloat64(12 + k * 8, v, true))
    b.setInt32(44, parts.length, true)
    b.setInt32(48, points.length, true)
    let first = 0
    parts.forEach((part, k) => {
      b.setInt32(52 + k * 4, first, true)
      first += part.length
    })
    points.forEach(([x, y], k) => {
      b.setFloat64(52 + parts.length * 4 + k * 16, x, true)
      b.setFloat64(60 + parts.length * 4 + k * 16, y, true)
    })
    return new Uint8Array(b.buffer)
  })
  const total = 100 + records.reduce((n, r) => n + r.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setInt32(0, 9994, false)
  dv.setInt32(24, total / 2, false)
  dv.setInt32(28, 1000, true)
  dv.setInt32(32, type, true)
  let at = 100
  for (const r of records) {
    out.set(r, at)
    at += r.length
  }
  return out
}

/** A `.dbf` with one text field `name` of 20 characters. */
export function dbf(names: string[]): Uint8Array {
  const headerLength = 32 + 32 + 1
  const recordLength = 21
  const out = new Uint8Array(headerLength + names.length * recordLength + 1)
  const dv = new DataView(out.buffer)
  out[0] = 3
  dv.setUint32(4, names.length, true)
  dv.setUint16(8, headerLength, true)
  dv.setUint16(10, recordLength, true)
  out.set(new TextEncoder().encode('name'), 32)
  out[32 + 11] = 'C'.charCodeAt(0)
  out[32 + 16] = 20
  out[64] = 0x0d
  names.forEach((n, i) => {
    const at = headerLength + i * recordLength
    out[at] = 0x20
    out.fill(0x20, at + 1, at + 21)
    out.set(new TextEncoder().encode(n), at + 1)
  })
  return out
}

export const crc32 = (data: Uint8Array): number => {
  let c = ~0
  for (const b of data) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

/** A ZIP with entries stored (method 0) or deflated (8). */
export function zip(entries: [string, Uint8Array, 0 | 8][]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, data, method] of entries) {
    const body = method === 8 ? deflateRaw(data) : data
    const n = new TextEncoder().encode(name)
    const local = new Uint8Array(30 + n.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(8, method, true)
    dv.setUint32(14, crc32(data), true)
    dv.setUint32(18, body.length, true)
    dv.setUint32(22, data.length, true)
    dv.setUint16(26, n.length, true)
    local.set(n, 30)
    const head = new Uint8Array(46 + n.length)
    const cd = new DataView(head.buffer)
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(10, method, true)
    cd.setUint32(16, crc32(data), true)
    cd.setUint32(20, body.length, true)
    cd.setUint32(24, data.length, true)
    cd.setUint16(28, n.length, true)
    cd.setUint32(42, offset, true)
    head.set(n, 46)
    chunks.push(local, body)
    central.push(head)
    offset += local.length + body.length
  }
  const size = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ed = new DataView(end.buffer)
  ed.setUint32(0, 0x06054b50, true)
  ed.setUint16(8, entries.length, true)
  ed.setUint16(10, entries.length, true)
  ed.setUint32(12, size, true)
  ed.setUint32(16, offset, true)
  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0))
  let at = 0
  for (const c of all) {
    out.set(c, at)
    at += c.length
  }
  return out
}


/** The three zips of a tiny Natural Earth: a land square with an islet, two lakes (one in the list of `basemap.ts`), two rivers (one in the list). */
export function naturalEarthFixture(): { land: Uint8Array; lakes: Uint8Array; rivers: Uint8Array } {
  const land = shp(5, [[[[7, 21], [60, 21], [60, 50], [7, 50], [7, 21]]], [[[10, 25], [10.01, 25], [10.01, 25.01], [10, 25]]]])
  const lakes = shp(5, [[[[35.5, 32.8], [35.7, 32.8], [35.7, 32.9], [35.5, 32.9], [35.5, 32.8]]], [[[40, 30], [41, 30], [41, 31], [40, 30]]]])
  const rivers = shp(3, [[[[35, 31], [35.1, 32], [35.2, 33]]], [[[20, 30], [21, 31]]]])
  const files = (name: string, s: Uint8Array, names: string[]): Uint8Array => zip([[`ne_10m_${name}.shp`, s, 8], [`ne_10m_${name}.dbf`, dbf(names), 8]])
  return { land: files('land', land, ['', '']), lakes: files('lakes', lakes, ['Sea of Galilee', 'Some Lake']), rivers: files('rivers_lake_centerlines', rivers, ['Jordan', 'Other']) }
}
