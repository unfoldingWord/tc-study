import { describe, expect, test } from 'bun:test'
import { decodeBits, decodeTexts, decodeUvarints } from '../codec/columns'
import { readSegment, writeSegment } from '../codec/container'
import type { ObsModel, ObsTfModel } from '../model'
import { OBS_TABLES } from '../read/obs'
import { parseObsTf } from '../source/obsTf'
import { obsSegment } from './obs'

const OBS = 'unfoldingWord/en/obs'
const TF = 'unfoldingWord/en/obs-tf'

const files = new Map<string, string>([
  [
    'obs_story_1.md',
    `## Introduction\n\n### Key\nIdea.\n\n### Open Bible Story: Creation\n\n######### 01-01\n\nGod made it.\n\n*A Bible story from: Genesis 1*\n\n## Biblical Interpretation: M1\n\n![[movement_4]]\n\n### Observation Questions\n\n#### 01-01\n\nWho?  \nGod.\n\nWhat?\n\n### Translation Questions\n\n#### 01-01\n\n**made** means made.\n\n## Theological Dialogue: M2\n\n### Theological Questions\n\n1. Why?\n`,
  ],
  ['transclusions/movement_4.md', '# Movement 4\n\nM4 text.\n'],
  ['transclusions/overview.md', '# Overview\n\nFraming.\n'],
])
const obsStories = [{ res: OBS, n: 1, title: 'Creation', reference: 'A Bible story from: Genesis 1', frames: [{ n: 1, text: 'God made it.' }] }]

const tfModel = (): ObsTfModel => {
  const r = parseObsTf(files, TF, obsStories)
  expect(r.errors).toEqual([])
  return r.model
}
const withTf = (tf?: ObsTfModel): ObsModel => ({
  lang: 'en',
  res: tf === undefined ? [[OBS, 'v9']] : [[OBS, 'v9'], [TF, 'v4']],
  stories: obsStories,
  ...(tf === undefined ? {} : { tf }),
})

const TF_KNOWN = Object.fromEntries(['tf-parts', 'tf-questions', 'tf-terms', 'tf-shared', 'tf-frames', 'tf-framework'].map((n) => [n, [1]]))
const read = async (m: ObsModel, knowTf = true) => {
  const { bytes } = await writeSegment(obsSegment(m))
  const { seg, skipped } = await readSegment(bytes, { known: knowTf ? { ...OBS_TABLES, ...TF_KNOWN } : OBS_TABLES })
  return { seg, skipped, bytes }
}

describe('the Five Movements tables of the obs segment', () => {
  test('are written as optional tables, version 1, and a reader that does not know them skips them', async () => {
    const { seg, skipped } = await read(withTf(tfModel()), false)
    for (const name of ['tf-parts', 'tf-questions', 'tf-terms', 'tf-shared', 'tf-framework']) expect(seg.h.tables[name]).toEqual([1, false])
    expect(seg.h.tables['tf-frames']).toBeUndefined() // absent when no frame needs it
    expect(skipped.sort()).toEqual(['tf-framework', 'tf-parts', 'tf-questions', 'tf-shared', 'tf-terms'])
  })

  test('hold the rows of the model in table order, with fixed codes and columns as the spec says', async () => {
    const { seg } = await read(withTf(tfModel()))
    const parts = seg.t['tf-parts'] as any
    expect(parts.res).toBe(1)
    expect(decodeUvarints(parts.stories)).toEqual([1])
    expect(parts.codes).toEqual(['intro', 'frames', 'm1', 'm2', 'm4', 'observation', 'terms', 'theology'])
    expect(parts.n).toBe(8)
    // list has a bit per row; the heading rows lack it
    expect(parts.list.has).toBeDefined()
    expect(parts.shared.has).toBeDefined()
    const sharedRows = decodeBits(parts.shared.has, parts.n)
    expect(sharedRows.filter(Boolean).length).toBe(1)
    const titles = decodeTexts(parts.title.texts)
    expect(titles[0]).toBe('Introduction')
    const q = seg.t['tf-questions'] as any
    expect(q.n).toBe(3)
    expect(decodeUvarints(q.k)).toEqual([1, 2, 1])
    expect(decodeUvarints(q.frames.count)).toEqual([1, 1, 0])
    expect(decodeUvarints(q.frames.ids)).toEqual([101, 101])
    expect(decodeBits(q.a.has, q.n)).toEqual([true, false, false])
    const shared = seg.t['tf-shared'] as any
    expect(decodeTexts(shared.key.texts)).toEqual(['movement_4'])
    expect(shared.title.has).toBeUndefined()
    const fw = seg.t['tf-framework'] as any
    expect(fw.codes).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'overview'])
    expect(decodeBits(fw.name.has, fw.n)).toEqual([true, true, false, true, false, false])
  })

  test('give the same bytes for the same model, and leave every other table of the segment as it was', async () => {
    const a = await read(withTf(tfModel()))
    const b = await read(withTf(tfModel()))
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true)
    const off = await read(withTf())
    for (const name of ['strings', 'stories']) expect(a.seg.t[name]).toEqual(off.seg.t[name])
    expect(Object.keys(off.seg.t).some((k) => k.startsWith('tf-'))).toBe(false)
  })

  test('refuse a model they cannot hold', () => {
    const base = (): ObsTfModel => tfModel()
    expect(() => obsSegment({ ...withTf(base()), res: [[OBS, 'v9']] })).toThrow('res does not list')
    const outside = base()
    outside.questions[0].story = 7
    expect(() => obsSegment(withTf(outside))).toThrow('not in the coverage')
    const dangling = base()
    dangling.parts.find((b) => b.shared !== undefined)!.shared = 'nope'
    expect(() => obsSegment(withTf(dangling))).toThrow('not in tf-shared')
    const empty = base()
    empty.questions[0].q = ''
    expect(() => obsSegment(withTf(empty))).toThrow('empty text')
    const twice = base()
    twice.shared.push({ ...twice.shared[0] })
    expect(() => obsSegment(withTf(twice))).toThrow('twice')
    const code = base()
    code.parts[0].part = 'intro2'
    expect(() => obsSegment(withTf(code))).toThrow('not a fixed code')
  })
})
