/** Test helper: a small signed `zxx-obsimg` catalog (two stories, shape [2, 1], tiny image bytes), signed with the key of a sample. */
import { BUILDER, buildCatalog, builtObsimgSegments, OBSIMG_CATALOG, signCatalog, type ObsImageInput } from '@bt-synergy/language-pack-v3'
import type { Sample } from './sample'

export const OBSIMG_META = {
  license: 'CC BY-SA 3.0',
  credit: 'Illustrations (c) Sweet Publishing, https://sweetpublishing.com',
  changes: 'converted to WebP quality 75',
  source: 'https://cdn.door43.org/obs/jpg/obs-images-360px.zip',
}
export const OBSIMG_SHAPE = [2, 1] as const
const image = (story: number, frame: number, bytes: number[]): ObsImageInput => ({ story, frame, bytes: Uint8Array.from(bytes), media: 'image/webp', w: 640, h: 360 })
export const OBSIMG_IMAGES = [image(1, 1, [1, 2, 3]), image(1, 2, [4, 5]), image(2, 1, [6, 7, 8, 9])]

export type ObsimgFixture = { catalog: Uint8Array; segments: Map<string, Uint8Array>; segmentIds: string[]; bytes: number }

/** The catalog `zxx-obsimg` (revision 1) signed with the sample's key, and its segments by id. */
export async function buildObsimgFixture(sample: Sample, revision = 1): Promise<ObsimgFixture> {
  const built = await builtObsimgSegments(OBSIMG_IMAGES, OBSIMG_META, OBSIMG_SHAPE)
  const cat = await buildCatalog({
    about: { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision, built: '2026-11-01T10:00:00Z', builder: BUILDER, catalog: OBSIMG_CATALOG },
    resources: [],
    segments: built,
  })
  return {
    catalog: await signCatalog(cat.bytes, sample.keys.privateKey),
    segments: new Map(built.map((s) => [s.id, s.bytes])),
    segmentIds: built.map((s) => s.id),
    bytes: built.reduce((n, s) => n + s.bytes.length, 0),
  }
}

/** The sample plus the obsimg catalog and its segments, for `startFakeServer`. */
export function withObsimg(sample: Sample, f: ObsimgFixture): Sample & { catalogs: Record<string, Uint8Array> } {
  return { ...sample, segments: new Map([...sample.segments, ...f.segments]), catalogs: { [OBSIMG_CATALOG]: f.catalog } }
}
