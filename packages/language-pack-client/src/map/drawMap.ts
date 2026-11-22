/**
 * `drawMap`: the SVG text of a map (`diseno-mapas.md` 5.6), with no DOM, shared by Mini and tc-study. Equirectangular, the longitude multiplied by the
 * cosine of the latitude of the middle of the frame; the frame fits the points with a margin (one point: a radius of about 40 km); only the paths that touch
 * the frame are drawn, simplified to the scale and smoothed once (Chaikin, done here and not stored); more than 200 points are grouped in a grid of 44 px;
 * labels go by number of verses and a label that collides with one already placed is left out (the list has them all).
 *
 * Colors are not in the SVG: every shape has a class (`map-sea` the frame, `map-land`, `map-lake`, `map-river`, `map-route`, `map-dot`, `map-dot-open`,
 * `map-label`, `map-cluster`) that the page colors with its theme. Open against filled and a dashed line carry the meaning, never color alone. The map is
 * not mirrored in right-to-left pages (north stays north): the root has `direction="rtl"` and the labels `text-anchor="start"` with their x at the left of
 * their dot, so the text runs away from it. No Node module is used.
 */
import type { Basemap } from '@bt-synergy/language-pack-v3'

/** A place to draw: its point (degrees), certainty (1 low, 2 medium, 3 high), form (1 point, 2 area, 3 water, 4 height, 5 port), label and verse count. */
export type MapPoint = { id: string; lat: number; lon: number; sure: 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5; label: string; verses?: number }

export type DrawMapOptions = {
  points: MapPoint[]
  /** A route: ids of `points` in travel order, drawn as a dashed straight line between stops. */
  route?: string[]
  basemap?: Basemap
  width?: number
  height?: number
  /** The page direction: `rtl` puts the labels to the left of their dot and sets `direction="rtl"` on the root. */
  dir?: 'ltr' | 'rtl'
  /** The summary the screen reader says (`aria-label`). */
  summary?: string
  /** The width in pixels of a label, as the page measures it; without it, an estimate of 0.6 times the font size per character. */
  measure?: (text: string) => number
  fontSize?: number
  /** Smoothing passes of Chaikin over the paths (default 1; 0 none). */
  smooth?: number
}

type Pt = [number, number]

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n1 = (x: number): string => String(Math.round(x * 10) / 10)

function chaikin(points: Pt[], closed: boolean): Pt[] {
  if (points.length < 3) return points
  const out: Pt[] = []
  const last = closed ? points.length : points.length - 1
  if (!closed) out.push(points[0])
  for (let i = 0; i < last; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
  }
  if (!closed) out.push(points[points.length - 1])
  return out
}

function simplify(line: Pt[], tolerance: number): Pt[] {
  if (line.length < 3) return line
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  const t2 = tolerance * tolerance
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    const [ax, ay] = line[from]
    const dx = line[to][0] - ax
    const dy = line[to][1] - ay
    const len2 = dx * dx + dy * dy
    let far = -1
    let best = t2
    for (let i = from + 1; i < to; i++) {
      let t = len2 === 0 ? 0 : ((line[i][0] - ax) * dx + (line[i][1] - ay) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const ex = ax + t * dx - line[i][0]
      const ey = ay + t * dy - line[i][1]
      const d = ex * ex + ey * ey
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

/** The SVG text of the map. See the file's comment. */
export function drawMap(o: DrawMapOptions): string {
  const W = o.width ?? 360
  const H = o.height ?? 240
  const font = o.fontSize ?? 11
  const rtl = o.dir === 'rtl'
  const measure = o.measure ?? ((t: string): number => [...t].length * font * 0.6)
  const smooth = o.smooth ?? 1
  const pts = o.points
  // The frame, in degrees
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  if (pts.length === 0) {
    ;[minLat, maxLat, minLon, maxLon] = [29, 38, 31, 40]
  }
  const midLat = (minLat + maxLat) / 2
  const cos = Math.cos((midLat * Math.PI) / 180)
  let spanLat = maxLat - minLat
  let spanLon = (maxLon - minLon) * cos
  const radius = 40 / 111.2 // one point: a radius of about 40 km, in degrees of latitude
  spanLat = Math.max(spanLat, 2 * radius * (pts.length <= 1 ? 1 : 0.1))
  spanLon = Math.max(spanLon, 2 * radius * (pts.length <= 1 ? 1 : 0.1))
  const margin = 28
  const scale = Math.min((W - 2 * margin) / spanLon, (H - 2 * margin) / spanLat) // pixels per degree of latitude
  const cx = (minLon + maxLon) / 2
  const cy = midLat
  const project = (lat: number, lon: number): Pt => [W / 2 + (lon - cx) * cos * scale, H / 2 - (lat - cy) * scale]
  const frame = { w: -0.2 * W, e: 1.2 * W, n: -0.2 * H, s: 1.2 * H }
  const tolerance = 0.7

  const parts: string[] = []
  const d = (points: Pt[], closed: boolean): string => {
    let list = simplify(points, tolerance)
    for (let i = 0; i < smooth; i++) list = chaikin(list, closed)
    return `M${list.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}${closed ? 'Z' : ''}`
  }
  const touches = (points: Pt[]): boolean => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const [x, y] of points) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    return x1 >= frame.w && x0 <= frame.e && y1 >= frame.n && y0 <= frame.s
  }
  if (o.basemap !== undefined) {
    const land: string[] = []
    const lakes: string[] = []
    const rivers: string[] = []
    for (const path of o.basemap.paths) {
      const points = path.points.map(([x, y]) => project(y / 100, x / 100))
      if (!touches(points) || points.length < 2) continue
      if (path.layer === 1) land.push(d(points, true))
      else if (path.layer === 2) lakes.push(d(points, true))
      else rivers.push(d(points, false))
    }
    if (land.length > 0) parts.push(`<path class="map-land" fill-rule="evenodd" d="${land.join('')}"/>`)
    if (lakes.length > 0) parts.push(`<path class="map-lake" d="${lakes.join('')}"/>`)
    if (rivers.length > 0) parts.push(`<path class="map-river" fill="none" d="${rivers.join('')}"/>`)
  }
  const at = new Map(pts.map((p) => [p.id, project(p.lat, p.lon)]))
  if (o.route !== undefined && o.route.length > 1) {
    const line = o.route.map((id) => at.get(id)).filter((p): p is Pt => p !== undefined)
    if (line.length > 1) parts.push(`<path class="map-route" fill="none" stroke-dasharray="6 4" d="M${line.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}"/>`)
  }
  // Points: grouped in a grid of 44 px when there are more than 200
  const drawn = pts.filter((p) => p.form !== 2)
  const areas = pts.filter((p) => p.form === 2)
  const dots: string[] = []
  const labelled: { p: MapPoint; at: Pt }[] = []
  if (drawn.length > 200) {
    const cells = new Map<string, { n: number; x: number; y: number; one: MapPoint }>()
    for (const p of drawn) {
      const [x, y] = at.get(p.id)!
      const key = `${Math.floor(x / 44)},${Math.floor(y / 44)}`
      const c = cells.get(key)
      if (c === undefined) cells.set(key, { n: 1, x, y, one: p })
      else {
        c.n++
        c.x += x
        c.y += y
      }
    }
    for (const c of [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (c.n === 1) {
        dots.push(dot(c.one, c.x, c.y))
        labelled.push({ p: c.one, at: [c.x, c.y] })
      } else dots.push(`<g class="map-cluster"><circle cx="${n1(c.x / c.n)}" cy="${n1(c.y / c.n)}" r="11"/><text x="${n1(c.x / c.n)}" y="${n1(c.y / c.n + 4)}" text-anchor="middle">${c.n}</text></g>`)
    }
  } else {
    for (const p of drawn) {
      const [x, y] = at.get(p.id)!
      dots.push(dot(p, x, y))
      labelled.push({ p, at: [x, y] })
    }
  }
  function dot(p: MapPoint, x: number, y: number): string {
    return p.sure === 3 ? `<circle class="map-dot" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="4"/>` : `<circle class="map-dot-open" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="4" fill="none"/>`
  }
  parts.push(...dots)
  // Labels: most verses first, a collision with one already placed leaves the label out. Areas are only their name, in the middle of their point.
  const placed: [number, number, number, number][] = []
  const free = (r: [number, number, number, number]): boolean => !placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
  const labels: string[] = []
  const gap = 6
  const items = [
    ...labelled.map((l) => ({ ...l, area: false })),
    ...areas.map((p) => ({ p, at: at.get(p.id)!, area: true })),
  ].sort((a, b) => (b.p.verses ?? 0) - (a.p.verses ?? 0) || (a.p.id < b.p.id ? -1 : 1))
  for (const { p, at: [x, y], area } of items) {
    if (p.label === '') continue
    const w = measure(p.label)
    let rect: [number, number, number, number]
    let tx: number
    let anchor: 'start' | 'middle'
    if (area) {
      tx = x
      anchor = 'middle'
      rect = [x - w / 2, y - font, x + w / 2, y + 3]
    } else if (rtl) {
      tx = x - gap // text-anchor start with direction rtl: the text runs left from here
      anchor = 'start'
      rect = [tx - w, y - font / 2 - 2, tx, y + font / 2 + 2]
    } else {
      tx = x + gap
      anchor = 'start'
      rect = [tx, y - font / 2 - 2, tx + w, y + font / 2 + 2]
    }
    if (rect[0] < 0 || rect[2] > W || rect[1] < 0 || rect[3] > H || !free(rect)) continue
    placed.push(rect)
    labels.push(`<text class="${area ? 'map-label map-area' : 'map-label'}" x="${n1(tx)}" y="${n1(y + font / 2 - 2)}" font-size="${font}" text-anchor="${anchor}">${esc(p.label)}</text>`)
  }
  parts.push(...labels)
  const summary = o.summary ?? `Map: ${pts.length} places`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary)}"${rtl ? ' direction="rtl"' : ''}>` +
    `<rect class="map-sea" width="${W}" height="${H}"/>${parts.join('')}</svg>`
  )
}
