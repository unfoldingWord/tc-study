import { describe, expect, test } from 'bun:test'
import type { ObsStory } from '../model'
import { parseObsTf } from './obsTf'

const RES = 'unfoldingWord/en/obs-tf'

/** A small manual of one story, in the shape of en_obs-tf v4 (headings, frames, questions, terms, transclusions). */
function storyMd(n: number, labels = ['01-01', '01-02']): string {
  const l = (i: number) => labels[i]
  return `---
title: x
---
## Introduction

### Key Idea
Idea of story ${n}.

### Open Bible Story: The Creation

######### ${l(0)}

![[image1.jpeg]]

God made it all.

*A Bible story from: Genesis 1-2*

######### ${l(1)}

![[image2.jpeg]]

And it was good.

![[movement_2_drafting]]

## Biblical Interpretation: Meaning

![[obs-devotionals-unit-1#Community Study: Praise]]

### Observation Questions

#### ${l(0)}

What did God make?
He made everything.

### Translation Questions

#### ${l(1)}

**it was good** means a lot.

Free paragraph without a term.

## Theological Dialogue: Talk

### Discourse Questions

##### Who made it? (${l(0)}, ${l(1)})

God did.

### Theological Questions

1. What does it show?
2. Why does it matter?

## Personal Reflection: Own

### Journal Reflection

1. What did you learn?

![[movement_3_checking]]
![[movement_4]]
![[movement_5]]
![[conclusion]]
`
}

const FILES = (extra: Record<string, string> = {}): Map<string, string> =>
  new Map(
    Object.entries({
      'obs_story_1.md': storyMd(1),
      'transclusions/movement_2_drafting.md': '# Drafting\n\nDraft text.\n',
      'transclusions/movement_3_checking.md': '# Checking\n\nCheck text.\n',
      'transclusions/movement_4.md': '# Movement 4\n\nM4 text.\n',
      'transclusions/movement_5.md': '# Movement 5\n\nM5 text.\n',
      'transclusions/conclusion.md': '# Conclusion\n\nThe end.\n',
      'transclusions/obs-devotionals-unit-1.md': '# Unit 1\n\n## Community Study: Praise\n\nPraise together.\n\n### Sub\n\nMore.\n\n## Other\n\nNot this.\n',
      ...extra,
    }),
  )

const obsStory = (n: number, frames: [number, string][], title = 'The Creation', reference = 'A Bible story from: Genesis 1-2'): ObsStory => ({
  res: 'unfoldingWord/en/obs',
  n,
  title,
  reference,
  frames: frames.map(([f, text]) => ({ n: f, text })),
})
const OBS1 = obsStory(1, [[1, 'God made it all.'], [2, 'And it was good.']])

describe('parseObsTf', () => {
  test('reads a story into parts, questions, terms and one shared block per transclusion', () => {
    const r = parseObsTf(FILES(), RES, [OBS1])
    expect(r.errors).toEqual([])
    expect(r.model.stories).toEqual([1])
    // part order is the fixed order, with the heading row of a part before its lists
    expect(r.model.parts.map((b) => `${b.part}${b.list === undefined ? '' : ':' + b.list}${b.shared === undefined ? '' : '*'}`)).toEqual([
      'intro', 'frames', 'community*', 'm1', 'm1:observation', 'm1:terms', 'm2', 'm2:discourse', 'm2:theology', 'drafting*',
      'm3', 'm3:journal', 'checking*', 'm4*', 'm5*', 'conclusion*',
    ])
    expect(r.model.questions.map((q) => `${q.part}/${q.k} ${q.list}`)).toEqual([
      'm1/1 observation', 'm2/1 discourse', 'm2/2 theology', 'm2/3 theology', 'm3/1 journal',
    ])
    expect(r.model.questions[0]).toEqual({ story: 1, part: 'm1', list: 'observation', k: 1, frames: [101], q: 'What did God make?', a: 'He made everything.' })
    expect(r.model.questions[1].frames).toEqual([101, 102])
    expect(r.model.terms.map((t) => [t.frame, t.k, t.term])).toEqual([[102, 1, 'it was good'], [102, 2, undefined]])
    expect(r.model.shared.map((s) => s.key)).toEqual([
      'obs-devotionals-unit-1#Community Study: Praise', 'movement_2_drafting', 'movement_3_checking', 'movement_4', 'movement_5', 'conclusion',
    ])
    expect(r.model.shared[0].text).toContain('Praise together.')
    expect(r.model.shared[0].text).toContain('More.')
    expect(r.model.shared[0].text).not.toContain('Not this')
    expect(r.model.frames).toEqual([])
    expect(r.warnings).toContain('story 1: a translation paragraph without a bold term'.replace('story 1:', 'story 1 01-02:'))
  })

  test('the same files give the same model', () => {
    const a = parseObsTf(FILES(), RES, [OBS1]).model
    const b = parseObsTf(FILES(), RES, [OBS1]).model
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test('the framing text of the method is the row overview, when the file is there', () => {
    const r = parseObsTf(FILES({ 'transclusions/overview.md': '---\ntitle: O\n---\n# Overview\n\n## Intro\n\nWelcome.\n' }), RES, [OBS1])
    expect(r.model.framework.at(-1)).toEqual({ code: 'overview', text: '## Intro\n\nWelcome.' })
    expect(r.model.framework.map((f) => f.code)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'overview'])
    expect(r.model.framework[0].name).toBe('Biblical Interpretation: Meaning')
    expect(r.model.framework[3].name).toBe('Movement 4')
  })

  test('errors: a frame that obs does not have, a missing transclusion, a heading that does not exist, an unknown part', () => {
    const bad = parseObsTf(FILES(), RES, [obsStory(1, [[1, 'God made it all.']])])
    expect(bad.errors.some((e) => e.includes('story 1'))).toBe(true)
    const gone = new Map(FILES())
    gone.delete('transclusions/movement_4.md')
    expect(parseObsTf(gone, RES, [OBS1]).errors).toContain('story 1: transclusion movement_4: the file does not exist')
    const noHead = FILES({ 'obs_story_1.md': storyMd(1).replace('Community Study: Praise', 'Community Study: Nope') })
    expect(parseObsTf(noHead, RES, [OBS1]).errors.join('\n')).toContain('the heading does not exist')
    const unknown = FILES({ 'obs_story_1.md': storyMd(1).replace('## Personal Reflection: Own', '## Something Else') })
    expect(parseObsTf(unknown, RES, [OBS1]).errors.join('\n')).toContain('is not known')
  })

  test('the reviewed correspondence: story 21 headers, and a corrected reference of story 44', () => {
    // OBS has frames 13, 14 and 15; the manual has two headers, 21-13 (13 and 14) and 21-14 (15).
    const files = FILES({ 'obs_story_21.md': storyMd(21, ['21-13', '21-14']).replace(/Who made it\? \(21-13, 21-14\)/, 'Who? (21-14, 21-15)') })
    files.delete('obs_story_1.md')
    const s21 = obsStory(21, [[13, 'God made it all.'], [14, ''], [15, 'And it was good.']])
    const r = parseObsTf(files, RES, [s21])
    expect(r.errors).toEqual([])
    // the text under 21-13 is compared with frames 13 and 14 together: no difference
    expect(r.warnings.some((w) => w.includes('text differs'))).toBe(false)
    // the discourse reference "21-14, 21-15" is OBS numbering: it is not changed
    const q = r.model.questions.find((x) => x.list === 'discourse')!
    expect(q.frames).toEqual([2114, 2115])
    expect(q.refText).toBeUndefined()
    // story 44: 43-03 is a typo of 44-03 and keeps the published text
    const f44 = FILES({ 'obs_story_44.md': storyMd(44, ['44-03', '44-04']).replace('(44-03, 44-04)', '(43-03, 44-04)') })
    f44.delete('obs_story_1.md')
    const r44 = parseObsTf(f44, RES, [obsStory(44, [[3, 'God made it all.'], [4, 'And it was good.']])])
    expect(r44.errors).toEqual([])
    const d = r44.model.questions.find((x) => x.list === 'discourse')!
    expect(d.frames).toEqual([4403, 4404])
    expect(d.refText).toBe('43-03, 44-04')
  })

  test('a story that obs lacks takes its frames from the manual (the approved fallback), with its title on the frames row', () => {
    const r = parseObsTf(FILES(), RES, [])
    expect(r.errors).toEqual([])
    expect(r.model.frames).toEqual([{ frame: 101, text: 'God made it all.' }, { frame: 102, text: 'And it was good.' }])
    expect(r.model.parts.find((b) => b.part === 'frames')!.title).toBe('The Creation')
  })

  test('warnings: other frame text, title, reference, a term that is not in its frame, a missing part', () => {
    const r = parseObsTf(FILES(), RES, [obsStory(1, [[1, 'God made everything.'], [2, 'And it was good.']], 'Creation', 'A Bible story from: Genesis 1')])
    expect(r.errors).toEqual([])
    const w = r.warnings.join('\n')
    expect(w).toContain('frame 01-01: text differs from obs')
    expect(w).toContain('title differs')
    expect(w).toContain('reference differs')
    const noDraft = FILES({ 'obs_story_1.md': storyMd(1).replace('![[movement_2_drafting]]\n', '') })
    expect(parseObsTf(noDraft, RES, [OBS1]).warnings).toContain('story 1: no part drafting')
  })
})
