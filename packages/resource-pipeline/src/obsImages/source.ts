/**
 * The source of the Open Bible Stories pictures: the 360px JPEG zip of the OBS project on cdn.door43.org, pinned by size and SHA-256
 * so that a changed upstream file fails the build instead of changing the published pictures silently.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'

export const OBS_IMAGES_ZIP = {
  url: 'https://cdn.door43.org/obs/jpg/obs-images-360px.zip',
  sha256: '21dd4cb4e61e33a8ce9c778541854963951f0fe3ec88eca0858f930a94cbd02c',
  bytes: 37667628,
} as const

export type ObsJpeg = { story: number; frame: number; bytes: Uint8Array }

type Pin = { url: string; sha256: string; bytes: number }
type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Throws when `bytes` are not the pinned zip. */
export function checkPin(bytes: Uint8Array, pin: Pin = OBS_IMAGES_ZIP): void {
  if (bytes.length !== pin.bytes || sha256Hex(bytes) !== pin.sha256) {
    throw new Error(
      `the OBS images zip changed upstream: ${pin.url} is ${bytes.length} bytes with SHA-256 ${sha256Hex(bytes)}, the pin says ${pin.bytes} bytes and ${pin.sha256}. ` +
        'Look at the new file, then update the pin on purpose',
    )
  }
}

/** The pinned zip: read from `cacheDir` when it is there (and still checked), else downloaded (and saved there when `cacheDir` is given). */
export async function fetchObsImagesZip(fetchFn: FetchLike, cacheDir?: string, pin: Pin = OBS_IMAGES_ZIP): Promise<Uint8Array> {
  const cached = cacheDir === undefined ? undefined : join(cacheDir, `${pin.sha256}.zip`)
  if (cached !== undefined && existsSync(cached)) {
    const bytes = new Uint8Array(readFileSync(cached))
    checkPin(bytes, pin)
    return bytes
  }
  const response = await fetchFn(pin.url)
  if (!response.ok) throw new Error(`${pin.url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  checkPin(bytes, pin)
  if (cached !== undefined) {
    await mkdir(cacheDir!, { recursive: true })
    await writeFile(cached, bytes)
  }
  return bytes
}

/** The 360px English frames of the zip (`360px/obs-en-SS-FF.jpg`); folders, `.DS_Store`, `__MACOSX/` and anything else are skipped. */
export async function readObsJpegs(zipBytes: Uint8Array): Promise<ObsJpeg[]> {
  const zip = await JSZip.loadAsync(zipBytes)
  const out: ObsJpeg[] = []
  for (const [name, entry] of Object.entries(zip.files)) {
    const m = /^360px\/obs-en-(\d\d)-(\d\d)\.jpg$/.exec(name)
    if (m === null || entry.dir) continue
    out.push({ story: Number(m[1]), frame: Number(m[2]), bytes: await entry.async('uint8array') })
  }
  out.sort((a, b) => a.story - b.story || a.frame - b.frame)
  return out
}
