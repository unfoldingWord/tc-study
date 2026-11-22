/**
 * The `basemap` complement (`spec/catalog.md`, "The basemap complement"; `spec/ids.md`, "Builder rules: basemap"): land, four lakes and the rivers of the
 * list below, from the Natural Earth 10m shapefiles, cut to the rectangle of the first map (8 to 52 degrees east, 22 to 43 north) and
 * simplified (Douglas-Peucker, 0.015 degrees), with the points rounded to 0.01 degrees, and a land ring of less than 0.05 square degrees dropped. Land and lakes are closed paths (a ring is cut by Sutherland-Hodgman
 * against the rectangle), rivers are open ones (each segment is cut by Liang-Barsky and the pieces become paths of their own). The land rings, holes
 * included, are painted with the even-odd rule. No Node module is used.
 */
import type { Basemap, BasemapPath } from '../model'
import { readDbf, readShp, type Shape } from '../source/shapefile'
import { readZip } from '../source/zip'
import { sha256 } from '../codec/sha256'
import { encodeBasemap } from '../read/basemap'

type Pt = [number, number]

/** The rectangle of the first map, `[west, south, east, north]` in degrees x 100. */
export const BASEMAP_BBOX: [number, number, number, number] = [800, 2200, 5200, 4300]
/** The tolerance of the simplification, degrees. */
export const BASEMAP_TOLERANCE = 0.015

/** A land ring smaller than this (square degrees, about 600 square kilometres) is dropped (a lake never is): the islets of the Aegean are not a background. */
export const BASEMAP_MIN_AREA = 0.05

/** The lakes kept, by the `name` of `ne_10m_lakes` (the Dead Sea is two shapes). */
export const BASEMAP_LAKES: readonly string[] = ['Dead Sea', 'Sea of Galilee', 'Lake Van', 'Lake Urmia']
/**
 * The rivers kept, by the `name` of `ne_10m_rivers_lake_centerlines`: the Jordan, the Nile with its Rosetta and Damietta branches, the Euphrates (with
 * its stretches `Firat` and `Al Furat`), the Tigris (`Dicle`), the Shatt al-Arab, the Murat, the Orontes (`Atshan`), the Halys (`Kizilirmak`) and the Tiber (`Tevere`).
 */
export const BASEMAP_RIVERS: readonly string[] = [
  'Jordan', 'Nile', 'Rosetta Branch', 'Damietta Branch', 'Euphrates', 'Firat', 'Al Furat', 'Tigris', 'Dicle', 'Shatt al-Arab', 'Murat', 'Atshan', 'Kızılırmak', 'Tevere',
]

const W = BASEMAP_BBOX[0] / 100
const S = BASEMAP_BBOX[1] / 100
const E = BASEMAP_BBOX[2] / 100
const N = BASEMAP_BBOX[3] / 100

/** One side of the rectangle: a point is inside when `inside` says so; `cut` gives the crossing of the segment a to b with the side. */
const SIDES: { inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt }[] = [
  { inside: (p) => p[0] >= W, cut: (a, b) => [W, a[1] + ((b[1] - a[1]) * (W - a[0])) / (b[0] - a[0])] },
  { inside: (p) => p[0] <= E, cut: (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])] },
  { inside: (p) => p[1] >= S, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (S - a[1])) / (b[1] - a[1]), S] },
  { inside: (p) => p[1] <= N, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (N - a[1])) / (b[1] - a[1]), N] },
]

/** A ring (closed: the first point is not repeated, or is, and is dropped) cut to the rectangle by Sutherland-Hodgman. May be empty. */
export function clipRing(ring: Pt[]): Pt[] {
  let list = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  for (const side of SIDES) {
    if (list.length === 0) return []
    const next: Pt[] = []
    let prev = list[list.length - 1]
    let prevIn = side.inside(prev)
    for (const cur of list) {
      const curIn = side.inside(cur)
      if (curIn) {
        if (!prevIn) next.push(side.cut(prev, cur))
        next.push(cur)
      } else if (prevIn) next.push(side.cut(prev, cur))
      prev = cur
      prevIn = curIn
    }
    list = next
  }
  return list
}

/** A segment cut to the rectangle by Liang-Barsky: the part inside, or `null`. */
function clipSegment(a: Pt, b: Pt): [Pt, Pt] | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - W], [dx, E - a[0]], [-dy, a[1] - S], [dy, N - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const r = q / p
      if (p < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]]
}

/** A line cut to the rectangle: the runs of it inside (each at least 2 points). */
export function clipLine(line: Pt[]): Pt[][] {
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (let i = 0; i + 1 < line.length; i++) {
    const seg = clipSegment(line[i], line[i + 1])
    if (seg === null) {
      if (run.length > 1) runs.push(run)
      run = []
      continue
    }
    const [a, b] = seg
    const continues = run.length > 0 && run[run.length - 1][0] === a[0] && run[run.length - 1][1] === a[1]
    if (!continues) {
      if (run.length > 1) runs.push(run)
      run = [a]
    }
    run.push(b)
  }
  if (run.length > 1) runs.push(run)
  return runs
}

const distance2 = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + t * dx - p[0]
  const y = a[1] + t * dy - p[1]
  return x * x + y * y
}

/** Douglas-Peucker on an open polyline (iterative): the points kept, the ends always. */
export function simplifyLine(line: Pt[], tolerance: number): Pt[] {
  if (line.length < 3) return line.slice()
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  const t2 = tolerance * tolerance
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    let far = -1
    let best = t2
    for (let i = from + 1; i < to; i++) {
      const d = distance2(line[i], line[from], line[to])
      if (d > best) {
        best = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([from, far], [far, to])
    }
  }
  return line.filter((_, i) => keep[i] === 1)
}

/** Douglas-Peucker on a ring: split at the first point and the one farthest from it, so that a ring never collapses to a line. */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length < 4) return ring.slice()
  let far = 0
  let best = -1
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const a = simplifyLine(ring.slice(0, far + 1), tolerance)
  const b = simplifyLine([...ring.slice(far), ring[0]], tolerance)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

/** Points in degrees to degrees x 100 (rounded); consecutive repeats and the repeat of the first point at the end dropped. */
function quantize(points: Pt[], closed: boolean): [number, number][] {
  const out: [number, number][] = []
  for (const [x, y] of points) {
    // Math.round of the float64 product (half toward +infinity); + 0 turns a -0 into 0
    const q: [number, number] = [Math.round(x * 100) + 0, Math.round(y * 100) + 0]
    const last = out[out.length - 1]
    if (last === undefined || last[0] !== q[0] || last[1] !== q[1]) out.push(q)
  }
  if (closed && out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop()
  return out
}

/** The doubled area of a ring in degrees x 100 (absolute). */
const area2 = (ring: [number, number][]): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum)
}

const touches = (s: Shape): boolean => s.bbox[2] >= W && s.bbox[0] <= E && s.bbox[3] >= S && s.bbox[1] <= N

function ringsOf(shape: Shape, minArea: number): BasemapPath[] {
  const out: BasemapPath[] = []
  for (const part of shape.parts) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const [x, y] of part) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    if (maxX < W || minX > E || maxY < S || minY > N) continue
    const clipped = clipRing(part)
    if (clipped.length < 3) continue
    const points = quantize(simplifyRing(clipped, BASEMAP_TOLERANCE), true)
    if (points.length >= 3 && area2(points) / 2 / 10000 >= minArea) out.push({ layer: 1, points })
  }
  return out
}

/**
 * The basemap of the three Natural Earth zips (`ne_10m_land`, `ne_10m_lakes`, `ne_10m_rivers_lake_centerlines`): the model and the bytes of the complement.
 * `report` gets one line with the counts. Throws `Error` for a zip that lacks its `.shp` or `.dbf`.
 */
export function buildBasemap(zips: { land: Uint8Array; lakes: Uint8Array; rivers: Uint8Array }, report: string[]): { model: Basemap; bytes: Uint8Array; id: Uint8Array } {
  const open = (bytes: Uint8Array, name: string, fields: string[]): { shapes: (Shape | null)[]; rows: Record<string, string>[] } => {
    const files = readZip(bytes)
    const shp = files.get(`ne_10m_${name}.shp`)
    const dbf = files.get(`ne_10m_${name}.dbf`)
    if (shp === undefined || dbf === undefined) throw new Error(`the zip of ne_10m_${name} has no .shp or .dbf`)
    const shapes = readShp(shp)
    const rows = readDbf(dbf, fields)
    if (rows.length !== shapes.length) throw new Error(`ne_10m_${name}: ${shapes.length} shapes and ${rows.length} rows`)
    return { shapes, rows }
  }
  const paths: BasemapPath[] = []
  const land = open(zips.land, 'land', [])
  for (const shape of land.shapes) if (shape !== null && touches(shape)) paths.push(...ringsOf(shape, BASEMAP_MIN_AREA))
  const lakes = open(zips.lakes, 'lakes', ['name'])
  lakes.shapes.forEach((shape, i) => {
    if (shape === null || !touches(shape) || !BASEMAP_LAKES.includes(lakes.rows[i].name)) return
    for (const ring of ringsOf(shape, 0)) paths.push({ layer: 2, points: ring.points })
  })
  const rivers = open(zips.rivers, 'rivers_lake_centerlines', ['name'])
  rivers.shapes.forEach((shape, i) => {
    if (shape === null || !touches(shape) || !BASEMAP_RIVERS.includes(rivers.rows[i].name)) return
    for (const part of shape.parts) {
      for (const run of clipLine(part)) {
        const points = quantize(simplifyLine(run, BASEMAP_TOLERANCE), false)
        if (points.length >= 2) paths.push({ layer: 3, points })
      }
    }
  })
  const model: Basemap = { bbox: [...BASEMAP_BBOX], paths }
  const bytes = encodeBasemap(model)
  const id = sha256(bytes) // the id of a complement is the sha256 of its file bytes, so pako 2.1.0 at level 9 is part of the build
  const count = (layer: number): number => paths.filter((p) => p.layer === layer).length
  const points = paths.reduce((n, p) => n + p.points.length, 0)
  report.push(`basemap: ${count(1)} land rings, ${count(2)} lakes, ${count(3)} river paths, ${points} points, ${bytes.length} bytes`)
  return { model, bytes, id }
}
