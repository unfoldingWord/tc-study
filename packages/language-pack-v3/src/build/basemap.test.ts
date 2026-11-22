import { describe, expect, test } from 'bun:test'
import { decodeBasemap } from '../read/basemap'
import { readDbf, readShp } from '../source/shapefile'
import { readZip } from '../source/zip'
import { dbf, naturalEarthFixture, shp, zip } from '../../spec/tests/data/topics/natural-earth-fixture'
import { buildBasemap, clipLine, clipRing, simplifyLine, simplifyRing } from './basemap'

type Pt = [number, number]

describe('zip, shp and dbf readers', () => {
  test('a zip with a stored and a deflated entry', () => {
    const files = readZip(zip([['a.txt', new TextEncoder().encode('hello'), 0], ['b.txt', new TextEncoder().encode('hello hello hello hello'), 8]]))
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello')
    expect(new TextDecoder().decode(files.get('b.txt'))).toBe('hello hello hello hello')
  })
  test('not a zip, a cut zip', () => {
    expect(() => readZip(new Uint8Array(40))).toThrow()
    expect(() => readZip(zip([['a', new Uint8Array(3), 0]]).subarray(0, 20))).toThrow()
  })
  test('a polygon shapefile with two parts and its names', () => {
    const square: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
    const hole: Pt[] = [[0.2, 0.2], [0.2, 0.4], [0.4, 0.4], [0.4, 0.2], [0.2, 0.2]]
    const shapes = readShp(shp(5, [[square, hole], [square]]))
    expect(shapes.length).toBe(2)
    expect(shapes[0]!.parts.map((p) => p.length)).toEqual([5, 5])
    expect(shapes[0]!.bbox).toEqual([0, 0, 1, 1])
    expect(readDbf(dbf(['Dead Sea', 'Jordan']), ['name', 'missing'])).toEqual([{ name: 'Dead Sea', missing: '' }, { name: 'Jordan', missing: '' }])
  })
  test('a file that is not a shapefile, or is cut', () => {
    expect(() => readShp(new Uint8Array(120))).toThrow()
    expect(() => readShp(shp(5, [[[[0, 0], [1, 0], [1, 1]]]]).subarray(0, 130))).toThrow()
  })
})

describe('the geometry', () => {
  test('clipRing cuts a square to the rectangle (8 to 52 east, 22 to 43 north) and keeps what is inside', () => {
    const inside = clipRing([[10, 30], [20, 30], [20, 40], [10, 40]])
    expect(inside).toEqual([[10, 30], [20, 30], [20, 40], [10, 40]])
    const cut = clipRing([[0, 20], [60, 20], [60, 50], [0, 50]])
    expect(cut.length).toBe(4)
    expect(Math.min(...cut.map((p) => p[0]))).toBe(8)
    expect(Math.max(...cut.map((p) => p[0]))).toBe(52)
    expect(Math.min(...cut.map((p) => p[1]))).toBe(22)
    expect(Math.max(...cut.map((p) => p[1]))).toBe(43)
    expect(clipRing([[100, 0], [110, 0], [110, 10]])).toEqual([])
  })
  test('clipLine cuts a line into the runs inside; a line that crosses twice is two runs', () => {
    expect(clipLine([[0, 30], [20, 30]])).toEqual([[[8, 30], [20, 30]]])
    expect(clipLine([[10, 30], [60, 30], [60, 40], [10, 40]]).length).toBe(2)
    expect(clipLine([[0, 0], [5, 5]])).toEqual([])
  })
  test('Douglas-Peucker keeps the ends and the corner, drops the point on the line; a ring does not collapse', () => {
    expect(simplifyLine([[0, 0], [1, 0.001], [2, 0], [2, 2]], 0.015)).toEqual([[0, 0], [2, 0], [2, 2]])
    const ring = simplifyRing([[0, 0], [1, 0.001], [2, 0], [2, 2], [0, 2]], 0.015)
    expect(ring.length).toBe(4)
  })
})

describe('buildBasemap', () => {
  const zips = naturalEarthFixture()
  const report: string[] = []
  const built = buildBasemap(zips, report)
  test('land cut to the rectangle, the islet dropped, the lake and the river of the lists kept', () => {
    expect(built.model.paths.map((p) => p.layer)).toEqual([1, 2, 3])
    expect(built.model.bbox).toEqual([800, 2200, 5200, 4300])
    expect(built.model.paths[0].points.length).toBe(4)
  })
  test('the bytes are a basemap a reader accepts, the same twice', () => {
    expect(decodeBasemap(built.bytes)).toEqual(built.model)
    const again = buildBasemap(naturalEarthFixture(), [])
    expect(Buffer.from(again.bytes).equals(Buffer.from(built.bytes))).toBe(true)
    expect(report[0]).toContain('1 land rings, 1 lakes, 1 river paths')
  })
  test('a zip with no dbf is an error', () => {
    expect(() => buildBasemap({ ...zips, land: zip([['ne_10m_land.shp', new Uint8Array(100), 0]]) }, [])).toThrow()
  })
})
