import { describe, expect, test } from 'bun:test'
import { CLASS_NAMES, readSegment, writeSegment } from '../codec/container'
import { OBSIMG_TABLES, obsimgView } from '../read/obsimg'
import { readerOutput } from '../read/output'
import { type BuiltSegment, builtSegment, unitsOf } from './catalog'
import { builtObsimgSegments, OBS_FRAMES_PER_STORY, OBSIMG_CATALOG, type ObsImageInput, obsimgSegments } from './obsimg'

const META = {
  license: 'CC BY-SA 3.0',
  credit: 'Illustrations © Sweet Publishing, https://sweetpublishing.com',
  changes: 'converted to WebP quality 75',
  source: 'https://cdn.door43.org/obs/jpg/obs-images-360px.zip',
}

const image = (story: number, frame: number, bytes: number[]): ObsImageInput => ({ story, frame, bytes: Uint8Array.from(bytes), media: 'image/webp', w: 640, h: 360 })

const FIXTURE = [image(1, 1, [1, 2, 3]), image(1, 2, [4, 5]), image(2, 1, [6, 7, 8, 9])]

describe('obsimgSegments', () => {
  test('the expected shape is the 598 frames of the 50 stories', () => {
    expect(OBS_FRAMES_PER_STORY.length).toBe(50)
    expect(OBS_FRAMES_PER_STORY.reduce((a, b) => a + b, 0)).toBe(598)
    expect(OBSIMG_CATALOG).toBe('zxx-obsimg')
  })

  test('three images in two stories give two segments, one unit, and the bytes come back unchanged', async () => {
    const segs = obsimgSegments(FIXTURE, META, [2, 1])
    expect(segs.map((s) => s.h.group)).toEqual(['01', '02'])
    expect(segs.every((s) => s.h.class === 'obsimg' && s.h.lang === 'zxx-obsimg' && s.h.book === undefined && s.h.res === undefined)).toBe(true)
    expect(segs[0].h.tables).toEqual({ frames: [1, true], meta: [1, true] })

    const built = await builtObsimgSegments(FIXTURE, META, [2, 1])
    const units = unitsOf(built, () => [])
    expect(units).toEqual([{ id: 'obsimg', segments: [0, 1] }])

    const back = await readSegment(built[0].bytes, { known: OBSIMG_TABLES, expectedId: built[0].id })
    const view = obsimgView(back.seg)
    expect(view.story).toBe(1)
    expect(view.frames.map((f) => [f.n, f.media, f.w, f.h, Array.from(f.data)])).toEqual([
      [1, 'image/webp', 640, 360, [1, 2, 3]],
      [2, 'image/webp', 640, 360, [4, 5]],
    ])
    expect(view.meta).toEqual(META)
    expect(obsimgView((await readSegment(built[1].bytes, { known: OBSIMG_TABLES })).seg).story).toBe(2)
  })

  test('frames come out sorted by n whatever order they were given in', () => {
    const [seg] = obsimgSegments([image(1, 2, [4]), image(1, 1, [3])], META, [2])
    expect(obsimgView(seg).frames.map((f) => f.n)).toEqual([1, 2])
  })

  test('the same input gives the same segment ids', async () => {
    const a = await builtObsimgSegments(FIXTURE, META, [2, 1])
    const b = await builtObsimgSegments([...FIXTURE].reverse(), META, [2, 1])
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id))
    expect(a.map((s) => s.inputs)).toEqual(b.map((s) => s.inputs))
    const c = await builtObsimgSegments([image(1, 1, [9]), ...FIXTURE.slice(1)], META, [2, 1])
    expect(c[0].inputs).not.toBe(a[0].inputs)
  })

  test('a missing frame fails with its story and frame', () => {
    expect(() => obsimgSegments([image(1, 1, [1]), image(2, 1, [2])], META, [2, 1])).toThrow('story 1 frame 2 has no image')
    expect(() => obsimgSegments([image(1, 1, [1]), image(1, 2, [1])], META, [2, 1])).toThrow('story 2 frame 1 has no image')
  })

  test('a frame or story outside the shape, a frame twice, empty bytes or a bad size fail', () => {
    expect(() => obsimgSegments([...FIXTURE, image(1, 3, [1])], META, [2, 1])).toThrow('story 1 frame 3 is not in the shape')
    expect(() => obsimgSegments([...FIXTURE, image(3, 1, [1])], META, [2, 1])).toThrow('story 3 frame 1 is not in the shape')
    expect(() => obsimgSegments([...FIXTURE, image(1, 1, [1])], META, [2, 1])).toThrow('story 1 frame 1 is twice')
    expect(() => obsimgSegments([image(1, 1, []), image(1, 2, [1]), image(2, 1, [1])], META, [2, 1])).toThrow('story 1 frame 1 has no bytes')
    expect(() => obsimgSegments([{ ...image(1, 1, [1]), w: 0 }, image(1, 2, [1]), image(2, 1, [1])], META, [2, 1])).toThrow('story 1 frame 1: w')
    expect(() => obsimgSegments([{ ...image(1, 1, [1]), h: 1.5 }, image(1, 2, [1]), image(2, 1, [1])], META, [2, 1])).toThrow('story 1 frame 1: h')
  })
})

describe('unitsOf and the class', () => {
  const stub = (group: string | undefined, n: number): Promise<BuiltSegment> =>
    builtSegment({ h: { class: 'obsimg', v: 1, tables: {}, lang: 'zxx-obsimg', ...(group === undefined ? {} : { group }) }, t: {} }, n.toString(16).padStart(64, '0'))

  test('a story twice in the unit is an error', async () => {
    await expect(stub('01', 1).then((a) => stub('01', 2).then((b) => unitsOf([a, b], () => [])))).rejects.toThrow('repeats the story')
  })

  test('an obsimg segment without a group is an error', async () => {
    await expect(stub(undefined, 1).then((a) => unitsOf([a], () => []))).rejects.toThrow('group')
  })

  test('obsimg is the last class, so no existing class changes its place', () => {
    expect(CLASS_NAMES[CLASS_NAMES.length - 1]).toBe('obsimg')
    expect(CLASS_NAMES.indexOf('gen')).toBe(CLASS_NAMES.length - 2)
  })

  test('the reader output of an obsimg segment has the bytes as hex and the meta row', async () => {
    const [seg] = await builtObsimgSegments(FIXTURE.slice(0, 2), META, [2])
    const out = (await readerOutput(seg.bytes)) as Record<string, any>
    expect(out.frames[0]).toEqual({ n: 1, media: 'image/webp', w: 640, h: 360, data: '010203' })
    expect(out.meta).toEqual(META)
  })
})

describe('the reader and a frame number of 0', () => {
  test('a frame with n = 0 is E_BODY', async () => {
    const h = { class: 'obsimg', v: 1, tables: { frames: [1, true], meta: [1, true] }, lang: 'zxx-obsimg', group: '01' } as never
    const frames = [{ n: 0, media: 'image/webp', w: 640, h: 360, data: Uint8Array.from([1, 2, 3]) }]
    const { bytes } = await writeSegment({ h, t: { frames, meta: [META] } } as never)
    const { seg } = await readSegment(bytes, { known: OBSIMG_TABLES })
    expect(() => obsimgView(seg)).toThrow(/obsimg segment is malformed.*frames\[0\]\.n/)
  })
})
