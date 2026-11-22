/**
 * A minimal reader of ESRI shapefiles (`.shp`) and of the attribute table of their `.dbf`, for Natural Earth (`spec/fuentes.md`): polylines and
 * polygons (shape types 3 and 5, and their Z and M forms, whose extra values are skipped). Only the x and y of each point and the text fields
 * of the table are read. No Node module is used.
 */

/** A shape: its parts (rings of a polygon, lines of a polyline), each a list of `[x, y]` points (longitude, latitude), and its bounding box. */
export type Shape = { bbox: [number, number, number, number]; parts: [number, number][][] }

const POLY_TYPES = new Set([3, 5, 13, 15, 23, 25])

/** The shapes of a `.shp`, in file order: a null shape (type 0) is `null`. Throws `Error` for a file that is not a polyline or polygon shapefile or is cut short. */
export function readShp(bytes: Uint8Array): (Shape | null)[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 100 || dv.getInt32(0, false) !== 9994) throw new Error('shp: not a shapefile (file code is not 9994)')
  const fileType = dv.getInt32(32, true)
  if (!POLY_TYPES.has(fileType)) throw new Error(`shp: shape type ${fileType} is not a polyline or a polygon`)
  const out: (Shape | null)[] = []
  let at = 100
  while (at + 8 <= bytes.length) {
    const words = dv.getInt32(at + 4, false)
    const start = at + 8
    const end = start + words * 2
    if (words < 2 || end > bytes.length) throw new Error('shp: a record is cut short')
    const type = dv.getInt32(start, true)
    if (type === 0) out.push(null)
    else if (!POLY_TYPES.has(type)) throw new Error(`shp: a record has the shape type ${type}`)
    else {
      const bbox: Shape['bbox'] = [dv.getFloat64(start + 4, true), dv.getFloat64(start + 12, true), dv.getFloat64(start + 20, true), dv.getFloat64(start + 28, true)]
      const parts = dv.getInt32(start + 36, true)
      const points = dv.getInt32(start + 40, true)
      const partsAt = start + 44
      const pointsAt = partsAt + parts * 4
      if (parts < 0 || points < 0 || pointsAt + points * 16 > end) throw new Error('shp: a record has more parts or points than its length')
      const firsts: number[] = []
      for (let p = 0; p < parts; p++) firsts.push(dv.getInt32(partsAt + p * 4, true))
      const lists: [number, number][][] = []
      for (let p = 0; p < parts; p++) {
        const from = firsts[p]
        const to = p + 1 < parts ? firsts[p + 1] : points
        if (from < 0 || to > points || from > to) throw new Error('shp: the parts of a record are not in order')
        const list: [number, number][] = []
        for (let i = from; i < to; i++) list.push([dv.getFloat64(pointsAt + i * 16, true), dv.getFloat64(pointsAt + i * 16 + 8, true)])
        lists.push(list)
      }
      out.push({ bbox, parts: lists })
    }
    at = end
  }
  return out
}

/**
 * The rows of a `.dbf` (dBASE III) as the text of the fields named in `fields` (trimmed; `""` when the table has no such field), in record order.
 * A record marked deleted is still a row (the shapes of the `.shp` count it). Throws `Error` for a file that is cut short.
 */
export function readDbf(bytes: Uint8Array, fields: string[]): Record<string, string>[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 32) throw new Error('dbf: too short')
  const rows = dv.getUint32(4, true)
  const headerLength = dv.getUint16(8, true)
  const recordLength = dv.getUint16(10, true)
  const columns: { name: string; at: number; length: number }[] = []
  const latin = new TextDecoder('latin1')
  let offset = 1
  for (let at = 32; at + 32 <= headerLength && bytes[at] !== 0x0d; at += 32) {
    const name = latin.decode(bytes.subarray(at, at + 11)).replace(/\0.*$/s, '')
    const length = bytes[at + 16]
    columns.push({ name, at: offset, length })
    offset += length
  }
  if (headerLength + rows * recordLength > bytes.length) throw new Error('dbf: the records are cut short')
  const utf8 = new TextDecoder('utf-8')
  const wanted = columns.filter((c) => fields.includes(c.name))
  const out: Record<string, string>[] = []
  for (let r = 0; r < rows; r++) {
    const base = headerLength + r * recordLength
    const row: Record<string, string> = Object.fromEntries(fields.map((f) => [f, '']))
    for (const c of wanted) row[c.name] = utf8.decode(bytes.subarray(base + c.at, base + c.at + c.length)).replace(/\0/g, '').trim()
    out.push(row)
  }
  return out
}
