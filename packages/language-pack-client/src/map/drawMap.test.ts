import { describe, expect, test } from 'bun:test'
import type { Basemap } from '@bt-synergy/language-pack-v3'
import { clampScale, drawMap, fit, LIGHT_THEME, MAX_SCALE, type MapPoint, minScale, project, unproject } from './drawMap'

// A small basemap of the test (not the real one: a change of the real map must not break this test): a land square, a lake, a river
const BASE: Basemap = {
  bbox: [3000, 3000, 3700, 3700],
  paths: [
    { layer: 1, points: [[3000, 3000], [3700, 3000], [3700, 3700], [3000, 3700]] },
    { layer: 2, points: [[3500, 3200], [3550, 3200], [3550, 3250], [3500, 3250]] },
    { layer: 3, points: [[3520, 3300], [3530, 3400], [3540, 3500]] },
    { layer: 1, points: [[8000, 3000], [8100, 3000], [8100, 3100]] }, // far away: not drawn
  ],
}
const P = (id: string, lat: number, lon: number, label: string, o: Partial<MapPoint> = {}): MapPoint => ({ id, lat, lon, label, sure: 3, form: 1, verses: 1, ...o })
const POINTS = [P('lug:jerusalem', 31.78, 35.22, 'Jerusalén', { verses: 800 }), P('lug:bethlehem', 31.7, 35.21, 'Belén', { verses: 40, sure: 2 }), P('lug:damascus', 33.51, 36.29, 'Damasco', { verses: 60 })]
const S = 'Mapa: 3 lugares'

/** Every number that follows an M or an L in the d of the paths of an SVG, as [x, y]. */
const coordinates = (svg: string): [number, number][] =>
  [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) => [...m[1].matchAll(/(-?[0-9.]+) (-?[0-9.]+)/g)].map((c) => [Number(c[1]), Number(c[2])] as [number, number]))

describe('drawMap', () => {
  test('the SVG of a known answer, with the test basemap, is the saved text', () => {
    expect(drawMap({ points: POINTS, route: ['lug:jerusalem', 'lug:damascus'], basemap: BASE, summary: S })).toMatchSnapshot()
  })
  test('it is the same text twice, has no DOM and is an accessible image', () => {
    const a = drawMap({ points: POINTS, basemap: BASE, summary: S })
    expect(drawMap({ points: POINTS, basemap: BASE, summary: S })).toBe(a)
    expect(a.startsWith('<svg ')).toBe(true)
    expect(a).toContain('role="img"')
    expect(a).toContain('aria-label="Mapa: 3 lugares"')
  })
  test('open against filled by certainty, a dashed route', () => {
    const a = drawMap({ points: POINTS, route: ['lug:jerusalem', 'lug:damascus'], summary: S })
    expect(a).toContain('class="map-dot" fill="#222222" data-id="lug:jerusalem"')
    expect(a).toContain('class="map-dot-open" data-id="lug:bethlehem"')
    expect(a).toContain('stroke-dasharray')
  })
  test('only the paths that touch the frame are drawn', () => {
    const a = drawMap({ points: POINTS, basemap: BASE, summary: S })
    expect(a.match(/class="map-land"/g)?.length).toBe(1)
    expect(a).not.toContain('8000')
  })
  test('the colors are literal attributes of the theme: no var(), none of the default theme is missing, and a theme replaces them', () => {
    const a = drawMap({ points: POINTS, basemap: BASE, route: ['lug:jerusalem', 'lug:damascus'], summary: S })
    expect(a).not.toContain('var(')
    expect(a).toContain(`fill="${LIGHT_THEME.sea}"`)
    expect(a).toContain(`fill="${LIGHT_THEME.land}"`)
    expect(a).toContain(`stroke="${LIGHT_THEME.river}"`)
    expect(a).toContain(`stroke="${LIGHT_THEME.route}"`)
    expect(a).toContain(`stroke="${LIGHT_THEME.halo}"`)
    const dark = drawMap({ points: POINTS, basemap: BASE, summary: S, theme: { ...LIGHT_THEME, sea: '#101820', land: '#243040', lake: '#000000' } })
    expect(dark).toContain('fill="#101820"')
    expect(dark).toContain('fill="#243040"')
    expect(dark).not.toContain(LIGHT_THEME.sea)
  })
  test('a label that collides with one placed is left out, the one with more verses wins', () => {
    const a = drawMap({ points: [P('a', 31.78, 35.22, 'Alfa', { verses: 5 }), P('b', 31.7801, 35.2201, 'Beta', { verses: 50 })], summary: S })
    expect(a).toContain('>Beta<')
    expect(a).not.toContain('>Alfa<')
  })
  test('a label never lies over a dot: the label of one place is dropped when it would cover the dot of another', () => {
    // two points 9 px apart in the same row: the label of the left one would start 6 px to its right, over the other dot
    const frame = { lat: 32, lon: 35, scale: 2000, width: 360, height: 240 }
    const a = project(frame, 32, 35)
    const b = unproject(frame, a[0] + 14, a[1])
    const svg = drawMap({ points: [P('a', 32, 35, 'Aaaaaaaa', { verses: 9 }), P('b', b.lat, b.lon, 'B', { verses: 1 })], frame, summary: S })
    expect(svg).not.toContain('>Aaaaaaaa<') // it would cover b's dot
    expect(svg).toContain('>B<')
  })
  test('one point: a frame of about 40 km around it', () => {
    expect(drawMap({ points: [POINTS[0]], basemap: BASE, summary: S })).toContain('>Jerusalén<')
  })
  test('more than 200 points are grouped in a grid, a cell with several is a circle with its number', () => {
    const many = Array.from({ length: 250 }, (_, i) => P(`lug:p${i}`, 31 + (i % 5) * 0.001, 35 + Math.floor(i / 5) * 0.001, `P${i}`))
    const a = drawMap({ points: many, summary: S })
    expect(a).toContain('class="map-cluster"')
    expect((a.match(/<circle/g) ?? []).length).toBeLessThan(60)
  })
  test('adjacent cluster circles do not overlap: their centers are at least 22 px apart', () => {
    const frame = { lat: 32, lon: 35, scale: 400, width: 360, height: 240 }
    // 250 points in two tight bunches in neighbouring 44 px cells, whose centers fall close together
    const many: MapPoint[] = []
    // two bunches 2 px apart, one on each side of the border between two cells of the grid (x = 44 px)
    const left = unproject(frame, 43, 100)
    const right = unproject(frame, 45, 100)
    for (let i = 0; i < 125; i++) many.push(P(`lug:a${i}`, left.lat + (i % 5) * 0.00001, left.lon, 'a'))
    for (let i = 0; i < 125; i++) many.push(P(`lug:b${i}`, right.lat + (i % 5) * 0.00001, right.lon, 'b'))
    const svg = drawMap({ points: many, frame, summary: S })
    const centers = [...svg.matchAll(/<g class="map-cluster"><circle[^>]* cx="([0-9.]+)" cy="([0-9.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(centers.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) expect(Math.hypot(centers[i][0] - centers[j][0], centers[i][1] - centers[j][1])).toBeGreaterThanOrEqual(22)
  })
  test('a label never lies over a cluster circle', () => {
    const many = Array.from({ length: 250 }, (_, i) => P(`lug:p${i}`, 31 + (i % 5) * 0.001, 35 + Math.floor(i / 5) * 0.001, `P${i}`))
    const svg = drawMap({ points: [...many, P('lug:x', 31.002, 35.0006, 'LabelOverCircle', { verses: 999 })], summary: S, measure: () => 40 })
    expect(svg).toContain('class="map-cluster"')
  })
  test('right to left: direction rtl on the root, labels with text-anchor start to the left of their dot', () => {
    const rtl = drawMap({ points: [P('a', 31, 35, 'القدس'), P('b', 33, 36.5, 'دمشق')], dir: 'rtl', summary: S })
    expect(rtl).toContain('direction="rtl"')
    expect(rtl).not.toContain('text-anchor="end"')
    const x = (svg: string, id: string): number => Number(new RegExp(`data-id="${id}" cx="([0-9.]+)"`).exec(svg)![1])
    const labelX = Number(/<text class="map-label"[^>]* x="([0-9.]+)"/.exec(rtl)![1])
    expect(labelX).toBeLessThan(Math.max(x(rtl, 'a'), x(rtl, 'b')))
    expect(drawMap({ points: [P('a', 31, 35, 'Aaa'), P('b', 33, 36.5, 'Bbb')], summary: S })).not.toContain('direction=')
  })
  test('the map is not mirrored: north stays at the top, east at the right, in rtl too', () => {
    const svg = drawMap({ points: [P('s', 31, 35, 'S'), P('n', 33, 37, 'N')], dir: 'rtl', summary: S })
    const at = (id: string): [number, number] => {
      const m = new RegExp(`data-id="${id}" cx="([0-9.]+)" cy="([0-9.]+)"`).exec(svg)!
      return [Number(m[1]), Number(m[2])]
    }
    expect(at('n')[1]).toBeLessThan(at('s')[1])
    expect(at('n')[0]).toBeGreaterThan(at('s')[0])
  })
  test('the label width comes from measure() when given', () => {
    expect(drawMap({ points: POINTS, measure: () => 1000, summary: S })).not.toContain('>Damasco<')
    expect(drawMap({ points: POINTS, measure: () => 10, summary: S })).toContain('>Damasco<')
  })
  test('names are escaped', () => {
    expect(drawMap({ points: [P('a', 31, 35, 'A<&>"B')], summary: S })).toContain('A&lt;&amp;&gt;&quot;B')
  })
  test('areas are only their name; smoothing is a pass of Chaikin that can be turned off', () => {
    const a = drawMap({ points: [P('r', 31, 35, 'Egipto', { form: 2 }), P('c', 31.2, 35.2, 'Ciudad')], summary: S })
    expect(a).toContain('map-area')
    expect(a).not.toContain('data-id="r"')
    expect(drawMap({ points: POINTS, basemap: BASE, summary: S })).not.toBe(drawMap({ points: POINTS, basemap: BASE, summary: S, smooth: 0 }))
  })
  test('no points: a default frame, still a valid image', () => {
    expect(drawMap({ points: [], summary: S })).toContain('</svg>')
  })
})

describe('clipping per segment', () => {
  // A land ring of 40 degrees by 40 around the frame, at a deep zoom: every point of the ring is far off screen
  const HUGE: Basemap = { bbox: [0, 0, 10000, 10000], paths: [{ layer: 1, points: [[1000, 2000], [6000, 2000], [6000, 6000], [1000, 6000]] }, { layer: 3, points: [[3500, 3100], [3500, 3300]] }] }
  const frame = { lat: 32, lon: 35, scale: 4000, width: 360, height: 240 }
  test('no coordinate lies more than the margin outside the picture, for a ring and for a line', () => {
    const svg = drawMap({ points: [P('a', 32, 35, 'A')], basemap: HUGE, frame, summary: S, smooth: 0 })
    const c = coordinates(svg)
    expect(c.length).toBeGreaterThan(0)
    for (const [x, y] of c) {
      expect(x).toBeGreaterThanOrEqual(-20.5)
      expect(x).toBeLessThanOrEqual(360 + 20.5)
      expect(y).toBeGreaterThanOrEqual(-20.5)
      expect(y).toBeLessThanOrEqual(240 + 20.5)
    }
    expect(svg).toContain('class="map-land"') // the ring covers the frame: its clipped outline is the margin box
    expect(svg).toContain('class="map-river"') // the river crosses the frame
  })
  test('a ring that does not reach the frame is not drawn', () => {
    const far: Basemap = { bbox: [0, 0, 10000, 10000], paths: [{ layer: 1, points: [[8000, 8000], [9000, 8000], [9000, 9000]] }] }
    expect(drawMap({ points: [P('a', 32, 35, 'A')], basemap: far, frame, summary: S })).not.toContain('map-land')
  })
})

describe('markers on the same pixel', () => {
  test('markers that nearly coincide are spread on a small ring with leaders, and a route goes through the spread positions', () => {
    const pts = [P('lug:perga', 36.96, 30.85, 'Perge'), P('lug:attalia', 36.88, 30.7, 'Atalia'), P('lug:far', 33, 36, 'Lejos')]
    const frame = { lat: 35, lon: 33, scale: 40, width: 360, height: 240 } // 40 px per degree: Perge and Atalia are 7 px apart
    const svg = drawMap({ points: pts, frame, route: ['lug:perga', 'lug:attalia', 'lug:far'], summary: S })
    const at = (id: string): [number, number] => {
      const m = new RegExp(`data-id="${id}" cx="([0-9.]+)" cy="([0-9.]+)"`).exec(svg)!
      return [Number(m[1]), Number(m[2])]
    }
    const [a, b] = [at('lug:perga'), at('lug:attalia')]
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(2 * 4 + 2) // no longer overlapping
    expect((svg.match(/class="map-leader"/g) ?? []).length).toBe(2)
    expect(svg).toContain('class="map-route"')
  })
  test('the same id twice at one place is not spread, three markers are spread evenly, and badges stay readable', () => {
    const pts = [P('lug:a', 36, 30, 'A', { badge: '1, 12' }), P('lug:b', 36.001, 30.001, 'B', { badge: '8/10' }), P('lug:c', 36, 30.001, 'C')]
    const svg = drawMap({ points: pts, frame: { lat: 36, lon: 30, scale: 40, width: 360, height: 240 }, summary: S })
    expect((svg.match(/class="map-leader"/g) ?? []).length).toBe(3)
    expect(svg).toContain('>1, 12<')
    expect((svg.match(/class="map-badge"/g) ?? []).length).toBeGreaterThanOrEqual(1) // a badge that would cover another is left out
    const one = drawMap({ points: [P('lug:a', 36, 30, 'A')], summary: S })
    expect(one).not.toContain('map-leader')
  })
})

describe('the helpers for pan and zoom', () => {
  const frame = { lat: 32, lon: 35, scale: 500, width: 360, height: 240 }
  test('project and unproject are inverses, north is up and east is right', () => {
    const [x, y] = project(frame, 32.1, 35.2)
    const back = unproject(frame, x, y)
    expect(back.lat).toBeCloseTo(32.1, 9)
    expect(back.lon).toBeCloseTo(35.2, 9)
    expect(project(frame, 32.1, 35)[1]).toBeLessThan(project(frame, 32, 35)[1])
    expect(project(frame, 32, 35.1)[0]).toBeGreaterThan(project(frame, 32, 35)[0])
    expect(project(frame, 32, 35)).toEqual([180, 120])
  })
  test('fit: both points are inside with the margin; one point shows about 40 km; the scale never passes the maximum', () => {
    const f = fit([{ lat: 31.78, lon: 35.22 }, { lat: 33.51, lon: 36.29 }], 360, 240)
    for (const p of [{ lat: 31.78, lon: 35.22 }, { lat: 33.51, lon: 36.29 }]) {
      const [x, y] = project(f, p.lat, p.lon)
      expect(x).toBeGreaterThanOrEqual(27.9)
      expect(x).toBeLessThanOrEqual(360 - 27.9)
      expect(y).toBeGreaterThanOrEqual(27.9)
      expect(y).toBeLessThanOrEqual(240 - 27.9)
    }
    expect(fit([{ lat: 32, lon: 35 }], 360, 240).scale).toBeLessThan(MAX_SCALE)
    expect(fit([{ lat: 32, lon: 35 }, { lat: 32, lon: 35 }], 360, 240).scale).toBeLessThanOrEqual(MAX_SCALE)
    expect(MAX_SCALE).toBe(4000)
  })
  test('the zoom limits: the whole basemap fits at the minimum, and a scale is clamped between the limits', () => {
    const bbox: [number, number, number, number] = [800, 2200, 5200, 4300]
    const min = minScale(bbox, 360, 240)
    const f = { lat: 32.5, lon: 30, scale: min, width: 360, height: 240 }
    const [wx, sy] = project(f, 22, 8)
    const [ex, ny] = project(f, 43, 52)
    expect(wx).toBeGreaterThanOrEqual(-0.5)
    expect(ex).toBeLessThanOrEqual(360.5)
    expect(sy).toBeLessThanOrEqual(240.5)
    expect(ny).toBeGreaterThanOrEqual(-0.5)
    expect(clampScale(1, bbox, 360, 240)).toBe(min)
    expect(clampScale(99999, bbox, 360, 240)).toBe(MAX_SCALE)
    expect(clampScale(300, bbox, 360, 240)).toBe(Math.max(min, 300))
  })
})

describe('reference points', () => {
  // Jonah 1: Joppa and Nineveh are the places of the text; Jerusalem and Damascus are only there to find one's bearings
  const JOPPA = P('lug:joppa', 32.05, 34.75, 'Jope', { verses: 3 })
  const NINEVEH = P('lug:nineveh', 36.36, 43.15, 'Nínive', { verses: 4 })
  const REFS = [P('lug:jerusalem', 31.78, 35.22, 'Jerusalén', { ref: true, verses: 800 }), P('lug:damascus', 33.51, 36.29, 'Damasco', { ref: true, verses: 60 })]
  const JONAH = [JOPPA, NINEVEH, ...REFS]
  const DARK = { ...LIGHT_THEME, sea: '#101820', land: '#243040', halo: '#101820', reference: '#9aa5b1', referenceLabel: '#aab4bf' }

  test('a reference point is a small grey hollow dot and a smaller grey label, never bold', () => {
    const svg = drawMap({ points: JONAH, summary: S })
    expect(svg).toContain(`class="map-dot-ref" data-id="lug:jerusalem"`)
    expect(svg).toMatch(/class="map-dot-ref"[^>]*r="3" fill="none" stroke="#757575"/)
    expect(svg).toMatch(/class="map-label map-ref" fill="#6b6b6b"[^>]*font-size="10"[^>]*>Damasco</)
    expect(svg).not.toContain('font-weight')
    // the protagonists keep their own style
    expect(svg).toContain('class="map-dot" fill="#222222" data-id="lug:joppa"')
    expect(svg).toMatch(/class="map-label" fill="#222222"[^>]*font-size="11"[^>]*>Jope</)
  })
  test('the colors of a reference point come from the theme, light or dark, and an old theme without them still works', () => {
    expect(drawMap({ points: JONAH, summary: S, theme: DARK })).toMatch(/class="map-dot-ref"[^>]*stroke="#9aa5b1"/)
    const { reference: _r, referenceLabel: _l, ...old } = LIGHT_THEME
    expect(drawMap({ points: JONAH, summary: S, theme: old })).toContain('class="map-dot-ref"')
  })
  test('a reference label gives way to a protagonist label, however many verses it has', () => {
    // the reference label has 800 verses and would sit right where the protagonist's is: the protagonist stays and the reference label moves to the other side of its dot
    const near = [P('lug:p', 31.78, 35.22, 'Protagonista', { verses: 1 }), P('lug:r', 31.7805, 35.2205, 'Referencia', { ref: true, verses: 800 })]
    const svg = drawMap({ points: near, summary: S })
    expect(svg).toContain('>Protagonista<')
    expect(svg).toMatch(/map-ref"[^>]*text-anchor="end">Referencia</)
  })
  test('a reference dot never takes the place of a protagonist label', () => {
    // the reference dot is right where the protagonist label would start; the protagonist label is still drawn
    const pts = [P('lug:p', 31.78, 35.22, 'Protagonista'), P('lug:r', 31.78, 35.22 + 0.0017, 'Ref', { ref: true })]
    expect(drawMap({ points: pts, summary: S })).toContain('>Protagonista<')
  })
  test('a reference point never has a badge', () => {
    const pts = [P('lug:p', 31.78, 35.22, 'A', { badge: '1' }), P('lug:r', 32.5, 36, 'R', { ref: true, badge: '2' })]
    const svg = drawMap({ points: pts, summary: S })
    expect(svg).toContain('class="map-badge"')
    expect(svg).not.toContain('>2<')
  })
  test('reference points do not widen the frame', () => {
    const frameOf = (pts: MapPoint[]) => fit(pts, 360, 240)
    expect(frameOf(JONAH)).toEqual(frameOf([JOPPA, NINEVEH]))
    expect(drawMap({ points: JONAH, summary: S })).toContain(`viewBox="0 0 360 240"`)
    // a map with a reference point far outside the frame draws the same protagonists at the same pixels
    const far = [JOPPA, NINEVEH, P('lug:rome', 41.9, 12.5, 'Roma', { ref: true })]
    const a = drawMap({ points: far, summary: S })
    expect(a.replace(/<circle class="map-dot-ref"[^>]*\/>/g, '')).toBe(drawMap({ points: [JOPPA, NINEVEH], summary: S }))
  })
  test('a map without reference points is the same as before: the property changes nothing else', () => {
    expect(drawMap({ points: POINTS, basemap: BASE, summary: S })).not.toContain('map-dot-ref')
    expect(drawMap({ points: POINTS.map((p) => ({ ...p })), basemap: BASE, route: ['lug:jerusalem', 'lug:damascus'], summary: S })).toBe(
      drawMap({ points: POINTS, basemap: BASE, route: ['lug:jerusalem', 'lug:damascus'], summary: S }),
    )
  })
  test('a reference point never costs a protagonist its label: every label shown without refs is still shown with them', () => {
    // full label elements (text, x, y, anchor), not just names
    const labelsOf = (svg: string) => [...svg.matchAll(/<text class="map-label"[^>]*>[^<]+<\/text>/g)].map((m) => m[0])
    for (const [width, height] of [[360, 240], [480, 320], [200, 200]]) {
      const without = labelsOf(drawMap({ points: [JOPPA, NINEVEH], summary: S, width, height }))
      const withRefs = labelsOf(drawMap({ points: JONAH, summary: S, width, height }))
      expect(withRefs).toEqual(without)
    }
  })
  test('Jerusalem keeps its label next to Jope at 360x240, above or below its dot, and does not touch Jope label', () => {
    const svg = drawMap({ points: JONAH, summary: S, width: 360, height: 240 })
    const m = svg.match(/class="map-label map-ref"[^>]*x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>Jerusalén</)
    expect(m).not.toBeNull()
    const dot = svg.match(/data-id="lug:jerusalem" cx="([\d.]+)" cy="([\d.]+)"/)!
    expect(Math.abs(Number(m![2]) - Number(dot[2]))).toBeGreaterThan(5) // above or below, not beside
  })
  test('right to left: a reference label runs away from its dot with the anchor flipped', () => {
    const svg = drawMap({ points: [P('lug:r', 31.78, 35.22, 'Ref', { ref: true })], summary: S, dir: 'rtl' })
    const m = svg.match(/map-ref"[^>]*x="([\d.]+)"[^>]*text-anchor="(\w+)"/)!
    const dot = svg.match(/cx="([\d.]+)"/)!
    expect(Number(m[1])).toBeCloseTo(Number(dot[1]) - 6, 1)
    expect(m[2]).toBe('start')
  })
  test('only reference points, and one protagonist with references', () => {
    const only = drawMap({ points: REFS, summary: S, frame: { lat: 32.6, lon: 35.8, scale: 60, width: 360, height: 240 } }) // no protagonist: fit would show the default Levant view
    expect((only.match(/class="map-dot-ref"/g) ?? []).length).toBe(2)
    expect(only).not.toContain('class="map-dot"')
    const one = drawMap({ points: [JOPPA, ...REFS], summary: S, frame: { lat: 32.6, lon: 35.8, scale: 60, width: 360, height: 240 } }) // one protagonist alone would frame only 40 km around it
    expect(one).toContain('>Jope<')
    expect(one).toContain('class="map-dot" fill="#222222" data-id="lug:joppa"')
    expect((one.match(/class="map-dot-ref"/g) ?? []).length).toBe(2)
  })
  test('the 200-point cluster cap ignores reference points', () => {
    const many = Array.from({ length: 200 }, (_, i) => P(`lug:m${String(i).padStart(3, '0')}`, 31 + (i % 20) * 0.05, 35 + Math.floor(i / 20) * 0.05, `M${i}`))
    const withRefs = drawMap({ points: [...many, ...REFS], summary: S, width: 800, height: 600 })
    expect(withRefs).not.toContain('map-cluster') // 200 protagonists plus 2 refs is still not cluster mode
    expect(drawMap({ points: [...many, P('lug:x', 31.5, 35.5, 'X')], summary: S, width: 800, height: 600 })).toContain('map-cluster')
  })
  test('a reference on the same pixel as a protagonist forms no ring', () => {
    const svg = drawMap({ points: [P('lug:p', 31.78, 35.22, 'P'), P('lug:r', 31.78, 35.22, 'R', { ref: true })], summary: S })
    expect(svg).not.toContain('map-leader')
    expect(svg).toContain('cx="180" cy="120" r="4"')
    expect(svg).toContain('cx="180" cy="120" r="3"')
  })
  test('a reference with form 2 is a dot, not an area name', () => {
    const svg = drawMap({ points: [P('lug:a', 31.78, 35.22, 'Area', { ref: true, form: 2 })], summary: S })
    expect(svg).toContain('class="map-dot-ref"')
    expect(svg).not.toContain('map-area')
  })
  test('a small map like Jonah 1, in light and dark, is the saved text', () => {
    expect(drawMap({ points: JONAH, basemap: BASE, summary: 'Jonás 1', width: 360, height: 240 })).toMatchSnapshot('light')
    expect(drawMap({ points: JONAH, basemap: BASE, summary: 'Jonás 1', width: 360, height: 240, theme: DARK })).toMatchSnapshot('dark')
  })
})
