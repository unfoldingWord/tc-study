import { describe, expect, test } from 'bun:test'
import type { Basemap } from '@bt-synergy/language-pack-v3'
import { drawMap, LIGHT_THEME, type MapPoint, project, type Theme, unproject } from './drawMap'

const P = (id: string, lat: number, lon: number, label: string, o: Partial<MapPoint> = {}): MapPoint => ({ id, lat, lon, label, sure: 3, form: 1, verses: 1, ...o })
const S = 'Mapa'
const BASE: Basemap = { bbox: [3000, 3000, 3700, 3700], paths: [{ layer: 1, points: [[3000, 3000], [3700, 3000], [3700, 3700], [3000, 3700]] }] }
// land, a lake and a river around 35.1 east, 31.1 north: every part of the theme appears in the image
const SCENE: Basemap = {
  bbox: [3000, 3000, 3700, 3700],
  paths: [
    { layer: 1, points: [[3490, 3090], [3530, 3090], [3530, 3130], [3490, 3130]] },
    { layer: 2, points: [[3505, 3100], [3515, 3100], [3515, 3108], [3505, 3108]] },
    { layer: 3, points: [[3500, 3095], [3520, 3125]] },
  ],
}

// Helpers to read a drawn map back
const circlesOf = (svg: string): [number, number][] => [...svg.matchAll(/<g class="map-cluster"><circle[^>]* cx="([-0-9.]+)" cy="([-0-9.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])])
const dotsOf = (svg: string): Map<string, [number, number]> => new Map([...svg.matchAll(/data-id="([^"]*)" cx="([-0-9.]+)" cy="([-0-9.]+)"/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])] as [number, number]]))
const labelsOf = (svg: string): { x: number; y: number; text: string }[] => [...svg.matchAll(/<text class="map-label"[^>]* x="([-0-9.]+)" y="([-0-9.]+)"[^>]*>([^<]*)</g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }))
const coordinates = (svg: string): [number, number][] =>
  [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) => [...m[1].matchAll(/(-?[0-9.]+) (-?[0-9.]+)/g)].map((c) => [Number(c[1]), Number(c[2])] as [number, number]))

describe('what was drawn, read back', () => {
  test('a label is never over a cluster circle: every label box (as measured) is outside every circle box', () => {
    const many = Array.from({ length: 260 }, (_, i) => P(`lug:p${i}`, 31 + (i % 6) * 0.002, 35 + Math.floor(i / 6) * 0.002, `P${i}`, { verses: 1 }))
    const labelled = [P('lug:x1', 31.004, 35.0, 'Equis', { verses: 900 }), P('lug:x2', 31.02, 35.05, 'Ye', { verses: 800 })]
    const frame = { lat: 31.005, lon: 35.05, scale: 3000, width: 360, height: 240 }
    const svg = drawMap({ points: [...many, ...labelled], frame, summary: S, measure: () => 40 })
    const circles = circlesOf(svg)
    expect(circles.length).toBeGreaterThan(0)
    for (const l of labelsOf(svg)) {
      for (const [cx, cy] of circles) {
        const overlapX = l.x < cx + 11 && l.x + 40 > cx - 11
        const overlapY = l.y - 9 < cy + 11 && l.y + 3 > cy - 11
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })
  test('the route goes through the spread coordinates of its markers, not through their true pixel', () => {
    const pts = [P('lug:a', 36, 30, 'A'), P('lug:b', 36.0001, 30.0001, 'B'), P('lug:far', 37, 31, 'Far')]
    const frame = { lat: 36.5, lon: 30.5, scale: 40, width: 360, height: 240 }
    const svg = drawMap({ points: pts, frame, route: ['lug:a', 'lug:b', 'lug:far'], summary: S })
    const dots = dotsOf(svg)
    const route = /class="map-route"[^>]* d="M([-0-9.]+) ([-0-9.]+)L([-0-9.]+) ([-0-9.]+)L([-0-9.]+) ([-0-9.]+)"/.exec(svg)!
    expect([Number(route[1]), Number(route[2])]).toEqual(dots.get('lug:a')!)
    expect([Number(route[3]), Number(route[4])]).toEqual(dots.get('lug:b')!)
    expect([Number(route[5]), Number(route[6])]).toEqual(dots.get('lug:far')!)
    expect(dots.get('lug:a')).not.toEqual(project(frame, 36, 30).map((v) => Math.round(v * 10) / 10))
  })
  test('the same id twice at one place is one marker, not spread', () => {
    const svg = drawMap({ points: [P('lug:a', 36, 30, 'A'), P('lug:a', 36, 30, 'A')], frame: { lat: 36, lon: 30, scale: 40, width: 360, height: 240 }, summary: S })
    expect(svg).not.toContain('map-leader')
  })
  test('a spread ring is at most 30 px wide, and a bunch of more than 12 is one circle with its number', () => {
    const frame = { lat: 36, lon: 30, scale: 40, width: 360, height: 240 }
    const eleven = Array.from({ length: 11 }, (_, i) => P(`lug:m${i}`, 36 + i * 1e-5, 30, `M${i}`))
    const svg = drawMap({ points: eleven, frame, summary: S })
    const c = project(frame, 36, 30)
    for (const [, [x, y]] of dotsOf(svg)) expect(Math.hypot(x - c[0], y - c[1])).toBeLessThanOrEqual(30.5)
    const thirteen = Array.from({ length: 13 }, (_, i) => P(`lug:m${i}`, 36 + i * 1e-5, 30, `M${i}`))
    const big = drawMap({ points: thirteen, frame, summary: S })
    expect(big).toContain('class="map-cluster"')
    expect(big).toContain('>13<')
    expect(dotsOf(big).size).toBe(0)
  })
  test('a group is by distance to its first marker, not a chain: a line of markers 7 px apart is not one group', () => {
    const frame = { lat: 0, lon: 30, scale: 70, width: 360, height: 240 } // 7 px per 0.1 degree
    const line = Array.from({ length: 6 }, (_, i) => P(`lug:l${i}`, 0, 30 + i * 0.1, `L${i}`))
    const svg = drawMap({ points: line, frame, summary: S })
    // chained, the six would share one center; by distance to the first member there are three pairs, so three centers
    const centers = new Set([...svg.matchAll(/class="map-leader"[^>]* d="M([-0-9.]+ [-0-9.]+)L/g)].map((m) => m[1]))
    expect(centers.size).toBe(3)
  })
  test('a concave ring that straddles the frame is clipped: points inside the margin only, and it is drawn', () => {
    // a C shape: its mouth is in the frame, its body is far away
    const c: Basemap = { bbox: [0, 0, 10000, 10000], paths: [{ layer: 1, points: [[3400, 3100], [3700, 3100], [3700, 3300], [3500, 3300], [3500, 3200], [3400, 3200], [3400, 3400], [3800, 3400], [3800, 3000], [3400, 3000]] }] }
    const frame = { lat: 32, lon: 35, scale: 300, width: 360, height: 240 }
    const svg = drawMap({ points: [P('a', 32, 35, 'A')], basemap: c, frame, summary: S, smooth: 0 })
    expect(svg).toContain('class="map-land"')
    for (const [x, y] of coordinates(svg)) {
      expect(x).toBeGreaterThanOrEqual(-20.5)
      expect(x).toBeLessThanOrEqual(380.5)
      expect(y).toBeGreaterThanOrEqual(-20.5)
      expect(y).toBeLessThanOrEqual(260.5)
    }
  })
  test('a ring that only touches the margin box at a corner is a valid image', () => {
    const frame = { lat: 32, lon: 35, scale: 100, width: 360, height: 240 }
    const corner = unproject(frame, -20, -20)
    const x = Math.round(corner.lon * 100)
    const y = Math.round(corner.lat * 100)
    const ring: Basemap = { bbox: [0, 0, 10000, 10000], paths: [{ layer: 1, points: [[x, y], [x - 500, y], [x, y + 500]] }] }
    const svg = drawMap({ points: [P('a', 32, 35, 'A')], basemap: ring, frame, summary: S })
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
  })
  test('right to left: the x of a label is exactly 6 px left of its dot, and in left to right 6 px right of it', () => {
    const rtl = drawMap({ points: [P('a', 32, 35, 'القدس')], dir: 'rtl', summary: S })
    const ltr = drawMap({ points: [P('a', 32, 35, 'Aaa')], summary: S })
    expect(labelsOf(rtl)[0].x).toBeCloseTo(dotsOf(rtl).get('a')![0] - 6, 1)
    expect(labelsOf(ltr)[0].x).toBeCloseTo(dotsOf(ltr).get('a')![0] + 6, 1)
  })
  test('a dense adversarial layout: bunches in neighbouring cells all end at least 22 px apart', () => {
    const frame = { lat: 32, lon: 35, scale: 400, width: 360, height: 240 }
    const many: MapPoint[] = []
    // a grid of 6-marker bunches only 15 px from each other: their circles start overlapping and must be pushed apart
    for (let gx = 0; gx < 8; gx++) {
      for (let gy = 0; gy < 5; gy++) {
        const at = unproject(frame, 20 + gx * 15, 20 + gy * 15)
        for (let k = 0; k < 6; k++) many.push(P(`lug:g${gx}-${gy}-${k}`, at.lat + k * 1e-6, at.lon, 'x'))
      }
    }
    expect(many.length).toBeGreaterThan(200)
    const svg = drawMap({ points: many, frame, summary: S })
    const circles = circlesOf(svg)
    expect(circles.length).toBeGreaterThan(5)
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) expect(Math.hypot(circles[i][0] - circles[j][0], circles[i][1] - circles[j][1])).toBeGreaterThanOrEqual(22)
  })
  test('in cluster mode only the points in the frame are counted', () => {
    const frame = { lat: 32, lon: 35, scale: 400, width: 360, height: 240 }
    const inside = Array.from({ length: 150 }, (_, i) => P(`lug:in${i}`, 32 + (i % 5) * 1e-5, 35 + (i % 7) * 1e-5, 'a'))
    const outside = Array.from({ length: 300 }, (_, i) => P(`lug:out${i}`, 60 + (i % 5) * 1e-5, 80, 'b'))
    const svg = drawMap({ points: [...inside, ...outside], frame, summary: S })
    expect(svg).not.toContain('>300<')
  })
  test('every value of the theme and every text is escaped: a hostile value stays inside its attribute', () => {
    const hostile = 'red" onload="x'
    for (const key of Object.keys(LIGHT_THEME) as (keyof Theme)[]) {
      const many = Array.from({ length: 250 }, (_, i) => P(`lug:p${i}`, 31 + (i % 5) * 0.001, 35 + Math.floor(i / 5) * 0.001, `P${i}`))
      const svg = drawMap({
        points: [...many, P('lug:q', 31.15, 35.15, 'Q'), P('lug:r', 31.1, 35.1, 'R', { badge: '1<2', sure: 2 }), P('lug:s', 31.11, 35.12, 'S', { form: 2 })],
        route: ['lug:r', 'lug:s'],
        basemap: SCENE,
        frame: { lat: 31.1, lon: 35.1, scale: 800, width: 360, height: 240 },
        theme: { ...LIGHT_THEME, [key]: hostile },
        summary: 'a "quoted" <summary>',
      })
      expect(svg).not.toContain('" onload="')
      expect([key, svg.includes('red&quot; onload=&quot;x')]).toEqual([key, true])
    }
    expect(drawMap({ points: [P('a', 31, 35, 'A', { badge: '<b>&' })], summary: S })).toContain('&lt;b&gt;&amp;')
    expect(drawMap({ points: [P('a', 31, 35, 'A\u0001B')], summary: S })).toContain('>AB<')
  })
  test('a non-finite size or frame is refused', () => {
    expect(() => drawMap({ points: [], summary: S, width: Number.NaN })).toThrow(RangeError)
    expect(() => drawMap({ points: [], summary: S, height: -5 })).toThrow(RangeError)
    expect(() => drawMap({ points: [], summary: S, frame: { lat: 0, lon: 0, scale: Number.POSITIVE_INFINITY, width: 10, height: 10 } })).toThrow(RangeError)
  })
})
