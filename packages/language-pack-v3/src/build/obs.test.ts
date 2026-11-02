import { describe, expect, test } from 'bun:test'
import { readSegment, writeSegment } from '../codec/container'
import type { ObsHelpRow, ObsModel } from '../model'
import { OBS_TABLES, obsView } from '../read/obs'
import type { ResourceRef, Row, RowFilter, RowSource } from '../source/rows'
import { extractObs, formatFrameRef, obsSegment, parseFrameRef } from './obs'

// The row shapes are those the loaders write (no part of a real language has OBS rows yet): `resource-pipeline/src/loaders/ObsLoader.ts` and
// `obs/parseObsMarkdown.ts` for the stories (`ParsedObsStory`, `ObsFrame`), and the notes, questions and links loaders for the helps
// (`tn:{res}:obs`, `tn:{res}:obs:{story}`, `tq:…`, `twl:{res}:obs`), as the book helps' rows with `reference` = `story:frame`.
const EN = 'en'
const OBS = 'unfoldingWord/en/obs'
const TN = 'unfoldingWord/en/obs-tn'
const TQ = 'unfoldingWord/en/obs-tq'
const TWL = 'unfoldingWord/en/obs-twl'
const SN = 'unfoldingWord/en/obs-sn'
const SQ = 'unfoldingWord/en/obs-sq'

const ref = (key: string, kind: string, stamp = 'v12#2026-01-01T00_00_00Z'): ResourceRef => ({ key, stamp, kind, books: [] })
const obsRef = () => ref(OBS, 'Open Bible Stories')
const tnRef = () => ref(TN, 'TSV OBS Translation Notes', 'v7#2026-01-02T00_00_00Z')
const tqRef = () => ref(TQ, 'TSV OBS Translation Questions', 'v8#2026-01-03T00_00_00Z')
const twlRef = () => ref(TWL, 'TSV OBS Translation Words Links', 'v9#2026-01-04T00_00_00Z')

function fakeSource(resources: { ref: ResourceRef; rows: Row[] }[], others: ResourceRef[] = []): RowSource {
  return {
    async resources() {
      return [...resources.map((r) => r.ref), ...others]
    },
    async *rows(f: RowFilter) {
      for (const r of resources) {
        if (f.resource !== undefined && r.ref.key !== f.resource) continue
        for (const row of r.rows) if (f.layer === undefined || row.layer === f.layer) yield row
      }
    },
  }
}

const storyRow = (nn: string, content: Record<string, unknown>, res = OBS): Row => ({
  layer: 'sot',
  key: `obs:${res}:${nn}`,
  value: { content, timestamp: 1, resourceKey: res, storyId: nn },
})
const story10 = (): Row =>
  storyRow('10', {
    storyNumber: 10,
    title: '10. The plagues',
    sourceReference: 'A Bible story from: Exodus 5-14',
    frames: [
      { frameNumber: 1, imageUrl: 'https://cdn.door43.org/obs/jpg/360px/obs-en-10-01.jpg', resolvedSrc: 'https://cdn.door43.org/obs/jpg/360px/obs-en-10-01.jpg', text: 'God sent plagues.' },
      { frameNumber: 2, imageUrl: '', text: 'Pharaoh did not listen.' },
    ],
  })
const story01 = (): Row =>
  storyRow('01', { storyNumber: 1, title: '1. The Creation', sourceReference: null, frames: [{ frameNumber: 1, imageUrl: 'u1', text: 'In the beginning.' }] })

// In the rows the TSV escapes are a backslash and an n, and <br>.
const NL = String.raw`\n`

const noteItems = (): Record<string, unknown>[] => [
  { reference: '10:3', id: 'ab12', tags: '', supportReference: 'rc://*/ta/man/translate/figs-metaphor', quote: 'hardened', occurrence: '1', note: `A figure.${NL}See [[rc://*/ta/man/translate/figs-simile]].<br>End` },
  { reference: '10:03', id: 'cd34', tags: 'x', supportReference: '', quote: '', occurrence: '0', note: 'padded' },
  { reference: '10:intro', id: 'ef56', tags: '', supportReference: 'translate/figs-x', quote: '', occurrence: '0', note: 'intro', isIntro: true },
  { reference: '10:front', id: 'gh78', tags: '', quote: '', occurrence: '0', note: 'front' },
  { reference: '10:0', id: 'ij90', tags: '', quote: '', occurrence: '0', note: 'zero' },
  { reference: 'see below', id: 'kl12', tags: '', quote: '', occurrence: '0', note: 'unreadable' },
  { reference: '10:3', id: 'ab12', tags: '', quote: '', occurrence: '0', note: 'same id again' },
]
const tnRows = (): Row[] => [
  { layer: 'sot', key: `tn:${TN}:obs:10`, value: { content: { notes: noteItems() }, metadata: {} } },
  { layer: 'sot', key: `tn:${TN}:obs:2`, value: { content: { notes: [{ reference: '2:1', id: 'mn34', tags: '', quote: '', occurrence: '0', note: 'story 2' }] }, metadata: {} } },
]

async function build(resources: { ref: ResourceRef; rows: Row[] }[], others: ResourceRef[] = []) {
  const issues: string[] = []
  const model = await extractObs(fakeSource(resources, others), EN, issues)
  return { model, issues }
}

describe('frame references', () => {
  test('story:frame becomes story × 100 + frame, with or without leading zeros', () => {
    expect(parseFrameRef('10:3')).toBe(1003)
    expect(parseFrameRef('10:03')).toBe(1003)
    expect(parseFrameRef('01:03')).toBe(103)
    expect(parseFrameRef('1:3')).toBe(103)
    expect(parseFrameRef('50:16')).toBe(5016)
    expect(parseFrameRef(' 10:3 ')).toBe(1003)
  })

  test('intro, front and 0 as the frame are frame 0', () => {
    expect(parseFrameRef('10:intro')).toBe(1000)
    expect(parseFrameRef('10:INTRO')).toBe(1000)
    expect(parseFrameRef('10:front')).toBe(1000)
    expect(parseFrameRef('10:0')).toBe(1000)
    expect(parseFrameRef('10:00')).toBe(1000)
  })

  test('anything else gives null', () => {
    for (const text of ['', '10', '10:', ':3', '0:3', '10:100', '1000:1', 'front:intro', 'x:1', '10:3-4', '10:3,4', '10 : 3']) expect(parseFrameRef(text)).toBeNull()
  })

  test('the canonical text of a frame id', () => {
    expect(formatFrameRef(1003)).toBe('10:3')
    expect(formatFrameRef(1000)).toBe('10:intro')
    expect(formatFrameRef(103)).toBe('1:3')
    expect(formatFrameRef(0)).toBe('0:intro')
  })
})

describe('extractObs', () => {
  test('null when the language has no OBS: no resource, a resource with no rows, a story row that is not a story', async () => {
    expect((await build([])).model).toBeNull()
    expect((await build([], [tnRef()])).model).toBeNull()
    expect((await build([{ ref: obsRef(), rows: [] }])).model).toBeNull()
    const { model, issues } = await build([{ ref: obsRef(), rows: [{ layer: 'sot', key: `obs:${OBS}:intro`, value: {} }] }])
    expect(model).toBeNull()
    expect(issues).toEqual([`obs:${OBS}:intro is not the key of a story of ${OBS}: left out`])
  })

  test('the stories, ordered by number: resolvedSrc is dropped, an empty image is left out, a null reference is no reference', async () => {
    const { model, issues } = await build([{ ref: obsRef(), rows: [story10(), story01()] }])
    expect(model).toEqual({
      lang: EN,
      res: [[OBS, 'v12']],
      stories: [
        { res: OBS, n: 1, title: '1. The Creation', frames: [{ n: 1, text: 'In the beginning.', image: 'u1' }] },
        {
          res: OBS,
          n: 10,
          title: '10. The plagues',
          reference: 'A Bible story from: Exodus 5-14',
          frames: [
            { n: 1, text: 'God sent plagues.', image: 'https://cdn.door43.org/obs/jpg/360px/obs-en-10-01.jpg' },
            { n: 2, text: 'Pharaoh did not listen.' },
          ],
        },
      ],
    })
    expect(JSON.stringify(model)).not.toContain('resolvedSrc')
    expect(issues).toEqual([])
  })

  test('a story whose number differs from its key uses the key; a story with no frames is left out; both are reported', async () => {
    const { model, issues } = await build([
      { ref: obsRef(), rows: [storyRow('02', { storyNumber: 5, title: 't', frames: [{ frameNumber: 1, text: 'x', imageUrl: '' }] }), storyRow('03', { storyNumber: 3, title: 't3', frames: [] })] },
    ])
    expect(model!.stories.map((s) => s.n)).toEqual([2])
    expect(issues).toEqual([`${OBS} story 2: the row says it is story 5; the number of the key is used`, `${OBS} story 3 has no frames: left out`])
  })

  test('the notes: ids, frames, concept, escapes and links; a repeated id gets ~2; a reference that cannot be read puts the row at frame 0', async () => {
    const { model, issues } = await build([
      { ref: obsRef(), rows: [story10()] },
      { ref: tnRef(), rows: tnRows() },
    ])
    const notes = model!.notes!
    expect(notes.res).toBe(TN)
    // The chunks are in story order (2, then 10) whatever the order they come in.
    expect(notes.rows.map((r) => [r.id, r.ref, r.frame])).toEqual([
      ['mn34', '2:1', 201],
      ['ab12', '10:3', 1003],
      ['cd34', '10:03', 1003],
      ['ef56', '10:intro', 1000],
      ['gh78', '10:front', 1000],
      ['ij90', '10:0', 1000],
      ['kl12', 'see below', 0],
      ['ab12~2', '10:3', 1003],
    ])
    expect(notes.rows[1]).toEqual({
      id: 'ab12',
      ref: '10:3',
      frame: 1003,
      concept: 'ta:translate/figs-metaphor',
      cols: { tags: '', quote: 'hardened', occurrence: '1', note: 'A figure.\nSee [[ta:translate/figs-simile]].\nEnd' },
    })
    // An empty SupportReference is no concept and no column; one that is not an address stays in cols.
    expect(notes.rows[2]).toEqual({ id: 'cd34', ref: '10:03', frame: 1003, cols: { tags: 'x', quote: '', occurrence: '0', note: 'padded' } })
    expect(notes.rows[3].cols).toEqual({ tags: '', supportReference: 'translate/figs-x', quote: '', occurrence: '0', note: 'intro', isIntro: true })
    expect(notes.rows[3].concept).toBeUndefined()
    expect(issues).toContain(`${TN} kl12: the reference "see below" is not story:frame; the row is placed at frame 0`)
    expect(issues).toContain(`${TN} ab12~2: the id "ab12" is in the source twice; this row is "ab12~2"`)
    expect(issues.some((line) => line.includes('ef56') && line.includes('is not an address that becomes a concept'))).toBe(true)
  })

  test('the quote of a note stays as text in cols: OBS quotes have no positions', async () => {
    const { model } = await build([{ ref: obsRef(), rows: [story10()] }, { ref: tnRef(), rows: tnRows() }])
    expect(model!.notes!.rows.every((row) => !('quote' in row))).toBe(true)
    expect(model!.notes!.rows[1].cols.quote).toBe('hardened')
  })

  test('the book row is read when there are no chunks, and the chunks win when there are both', async () => {
    const items = [{ reference: '5:2', id: 'aa11', tags: '', quote: '', occurrence: '0', note: 'from the book row' }]
    const whole: Row = { layer: 'sot', key: `tn:${TN}:obs`, value: { _chunkedBook: true, bookCode: 'obs', notes: items } }
    const onlyBook = await build([{ ref: obsRef(), rows: [story01()] }, { ref: tnRef(), rows: [whole] }])
    expect(onlyBook.model!.notes!.rows.map((r) => [r.id, r.frame])).toEqual([['aa11', 502]])
    const both = await build([{ ref: obsRef(), rows: [story01()] }, { ref: tnRef(), rows: [whole, ...tnRows()] }])
    expect(both.model!.notes!.rows).toHaveLength(8)
  })

  test('the questions and the links', async () => {
    const tq: Row = {
      layer: 'sot',
      key: `tq:${TQ}:obs:1`,
      value: { content: { questions: [{ reference: '1:2', id: 'q001', tags: '', quote: 'q', occurrence: '1', question: `Who?${NL}Why?`, response: 'God.<br>Always' }] } },
    }
    const twl: Row = {
      layer: 'sot',
      key: `twl:${TWL}:obs`,
      value: {
        bookCode: 'obs',
        links: [
          { reference: '1:2', id: 'l001', tags: 'kt', origWords: 'God', occurrence: '1', articlePath: 'bible/kt/god', twLink: 'rc://*/tw/dict/bible/kt/god' },
          { reference: '1:3', id: 'l002', tags: '', origWords: 'x', occurrence: '1', twLink: 'other' },
        ],
      },
    }
    const { model, issues } = await build([
      { ref: obsRef(), rows: [story01()] },
      { ref: tqRef(), rows: [tq] },
      { ref: twlRef(), rows: [twl] },
    ])
    expect(model!.res).toEqual([[OBS, 'v12'], [TQ, 'v8'], [TWL, 'v9']])
    expect(model!.questions!.rows).toEqual([
      { id: 'q001', ref: '1:2', frame: 102, cols: { tags: '', quote: 'q', occurrence: '1', question: 'Who?\nWhy?', response: 'God.\nAlways' } },
    ])
    expect(model!.links!.rows[0]).toEqual({ id: 'l001', ref: '1:2', frame: 102, concept: 'tw:kt/god', cols: { tags: 'kt', origWords: 'God', occurrence: '1', articlePath: 'bible/kt/god' } })
    expect(model!.links!.rows[1].concept).toBeUndefined()
    expect(model!.links!.rows[1].cols.twLink).toBe('other')
    expect(issues).toHaveLength(1)
    expect(model!.notes).toBeUndefined()
  })

  test('study notes and study questions have no rows in format 2.0: the model never has them', async () => {
    const { model } = await build([{ ref: obsRef(), rows: [story10()] }, { ref: tnRef(), rows: tnRows() }])
    expect(model).not.toHaveProperty('studyNotes')
    expect(model).not.toHaveProperty('studyQuestions')
  })

  test('the subjects: both spellings are read; a helps resource with no OBS rows is left out with a line; a second one is not used', async () => {
    const plain = ref('unfoldingWord/en/obs-tq', 'OBS Translation Questions')
    const second = ref('a/en/obs-tn', 'TSV OBS Translation Notes')
    const empty: Row = { layer: 'sot', key: `tn:${TN}:tit`, value: {} }
    const { model, issues } = await build([
      { ref: obsRef(), rows: [story01()] },
      { ref: plain, rows: [{ layer: 'sot', key: `tq:${plain.key}:obs`, value: { questions: [{ reference: '1:1', id: 'q', tags: '', question: 'x', response: 'y' }] } }] },
      { ref: tnRef(), rows: [empty] },
      { ref: second, rows: [{ layer: 'sot', key: `tn:${second.key}:obs`, value: { notes: [{ reference: '1:1', id: 'n', note: 'z' }] } }] },
    ])
    expect(model!.questions!.rows).toHaveLength(1)
    expect(model!.notes!.res).toBe(second.key)
    expect(issues).toEqual([`2 resources of TSV OBS Translation Notes (${second.key}, ${TN}); ${second.key} is used`])
    const onlyEmpty = await build([{ ref: obsRef(), rows: [story01()] }, { ref: tnRef(), rows: [empty] }])
    expect(onlyEmpty.model!.notes).toBeUndefined()
    expect(onlyEmpty.issues).toEqual([`${TN} has no rows of OBS: left out`])
  })

  test('rows that are not what format 2.0 writes throw Error naming the row', async () => {
    const bad = async (rows: Row[], text: string, extra: { ref: ResourceRef; rows: Row[] }[] = []) => {
      await expect(build([{ ref: obsRef(), rows }, ...extra])).rejects.toThrow(text)
    }
    await bad([storyRow('01', { title: 1, frames: [] })], 'the title is not text')
    await bad([storyRow('01', { title: 't', frames: {} })], 'frames is not a list')
    await bad([{ layer: 'sot', key: `obs:${OBS}:01`, value: { storyId: '01' } }], 'the row has no content')
    await bad([storyRow('01', { title: 't', frames: [{ text: 1 }] })], 'the text of frame 0 is not text')
    await bad([storyRow('01', { title: 't', frames: [{ frameNumber: 1, text: 'a' }, { frameNumber: 1, text: 'b' }] })], 'the frame number 1 is in the story twice')
    await bad([story01()], 'has no id', [{ ref: tnRef(), rows: [{ layer: 'sot', key: `tn:${TN}:obs:1`, value: { content: { notes: [{ reference: '1:1' }] } } }] }])
    await bad([story01()], 'is not text or true and false', [
      { ref: tnRef(), rows: [{ layer: 'sot', key: `tn:${TN}:obs:1`, value: { content: { notes: [{ id: 'a', reference: '1:1', note: 5 }] } } }] },
    ])
  })
})

// The segment

const model = (): ObsModel => ({
  lang: EN,
  res: [[OBS, 'v12'], [SN, 'v1'], [SQ, 'v1'], [TN, 'v7'], [TQ, 'v8'], [TWL, 'v9']],
  stories: [
    {
      res: OBS,
      n: 10,
      title: '10. The plagues',
      reference: 'A Bible story from: Exodus 5-14',
      frames: [
        { n: 1, text: 'God sent plagues.', image: 'https://cdn.door43.org/obs/jpg/360px/obs-en-10-01.jpg' },
        { n: 2, text: 'Pharaoh did not listen.' },
      ],
    },
  ],
  notes: {
    res: TN,
    rows: [
      { id: 'ab12', ref: '10:3', frame: 1003, concept: 'ta:translate/figs-metaphor', cols: { tags: '', quote: 'hardened', occurrence: '1', note: 'A figure.\nSee [[ta:translate/figs-simile]].' } },
      { id: 'cd34', ref: '10:03', frame: 1003, cols: { tags: 'x', quote: '', occurrence: '0', note: 'padded', isIntro: false } },
      { id: 'kl12', ref: 'see below', frame: 0, cols: { tags: '', quote: '', occurrence: '0', note: 'unreadable' } },
    ],
  },
  questions: { res: TQ, rows: [{ id: 'q001', ref: '10:2', frame: 1002, cols: { tags: '', quote: '', occurrence: '0', question: 'Who?', response: 'God.' } }] },
  links: { res: TWL, rows: [{ id: 'l001', ref: '10:1', frame: 1001, concept: 'tw:kt/god', cols: { tags: 'kt', origWords: 'God', occurrence: '1', articlePath: 'bible/kt/god' } }] },
  studyNotes: { res: SN, rows: [{ id: 'sn001', ref: '10:1', frame: 1001, cols: { note: 'A study note.\nSecond line.' } }] },
  studyQuestions: { res: SQ, rows: [{ id: 'sq001', ref: '10:2', frame: 1002, cols: { question: 'Why?', response: 'Because.' } }] },
})

const roundTrip = async (m: ObsModel) => {
  const { bytes } = await writeSegment(obsSegment(m))
  const { seg, skipped } = await readSegment(bytes, { known: OBS_TABLES })
  expect(skipped).toEqual([])
  return { seg, view: obsView(seg), bytes }
}

describe('obsSegment', () => {
  test('a story with two frames, a note on 10:3, a study note and a study question round-trip', async () => {
    const m = model()
    const { seg, view } = await roundTrip(m)
    expect(view).toEqual(m)
    expect(seg.h).toEqual({
      class: 'obs',
      v: 1,
      tables: { strings: [1, true], stories: [1, true], notes: [1, false], questions: [1, false], links: [1, false], 'study-notes': [1, false], 'study-questions': [1, false] },
      lang: EN,
      res: m.res,
    })
    const notes = seg.t.notes as Record<string, unknown>
    expect(Object.keys(notes).sort()).toEqual(['cols', 'concept', 'frame', 'id', 'n', 'refText', 'res'])
    // The canonical text is not stored; the padded one and the unreadable one are.
    expect(notes.refText).toEqual([[1, '10:03'], [2, 'see below']])
    expect(notes.res).toBe(3)
    expect(notes.n).toBe(3)
  })

  test('a model without helps has the two required tables only; the strings table is there and empty', async () => {
    const m: ObsModel = { lang: EN, res: [[OBS, 'v12']], stories: model().stories }
    const { seg, view } = await roundTrip(m)
    expect(view).toEqual(m)
    expect(seg.h.tables).toEqual({ strings: [1, true], stories: [1, true] })
    expect(seg.t.strings).toEqual([])
    expect(Object.keys(seg.t).sort()).toEqual(['stories', 'strings'])
  })

  test('the helps share one string table; the ids of four ASCII characters are bytes, the others are strings', async () => {
    const { seg } = await roundTrip(model())
    const table = seg.t.strings as string[]
    expect(table).toContain('ta:translate/figs-metaphor')
    expect(table).toContain('tw:kt/god')
    expect(table).toContain('bible/kt/god')
    expect(table).toContain('sn001')
    expect((seg.t.notes as Record<string, any>).id.ascii4).toBeInstanceOf(Uint8Array)
    expect((seg.t['study-notes'] as Record<string, any>).id.strings).toBeInstanceOf(Uint8Array)
    expect(new Set(table).size).toBe(table.length)
  })

  test('stories are in the order of their number whatever the order given; the frames keep their order', () => {
    const m = model()
    m.stories = [{ ...m.stories[0], n: 20 }, { ...m.stories[0], n: 3 }]
    const seg = obsSegment(m)
    expect((seg.t.stories as { n: number }[]).map((s) => s.n)).toEqual([3, 20])
  })

  test('the same model gives the same bytes; the helps tables are optional', async () => {
    const a = (await writeSegment(obsSegment(model()))).bytes
    const b = (await writeSegment(obsSegment(model()))).bytes
    expect(b).toEqual(a)
    const m = model()
    delete m.studyNotes
    delete m.studyQuestions
    const { seg, view } = await roundTrip(m)
    expect(view).toEqual(m)
    expect(Object.keys(seg.h.tables).sort()).toEqual(['links', 'notes', 'questions', 'stories', 'strings'])
  })

  test('refs of a story are carried when the model has them, and left out otherwise', async () => {
    const m = model()
    m.stories[0].refs = [[2005001, 2014031]]
    expect((await roundTrip(m)).view).toEqual(m)
    expect((await roundTrip(model())).view.stories[0]).not.toHaveProperty('refs')
  })

  test('an extracted model round-trips', async () => {
    const { model: extracted } = await build([
      { ref: obsRef(), rows: [story10(), story01()] },
      { ref: tnRef(), rows: tnRows() },
    ])
    expect((await roundTrip(extracted!)).view).toEqual(extracted!)
  })

  test('throws for what the segment cannot hold', () => {
    const bad = (change: (m: ObsModel) => void, text: string) => {
      const m = model()
      change(m)
      expect(() => obsSegment(m)).toThrow(text)
    }
    bad((m) => void (m.res = []), 'at least one resource')
    bad((m) => void (m.res = [[OBS, 'a'], [OBS, 'b']]), 'is in res twice')
    bad((m) => void (m.stories[0].res = 'x'), 'res does not list')
    bad((m) => void m.stories.push({ ...m.stories[0] }), 'is in the model twice')
    bad((m) => void (m.stories[0].n = 0), 'the number is not an integer from 1')
    bad((m) => void (m.stories[0].frames = []), 'has no frames')
    bad((m) => void m.stories[0].frames.push({ n: 1, text: 'x' }), 'has the frame 1 twice')
    bad((m) => void (m.stories[0].title = 3 as never), 'has no title')
    bad((m) => void (m.stories[0].frames[0].text = 3 as never), 'the text is not text')
    bad((m) => void (m.stories[0].frames[0].image = 3 as never), 'the image is not text')
    bad((m) => void (m.stories[0].reference = 3 as never), 'the reference is not text')
    bad((m) => void (m.stories[0].refs = [[5, 4]]), 'is not [from, to]')
    bad((m) => void (m.notes!.res = 'x'), 'res does not list')
    bad((m) => void m.notes!.rows.push({ ...m.notes!.rows[0] }), 'is in the table twice')
    bad((m) => void (m.notes!.rows[0].id = ''), 'has no id')
    bad((m) => void (m.notes!.rows[0].frame = -1), 'frame is story')
    bad((m) => void (m.notes!.rows[0].frame = 1.5), 'frame is story')
    bad((m) => void (m.notes!.rows[0].concept = 3 as never), 'the concept is not text')
    bad((m) => void (m.notes!.rows[0].ref = 3 as never), 'has no reference text')
    bad((m) => void ((m.notes!.rows[0] as ObsHelpRow).cols = { note: 1 as never }), 'a column holds text or true and false')
  })
})
