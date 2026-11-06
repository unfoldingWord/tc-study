import { describe, expect, test } from 'bun:test'
import { partsSource } from '../../node/partsSource'
import type { OrigModel } from '../../model'
import { extractOrig } from '../orig'
import { Tally } from './tally'
import { expandRange, versesOf } from './verses'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
let cached: Promise<OrigModel> | undefined
const titus = () =>
  (cached ??= partsSource({ list: join(DATA, 'originals', 'list.json'), partsDir: join(DATA, 'parts') }).then((s) => extractOrig(s, 'tit')))

describe('Tally', () => {
  test('three adds on one verse are 3 occurrences and 1 verse', () => {
    const t = new Tally('occurrences')
    for (let i = 0; i < 3; i++) t.add('G1', 'tit', [56001001])
    expect(t.table().rows.get('G1')!.get('tit')).toEqual([3, 1])
  })
  test('one add over three verses is [1, 3]', () => {
    const t = new Tally('notes')
    t.add('ta:x', 'tit', [56001002, 56001003, 56001004])
    expect(t.table().rows.get('ta:x')!.get('tit')).toEqual([1, 3])
    expect(t.table().unit).toBe('notes')
  })
  test('two adds on one verse are [2, 1]', () => {
    const t = new Tally('notes')
    t.add('k', 'tit', [56001002])
    t.add('k', 'tit', [56001002])
    expect(t.table().rows.get('k')!.get('tit')).toEqual([2, 1])
  })
  test('an add without verses is [1, 0] and has no verse list entry', () => {
    const t = new Tally('links')
    t.add('k', 'tit', [])
    expect(t.table().rows.get('k')!.get('tit')).toEqual([1, 0])
    expect(t.verseLists('tit').has('k')).toBe(false)
  })
  test('verseLists is sorted and distinct; books are in canonical order', () => {
    const t = new Tally('notes')
    t.add('k', 'tit', [56001003, 56001001])
    t.add('k', 'tit', [56001001, 56001002])
    t.add('k', 'gen', [1001001])
    expect(t.verseLists('tit').get('k')).toEqual([56001001, 56001002, 56001003])
    expect(t.books()).toEqual(['gen', 'tit'])
    expect([...t.table().rows.get('k')!.keys()]).toEqual(['gen', 'tit'])
  })
})

describe('verses', () => {
  test('expandRange over Titus', async () => {
    const verses = versesOf(await titus())
    const got = expandRange(verses, 56001012, 56002003)
    expect(got).toEqual([...[12, 13, 14, 15, 16].map((v) => 56001000 + v), 56002001, 56002002, 56002003])
    const end = expandRange(verses, 56003014, 56003099)
    expect(end[end.length - 1]).toBe(verses[verses.length - 1])
    expect(end.every((v) => v >= 56003014 && v < 56004000)).toBe(true)
    expect(expandRange(verses, 56000000, 56000000)).toEqual([56000000])
    expect(verses[0]).toBe(56000000)
    expect(verses).toEqual([...verses].sort((a, b) => a - b))
  })
})
