/**
 * The complement of kind `basemap`, version 1: the bytes `spec/catalog.md` ("The basemap complement") and `spec/cddl/catalog.cddl`
 * (`basemap-v1`) describe, as a {@link Basemap}. {@link encodeBasemap} writes them and {@link decodeBasemap} reads them, rejecting at the first defect;
 * the caller (the app) then dismisses the complement and draws without a background. The sha256 of the bytes is the `id` the catalog lists. No Node module is used.
 *
 * The file is a CBOR map compressed with deflate-raw (the codec of the segments, with no container around it):
 * `{bbox, layer, count, x, y}`; `layer` and `count` are uvarints per path, `x` and `y` are `deltas` columns of all the points of all the paths, path
 * after path (longitude and latitude, degrees x 100). Rejected with `E_INFLATE` (not a complete deflate stream, or more than {@link BASEMAP_MAX_BYTES} inflated)
 * or `E_BODY` (the rest); `E_LIMIT` for CBOR nested too deep.
 */
import { deflateRaw, Inflate } from 'pako'
import { CborNestingError, type CborValue, decodeCbor, encodeDeterministic } from '../codec/cbor'
import { ColumnError, decodeDeltas, decodeUvarints, encodeDeltas, encodeUvarints } from '../codec/columns'
import { FormatError } from '../codec/errors'
import { hasOwn, isMap } from '../codec/values'
import type { Basemap, BasemapPath } from '../model'

/** The most a basemap inflates to: 4 MiB. */
export const BASEMAP_MAX_BYTES = 4_194_304

/** The layers: 1 land, 2 lake (both closed), 3 river (open). */
export const BASEMAP_LAYERS = [1, 2, 3] as const

function bad(what: string): never {
  throw new FormatError('E_BODY', `the basemap is malformed: ${what}`)
}

/** The checks both directions share. `lengths` is the `count` column; the points are in `x` and `y`. */
function checkShape(bbox: number[], layer: number[], count: number[], x: number[], y: number[]): void {
  if (bbox.length !== 4 || !bbox.every((n) => Number.isSafeInteger(n))) bad('bbox is not four integers')
  const [w, s, e, n] = bbox
  if (w > e || s > n) bad('bbox has its west after its east or its south after its north')
  if (w < -18000 || e > 18000 || s < -9000 || n > 9000) bad('bbox is outside the globe')
  if (layer.length !== count.length) bad('layer and count have different lengths')
  let total = 0
  layer.forEach((l, i) => {
    if (l < 1 || l > 3) bad(`layer[${i}] is ${l}`)
    if (count[i] < (l === 3 ? 2 : 3)) bad(`path ${i} has ${count[i]} points, too few for ${l === 3 ? 'an open' : 'a closed'} path`)
    total += count[i]
  })
  if (x.length !== total || y.length !== total) bad(`x and y have ${x.length} and ${y.length} values, and count adds up to ${total}`)
  for (let i = 0; i < total; i++) {
    if (x[i] < w || x[i] > e || y[i] < s || y[i] > n) bad(`point ${i} is outside bbox`)
  }
}

/** The bytes of a basemap; throws `E_BODY` for a model the reader would reject. */
export function encodeBasemap(model: Basemap): Uint8Array {
  const layer = model.paths.map((p) => p.layer as number)
  const count = model.paths.map((p) => p.points.length)
  const x = model.paths.flatMap((p) => p.points.map((pt) => pt[0]))
  const y = model.paths.flatMap((p) => p.points.map((pt) => pt[1]))
  checkShape([...model.bbox], layer, count, x, y)
  const body = encodeDeterministic({
    bbox: [...model.bbox],
    layer: encodeUvarints(layer),
    count: encodeUvarints(count),
    x: encodeDeltas(x),
    y: encodeDeltas(y),
  } as unknown as CborValue)
  return deflateRaw(body, { level: 9 })
}

interface InflateState {
  ended: boolean
  err: number
  strm: { avail_in: number }
}

function inflate(bytes: Uint8Array): Uint8Array {
  const inflator = new Inflate({ raw: true })
  const chunks: Uint8Array[] = []
  let total = 0
  inflator.onData = (chunk) => {
    total += (chunk as Uint8Array).length
    if (total > BASEMAP_MAX_BYTES) throw new FormatError('E_INFLATE', `the basemap inflates to more than ${BASEMAP_MAX_BYTES} bytes`)
    chunks.push(chunk as Uint8Array)
  }
  let ok: boolean
  try {
    ok = inflator.push(bytes)
  } catch (error) {
    if (error instanceof FormatError) throw error
    throw new FormatError('E_INFLATE', 'the basemap does not inflate')
  }
  const state = inflator as unknown as InflateState
  if (!ok || state.err !== 0 || !state.ended) throw new FormatError('E_INFLATE', 'the basemap is not a complete deflate stream')
  if (state.strm.avail_in > 0) throw new FormatError('E_INFLATE', 'there are bytes after the deflate stream')
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** The basemap the bytes hold. Throws {@link FormatError} (`E_INFLATE`, `E_LIMIT` or `E_BODY`) at the first defect; a key the schema does not list is ignored. */
export function decodeBasemap(bytes: Uint8Array): Basemap {
  const body = inflate(bytes)
  let value: CborValue
  try {
    value = decodeCbor(body)
  } catch (error) {
    if (error instanceof CborNestingError) throw new FormatError('E_LIMIT', 'the basemap is nested too deep')
    if (error instanceof ColumnError) return bad(error.message)
    throw error
  }
  try {
    if (!isMap(value)) bad('it is not a map')
    const m = value as { [key: string]: CborValue }
    for (const key of ['bbox', 'layer', 'count', 'x', 'y']) if (!hasOwn(m, key)) bad(`there is no "${key}"`)
    const bbox = m.bbox
    if (!Array.isArray(bbox) || !bbox.every((n) => typeof n === 'number')) bad('bbox is not a list of numbers')
    for (const key of ['layer', 'count', 'x', 'y']) if (!(m[key] instanceof Uint8Array)) bad(`${key} is not a byte string`)
    const layer = decodeUvarints(m.layer as Uint8Array)
    const count = decodeUvarints(m.count as Uint8Array)
    const x = decodeDeltas(m.x as Uint8Array)
    const y = decodeDeltas(m.y as Uint8Array)
    checkShape(bbox as number[], layer, count, x, y)
    const paths: BasemapPath[] = []
    let at = 0
    layer.forEach((l, i) => {
      const points: [number, number][] = []
      for (let k = 0; k < count[i]; k++, at++) points.push([x[at], y[at]])
      paths.push({ layer: l as 1 | 2 | 3, points })
    })
    const [w, s, e, n] = bbox as number[]
    return { bbox: [w, s, e, n], paths }
  } catch (error) {
    if (error instanceof ColumnError) return bad(error.message)
    throw error
  }
}
