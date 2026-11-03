import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { verseId } from '../ids'
import { LAST_VERSE_OF_CHAPTER, parseObsRefs } from './obsRefs'

const FIXTURE = [import.meta.dir, '..', '..', 'spec', 'tests', 'data', 'topics', 'obs-refs.txt'].join('/')
const stories = new Map<number, string>()
for (const part of readFileSync(FIXTURE, 'utf8').split(/^=== /m).slice(1)) {
  const nl = part.indexOf('\n')
  stories.set(Number(part.slice(0, nl)), part.slice(nl + 1))
}
const END = LAST_VERSE_OF_CHAPTER

describe('parseObsRefs (fixture)', () => {
  const issues: string[] = []
  const refs = parseObsRefs(stories, issues)
  test('reads without issues', () => expect(issues).toEqual([]))
  test('story 10 is Exodus 5-10', () => {
    expect(refs.get(10)).toEqual([[verseId('exo', 5, 1), verseId('exo', 10, END)]])
  })
  test('story 1 is Genesis 1-2', () => {
    expect(refs.get(1)).toEqual([[verseId('gen', 1, 1), verseId('gen', 2, END)]])
  })
  test('story 50 parses every piece, carrying the book over', () => {
    const r = refs.get(50) ?? []
    expect(r).toHaveLength(12)
    expect(r[0]).toEqual([verseId('mat', 13, 24), verseId('mat', 13, 42)])
    expect(r[1]).toEqual([verseId('mat', 22, 13), verseId('mat', 22, 13)])
    expect(r[4]).toEqual([verseId('jhn', 4, 35), verseId('jhn', 4, 35)])
    expect(r[7]).toEqual([verseId('1th', 4, 13), verseId('1th', 5, 11)])
    expect(r[11]).toEqual([verseId('rev', 21, 1), verseId('rev', 22, END)])
  })
})

describe('parseObsRefs (forms)', () => {
  const one = (line: string, last?: (b: string, c: number) => number | undefined) => {
    const issues: string[] = []
    const r = parseObsRefs(new Map([[7, `text\n\n_A Bible story from: ${line}_\n`]]), issues, last)
    return { r: r.get(7), issues }
  }
  test('across chapters, and chapter then verse', () => {
    expect(one('Genesis 24:1-25:26').r).toEqual([[verseId('gen', 24, 1), verseId('gen', 25, 26)]])
    expect(one('Acts 3-4:22').r).toEqual([[verseId('act', 3, 1), verseId('act', 4, 22)]])
  })
  test('a verse count function ends whole chapters', () => {
    expect(one('Luke 1', () => 80).r).toEqual([[verseId('luk', 1, 1), verseId('luk', 1, 80)]])
  })
  test('numbered books and Psalm', () => {
    expect(one('Judges 1-3; 1 Samuel 1-10; Psalm 16; 22').r?.length).toBe(4)
  })
  test('an unparsable piece lands in issues, the rest stays', () => {
    const { r, issues } = one('Exodus 5-10; Hezekiah 3; Exodus x')
    expect(r).toEqual([[verseId('exo', 5, 1), verseId('exo', 10, END)]])
    expect(issues).toHaveLength(2)
  })
  test('a story without the line, or backwards range, is reported', () => {
    const issues: string[] = []
    expect(parseObsRefs(new Map([[3, 'nothing']]), issues).size).toBe(0)
    expect(one('Exodus 10-5').issues.length).toBeGreaterThan(0)
    expect(issues.length).toBe(1)
  })
})

const SOURCES = process.env.LP3_SOURCES
const dir = SOURCES ? `${SOURCES}/en_obs/obs-repo/content` : ''
describe('parseObsRefs (real OBS v9)', () => {
  if (!SOURCES || !existsSync(dir)) {
    test.skip('LP3_SOURCES is not set: the real OBS files are skipped', () => {})
    return
  }
  test('all 50 stories parse', () => {
    const all = new Map<number, string>()
    for (let n = 1; n <= 50; n++) all.set(n, readFileSync(`${dir}/${String(n).padStart(2, '0')}.md`, 'utf8'))
    const issues: string[] = []
    const refs = parseObsRefs(all, issues)
    console.log(`obs refs: ${refs.size} stories, ${[...refs.values()].flat().length} ranges, ${issues.length} issues`, issues)
    expect(issues).toEqual([])
    expect(refs.size).toBe(50)
  })
})
