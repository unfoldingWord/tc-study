/**
 * `drawMap`: the SVG text of a map (`diseno-mapas.md` 5.6), with no DOM, shared by Mini and tc-study. Equirectangular, the longitude multiplied by the
 * cosine of the latitude of the middle of the frame; the frame fits the points with a margin (one point: a radius of about 40 km). Each path is cut to the
 * frame, segment by segment (a ring by Sutherland-Hodgman, a line by Liang-Barsky), so a large land ring emits no point far outside the screen even at
 * the deepest zoom; the pieces are simplified to the scale and smoothed once (Chaikin, done here and not stored). More than 200 points are grouped in a grid
 * of 44 px (adjacent circles are pushed apart, in as many passes as needed, so none overlaps another; only points in the frame are counted); markers that fall on nearly the same pixel (route stops that return to a place,
 * Perga and Attalia at a wide zoom) are spread on a small ring (at most 30 px) with a leader line, grouped by distance to the group's first marker, and a bunch of more than 12 becomes one circle; labels go by number of verses, and a label that collides with a dot, a
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

/** A place to draw: its point (degrees), certainty (1 low, 2 medium, 3 high), form (1 point, 2 area, 3 water, 4 height, 5 port), label and verse count. `badge`: the stop numbers of a route that pass here ("1, 12"). `ref`: (a ref with `form` 2 is still drawn as a dot, never as an area name) a well-known place drawn only so the reader can find their bearings (Jerusalem on the map of Jonah 1): a small grey hollow dot with a quiet label; it never widens the frame, never gets a badge, and its label gives way to every other label. */
export type MapPoint = { id: string; lat: number; lon: number; sure: 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5; label: string; verses?: number; badge?: string; ref?: true }

/** The colors of a map, written as attributes in the SVG. */
export type Theme = { sea: string; land: string; coast: string; lake: string; river: string; route: string; point: string; pointHollow: string; label: string; halo: string; cluster: string; clusterText: string; reference?: string; referenceLabel?: string }

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

/** The grey of reference points on a light map. Kept out of {@link LIGHT_THEME} on purpose: a theme without `reference` and `referenceLabel` gets these, so a map without reference points never mentions them. A dark theme must set its own `reference` and `referenceLabel` and also a dark `halo` (the label outline), or the grey text gets a white outline. #757575 is about 4:1 on the default sea and land. */
export const LIGHT_REFERENCE = { reference: '#757575', referenceLabel: '#6b6b6b' }

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
export function fit(points: readonly { lat: number; lon: number; ref?: true }[], width: number, height: number, margin = 28): Frame {
  // reference points are scenery: they never decide how much of the map is shown
  points = points.filter((p) => p.ref !== true)
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

// Text and attribute values: the characters XML 1.0 does not allow are dropped, and & < > " are escaped (every attribute is written between double quotes)
const esc = (s: string): string =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    // a lone surrogate is not text XML can hold
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
/** A reference dot is smaller than a protagonist's, so it reads as a landmark and not as a place of the text. */
const REF_DOT = 3
const CLUSTER = 11

/** The SVG text of the map. See the file's comment. */
export function drawMap(o: DrawMapOptions): string {
  const W = o.width ?? o.frame?.width ?? 360
  const H = o.height ?? o.frame?.height ?? 240
  const font = o.fontSize ?? 11
  const rtl = o.dir === 'rtl'
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) throw new RangeError('drawMap: the width and the height must be finite numbers above 0')
  // The theme is written into attributes: every value goes through esc once, here, so a hostile value cannot leave its attribute
  const th = Object.fromEntries(Object.entries(o.theme ?? LIGHT_THEME).map(([k, v]) => [k, esc(String(v))])) as Theme
  // a theme written before reference points existed has no grey of its own: it gets the light greys
  const refDotColor = th.reference ?? LIGHT_REFERENCE.reference
  const refTextColor = th.referenceLabel ?? LIGHT_REFERENCE.referenceLabel
  const measure = o.measure ?? ((t: string): number => [...t].length * font * 0.6)
  const smooth = o.smooth ?? 1
  const pts = o.points
  for (const p of pts) if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) throw new RangeError(`drawMap: the point ${JSON.stringify(p.id)} has a latitude or longitude that is not a finite number`)
  const frame = o.frame ?? fit(pts, W, H)
  if (![frame.lat, frame.lon, frame.scale].every(Number.isFinite) || frame.scale <= 0) throw new RangeError('drawMap: the frame must have a finite center and a scale above 0')
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

  // Where each marker is drawn: its point, or a place on a small ring when several fall on nearly the same pixel; a bunch of more than 12 becomes a circle
  const home = new Map<string, Pt>(pts.map((p) => [p.id, proj(p.lat, p.lon)]))
  const inFrame = (at: Pt): boolean => at[0] >= box.w && at[0] <= box.e && at[1] >= box.n && at[1] <= box.s
  // a marker off the frame (and its margin) is not drawn and not counted: it may still be a stop of the route, which is drawn through `where`
  // reference points stay apart from all of this (no ring, no circle, no count toward the 200): they are drawn where they are, under everything else
  const refs = pts.filter((p) => p.ref === true && inFrame(home.get(p.id)!))
  const drawn = pts.filter((p) => p.ref !== true && p.form !== 2 && inFrame(home.get(p.id)!))
  const areas = pts.filter((p) => p.ref !== true && p.form === 2)
  const where = new Map<string, Pt>(home)
  const leaderBoxes: [number, number, number, number][] = []
  const leaders: string[] = []
  const circles: { at: Pt; n: number; ids: string[] }[] = []
  const hidden = new Set<string>() // markers drawn as part of a circle
  const clusterMode = drawn.length > 200
  const RING_MAX = 30
  const BUNCH = 12
  if (!clusterMode) {
    const sorted = [...drawn].sort((a, b) => (a.id < b.id ? -1 : 1))
    // groups by distance to the group's first member (no chaining): the first one not yet in a group opens a group
    const taken = new Set<string>()
    for (const first of sorted) {
      if (taken.has(first.id)) continue
      taken.add(first.id)
      const [x0, y0] = home.get(first.id)!
      const list = [first]
      for (const q of sorted) {
        if (taken.has(q.id)) continue
        const [xq, yq] = home.get(q.id)!
        if (Math.hypot(x0 - xq, y0 - yq) < 2 * DOT + 2) {
          taken.add(q.id)
          list.push(q)
        }
      }
      if (list.length < 2) continue
      const cx = list.reduce((t, p) => t + home.get(p.id)![0], 0) / list.length
      const cy = list.reduce((t, p) => t + home.get(p.id)![1], 0) / list.length
      if (list.length > BUNCH) {
        circles.push({ at: [cx, cy], n: list.length, ids: list.map((p) => p.id) })
        for (const p of list) {
          hidden.add(p.id)
          where.set(p.id, [cx, cy])
        }
        continue
      }
      const radius = Math.min(RING_MAX, list.length === 2 ? 7 : 7 + 2 * (list.length - 2))
      list.forEach((p, k) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * k) / list.length
        const at: Pt = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
        where.set(p.id, at)
        leaders.push(`<path class="map-leader" fill="none" stroke="${th.label}" stroke-width="0.6" d="M${n1(cx)} ${n1(cy)}L${n1(at[0])} ${n1(at[1])}"/>`)
        // the obstacle is a few small boxes along the line, not its whole bounding box
        for (const t of [0.34, 0.67, 1]) leaderBoxes.push([cx + (at[0] - cx) * t - 1.5, cy + (at[1] - cy) * t - 1.5, cx + (at[0] - cx) * t + 1.5, cy + (at[1] - cy) * t + 1.5])
      })
    }
  }

  // the route is drawn after the circles are pushed apart, through their final centers: its place in the image is kept here
  const routeAt = parts.length
  parts.push('')
  parts.push(...leaders)

  const dot = (p: MapPoint, x: number, y: number): string =>
    p.sure === 3
      ? `<circle class="map-dot" fill="${th.point}" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="${DOT}"/>`
      : `<circle class="map-dot-open" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="${DOT}" fill="none" stroke="${th.pointHollow}" stroke-width="1.4"/>`
  // reference dots go first in the image so a protagonist's dot is always on top of one
  const dots: string[] = refs.map((p) => {
    const [x, y] = home.get(p.id)!
    return `<circle class="map-dot-ref" data-id="${esc(p.id)}" cx="${n1(x)}" cy="${n1(y)}" r="${REF_DOT}" fill="none" stroke="${refDotColor}" stroke-width="1"/>`
  })
  const labelled: { p: MapPoint; at: Pt }[] = []
  if (clusterMode) {
    const cells = new Map<string, { n: number; x: number; y: number; one: MapPoint }>()
    for (const p of drawn) {
      const [x, y] = home.get(p.id)!
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
      } else circles.push({ at: [c.x / c.n, c.y / c.n], n: c.n, ids: [] })
    }
  } else {
    for (const p of drawn) {
      if (hidden.has(p.id)) continue
      const [x, y] = where.get(p.id)!
      dots.push(dot(p, x, y))
      labelled.push({ p, at: [x, y] })
    }
  }
  // Circles are pushed apart until none overlaps another: passes until nothing moves, with a cap (a dense layout needs more than a few)
  const need = 2 * CLUSTER + 2
  for (let pass = 0; pass < 200; pass++) {
    let moved = false
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i].at
        const b = circles[j].at
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
        if (dist >= need - 1e-6) continue
        const ux = dist === 0 ? 1 : (b[0] - a[0]) / dist
        const uy = dist === 0 ? 0 : (b[1] - a[1]) / dist
        const push = (need - dist) / 2 + 1e-3
        a[0] -= ux * push
        a[1] -= uy * push
        b[0] += ux * push
        b[1] += uy * push
        moved = true
      }
    }
    // a circle stays inside the frame
    for (const c of circles) {
      const x = Math.min(Math.max(c.at[0], CLUSTER), Math.max(CLUSTER, W - CLUSTER))
      const y = Math.min(Math.max(c.at[1], CLUSTER), Math.max(CLUSTER, H - CLUSTER))
      if (x !== c.at[0] || y !== c.at[1]) {
        c.at[0] = x
        c.at[1] = y
        moved = true
      }
    }
    if (!moved) break
  }
  const clusters: Pt[] = circles.map((c) => c.at)
  // the markers of a bunch drawn as a circle are at the circle's final center
  for (const c of circles) for (const id of c.ids) where.set(id, c.at)
  if (o.route !== undefined && o.route.length > 1) {
    const line = o.route.map((id) => where.get(id)).filter((p): p is Pt => p !== undefined)
    if (line.length > 1) parts[routeAt] = `<path class="map-route" fill="none" stroke="${th.route}" stroke-width="1.6" stroke-dasharray="6 4" d="M${line.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}"/>`
  }
  for (const c of circles) {
    dots.push(`<g class="map-cluster"><circle fill="${th.cluster}" cx="${n1(c.at[0])}" cy="${n1(c.at[1])}" r="${CLUSTER}"/><text fill="${th.clusterText}" x="${n1(c.at[0])}" y="${n1(c.at[1] + 4)}" font-size="${font}" text-anchor="middle">${c.n}</text></g>`)
  }
  parts.push(...dots)

  // Labels: most verses first; a collision with a dot, a circle, a leader, a badge or a label already placed leaves the label out. Areas are only their name.
  const placed: [number, number, number, number][] = []
  for (const { at: [x, y] } of labelled) placed.push([x - DOT, y - DOT, x + DOT, y + DOT])
  for (const c of clusters) placed.push([c[0] - CLUSTER, c[1] - CLUSTER, c[0] + CLUSTER, c[1] + CLUSTER])
  placed.push(...leaderBoxes)
  const inside = (r: [number, number, number, number]): boolean => r[0] >= 0 && r[2] <= W && r[1] >= 0 && r[3] <= H
  const free = (r: [number, number, number, number]): boolean => inside(r) && !placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
  const text = (cls: string, x: number, y: number, anchor: string, size: number, body: string, color = th.label): string =>
    `<text class="${cls}" fill="${color}" stroke="${th.halo}" stroke-width="3" paint-order="stroke" x="${n1(x)}" y="${n1(y)}" font-size="${size}" text-anchor="${anchor}">${body}</text>`
  const badges: string[] = []
  for (const { p, at: [x, y] } of labelled) {
    if (p.badge === undefined || p.badge === '') continue
    const w = measure(p.badge) * 0.9
    const rect: [number, number, number, number] = [x - w / 2, y - DOT - font, x + w / 2, y - DOT]
    if (!free(rect)) continue
    placed.push(rect)
    badges.push(text('map-badge', x, y - DOT - 2, 'middle', font - 1, esc(p.badge)))
  }
  const labels: string[] = []
  const gap = 6
  const items = [...labelled.map((l) => ({ ...l, area: false })), ...areas.filter((p) => inFrame(where.get(p.id)!)).map((p) => ({ p, at: where.get(p.id)!, area: true }))].sort(
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
    if (!free(rect)) continue
    placed.push(rect)
    labels.push(text(area ? 'map-label map-area' : 'map-label', tx, y + font / 2 - 2, anchor, font, esc(p.label)))
  }
  // Reference labels come last: they only take what the protagonists left. Their dots become obstacles only now, so a reference dot never pushes a
  // protagonist's label away. A reference label tries its usual side, the other side, above, below and the four diagonals, and is dropped only if none is free. No badge.
  for (const p of refs) {
    const [x, y] = home.get(p.id)!
    placed.push([x - REF_DOT, y - REF_DOT, x + REF_DOT, y + REF_DOT])
  }
  const refFont = font - 1
  for (const p of refs) {
    if (p.label === '') continue
    const [x, y] = home.get(p.id)!
    const w = measure(p.label) * (refFont / font)
    // candidate places, in order: the usual side, the other side, above, below, then the four diagonals; the first free one wins (same test as every label)
    const up = REF_DOT + refFont / 2 + 1
    const diag = gap - 1
    const cands: ['r' | 'l' | 'm', number, number][] = [
      rtl ? ['l', -gap, 0] : ['r', gap, 0],
      rtl ? ['r', gap, 0] : ['l', -gap, 0],
      ['m', 0, -up - 1],
      ['m', 0, up + 1],
      ['r', diag, -up],
      ['l', -diag, -up],
      ['r', diag, up],
      ['l', -diag, up],
    ]
    for (const [ext, dx, dy] of cands) {
      const tx = x + dx
      const cy = y + dy
      const rect: [number, number, number, number] = [ext === 'r' ? tx : ext === 'l' ? tx - w : tx - w / 2, cy - refFont / 2 - 2, ext === 'r' ? tx + w : ext === 'l' ? tx : tx + w / 2, cy + refFont / 2 + 2]
      if (!free(rect)) continue
      placed.push(rect)
      // text-anchor start runs left in a right-to-left page, so the anchor flips there
      const anchor = ext === 'm' ? 'middle' : (ext === 'r') !== rtl ? 'start' : 'end'
      labels.push(text('map-label map-ref', tx, cy + refFont / 2 - 2, anchor, refFont, esc(p.label), refTextColor))
      break
    }
  }
  parts.push(...badges, ...labels)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.summary)}"${rtl ? ' direction="rtl"' : ''}>` +
    `${parts.join('')}</svg>`
  )
}
