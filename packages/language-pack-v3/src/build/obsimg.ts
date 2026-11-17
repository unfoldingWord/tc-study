/**
 * The builder of the Open Bible Stories pictures (`spec/cddl/obsimg.cddl`): the images of every frame, one segment per story, into
 * the one unit `obsimg` of the catalog `zxx-obsimg`. The images are given as the bytes of the files (converted by the caller); nothing
 * here decodes them.
 */
import { hex, type Segment } from '../codec/container'
import type { ObsImageFrame, ObsImagesMeta } from '../model'
import { type BuiltSegment, builtSegment } from './catalog'

/** The name of the catalog of the pictures, and its header `lang`: the pictures are the same for every language (`catalog.md`, "Catalogs with no linguistic content"). */
export const OBSIMG_CATALOG = 'zxx-obsimg'

/** The frames of each story, stories 1 to 50 in order (598 in all), as the OBS source has them. The build fails when the images are not exactly these. */
export const OBS_FRAMES_PER_STORY: readonly number[] = [
  16, 12, 16, 9, 10, 7, 10, 15, 15, 12, 8, 14, 15, 15, 13, 18, 14, 13, 18, 13, 15, 7, 10, 9, 8, 10, 11, 10, 9, 9, 8, 16, 9, 10, 13, 7, 11, 15, 12, 9, 8,
  11, 13, 9, 13, 10, 14, 14, 18, 17,
]

/** One picture: the frame `frame` of the story `story`, as the bytes of an image file of the type `media` and `w` by `h` pixels. */
export type ObsImageInput = { story: number; frame: number; bytes: Uint8Array; media: string; w: number; h: number }

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * The segments of `images`: one per story of `shape` (default {@link OBS_FRAMES_PER_STORY}; the story is the index + 1), each with
 * frames 1 to `shape[i]` sorted by `n` and the same `meta` row.
 *
 * Throws `Error` for a frame with no image, a story or frame outside the shape, a frame twice, an image with no bytes, or a `w` or `h`
 * that is not a positive integer.
 */
export function obsimgSegments(images: ObsImageInput[], meta: ObsImagesMeta, shape: readonly number[] = OBS_FRAMES_PER_STORY): Segment[] {
  const frames = shape.map(() => new Map<number, ObsImageFrame>())
  for (const image of images) {
    const where = `story ${image.story} frame ${image.frame}`
    const count = Number.isInteger(image.story) ? shape[image.story - 1] : undefined
    if (count === undefined || !Number.isInteger(image.frame) || image.frame < 1 || image.frame > count) throw new Error(`The image of ${where} is not in the shape`)
    if (frames[image.story - 1].has(image.frame)) throw new Error(`The image of ${where} is twice`)
    if (image.bytes.length === 0) throw new Error(`The image of ${where} has no bytes`)
    for (const key of ['w', 'h'] as const) {
      if (!Number.isInteger(image[key]) || image[key] <= 0) throw new Error(`The image of ${where}: ${key} is not a positive integer`)
    }
    frames[image.story - 1].set(image.frame, { n: image.frame, media: image.media, w: image.w, h: image.h, data: image.bytes })
  }
  return shape.map((count, i) => {
    const rows: ObsImageFrame[] = []
    for (let n = 1; n <= count; n++) {
      const row = frames[i].get(n)
      if (row === undefined) throw new Error(`The story ${i + 1} frame ${n} has no image`)
      rows.push(row)
    }
    return {
      h: { class: 'obsimg', v: 1, tables: { frames: [1, true], meta: [1, true] }, lang: OBSIMG_CATALOG, group: pad2(i + 1) },
      t: { frames: rows, meta: [{ ...meta }] },
    } as unknown as Segment
  })
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

/**
 * {@link obsimgSegments} written, each with the fingerprint of what it was built from: the SHA-256 over the story, the `n`, `media`,
 * `w`, `h` and the SHA-256 of the bytes of every frame, and the `meta` row.
 */
export async function builtObsimgSegments(images: ObsImageInput[], meta: ObsImagesMeta, shape: readonly number[] = OBS_FRAMES_PER_STORY): Promise<BuiltSegment[]> {
  const segments = obsimgSegments(images, meta, shape)
  return Promise.all(
    segments.map(async (seg) => {
      const lines = [`obsimg 1 ${seg.h.group}`, JSON.stringify([meta.license, meta.credit, meta.changes, meta.source])]
      for (const frame of (seg.t as unknown as { frames: ObsImageFrame[] }).frames) {
        lines.push(`${frame.n} ${JSON.stringify(frame.media)} ${frame.w} ${frame.h} ${await sha256Hex(frame.data)}`)
      }
      return builtSegment(seg, await sha256Hex(new TextEncoder().encode(lines.join('\n'))))
    }),
  )
}
