import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { OBS_FRAMES_PER_STORY } from '@bt-synergy/language-pack-v3'
import { OBS_IMAGES_ZIP } from '../src/obsImages/source'
import type { ObsImagesDeps } from './build-v3'

/** Test fixtures for the OBS images build: a fake zip of the 598 frames, a pin for it, and the injected network and converter. */
const pad = (n: number) => String(n).padStart(2, '0')

/** A zip with the 598 frames (the bytes say which frame), the junk a Mac zip has, and `extra` entries. */
export async function zipOf(extra: Record<string, string> = {}, skip: string[] = []): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.folder('360px')
  zip.file('360px/.DS_Store', 'junk')
  zip.file('__MACOSX/360px/._obs-en-01-01.jpg', 'junk')
  zip.file('360px/obs-es-01-01.jpg', 'another language')
  OBS_FRAMES_PER_STORY.forEach((count, i) => {
    for (let f = 1; f <= count; f++) {
      const name = `360px/obs-en-${pad(i + 1)}-${pad(f)}.jpg`
      if (!skip.includes(name)) zip.file(name, `jpeg ${i + 1}/${f}`)
    }
  })
  for (const [name, text] of Object.entries(extra)) zip.file(name, text)
  return zip.generateAsync({ type: 'uint8array' })
}

export const pinOf = (bytes: Uint8Array) => ({ url: OBS_IMAGES_ZIP.url, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })

/** No network, no sharp: the "converter" keeps the text and says the picture is 3 by 2. */
export function deps(zip: Uint8Array, pin: ReturnType<typeof pinOf> = pinOf(zip)): ObsImagesDeps & { fetched: string[] } {
  const fetched: string[] = []
  return {
    fetched,
    pin: pin as unknown as ObsImagesDeps['pin'],
    fetch: async (url) => {
      fetched.push(url)
      return { ok: true, status: 200, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer }
    },
    converter: async () => ({
      encoder: 'fake 1.0 (libwebp 0)',
      convert: async (jpeg) => ({ bytes: new TextEncoder().encode(`webp of ${new TextDecoder().decode(jpeg)}`), w: 3, h: 2, media: 'image/webp' as const }),
    }),
  }
}

