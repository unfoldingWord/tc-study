/**
 * The reader of the Open Bible Stories pictures segment (`spec/cddl/obsimg.cddl`): a {@link Segment} that `readSegment` has
 * accepted, back into an {@link ObsImagesModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a group that is not a
 * story number, a frame whose number is out of order or twice, a size that is not a positive integer, a picture with no
 * bytes, a `meta` with other than one row. It imports no builder code and no Node module.
 */
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, isMap, isUint } from '../codec/values'
import type { ObsImageFrame, ObsImagesMeta, ObsImagesModel } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the obsimg segment is malformed: ${what}`)
}

function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad(`${what} is not text`)
  return value
}

function size(value: unknown, what: string): number {
  if (!isUint(value) || value === 0) bad(`${what} is not a positive integer`)
  return value
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const OBSIMG_TABLES: Readonly<Record<string, number[]>> = { frames: [1], meta: [1] }

/**
 * The story of an `obsimg` segment, its pictures and its credit. `frames` are in the order of `n`; `data` are the bytes of the image file.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not an `obsimg` segment or its tables are not what `obsimg.cddl` says.
 */
export function obsimgView(seg: Segment): ObsImagesModel {
  const { h, t } = seg
  if (h.class !== 'obsimg') bad(`the class is "${h.class}"`)
  if (h.lang === undefined) bad('the header has no lang')
  if (h.group === undefined || !/^\d\d$/.test(h.group)) bad('the header group is not a two-digit story number')
  const story = Number(h.group)
  if (story < 1 || story > 50) bad(`the story ${story} is not a story number (an integer from 1 to 50)`)
  if (!Array.isArray(t.frames) || t.frames.length === 0) bad('the table "frames" is not a list with at least one frame')
  if (!Array.isArray(t.meta) || t.meta.length !== 1) bad('the table "meta" is not a list with one row')

  let last = -1
  const frames = t.frames.map((value, i): ObsImageFrame => {
    const what = `frames[${i}]`
    const fields = map(value, what)
    if (!isUint(fields.n)) bad(`${what}.n is not an integer from 0 to 2^53 - 1`)
    if (fields.n <= last) bad(`${what}.n (${fields.n}) is not above the frame before`)
    last = fields.n
    if (!(fields.data instanceof Uint8Array) || fields.data.length === 0) bad(`${what}.data is not a byte string with at least one byte`)
    return { n: fields.n, media: text(fields.media, `${what}.media`), w: size(fields.w, `${what}.w`), h: size(fields.h, `${what}.h`), data: fields.data }
  })

  const row = map(t.meta[0], 'meta[0]')
  const meta: ObsImagesMeta = {
    license: text(row.license, 'meta[0].license'),
    credit: text(row.credit, 'meta[0].credit'),
    changes: text(row.changes, 'meta[0].changes'),
    source: text(row.source, 'meta[0].source'),
  }
  return { story, frames, meta }
}
