import { describe, expect, test } from 'bun:test'
import { OBS_FRAMES_PER_STORY } from '../build/obsimg'
import { parseObsFrames } from './obsFrames'

/** Every story with its frames, each frame "GEN 1:1" unless `over` gives its tags (frame key "N:F" to the text after the picture). */
function source(over: Record<string, string> = {}): Map<string, string> {
  const files = new Map<string, string>()
  OBS_FRAMES_PER_STORY.forEach((n, i) => {
    const s = i + 1
    const ss = String(s).padStart(2, '0')
    let text = `[[story:${ss}]]\n\n`
    for (let f = 1; f <= n; f++) {
      text += `![Image](obs-en-${ss}-${String(f).padStart(2, '0')}.jpg)\n\n${over[`${s}:${f}`] ?? '[[ref:GEN 1:1]]'}\n\n`
    }
    files.set(`${String(Math.ceil(s / 5)).padStart(2, '0')}/${ss}.md`, text)
  })
  return files
}
const LAST: Record<string, number[]> = { gen: [31, 25, 24, 26, 32, 22, 24], heb: [14, 18, 19, 16, 14, 20, 28, 13, 28, 39], jhn: [51], '1pe': [25] }
const lastVerse = (b: string, c: number) => LAST[b]?.[c - 1]

describe('parseObsFrames', () => {
  test('every frame, keyed "N:F" with no leading zeros', () => {
    const report: string[] = []
    const out = parseObsFrames(source(), report, lastVerse)
    expect(out.size).toBe(598)
    expect([...out.keys()].slice(0, 3)).toEqual(['1:1', '1:2', '1:3'])
    expect(out.get('50:17')).toEqual([[1_001_001, 1_001_001]])
    expect(report).toEqual([])
  })
  test('the forms of the source: several books, verse lists, chapters across, several tags in a frame', () => {
    const out = parseObsFrames(
      source({
        '1:1': '[[ref:GEN 6:21, GEN 7:1,7]]',
        '1:2': '[[ref:GEN 3:1,6,GEN 3:19]]',
        '1:3': '[[ref:HEB 9:11-14,JOH 1:29, 1PE 1:18-19]]',
        '1:4': '[[ref:GEN 1:31-2:3]]\n\n[[ref:GEN 4:1;5:2-3]]',
        '1:5': '[[ref:GEN 2]]',
      }),
      [],
      lastVerse,
    )
    expect(out.get('1:1')).toEqual([[1_006_021, 1_006_021], [1_007_001, 1_007_001], [1_007_007, 1_007_007]])
    expect(out.get('1:2')).toEqual([[1_003_001, 1_003_001], [1_003_006, 1_003_006], [1_003_019, 1_003_019]])
    expect(out.get('1:3')).toEqual([[58_009_011, 58_009_014], [43_001_029, 43_001_029], [60_001_018, 60_001_019]])
    expect(out.get('1:4')).toEqual([[1_001_031, 1_001_031], [1_002_001, 1_002_003], [1_004_001, 1_004_001], [1_005_002, 1_005_003]])
    expect(out.get('1:5')).toEqual([[1_002_001, 1_002_025]])
  })
  test('empty tags leave a frame out, and the fixes and the empty frames are reported', () => {
    const report: string[] = []
    const out = parseObsFrames(source({ '27:11': '[[ref:]]', '49:2': '[[ref:JOH 1:1]]' }), report, lastVerse)
    expect(out.has('27:11')).toBe(false)
    expect(out.size).toBe(597)
    expect(out.get('49:2')).toEqual([[43_001_001, 43_001_001]])
    expect(report).toEqual(['obs-frames: 1 frames tell no verse and are left out: 27:11', 'obs-frames: the book code JOH was read as jhn (1 times)'])
  })
  test('a verse of a chapter the build does not know is kept and counted', () => {
    const report: string[] = []
    const out = parseObsFrames(source({ '2:1': '[[ref:REV 21:1-4]]' }), report, lastVerse)
    expect(out.get('2:1')).toEqual([[66_021_001, 66_021_004]])
    expect(report).toEqual(['obs-frames: 2 range ends are in chapters this build has no length for; they were not checked'])
  })
  test('a piece whose verses do not hold is left out and reported, and the frame keeps its other pieces', () => {
    const report: string[] = []
    const out = parseObsFrames(
      source({ '1:1': '[[ref:GEN 1:32, GEN 1:2]]', '1:2': '[[ref:GEN 1:5-2]]', '1:3': '[[ref:REV 1:20-2:3]]', '1:4': '[[ref:REV 3]]' }),
      report,
      lastVerse,
    )
    expect(out.get('1:1')).toEqual([[1_001_002, 1_001_002]])
    for (const k of ['1:2', '1:3', '1:4']) expect(out.has(k)).toBe(false)
    const left = report.filter((l) => l.startsWith('obs-frames: left out: '))
    expect(left.length).toBe(4)
    expect(left[0]).toContain('gen 1:32 is past the end of the chapter (31)')
    expect(left[1]).toContain('runs backwards')
    expect(left[2]).toContain('crosses the end of rev 1')
    expect(left[3]).toContain('the whole chapter rev 3 needs its length')
    expect(report).toContain('obs-frames: 3 frames tell no verse and are left out: 1:2, 1:3, 1:4')
  })
  test('what fails the build: a change of the source shape', () => {
    const fails = (over: Record<string, string>, files?: Map<string, string>) => expect(() => parseObsFrames(files ?? source(over), [], lastVerse)).toThrow()
    fails({ '1:1': '[[ref:XYZ 1:1]]' }) // not a book
    fails({ '1:1': '[[ref:1:1]]' }) // no book
    fails({ '1:1': '[[ref:GEN 1:a]]' }) // unreadable
    fails({ '1:1': '[[ref:GEN 1:1,,2]]' }) // an empty piece
    fails({}, new Map([...source(), ['00/00.md', '![Image](obs-en-00-01.jpg)\n[[ref:GEN 1:1]]\n']])) // story 0
    const missing = source()
    missing.set('01/01.md', missing.get('01/01.md')!.replace(/!\[Image\]\(obs-en-01-16\.jpg\)/, ''))
    fails({}, missing) // a frame missing
    const twice = source()
    twice.set('01/01.md', `${twice.get('01/01.md')!}![Image](obs-en-01-01.jpg)\n`)
    fails({}, twice) // a frame twice
  })
})
