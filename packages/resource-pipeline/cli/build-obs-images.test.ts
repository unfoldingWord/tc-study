import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { catalogView, hex, keyId, KNOWN, OBS_FRAMES_PER_STORY, obsimgView, readSegment, verifyCatalog } from '@bt-synergy/language-pack-v3'
import { OBS_IMAGES_ZIP, readObsJpegs } from '../src/obsImages/source'
import { deps, pinOf, zipOf } from './obsImagesFixture'
import { type ObsImagesDeps, main, optionsFromArgs } from './build-v3'
import { testKey } from './testKey'

const BUILT = '2026-11-01T10:00:00Z'
const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'build-obsimg-'))
  temps.push(dir)
  return dir
}

const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

async function run(args: string[], d: ObsImagesDeps) {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (line) => out.push(line), error: (line) => err.push(line) }, undefined, d)
  return { code, out, err }
}

const catalogOf = async (path: string) => catalogView((await readSegment(read(path), { known: KNOWN.catalog, expectedClass: 'catalog' })).seg)

describe('--obs-images options', () => {
  test('only --out is required; the revision defaults to 1', () => {
    const o = optionsFromArgs(['--obs-images', '--out', 'x'])
    expect(o.obsImages).toBe(true)
    expect(o.revision).toBe(1)
    expect(o.out).toBe('x')
    expect(o.previous).toBeUndefined()
  })
  test('the flag can come in any position and takes the optional flags', () => {
    const o = optionsFromArgs(['--out', 'x', '--revision', '4', '--previous', 'ab'.repeat(32), '--built', BUILT, '--publisher', 'P', '--cache', 'c', '--obs-images'])
    expect([o.obsImages, o.revision, o.built, o.publisher, o.cache, o.previous?.length]).toEqual([true, 4, BUILT, 'P', 'c', 32])
  })
  test('a missing --out, a language flag and a bad --previous are usage errors', () => {
    expect(() => optionsFromArgs(['--obs-images'])).toThrow('--out is missing')
    expect(() => optionsFromArgs(['--obs-images', '--out', 'x', '--list', 'l.json'])).toThrow('--list does not apply to --obs-images')
    expect(() => optionsFromArgs(['--obs-images', '--out', 'x', '--aligned'])).toThrow('--aligned does not apply')
    expect(() => optionsFromArgs(['--obs-images', '--out', 'x', '--previous', 'zz'])).toThrow('is not an id')
  })
})

describe('readObsJpegs', () => {
  test('takes only 360px/obs-en-SS-FF.jpg: not .DS_Store, __MACOSX, folders or other languages', async () => {
    const zip = new JSZip()
    zip.folder('360px')
    zip.file('360px/.DS_Store', 'x')
    zip.file('__MACOSX/360px/._obs-en-01-01.jpg', 'x')
    zip.file('360px/obs-en-02-03.jpg', 'b')
    zip.file('360px/obs-en-01-02.jpg', 'a')
    zip.file('360px/obs-en-1-2.jpg', 'x')
    zip.file('90px/obs-en-01-01.jpg', 'x')
    const found = await readObsJpegs(await zip.generateAsync({ type: 'uint8array' }))
    expect(found.map((j) => [j.story, j.frame, new TextDecoder().decode(j.bytes)])).toEqual([[1, 2, 'a'], [2, 3, 'b']])
  })
})

describe('build --obs-images', () => {
  test('writes the zxx-obsimg catalog and its 50 segments; nothing requires anything', async () => {
    const out = temp()
    const d = deps(await zipOf())
    const { code, out: log, err } = await run(['--obs-images', '--out', out, '--built', BUILT], d)
    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(d.fetched).toEqual([OBS_IMAGES_ZIP.url])

    const file = join(out, 'catalog-zxx-obsimg.seg')
    const { seg } = await readSegment(read(file), { known: KNOWN.catalog, expectedClass: 'catalog' })
    const model = catalogView(seg)
    expect(seg.h.lang).toBe('zxx-obsimg')
    expect(model.about.catalog).toBe('zxx-obsimg')
    expect(model.about.revision).toBe(1)
    expect(model.about.builder).toContain('fake 1.0 (libwebp 0)')
    expect(model.requires).toBeUndefined()
    expect(model.resources).toEqual([])
    expect(model.segments).toHaveLength(50)
    expect(model.units.map((u) => u.id)).toEqual(['obsimg'])
    expect(readdirSync(join(out, 'segments'))).toHaveLength(50)
    expect(existsSync(join(out, 'catalog-common.seg'))).toBe(false)

    // A segment: the converted frames of its story and the credit
    const third = model.segments.find((s) => s.group === '03')!
    const body = await readSegment(read(join(out, 'segments', `${hex(third.id)}.seg`)), { known: KNOWN.obsimg, expectedClass: 'obsimg' })
    const view = obsimgView(body.seg)
    expect(view.frames).toHaveLength(OBS_FRAMES_PER_STORY[2])
    expect(new TextDecoder().decode(view.frames[6].data)).toBe('webp of jpeg 3/7')
    expect([view.frames[6].media, view.frames[6].w, view.frames[6].h]).toEqual(['image/webp', 3, 2])
    expect(view.meta.license).toBe('CC BY-SA 3.0')
    expect(view.meta.credit).toContain('Sweet Publishing')
    expect(view.meta.changes).toContain('fake 1.0 (libwebp 0)')
    expect(view.meta.source).toBe(OBS_IMAGES_ZIP.url)

    // The log: images, segments, catalog size, largest segment, encoder, time
    const text = log.join('\n')
    for (const word of ['images: 598', 'segments: 50', 'catalog: ', 'largest segment: story ', 'encoder: fake 1.0', 'wall time: ']) expect(text).toContain(word)
  })

  test('the same inputs and --built give the same bytes; revision and previous reach about', async () => {
    const zip = await zipOf()
    const [a, b] = [temp(), temp()]
    await run(['--obs-images', '--out', a, '--built', BUILT], deps(zip))
    const previous = 'cd'.repeat(32)
    await run(['--obs-images', '--out', b, '--built', BUILT, '--revision', '3', '--previous', previous], deps(zip))
    const catA = await catalogOf(join(a, 'catalog-zxx-obsimg.seg'))
    const catB = await catalogOf(join(b, 'catalog-zxx-obsimg.seg'))
    expect(catA.segments.map((s) => hex(s.id))).toEqual(catB.segments.map((s) => hex(s.id)))
    expect(catB.about.revision).toBe(3)
    expect(hex(catB.about.previous!)).toBe(previous)
  })

  test('--sign-key signs the catalog; the segments are the same bytes', async () => {
    const key = testKey()
    temps.push(key.dir)
    const zip = await zipOf()
    const [plain, signed] = [temp(), temp()]
    await run(['--obs-images', '--out', plain, '--built', BUILT], deps(zip))
    const { code } = await run(['--obs-images', '--out', signed, '--built', BUILT, '--sign-key', key.pem], deps(zip))
    expect(code).toBe(0)
    const trusted = { [keyId(key.publicKey)]: key.publicKey }
    expect((await verifyCatalog(read(join(signed, 'catalog-zxx-obsimg.seg')), trusted)).valid).toBe(true)
    await expect(verifyCatalog(read(join(plain, 'catalog-zxx-obsimg.seg')), trusted)).rejects.toThrow()
    expect(readdirSync(join(signed, 'segments'))).toEqual(readdirSync(join(plain, 'segments')))
  })

  test('a zip that is not the pinned one fails and says to update the pin on purpose', async () => {
    const zip = await zipOf()
    const out = temp()
    const { code, err } = await run(['--obs-images', '--out', out], deps(zip, { ...pinOf(zip), sha256: '0'.repeat(64) }))
    expect(code).toBe(2)
    expect(err.join('\n')).toContain('update the pin on purpose')
    expect(existsSync(join(out, 'catalog-zxx-obsimg.seg'))).toBe(false)
  })

  test('a missing frame and an extra frame both fail', async () => {
    const missing = await zipOf({}, ['360px/obs-en-07-04.jpg'])
    const r1 = await run(['--obs-images', '--out', temp()], deps(missing))
    expect(r1.code).toBe(2)
    expect(r1.err.join('\n')).toContain('story 7 frame 4 has no image')
    const extra = await zipOf({ '360px/obs-en-07-99.jpg': 'one too many' })
    const r2 = await run(['--obs-images', '--out', temp()], deps(extra))
    expect(r2.code).toBe(2)
    expect(r2.err.join('\n')).toContain('story 7 frame 99 is not in the shape')
  })

  test('a failed download is an error', async () => {
    const d = deps(await zipOf())
    d.fetch = async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) })
    const r = await run(['--obs-images', '--out', temp()], d)
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('HTTP 503')
  })

  test('--cache keeps the zip and the second run does not download', async () => {
    const zip = await zipOf()
    const cache = temp()
    const d1 = deps(zip)
    await run(['--obs-images', '--out', temp(), '--cache', cache], d1)
    expect(d1.fetched).toHaveLength(1)
    const d2 = deps(zip)
    const r = await run(['--obs-images', '--out', temp(), '--cache', cache], d2)
    expect(r.code).toBe(0)
    expect(d2.fetched).toEqual([])
  })
})
