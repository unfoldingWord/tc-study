import { describe, expect, test } from 'bun:test'
import type { ObsModel } from '@bt-synergy/language-pack-v3'
import { obsPartOf, obsSessionOf } from './obsTf'

const model = (): ObsModel => ({
  lang: 'en',
  res: [['unfoldingWord/en/obs', 'v9'], ['unfoldingWord/en/obs-tf', 'v4']],
  stories: [{ res: 'unfoldingWord/en/obs', n: 1, title: 'Creation', reference: 'A Bible story from: Genesis 1', frames: [{ n: 1, text: 'God made it.', image: 'x.jpg' }] }],
  tf: {
    res: 'unfoldingWord/en/obs-tf',
    stories: [1, 3],
    parts: [
      { story: 1, part: 'intro', title: 'Introduction', text: 'Idea.' },
      { story: 1, part: 'frames' },
      { story: 1, part: 'm1', title: 'Biblical Interpretation', text: 'Lead.' },
      { story: 1, part: 'm1', list: 'observation', title: 'Observation Questions' },
      { story: 1, part: 'm1', list: 'terms', title: 'Translation Questions' },
      { story: 1, part: 'm4', shared: 'movement_4' },
      { story: 3, part: 'frames', title: 'The Flood' },
    ],
    questions: [{ story: 1, part: 'm1', list: 'observation', k: 1, frames: [101], q: 'Who?', a: 'God.' }],
    terms: [{ frame: 101, k: 1, term: 'made', text: '**made** means made.' }, { frame: 101, k: 2, text: 'No term.' }],
    shared: [{ key: 'movement_4', title: 'Movement 4', text: 'M4.' }],
    frames: [{ frame: 301, text: 'Manual frame.' }],
    framework: [],
  },
})

describe('obsSession and obsPart', () => {
  test('give the parts in order with their lists, the frames of the story and the release of the manual', () => {
    const s = obsSessionOf(model(), 1)!
    expect(s.title).toBe('Creation')
    expect(s.release).toBe('v4')
    expect(s.coverage).toEqual([1, 3])
    expect(s.frames).toEqual([{ n: 1, id: 101, text: 'God made it.', image: 'x.jpg', source: 'obs' }])
    expect(s.parts.map((p) => p.code)).toEqual(['intro', 'frames', 'm1', 'm4'])
    const m1 = s.parts[2]
    expect(m1.lists.map((l) => l.code)).toEqual(['observation', 'terms'])
    expect(m1.lists[0].questions).toEqual([{ id: '1/m1/1', q: 'Who?', a: 'God.', frames: [101] }])
    expect(m1.lists[1].terms).toEqual([{ frame: 101, terms: [{ id: '1:1/1', term: 'made', text: '**made** means made.' }, { id: '1:1/2', text: 'No term.' }] }])
    expect(s.parts[3].block).toEqual({ key: 'movement_4', title: 'Movement 4', text: 'M4.' })
  })

  test('a story that obs lacks gets its frames from the manual, and its title from the frames row', () => {
    const s = obsSessionOf(model(), 3)!
    expect(s.title).toBe('The Flood')
    expect(s.frames).toEqual([{ n: 1, id: 301, text: 'Manual frame.', source: 'manual' }])
  })

  test('null without the manual, outside the coverage, or for a part the story lacks', () => {
    const m = model()
    expect(obsSessionOf(m, 2)).toBeNull()
    expect(obsSessionOf(m, 0)).toBeNull()
    expect(obsSessionOf({ ...m, tf: undefined }, 1)).toBeNull()
    expect(obsSessionOf(undefined, 1)).toBeNull()
    expect(obsPartOf(m, 1, 'm1')!.title).toBe('Biblical Interpretation')
    expect(obsPartOf(m, 1, 'm3')).toBeNull()
  })
})
