/** The catalog `zxx-obsimg`: the pictures of the 50 Open Bible Stories, converted, into one segment per story. */
import { type About, type BuiltSegment, buildCatalog, builtObsimgSegments, BUILDER, OBSIMG_CATALOG, type ObsImageInput, type ObsImagesMeta } from '@bt-synergy/language-pack-v3'
import { OBS_IMAGES_ZIP } from './source'

export const OBS_IMAGES_LICENSE = 'CC BY-SA 3.0'
export const OBS_IMAGES_CREDIT = 'Illustrations © Sweet Publishing, https://sweetpublishing.com'

/** The `meta` row of every segment: what a reader needs to show the credit of one story alone. */
export function obsImagesMeta(encoder: string, source: string = OBS_IMAGES_ZIP.url): ObsImagesMeta {
  return { license: OBS_IMAGES_LICENSE, credit: OBS_IMAGES_CREDIT, changes: `converted to WebP quality 75 (${encoder})`, source }
}

export type ObsImagesBuild = { segments: BuiltSegment[]; catalog: BuiltSegment }

/** The segments and the (unsigned) catalog. `about.builder` names the pipeline and the encoder. */
export async function buildObsImages(o: {
  images: ObsImageInput[]
  encoder: string
  about: Omit<About, 'catalog' | 'builder'>
  source?: string
  shape?: readonly number[]
}): Promise<ObsImagesBuild> {
  const segments = await builtObsimgSegments(o.images, obsImagesMeta(o.encoder, o.source), o.shape)
  const catalog = await buildCatalog({ about: { ...o.about, catalog: OBSIMG_CATALOG, builder: `${BUILDER}; ${o.encoder}` }, resources: [], segments })
  return { segments, catalog }
}
