import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MapSet, Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import type { PackReader } from '../reader'
import { familyQuery, kinVerses, peopleQuery } from './family'

const v = (book: number, chapter: number, verse: number): number => book * 1_000_000 + chapter * 1000 + verse
const gen = (c: number, x: number): number => v(1, c, x)

describe('kinVerses: the vectors of spec/tests/parentescos/versiculos.json', () => {
  const file = join(import.meta.dir, '../../../language-pack-v3/spec/tests/parentescos/versiculos.json')
  const { cases } = JSON.parse(readFileSync(file, 'utf8')) as { cases: { what: string; a: number[]; b: number[]; verses: [number, number][] }[] }
  for (const c of cases) {
    test(c.what, () => {
      expect(kinVerses(c.a, c.b)).toEqual(c.verses)
      expect(kinVerses(c.b, c.a)).toEqual(c.verses)
    })
  }
})

describe('kinVerses (ids.md, "Verses of a family relation")', () => {
  test('the first three shared verses, in verse order, each as [v, v]', () => {
    expect(kinVerses([gen(27, 1), gen(25, 26), gen(25, 28), gen(26, 1)], [gen(26, 1), gen(25, 28), gen(25, 26), gen(27, 1)])).toEqual([
      [gen(25, 26), gen(25, 26)],
      [gen(25, 28), gen(25, 28)],
      [gen(26, 1), gen(26, 1)],
    ])
  })
  test('none shared: the closest pair in one chapter, at most three verses apart, as [first, last]', () => {
    expect(kinVerses([gen(4, 1), gen(9, 10)], [gen(4, 3), gen(9, 14)])).toEqual([[gen(4, 1), gen(4, 3)]])
    expect(kinVerses([gen(4, 10)], [gen(4, 7)])).toEqual([[gen(4, 7), gen(4, 10)]])
  })
  test('a tie of distance: the smallest first verse, then the smallest last', () => {
    expect(kinVerses([gen(5, 10), gen(3, 5)], [gen(5, 8), gen(3, 7)])).toEqual([[gen(3, 5), gen(3, 7)]])
    expect(kinVerses([gen(5, 10)], [gen(5, 8), gen(5, 12)])).toEqual([[gen(5, 8), gen(5, 10)]])
  })
  test('nothing within three verses of one chapter, or in another chapter: none', () => {
    expect(kinVerses([gen(4, 1)], [gen(4, 5)])).toEqual([])
    expect(kinVerses([gen(4, 26)], [gen(5, 1)])).toEqual([])
    expect(kinVerses([], [gen(4, 1)])).toEqual([])
  })
})

// The family of Isaac, as the common xtopics and an es-419 language would have it
const TIPNR = 'STEPBible/STEPBible-Data/TIPNR'
const ACAI = 'BibleAquifer/ACAI'
const person = (title: string): Topic => ({ kind: 'person', source: TIPNR, ref: `${title}@x`, title, ustrong: '' })
const VERSES: Record<string, number[]> = {
  'per:abraham': [gen(21, 3), gen(25, 9)],
  'per:sarah': [gen(21, 3)],
  'per:hagar': [gen(16, 15)],
  'per:keturah': [gen(25, 1)],
  'per:isaac': [gen(21, 3), gen(25, 9), gen(25, 20), gen(25, 26), gen(25, 28), gen(27, 1)],
  'per:ishmael': [gen(16, 15), gen(25, 9)],
  'per:zimran': [gen(25, 2)],
  'per:rebekah': [gen(24, 15), gen(25, 20), gen(25, 28)],
  'per:esau': [gen(25, 25), gen(25, 26), gen(25, 28), gen(27, 1)],
  'per:israel': [gen(25, 26), gen(25, 28)],
  'per:jacob': [v(40, 1, 16)],
}
const core: XtopicsCore = {
  part: 'core',
  res: [[ACAI, '5375d0d3'], [TIPNR, 'be4191f0']],
  coverage: new Map(),
  topics: new Map(
    [...Object.keys(VERSES), 'lug:hebron']
      .sort()
      .map((id) => [id, id === 'lug:hebron' ? { ...person('Hebron'), kind: 'place' } : person(id.slice(4, 5).toUpperCase() + id.slice(5))]),
  ),
  occurrences: new Map(Object.entries(VERSES).map(([id, list]) => [id, new Map([[id === 'per:jacob' ? 'mat' : 'gen', [list.length, list.length] as [number, number]]])])),
  relations: [
    ...[
      ['per:abraham', 'per:isaac'],
      ['per:sarah', 'per:isaac'],
      ['per:abraham', 'per:ishmael'],
      ['per:hagar', 'per:ishmael'],
      ['per:abraham', 'per:zimran'],
      ['per:keturah', 'per:zimran'],
      ['per:isaac', 'per:esau'],
      ['per:isaac', 'per:israel'],
      ['per:rebekah', 'per:esau'],
      ['per:rebekah', 'per:israel'],
    ].map(([from, to]) => ({ from, to, type: 'parent-of', source: TIPNR, confidence: 100 })),
    { from: 'per:isaac', to: 'per:ishmael', type: 'sibling-of', source: TIPNR, confidence: 100 },
    { from: 'per:isaac', to: 'per:zimran', type: 'sibling-of', source: TIPNR, confidence: 100 },
    { from: 'per:esau', to: 'per:israel', type: 'sibling-of', source: TIPNR, confidence: 100 },
    { from: 'per:isaac', to: 'per:rebekah', type: 'partner-of', source: TIPNR, confidence: 100 },
    { from: 'tw:names/isaac', to: 'per:isaac', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'tw:names/jacob', to: 'per:israel', type: 'same-as', source: TIPNR, confidence: 70 },
  ],
  gender: { 'per:abraham': 1, 'per:sarah': 2, 'per:hagar': 2, 'per:keturah': 2, 'per:isaac': 1, 'per:ishmael': 1, 'per:rebekah': 2, 'per:esau': 1, 'per:israel': 1, 'per:jacob': 1 },
}
const parts = new Map<string, XtopicsPart>([
  ['gen', { part: 'gen', occurrences: new Map(Object.entries(VERSES).filter(([id]) => id !== 'per:jacob')) }],
  ['mat', { part: 'mat', occurrences: new Map([['per:jacob', VERSES['per:jacob']]]) }],
])
const topics: TopicsCore = {
  lang: 'es-419',
  part: 'core',
  res: [],
  coverage: new Map(),
  names: { 'per:isaac': [['Isaac', 'alignment', 3, ['gen']]], 'per:esau': [['él', 'alignment', 9, ['gen']]] },
  people: { names: { 'per:esau': 'Esaú', 'per:sarah': 'Sara', 'per:rebekah': 'Rebeca' }, notes: { 'per:jacob': 'padre de José' }, aliases: { Saray: ['per:sarah'] } },
}
const mapNames = { 'tw:names/isaac': ['Isaac'], 'tw:names/jacob': ['Jacob'] }

/** A reader that has the maps above (a unit left out of `has` is not installed). */
function reader(has: { parts?: boolean; topics?: boolean; xtopics?: boolean } = {}): PackReader {
  const o = { parts: true, topics: true, xtopics: true, ...has }
  return {
    lang: 'es-419',
    revisions: () => ({ lang: 3, common: 5 }),
    unitRevision: () => 5,
    listed: () => true,
    size: () => 1234,
    mapsOf: async (units: readonly string[], how?: { coreOnly?: boolean }) => {
      const m: MapSet = { revision: 3 }
      if (units.includes('xtopics') && o.xtopics) m.xtopics = { core, parts: how?.coreOnly === true || !o.parts ? new Map() : parts }
      if (units.includes('topics') && o.topics) m.topics = { core: topics, parts: new Map() }
      if (units.includes('map')) m.map = { core: { names: mapNames } as never, parts: new Map() }
      return m
    },
  } as unknown as PackReader
}

describe('family', () => {
  test('the children of Isaac: Esaú and Jacob (the patriarch, per:israel), both first in Genesis 25:26', async () => {
    const a = await familyQuery(reader(), 'per:isaac')
    expect(a.query).toBe('family')
    const d = a.data!
    expect(d).toMatchObject({ id: 'per:isaac', name: 'Isaac', gender: 1, tw: ['tw:names/isaac'], verses: 6 })
    expect(d.children).toEqual([
      { id: 'per:esau', name: 'Esaú', gender: 1, verses: [[gen(25, 26), gen(25, 26)], [gen(25, 28), gen(25, 28)], [gen(27, 1), gen(27, 1)]] },
      { id: 'per:israel', name: 'Jacob', gender: 1, verses: [[gen(25, 26), gen(25, 26)], [gen(25, 28), gen(25, 28)]] },
    ])
    expect(d.parents.map((p) => [p.name, p.gender])).toEqual([['Abraham', 1], ['Sara', 2]])
    expect(d.partners.map((p) => p.name)).toEqual(['Rebeca'])
    expect(d.sources).toEqual([TIPNR, ACAI])
    expect(a.cites).toEqual([{ res: TIPNR, release: 'be4191f0' }, { res: ACAI, release: '5375d0d3' }])
  })
  test('half siblings only when the data proves it', async () => {
    const isaac = (await familyQuery(reader(), 'per:isaac')).data!
    // Ishmael (Abraham and Hagar) and Zimran (Abraham and Keturah): two parents each, one shared with Isaac
    expect(isaac.siblings.map((s) => [s.id, s.half])).toEqual([['per:ishmael', true], ['per:zimran', true]])
    // Esau and Jacob share both parents: brothers, not half
    const esau = (await familyQuery(reader(), 'per:esau')).data!
    expect(esau.siblings).toEqual([{ id: 'per:israel', name: 'Jacob', gender: 1, verses: [[gen(25, 26), gen(25, 26)], [gen(25, 28), gen(25, 28)]] }])
  })
  test('without the parts: the same people, no verses, in id order, and the parts it needed listed as not installed', async () => {
    const a = await familyQuery(reader({ parts: false }), 'per:isaac')
    expect(a.data!.children.map((c) => [c.id, c.verses])).toEqual([['per:esau', []], ['per:israel', []]])
    expect(a.notInstalled).toEqual([{ unit: 'xtopics', book: 'gen', bytes: 0, what: 'part' }])
  })
  test('not half: a sibling with one parent in the data, or three', async () => {
    const one = { ...core, relations: core.relations!.filter((r) => !(r.from === 'per:hagar' && r.to === 'per:ishmael')) }
    const three = { ...core, relations: [...core.relations!, { from: 'per:terah', to: 'per:ishmael', type: 'parent-of', source: TIPNR, confidence: 100 }] }
    for (const c of [one, three]) {
      const r = { ...reader(), mapsOf: async (units: readonly string[], how?: { coreOnly?: boolean }) => ({ ...(await reader().mapsOf(units as never, how)), ...(units.includes('xtopics') ? { xtopics: { core: c, parts } } : {}) }) } as unknown as PackReader
      const d = (await familyQuery(r, 'per:isaac')).data!
      expect(d.siblings.find((s) => s.id === 'per:ishmael')!.half).toBeUndefined()
      expect(d.siblings.find((s) => s.id === 'per:zimran')!.half).toBe(true)
    }
  })
  test('without the topics of the language: the derived names (tW article, else the English title)', async () => {
    const d = (await familyQuery(reader({ topics: false }), 'per:isaac')).data!
    expect(d.children.map((c) => c.name)).toEqual(['Esau', 'Jacob'])
    expect(d.sources).toEqual([TIPNR, ACAI])
  })
  test('not installed, not a person, not a per: id', async () => {
    const none = await familyQuery(reader({ xtopics: false }), 'per:isaac')
    expect(none.data).toBeNull()
    expect(none.notInstalled).toEqual([{ unit: 'xtopics', bytes: 1234 }])
    expect((await familyQuery(reader(), 'per:nobody')).data).toBeNull()
    await expect(familyQuery(reader(), 'lug:hebron')).rejects.toThrow('not a person id')
  })
})

describe('people', () => {
  test('every person with the names it is found by: its name first, aliases, tW names, English title, first topics name', async () => {
    const d = (await peopleQuery(reader())).data!
    expect(d.find((p) => p.id === 'per:sarah')).toEqual({ id: 'per:sarah', name: 'Sara', gender: 2, names: ['Sara', 'Saray', 'Sarah'], verses: 1 })
    expect(d.find((p) => p.id === 'per:israel')!.names).toEqual(['Jacob', 'Israel'])
    expect(d.find((p) => p.id === 'per:jacob')).toMatchObject({ name: 'Jacob', note: 'padre de José', names: ['Jacob'] })
    expect(d.find((p) => p.id === 'per:esau')!.names).toEqual(['Esaú', 'Esau', 'él'])
    expect(d.some((p) => p.id === 'lug:hebron')).toBe(false)
  })
})

describe('family on a built sample (es-419 Titus, common built with the ACAI fixture)', () => {
  test('names, gender and the parts of only the books asked', async () => {
    const { buildSample } = await import('../../test/sample')
    const { startFakeServer } = await import('../../test/fakeServer')
    const { createClient } = await import('../client')
    const { httpSource } = await import('../source/http')
    const { memoryStore } = await import('../store/memory')
    const sample = await buildSample({ acai: true })
    const trust = { trustedKeys: { [sample.keys.keyId]: Uint8Array.from(sample.keys.publicKey.match(/../g)!, (p) => parseInt(p, 16)) } }
    const server = startFakeServer(sample, {})
    try {
      const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
      await client.install('es-419', { books: ['tit'] })
      const r = await client.open('es-419')
      const d = (await r.family('per:isaac')).data!
      expect(d.parents.map((p) => [p.id, p.name, p.gender])).toEqual([['per:abraham', 'Abraham', 1], ['per:sarah', 'Sara', 2]])
      expect(d.sources).toEqual([TIPNR, ACAI])
      const parts = await r.xtopicsParts!(['tit', 'gen'])
      expect([...parts!.keys()]).toEqual(['tit'])
      expect((await r.people()).data!.find((p) => p.id === 'per:sarah')!.names).toContain('Saray')
    } finally {
      server.stop()
    }
  }, 120_000)
})
