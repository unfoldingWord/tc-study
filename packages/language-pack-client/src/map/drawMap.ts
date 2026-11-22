/**
 * `drawMap`: the SVG text of a map (`diseno-mapas.md` 5.6), with no DOM, shared by Mini and tc-study. Equirectangular, the longitude multiplied by the
 * cosine of the latitude of the middle of the frame; the frame fits the points with a margin (one point: a radius of about 40 km). Each path is cut to the
 * frame, segment by segment (a ring by Sutherland-Hodgman, a line by Liang-Barsky), so a large land ring emits no point far outside the screen even at
 * the deepest zoom; the pieces are simplified to the scale and smoothed once (Chaikin, done here and not stored). More than 200 points are grouped in a grid
 * of 44 px (adjacent circles are pushed apart so none overlaps another); markers that fall on nearly the same pixel (route stops that return to a place,
 * Perga and Attalia at a wide zoom) are spread on a small ring with a leader line; labels go by number of verses, and a label that collides with a dot, a
 * circle or a label already placed is left out (the list has them all).
 *
 * **Colors** are literal attributes taken from `theme` ({@link LIGHT_THEME} by default), so an image that is shared keeps them; there is no `var()` and no style
 * sheet. Every shape also has a class (`map-sea`, `map-land`, `map-lake`, `map-river`, `map-route`, `map-dot`, `map-dot-open`, `map-label`, `map-cluster`,
 * `map-leader`, `map-badge`) as a hook for a page that wants to restyle it. Open against filled and a dashed line carry the meaning, never color alone. The map
 * is not mirrored in right-to-left pages (north stays north): the root has `direction="rtl"` and the labels `text-anchor="start"` with their x at the left of their
 * dot, so the text runs away from it.
 *
 * **For pan and zoom** the module exports the pure helpers a screen needs: a {@link Frame} (center, and `scale` in pixels per degree of latitude), {@link fit},
 * {@link project} and {@link unproject}, {@link minScale} (the scale at which the whole basemap fits: the lower limit of the zoom), {@link MAX_SCALE} (4000
 * pixels per degree: the upper one) and {@link clampScale}. Pass the frame to `drawMap` with `frame`. No Node module is used.
 */
import type { Basemap } from '@bt-synergy/language-pack-v3'

/** A place to draw: its point (degrees), certainty (1 low, 2 medium, 3 high), form (1 point, 2 area, 3 water, 4 height, 5 port), label and verse count. `badge`: the stop numbers of a route that pass here ("1, 12"). */
export type MapPoint = { id: string; lat: number; lon: number; sure: 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5; label: string; verses?: number; badge?: string }

/** The colors of a map, written as attributes in the SVG. */
export type Theme = { sea: string; land: string; coast: string; lake: string; river: string; route: string; point: string; pointHollow: string; label: string; halo: string; cluster: string; clusterText: string }

/** The default light theme. */
export const LIGHT_THEME: Theme = {
  sea: '#dbe9f4',
  land: '#f1ead9',
  coast: '#9a8f78',
  lake: '#dbe9f4',
  river: '#6f9fc6',
  route: '#b3402b',
  point: '#222222',
  pointHollow: '#222222',
  label: '#222222',
  halo: '#ffffff',
  cluster: '#34495e',
  clusterText: '#ffffff',
}

/** The view of a map: the center in degrees and `scale`, pixels per degree of latitude (a degree of longitude is `scale` times the cosine of the center's latitude), in a `width` x `height` picture. */
export type Frame = { lat: number; lon: number; scale: number; width: number; height: number }

/** The upper limit of the zoom, pixels per degree of latitude. */
export const MAX_SCALE = 4000

/** The point of a frame in pixels. North is up, east is right, in every page direction. */
export function project(f: Frame, lat: number, lon: number): [number, number] {
  return [f.width / 2 + (lon - f.lon) * Math.cos((f.lat * Math.PI) / 180) * f.scale, f.height / 2 - (lat - f.lat) * f.scale]
}

/** The point in degrees of a pixel of a frame (the inverse of {@link project}). */
export function unproject(f: Frame, x: number, y: number): { lat: number; lon: number } {
  return { lat: f.lat - (y - f.height / 2) / f.scale, lon: f.lon + (x - f.width / 2) / (f.scale * Math.cos((f.lat * Math.PI) / 180)) }
}

/**
 * The frame that fits the points with `margin` pixels around them: one point (or none) shows a radius of about 40 km. The scale never passes {@link MAX_SCALE}.
 * `points` empty: a default view of the Levant.
 */
export function fit(points: readonly { lat: number; lon: number }[], width: number, height: number, margin = 28): Frame {
  let [minLat, maxLat, minLon, maxLon] = points.length === 0 ? [29, 38, 31, 40] : [Infinity, -Infinity, Infinity, -Infinity]
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  const lat = (minLat + maxLat) / 2
  const cos = Math.cos((lat * Math.PI) / 180)
  const radius = 40 / 111.2 // about 40 km, in degrees of latitude
  const few = points.length <= 1
  const spanLat = Math.max(maxLat - minLat, 2 * radius * (few ? 1 : 0.1))
  const spanLon = Math.max((maxLon - minLon) * cos, 2 * radius * (few ? 1 : 0.1))
  const scale = Math.min(MAX_SCALE, Math.min((width - 2 * margin) / spanLon, (height - 2 * margin) / spanLat))
  return { lat, lon: (minLon + maxLon) / 2, scale, width, height }
}

/** The scale at which the whole basemap (`bbox`, degrees x 100) fits in the picture: the lower limit of the zoom. */
export function minScale(bbox: readonly [number, number, number, number], width: number, height: number): number {
  return fit([{ lat: bbox[1] / 100, lon: bbox[0] / 100 }, { lat: bbox[3] / 100, lon: bbox[2] / 100 }], width, height, 0).scale
}

/** A scale between {@link minScale} of the basemap and {@link MAX_SCALE}. */
export function clampScale(scale: number, bbox: readonly [number, number, number, number], width: number, height: number): number {
  return Math.max(minScale(bbox, width, height), Math.min(MAX_SCALE, scale))
}

export type DrawMapOptions = {
  points: MapPoint[]
  /** A route: ids of `points` in travel order, drawn as a dashed straight line between stops. */
  route?: string[]
  basemap?: Basemap
  width?: number
  height?: number
  /** The view; without it, {@link fit} of the points. */
  frame?: Frame
  theme?: Theme
  /** The page direction: `rtl` puts the labels to the left of their dot and sets `direction="rtl"` on the root. */
  dir?: 'ltr' | 'rtl'
  /** The summary the screen reader says (`aria-label`), in the page's language: required, the function has no words of its own. */
  summary: string
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

type Box = { w: number; e: number; n: number; s: number }

/** A ring cut to the box by Sutherland-Hodgman (it may come back empty). */
function clipRing(ring: Pt[], b: Box): Pt[] {
  const sides: { inside: (p: Pt) => boolean; cut: (a: Pt, c: Pt) => Pt }[] = [
    { inside: (p) => p[0] >= b.w, cut: (a, c) => [b.w, a[1] + ((c[1] - a[1]) * (b.w - a[0])) / (c[0] - a[0])] },
    { inside: (p) => p[0] <= b.e, cut: (a, c) => [b.e, a[1] + ((c[1] - a[1]) * (b.e - a[0])) / (c[0] - a[0])] },
    { inside: (p) => p[1] >= b.n, cut: (a, c) => [a[0] + ((c[0] - a[0]) * (b.n - a[1])) / (c[1] - a[1]), b.n] },
    { inside: (p) => p[1] <= b.s, cut: (a, c) => [a[0] + ((c[0] - a[0]) * (b.s - a[1])) / (c[1] - a[1]), b.s] },
  ]
  let list = ring
  for (const side of sides) {
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

/** A segment cut to the box by Liang-Barsky, or `null`. */
function clipSegment(a: Pt, c: Pt, b: Box): [Pt, Pt] | null {
  let t0 = 0
  let t1 = 1
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - b.w], [dx, b.e - a[0]], [-dy, a[1] - b.n], [dy, b.s - a[1]]] as const) {
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

/** A line cut to the box: the runs inside, each of 2 points or more. */
function clipLine(line: Pt[], b: Box): Pt[][] {
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (let i = 0; i + 1 < line.length; i++) {
    const seg = clipSegment(line[i], line[i + 1], b)
    if (seg === null) {
      if (run.length > 1) runs.push(run)
      run = []
      continue
    }
    const [a, c] = seg
    const last = run[run.length - 1]
    if (last === undefined || last[0] !== a[0] || last[1] !== a[1]) {
      if (run.length > 1) runs.push(run)
      run = [a]
    }
    run.push(c)
  }
  if (run.length > 1) runs.push(run)
  return runs
}

const DOT = 4
const CLUSTER = 11

/** The SVG text of the map. See the file's comment. */
export function drawMap(o: DrawMapOptions): string {
  const W = o.width ?? o.frame?.width ?? 360
  const H = o.height ?? o.frame?.height ?? 240
  const font = o.fontSize ?? 11
  const rtl = o.dir === 'rtl'
  const th = o.theme ?? LIGHT_THEME
  const measure = o.measure ?? ((t: string): number => [...t].length * font * 0.6)
  const smooth = o.smooth ?? 1
  const pts = o.points
  const frame = o.frame ?? fit(pts, W, H)
  const margin = 20
  const box: Box = { w: -margin, e: W + margin, n: -margin, s: H + margin }
  const tolerance = 0.7
  const proj = (lat: number, lon: number): Pt => project(frame, lat, lon)

  const parts: string[] = []
  const d = (points: Pt[], closed: boolean): string => {
    let list = simplify(points, tolerance)
    for (let i = 0; i < smooth; i++) list = chaikin(list, closed)
    return `M${list.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}${closed ? 'Z' : ''}`
  }
  parts.push(`<rect class="map-sea" fill="${th.sea}" width="${W}" height="${H}"/>`)
  if (o.basemap !== undefined) {
    const land: string[] = []
    const lakes: string[] = []
    const rivers: string[] = []
    for (const path of o.basemap.paths) {
      const points = path.points.map(([x, y]) => proj(y / 100, x / 100))
      if (points.length < 2) continue
      if (path.layer === 3) {
        for (const run of clipLine(points, box)) rivers.push(d(run, false))
      } else {
        const ring = clipRing(points, box)
        if (ring.length >= 3) (path.layer === 1 ? land : lakes).push(d(ring, true))
      }
    }
    if (land.length > 0) parts.push(`<path class="map-land" fill="${th.land}" stroke="${th.coast}" stroke-width="0.8" fill-rule="evenodd" d="${land.join('')}"/>`)
    if (lakes.length > 0) parts.push(`<path class="map-lake" fill="${th.lake}" stroke="${th.coast}" stroke-width="0.6" d="${lakes.join('')}"/>`)
    if (rivers.length > 0) parts.push(`<path class="map-river" fill="none" stroke="${th.river}" stroke-width="1.2" d="${rivers.join('')}"/>`)
  }

  // Where each marker is drawn: its point, or a place on a small ring when several fall on nearly the same pixel
  const drawn = pts.filter((p) => p.form !== 2)
  const areas = pts.filter((p) => p.form === 2)
  const where = new Map<string, Pt>()
  const trueAt = new Map<string, Pt>()
  for (const p of pts) {
    const at = proj(p.lat, p.lon)
    where.set(p.id, [at[0], at[1]])
    trueAt.set(p.id, at)
  }
  const leaders: string[] = []
  const clusterMode = drawn.length > 200
  if (!clusterMode) {
    const sorted = [...drawn].sort((a, b) => (a.id < b.id ? -1 : 1))
    // groups of markers closer than a dot and a bit: a point joins the group of the first earlier one it touches
    const group = new Array<number>(sorted.length).fill(-1)
    let groups = 0
    for (let i = 0; i < sorted.length; i++) {
      if (group[i] < 0) group[i] = groups++
      const [xi, yi] = trueAt.get(sorted[i].id)!
      for (let j = i + 1; j < sorted.length; j++) {
        const [xj, yj] = trueAt.get(sorted[j].id)!
        if (group[j] < 0 && Math.hypot(xi - xj, yi - yj) < 2 * DOT + 2) group[j] = group[i]
      }
    }
    const members = new Map<number, MapPoint[]>()
    sorted.forEach((p, i) => members.set(group[i], [...(members.get(group[i]) ?? []), p]))
    for (const list of members.values()) {
      if (list.length < 2) continue
      const cx = list.reduce((s, p) => s + trueAt.get(p.id)![0], 0) / list.length
      const cy = list.reduce((s, p) => s + trueAt.get(p.id)![1], 0) / list.length
      const radius = list.length === 2 ? 7 : 7 + 2 * (list.length - 2)
      list.forEach((p, k) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * k) / list.length
        const at: Pt = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
        where.set(p.id, at)
        leaders.push(`<path class="map-leader" fill="none" stroke="${th.label}" stroke-width="0.6" d="M${n1(cx)} ${n1(cy)}L${n1(at[0])} ${n1(at[1])}"/>`)
      })
    }
  }

  if (o.route !== undefined && o.route.length > 1) {
    const line = o.route.map((id) => where.get(id)).filter((p): p is Pt => p !== undefined)
    if (line.length > 1) parts.push(`<path class="map-route" fill="none" stroke="${th.route}" stroke-width="1.6" stroke-dasharray="6 4" d="M${line.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}"/>`)
  }
  parts.push(...leaders)

  const dot = (p: MapPoint, x: number, y: number): string =>
    p.sure === 3
      ? `<circle class="map-dot" fill="${th.point}" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="${DOT}"/>`
      : `<circle class="map-dot-open" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="${DOT}" fill="none" stroke="${th.pointHollow}" stroke-width="1.4"/>`
  const dots: string[] = []
  const labelled: { p: MapPoint; at: Pt }[] = []
  const clusters: Pt[] = []
  if (clusterMode) {
    const cells = new Map<string, { n: number; x: number; y: number; one: MapPoint }>()
    for (const p of drawn) {
      const [x, y] = where.get(p.id)!
      const key = `${Math.floor(x / 44)},${Math.floor(y / 44)}`
      const c = cells.get(key)
      if (c === undefined) cells.set(key, { n: 1, x, y, one: p })
      else {
        c.n++
        c.x += x
        c.y += y
      }
    }
    const circles: { at: Pt; n: number }[] = []
    for (const c of [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (c.n === 1) {
        dots.push(dot(c.one, c.x, c.y))
        labelled.push({ p: c.one, at: [c.x, c.y] })
      } else circles.push({ at: [c.x / c.n, c.y / c.n], n: c.n })
    }
    // Adjacent circles are pushed apart until none overlaps another (a few passes are enough for a grid of 44 px)
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i].at
          const b = circles[j].at
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
          const need = 2 * CLUSTER + 2
          if (dist >= need) continue
          const ux = dist === 0 ? 1 : (b[0] - a[0]) / dist
          const uy = dist === 0 ? 0 : (b[1] - a[1]) / dist
          const push = (need - dist) / 2
          a[0] -= ux * push
          a[1] -= uy * push
          b[0] += ux * push
          b[1] += uy * push
        }
      }
    }
    for (const c of circles) {
      clusters.push(c.at)
      dots.push(`<g class="map-cluster"><circle fill="${th.cluster}" cx="${n1(c.at[0])}" cy="${n1(c.at[1])}" r="${CLUSTER}"/><text fill="${th.clusterText}" x="${n1(c.at[0])}" y="${n1(c.at[1] + 4)}" font-size="${font}" text-anchor="middle">${c.n}</text></g>`)
    }
  } else {
    for (const p of drawn) {
      const [x, y] = where.get(p.id)!
      dots.push(dot(p, x, y))
      labelled.push({ p, at: [x, y] })
    }
  }
  parts.push(...dots)

  // Labels: most verses first; a collision with a dot, a circle, a badge or a label already placed leaves the label out. Areas are only their name.
  const placed: [number, number, number, number][] = []
  for (const { at: [x, y] } of labelled) placed.push([x - DOT, y - DOT, x + DOT, y + DOT])
  for (const c of clusters) placed.push([c[0] - CLUSTER, c[1] - CLUSTER, c[0] + CLUSTER, c[1] + CLUSTER])
  const free = (r: [number, number, number, number]): boolean => !placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
  const text = (cls: string, x: number, y: number, anchor: string, size: number, body: string): string =>
    `<text class="${cls}" fill="${th.label}" stroke="${th.halo}" stroke-width="3" paint-order="stroke" x="${n1(x)}" y="${n1(y)}" font-size="${size}" text-anchor="${anchor}">${body}</text>`
  const badges: string[] = []
  for (const { p, at: [x, y] } of labelled) {
    if (p.badge === undefined || p.badge === '') continue
    const w = measure(p.badge) * 0.9
    placed.push([x - w / 2, y - DOT - font, x + w / 2, y - DOT])
    badges.push(text('map-badge', x, y - DOT - 2, 'middle', font - 1, esc(p.badge)))
  }
  const labels: string[] = []
  const gap = 6
  const items = [...labelled.map((l) => ({ ...l, area: false })), ...areas.map((p) => ({ p, at: where.get(p.id)!, area: true }))].sort(
    (a, b) => (b.p.verses ?? 0) - (a.p.verses ?? 0) || (a.p.id < b.p.id ? -1 : 1),
  )
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
    labels.push(text(area ? 'map-label map-area' : 'map-label', tx, y + font / 2 - 2, anchor, font, esc(p.label)))
  }
  parts.push(...badges, ...labels)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.summary)}"${rtl ? ' direction="rtl"' : ''}>` +
    `${parts.join('')}</svg>`
  )
}
