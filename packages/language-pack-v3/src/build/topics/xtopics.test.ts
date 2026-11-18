import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verseId } from '../../ids'
import type { Event, OrigModel } from '../../model'
import { xtopicsView } from '../../read/topics'
import { parseObsRefs } from '../../source/obsRefs'
import { parseTheographic } from '../../source/theographic'
import { parseTipnr } from '../../source/tipnr'
import { xtopicsSegment } from './segment'
import type { AcaiPerson } from '../../source/acai'
import { buildXtopics, chapterLengths, foldTitle, strongKeyOfDStrong, type XtopicsSources } from './xtopics'

const DATA = join(import.meta.dir, '../../../spec/tests/data/topics')

/** An original with only chapters and verses, `lengths[c - 1]` verses in chapter c. */
function fakeOrig(book: string, lengths: number[]): OrigModel {
  const events: Event[] = []
  lengths.forEach((n, i) => {
    events.push([0, 'chapter', String(i + 1)])
    for (let v = 1; v <= n; v++) events.push([0, 'verse', String(v)])
  })
  return { book, key: 'test/hbo/uhb', stamp: 'v1', words: [], pieces: [], events }
}

function obsStories(): Map<number, string> {
  const out = new Map<number, string>()
  let n = 0
  for (const line of readFileSync(join(DATA, 'obs-refs.txt'), 'utf8').split(/\r?\n/)) {
    const h = /^=== (\d+)$/.exec(line)
    if (h) out.set((n = Number(h[1])), '')
    else if (n > 0) out.set(n, `${out.get(n)}${line}\n`)
  }
  return out
}

function theographicFixture(): { events: string; verses: string; people: string; places: string } {
  const f = (name: string) => readFileSync(join(DATA, 'theographic-subset', `${name}.json`), 'utf8')
  return { events: f('events'), verses: f('verses'), people: f('people'), places: f('places') }
}

const RES: XtopicsSources = {
  tipnr: ['STEPBible/TIPNR', 'be4191f0'],
  theographic: ['robertrouse/theographic-bible-metadata', '744355c7'],
  obs: ['test/en/obs', 'v9'],
  outlines: ['test/en/tn', 'v80'],
}

const origs = [
  fakeOrig('gen', [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 54, 33, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26]),
  fakeOrig('exo', [22, 25, 22, 31, 23, 30, 29, 28, 35, 29, 10, 51]),
]

function build(twNames?: Parameters<typeof buildXtopics>[0]['twNames']) {
  const issues: string[] = []
  const tipnr = parseTipnr(readFileSync(join(DATA, 'tipnr-subset.txt'), 'utf8'), issues)
  const events = parseTheographic(theographicFixture(), issues)
  const obs = parseObsRefs(obsStories(), issues, chapterLengths(origs))
  const outlines = new Map([['exo', [{ title: 'God sends the plagues', from: verseId('exo', 7, 1), to: verseId('exo', 12, 51) }]]])
  return { ...buildXtopics({ tipnr, events, obs, outlines, origs, res: RES, twNames }), issues }
}

describe('buildXtopics (fixtures)', () => {
  const { core, parts, report } = build()
  const part = (book: string) => parts.find((p) => p.part === book)!

  test('per:abraham: its Genesis verses, its uStrong, its Strong keys, a parent-of from per:terah', () => {
    expect(core.topics.get('per:abraham')).toEqual({ kind: 'person', source: 'STEPBible/TIPNR', ref: 'Abraham@Gen.11.26-1Pe', title: 'Abraham', ustrong: 'H0085' })
    const gen = part('gen').occurrences.get('per:abraham')!
    expect(gen).toContain(verseId('gen', 11, 26))
    expect(gen).toContain(verseId('gen', 17, 23))
    expect(core.occurrences.get('per:abraham')!.get('gen')).toEqual([gen.length, gen.length])
    expect(core.strongs!['per:abraham']).toEqual(['G00110', 'H0085', 'H0087'])
    expect(core.relations).toContainEqual({ from: 'per:terah', to: 'per:abraham', type: 'parent-of', source: 'STEPBible/TIPNR', confidence: 100 })
    // Symmetric relations once: Abraham and Sarah list each other as partners
    expect(core.relations!.filter((r) => r.type === 'partner-of' && [r.from, r.to].sort().join() === 'per:abraham,per:sarah')).toHaveLength(1)
  })

  test('ev:plagues-of-egypt has Exodus 7:14-12:36, and obs:10 and sec:exo/7-12 relate occurs-in to it', () => {
    expect(core.topics.get('ev:plagues-of-egypt')).toMatchObject({ kind: 'event', source: 'builder', title: 'Plagues of Egypt' })
    const exo = part('exo').occurrences.get('ev:plagues-of-egypt')!
    expect(exo[0]).toBe(verseId('exo', 7, 14))
    expect(exo[exo.length - 1]).toBe(verseId('exo', 12, 36))
    expect(exo).toHaveLength(29 - 13 + 28 + 35 + 29 + 10 + 36)
    expect(core.ranges!['obs:10']).toEqual([[verseId('exo', 5, 1), verseId('exo', 10, 29)]])
    expect(core.relations).toContainEqual({ from: 'obs:10', to: 'ev:plagues-of-egypt', type: 'occurs-in', source: 'test/en/obs', confidence: 60 })
    expect(core.relations).toContainEqual({ from: 'sec:exo/7-12', to: 'ev:plagues-of-egypt', type: 'occurs-in', source: 'test/en/tn', confidence: 60 })
    expect(core.topics.get('sec:exo/7-12')).toMatchObject({ kind: 'section', title: 'God sends the plagues' })
  })

  test('an obs: story has no title: only its reference is taken from OBS', () => {
    const stories = [...core.topics].filter(([id]) => id.startsWith('obs:'))
    expect(stories.length).toBeGreaterThan(0)
    for (const [, topic] of stories) expect(topic.title).toBe('')
  })

  test('Theographic: part-of, follows, and participants only on one exact match; the rest is in the review list', () => {
    expect(core.relations).toContainEqual({ from: 'ev:abraham-goes-to-egypt', to: 'ev:sojourn-in-canaan-and-egypt', type: 'part-of', source: RES.theographic[0], confidence: 100 })
    expect(core.relations).toContainEqual({ from: 'ev:abraham-goes-to-egypt', to: 'ev:abraham-enters-canaan', type: 'follows', source: RES.theographic[0], confidence: 100 })
    expect(core.relations).toContainEqual({ from: 'ev:abraham-goes-to-egypt', to: 'per:abraham', type: 'participant', source: RES.theographic[0], confidence: 80 })
    expect(core.relations).toContainEqual({ from: 'ev:abraham-goes-to-egypt', to: 'lug:egypt', type: 'place', source: RES.theographic[0], confidence: 80 })
    // Sarah has no verse of ev:abraham-enters-canaan: not linked, reviewed
    expect(core.relations!.some((r) => r.from === 'ev:abraham-enters-canaan' && r.to === 'per:sarah')).toBe(false)
    expect(report).toContain('review: ev:abraham-enters-canaan participant "Sarah": no TIPNR record with the name and a verse of the event')
  })

  test('the segment is what the reader reads back, and the same twice', () => {
    const seg = xtopicsSegment(core)
    expect(xtopicsView(structuredClone(seg))).toEqual(xtopicsView(xtopicsSegment(build().core)))
    for (const p of parts) expect(xtopicsView(xtopicsSegment(p))).toEqual(p)
  })

  test('nothing outside the books built is counted', () => {
    expect(parts.map((p) => p.part)).toEqual(['gen', 'exo'])
    for (const byBook of core.occurrences.values()) for (const book of byBook.keys()) expect(['gen', 'exo']).toContain(book)
  })
})

describe('buildXtopics: same-as', () => {
  test('a tW name joins the one person sharing a Strong key and a verse; otherwise the review list', () => {
    const { core, report } = build(
      new Map([
        ['tw:names/abraham', { strongs: ['H0085'], verses: [verseId('gen', 17, 5)] }],
        ['tw:names/sarah', { strongs: ['H8283'], verses: [verseId('exo', 1, 1)] }],
        ['tw:kt/god', { strongs: ['H0085'], verses: [verseId('gen', 17, 5)] }],
        ['tw:names/nobody', { strongs: ['H9999'], verses: [verseId('gen', 1, 1)] }],
      ]),
    )
    expect(core.relations).toContainEqual({ from: 'tw:names/abraham', to: 'per:abraham', type: 'same-as', source: 'STEPBible/TIPNR', confidence: 70 })
    expect(core.relations!.some((r) => r.from === 'tw:names/sarah' || r.from === 'tw:kt/god')).toBe(false)
    expect(report.some((l) => l.startsWith('review: tw:names/sarah same-as'))).toBe(true)
    expect(report.some((l) => l.startsWith('review: tw:names/nobody same-as'))).toBe(true)
    expect(xtopicsView(xtopicsSegment(core))).toMatchObject({ relations: expect.anything() })
  })
})

describe('buildXtopics: ACAI', () => {
  const ACAI_RES: [string, string] = ['BibleAquifer/ACAI', '5375d0d3']
  const p = (id: string, tipnr: string, gender: 0 | 1 | 2, tw: string[] = []): AcaiPerson => ({ id, primary: id, tipnr: [tipnr], tw, gender, labels: {} })
  const people = [
    p('person:Abraham', 'Abraham@Gen.11.26-1Pe', 1, ['Abraham']),
    p('person:Isaac', 'Isaac@Gen.17.19-Jas', 1, ['Isaac', 'Nobody']),
    p('person:Rebekah', 'Rebekah@Gen.22.23-Rom', 0),
    p('person:Sarah', 'Sarah@Gen.11.29-1Pe', 2, ['Sarah']),
  ]
  const twNames = new Map([
    ['tw:names/abraham', { strongs: ['H0085'], verses: [verseId('gen', 17, 5)] }],
    ['tw:names/sarah', { strongs: ['H8283'], verses: [verseId('exo', 1, 1)] }],
  ])
  const twTitles = new Map([
    ['tw:names/abraham', 'Abraham, Abram'],
    ['tw:names/sarah', 'Sarah, Sarai'],
    ['tw:names/isaac', 'Isaac'],
  ])
  function withAcai(acai: AcaiPerson[] | undefined) {
    const issues: string[] = []
    const tipnr = parseTipnr(readFileSync(join(DATA, 'tipnr-subset.txt'), 'utf8'), issues)
    const events = parseTheographic(theographicFixture(), issues)
    const obs = parseObsRefs(obsStories(), issues, chapterLengths(origs))
    return buildXtopics({ tipnr, events, obs, outlines: new Map(), origs, res: { ...RES, acai: ACAI_RES }, twNames, twTitles, acai })
  }
  const { core, parts, report } = withAcai(people)

  test('gender: 1 man, 2 woman, nothing for no data; the column reads back', () => {
    expect(core.gender).toEqual({ 'per:abraham': 1, 'per:isaac': 1, 'per:sarah': 2 })
    expect((xtopicsView(xtopicsSegment(core)) as typeof core).gender).toEqual(core.gender)
  })
  test('same-as of ACAI only for a tW name TIPNR joined to no one, confidence 75; the rest to the review list', () => {
    const same = core.relations!.filter((r) => r.type === 'same-as')
    expect(same).toEqual([
      { from: 'tw:names/abraham', to: 'per:abraham', type: 'same-as', source: 'STEPBible/TIPNR', confidence: 70 },
      { from: 'tw:names/isaac', to: 'per:isaac', type: 'same-as', source: 'BibleAquifer/ACAI', confidence: 75 },
      { from: 'tw:names/sarah', to: 'per:sarah', type: 'same-as', source: 'BibleAquifer/ACAI', confidence: 75 },
    ])
    expect(report).toContain('review: acai person:Isaac (per:isaac) tW "Nobody": no tw:names/ article has that title')
    expect(report).toContain('acai: 2 same-as added from the tW titles of ACAI, 1 left to the TIPNR rule')
  })
  test('ACAI is in res of the core; the parts are the same bytes as without it', () => {
    expect(core.res.map(([k]) => k)).toContain('BibleAquifer/ACAI')
    const without = withAcai(undefined)
    expect(without.core.res.map(([k]) => k)).not.toContain('BibleAquifer/ACAI')
    expect(without.core.gender).toBeUndefined()
    expect(parts.map((x) => xtopicsSegment(x))).toEqual(without.parts.map((x) => xtopicsSegment(x)))
  })
  test('foldTitle', () => {
    expect(foldTitle('Abi-Albon')).toBe('abialbon')
    expect(foldTitle(' Ésaü ')).toBe('esau')
  })
})

test('strongKeyOfDStrong', () => {
  expect(strongKeyOfDStrong('H0085')).toBe('H0085')
  expect(strongKeyOfDStrong('H2148P')).toBe('H2148')
  expect(strongKeyOfDStrong('G2197H')).toBe('G21970')
  expect(strongKeyOfDStrong('X1')).toBeNull()
})
