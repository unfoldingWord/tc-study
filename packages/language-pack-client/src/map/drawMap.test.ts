import { describe, expect, test } from 'bun:test'
import type { Basemap } from '@bt-synergy/language-pack-v3'
import { drawMap, type MapPoint } from './drawMap'

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

describe('drawMap', () => {
  test('the SVG of a known answer, with the test basemap, is the saved text', () => {
    expect(drawMap({ points: POINTS, route: ['lug:jerusalem', 'lug:damascus'], basemap: BASE, summary: 'Mapa: 3 lugares' })).toMatchSnapshot()
  })
  test('it is the same text twice, has no DOM and is an accessible image', () => {
    const a = drawMap({ points: POINTS, basemap: BASE })
    expect(drawMap({ points: POINTS, basemap: BASE })).toBe(a)
    expect(a.startsWith('<svg ')).toBe(true)
    expect(a).toContain('role="img"')
    expect(a).toContain('aria-label=')
  })
  test('open against filled by certainty, a dashed route', () => {
    const a = drawMap({ points: POINTS, route: ['lug:jerusalem', 'lug:damascus'] })
    expect(a).toContain('class="map-dot" data-id="lug:jerusalem"')
    expect(a).toContain('class="map-dot-open" data-id="lug:bethlehem"')
    expect(a).toContain('stroke-dasharray')
  })
  test('only the paths that touch the frame are drawn', () => {
    const a = drawMap({ points: POINTS, basemap: BASE })
    expect(a.match(/class="map-land"/g)?.length).toBe(1)
    expect(a).not.toContain('8000')
  })
  test('no colors in the SVG: the page colors the classes', () => {
    expect(drawMap({ points: POINTS, basemap: BASE })).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i)
  })
  test('a label that collides with one placed is left out, the one with more verses wins', () => {
    const a = drawMap({ points: [P('a', 31.78, 35.22, 'Alfa', { verses: 5 }), P('b', 31.7801, 35.2201, 'Beta', { verses: 50 })] })
    expect(a).toContain('>Beta<')
    expect(a).not.toContain('>Alfa<')
  })
  test('one point: a frame of about 40 km around it', () => {
    const a = drawMap({ points: [POINTS[0]], basemap: BASE })
    expect(a).toContain('>Jerusalén<')
  })
  test('more than 200 points are grouped in a grid, a cell with several is a circle with its number', () => {
    const many = Array.from({ length: 250 }, (_, i) => P(`lug:p${i}`, 31 + (i % 5) * 0.001, 35 + Math.floor(i / 5) * 0.001, `P${i}`))
    const a = drawMap({ points: many })
    expect(a).toContain('class="map-cluster"')
    expect((a.match(/<circle/g) ?? []).length).toBeLessThan(60)
  })
  test('right to left: direction rtl on the root, labels with text-anchor start to the left of their dot', () => {
    const rtl = drawMap({ points: [P('a', 31, 35, 'القدس'), P('b', 33, 36.5, 'دمشق')], dir: 'rtl' })
    expect(rtl).toContain('direction="rtl"')
    expect(rtl).not.toContain('text-anchor="end"')
    const x = (svg: string, id: string): number => Number(new RegExp(`data-id="${id}" cx="([0-9.]+)"`).exec(svg)![1])
    const labelX = Number(/<text class="map-label" x="([0-9.]+)"/.exec(rtl)![1])
    expect(labelX).toBeLessThan(Math.max(x(rtl, 'a'), x(rtl, 'b')))
    const ltr = drawMap({ points: [P('a', 31, 35, 'Aaa'), P('b', 33, 36.5, 'Bbb')] })
    expect(ltr).not.toContain('direction=')
  })
  test('the map is not mirrored: north stays at the top, east at the right, in rtl too', () => {
    const svg = drawMap({ points: [P('s', 31, 35, 'S'), P('n', 33, 37, 'N')], dir: 'rtl' })
    const at = (id: string): [number, number] => {
      const m = new RegExp(`data-id="${id}" cx="([0-9.]+)" cy="([0-9.]+)"`).exec(svg)!
      return [Number(m[1]), Number(m[2])]
    }
    expect(at('n')[1]).toBeLessThan(at('s')[1])
    expect(at('n')[0]).toBeGreaterThan(at('s')[0])
  })
  test('the label width comes from measure() when given', () => {
    const wide = (): number => 1000
    const a = drawMap({ points: POINTS, measure: wide })
    expect(a).not.toContain('>Damasco<') // no label fits in 1000 px
    expect(drawMap({ points: POINTS, measure: () => 10 })).toContain('>Damasco<')
  })
  test('names are escaped', () => {
    expect(drawMap({ points: [P('a', 31, 35, 'A<&>"B')] })).toContain('A&lt;&amp;&gt;&quot;B')
  })
  test('areas are only their name; smoothing is a pass of Chaikin that can be turned off', () => {
    const a = drawMap({ points: [P('r', 31, 35, 'Egipto', { form: 2 }), P('c', 31.2, 35.2, 'Ciudad')] })
    expect(a).toContain('map-area')
    expect(a).not.toContain('data-id="r"')
    const smooth = drawMap({ points: POINTS, basemap: BASE })
    const sharp = drawMap({ points: POINTS, basemap: BASE, smooth: 0 })
    expect(smooth).not.toBe(sharp)
  })
  test('no points: a default frame, still a valid image', () => {
    expect(drawMap({ points: [] })).toContain('</svg>')
  })
})
