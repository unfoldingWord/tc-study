/**
 * JPEG to WebP for the OBS pictures. `sharp` is loaded here, by dynamic import, and nowhere else: no other code path and no unit test
 * needs it. Its version is pinned exactly in package.json, and `ENCODER` (with the libwebp version) goes into `about.builder`.
 */
import type { ObsImageInput } from '@bt-synergy/language-pack-v3'
import type { ObsJpeg } from './source'

export const WEBP_OPTIONS = { quality: 75, effort: 6 } as const

export type Converted = { bytes: Uint8Array; w: number; h: number; media: 'image/webp' }
export type Converter = (jpeg: Uint8Array) => Promise<Converted>

type Sharp = typeof import('sharp')

async function loadSharp(): Promise<{ sharp: Sharp; encoder: string }> {
  const sharp = ((await import('sharp')) as unknown as { default: Sharp }).default
  return { sharp, encoder: `sharp ${(await import('sharp/package.json')).default.version} (libwebp ${sharp.versions.webp})` }
}

/** The encoder as `sharp 0.33.5 (libwebp 1.4.0)`. */
export async function encoderName(): Promise<string> {
  return (await loadSharp()).encoder
}

export async function sharpConverter(): Promise<Converter> {
  const { sharp } = await loadSharp()
  return async (jpeg) => {
    const { data, info } = await sharp(jpeg).webp({ quality: WEBP_OPTIONS.quality, effort: WEBP_OPTIONS.effort }).toBuffer({ resolveWithObject: true })
    return { bytes: new Uint8Array(data), w: info.width, h: info.height, media: 'image/webp' }
  }
}

/** Every JPEG converted (one at a time: the encoder already uses the cores). */
export async function convertAll(jpegs: ObsJpeg[], convert: Converter): Promise<ObsImageInput[]> {
  const out: ObsImageInput[] = []
  for (const { story, frame, bytes } of jpegs) {
    const c = await convert(bytes)
    out.push({ story, frame, bytes: c.bytes, media: c.media, w: c.w, h: c.h })
  }
  return out
}
