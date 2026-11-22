import { describe, expect, test } from 'bun:test'
import type { MapSet, Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import type { PackReader } from '../reader'
import { distance, inMediterranean, passagePlaces, placeQuery, type PlaceRef, placesOf, route, trip, travelDays } from './geo'

const v = (book: number, chapter: number, verse: number): number => book * 1_000_000 + chapter * 1000 + verse
const act = (c: number, x: number): number => v(44, c, x)

describe('distance', () => {
  const jerusalem = { lat: 31.78, lon: 35.22 }
  const damascus = { lat: 33.51, lon: 36.29 }
  test('Jerusalem to Damascus: about 217 km, to the north-east of the eight directions (bearing about 27 degrees)', () => {
    const d = distance(jerusalem, damascus)
    expect(Math.round(d.km)).toBe(217)
    expect(d.direction).toBe('NE')
    expect(Math.round(d.bearing)).toBe(27)
  })
  test('Bethlehem to Jerusalem: 8.5 km to the north, and the reverse to the south', () => {
    const bethlehem = { lat: 31.7, lon: 35.21 }
    const d = distance(bethlehem, jerusalem)
    expect(d.km).toBeGreaterThan(8)
    expect(d.km).toBeLessThan(9.5)
    expect(d.direction).toBe('N')
    expect(distance(jerusalem, bethlehem).direction).toBe('S')
  })
  test('the same point: 0 km', () => {
    expect(distance(jerusalem, jerusalem).km).toBe(0)
  })
})

describe('travelDays: the vectors of the design (5.8)', () => {
  test('217 km: on foot 8 to 11 days, on horseback 4 to 6', () => {
    expect(travelDays(217, 'foot')).toEqual({ low: 8, high: 11 })
    expect(travelDays(217, 'horse')).toEqual({ low: 4, high: 6 })
  })
  test('127 km: 4 to 6 days on foot, 2 to 4 on horseback', () => {
    expect(travelDays(127, 'foot')).toEqual({ low: 4, high: 6 })
    expect(travelDays(127, 'horse')).toEqual({ low: 2, high: 4 })
  })
  test('8.5 km: less than a day', () => {
    expect(travelDays(8.5, 'foot')).toEqual({ low: 0, high: 1 })
    expect(travelDays(8.5, 'horse')).toEqual({ low: 0, high: 1 })
  })
  test('by sea: low = km x 1.1 / 140 and high = km x 1.5 / 110', () => {
    expect(travelDays(1200, 'ship')).toEqual({ low: 9, high: 17 })
  })
  test('the low figure is at least 1 once the high one is', () => {
    expect(travelDays(30, 'foot')).toEqual({ low: 1, high: 2 })
  })
  test('a very long way: the low figure is 60 or more ("more than two months")', () => {
    expect(travelDays(2000, 'foot').low).toBeGreaterThanOrEqual(60)
  })
})

/** A place as an answer gives it: the tests of `trip` write only the point, certainty and form. */
const ref = (p: { lat?: number; lon?: number; sure: 0 | 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5 }): PlaceRef => ({ id: 'lug:x', name: 'X', ...p })
const tripOf = (a: Parameters<typeof ref>[0], b: Parameters<typeof ref>[0]) => trip(ref(a), ref(b))

describe('trip', () => {
  test('no point (sure 0, or no lat and lon): nothing to measure', () => {
    const here = { lat: 31.78, lon: 35.22, sure: 3 as const, form: 1 as const }
    expect(tripOf(here, { sure: 0, form: 1 })).toBeUndefined()
    expect(tripOf({ ...here, sure: 0 }, here)).toBeUndefined()
    expect(tripOf(here, { lat: 33, sure: 3, form: 1 })).toBeUndefined()
    expect(tripOf({ lon: 35, sure: 3, form: 1 }, here)).toBeUndefined()
  })
  const jerusalem = { lat: 31.78, lon: 35.22, sure: 3 as const, form: 1 as const }
  const damascus = { lat: 33.51, lon: 36.29, sure: 3 as const, form: 1 as const }
  test('land: foot and horse, no ship', () => {
    const t = tripOf(jerusalem, damascus)!
    expect(t.days).toEqual({ foot: { low: 8, high: 11 }, horse: { low: 4, high: 6 } })
  })
  test('medium certainty: days are given and the certainty is the lowest of the two; low: no days', () => {
    expect(tripOf(jerusalem, { ...damascus, sure: 2 })!.sure).toBe(2)
    expect(tripOf(jerusalem, { ...damascus, sure: 2 })!.days).toBeDefined()
    expect(tripOf(jerusalem, { ...damascus, sure: 1 })!.days).toBeUndefined()
  })
  test('closer than 3 km: "next to", no days', () => {
    const t = tripOf(jerusalem, { ...jerusalem, lat: 31.79 })!
    expect(t.near).toBe(true)
    expect(t.days).toBeUndefined()
  })
  test('a river or a region has no point to measure', () => {
    expect(tripOf(jerusalem, { ...damascus, form: 3 })).toBeUndefined()
    expect(tripOf(jerusalem, { ...damascus, form: 2 })).toBeUndefined()
  })
  test('ship: only between two ports of the Mediterranean', () => {
    const caesarea = { lat: 32.5, lon: 34.89, sure: 3 as const, form: 5 as const }
    const rome = { lat: 41.89, lon: 12.49, sure: 3 as const, form: 5 as const }
    expect(tripOf(caesarea, rome)!.days!.ship).toBeDefined()
    expect(tripOf(caesarea, { ...rome, form: 1 })!.days!.ship).toBeUndefined() // an inland city
    const aqaba = { lat: 29.53, lon: 35, sure: 3 as const, form: 5 as const } // the Red Sea: latitude below 30
    expect(tripOf(caesarea, aqaba)!.days!.ship).toBeUndefined()
    const trebizond = { lat: 41.0, lon: 39.7, sure: 3 as const, form: 5 as const } // the Black Sea: longitude above 37
    expect(tripOf(caesarea, trebizond)!.days!.ship).toBeUndefined()
    const sinope = { lat: 42.03, lon: 35.15, sure: 3 as const, form: 5 as const } // the Black Sea: latitude above 41, longitude above 26
    expect(tripOf(caesarea, sinope)!.days!.ship).toBeUndefined()
    expect(inMediterranean(rome)).toBe(true)
  })
})

const TIPNR = 'STEPBible/STEPBible-Data/TIPNR'
const OB = 'openbibleinfo/Bible-Geocoding-Data'
const THEO = 'robertrouse/theographic-bible-metadata'
const topic = (kind: Topic['kind'], title: string): Topic => ({ kind, source: TIPNR, ref: `${title}@x`, title, ustrong: '' })
const VERSES: Record<string, number[]> = {
  'ev:journey': [...Array.from({ length: 52 }, (_, i) => act(13, i + 1)), ...Array.from({ length: 28 }, (_, i) => act(14, i + 1))],
  'lug:antioch': [act(13, 1), act(14, 26)],
  'lug:seleucia': [act(13, 4)],
  'lug:salamis': [act(13, 5)],
  'lug:egypt': [act(13, 17)],
  'lug:perga': [act(13, 13), act(14, 25)],
  'per:paul': [act(9, 11)],
  'lug:tarsus': [act(9, 11)],
}
const GEO: NonNullable<XtopicsCore['geo']> = {
  'lug:antioch': { lat: 3623, lon: 3617, sure: 3, form: 1 },
  'lug:seleucia': { lat: 3612, lon: 3592, sure: 3, form: 5 },
  'lug:salamis': { lat: 3518, lon: 3390, sure: 3, form: 5 },
  'lug:egypt': { lat: 3013, lon: 3131, sure: 3, form: 2 },
  'lug:perga': { lat: 3696, lon: 3085, sure: 3, form: 1 },
  'lug:tarsus': { lat: 3691, lon: 3489, sure: 2, form: 1 },
}
const core: XtopicsCore = {
  part: 'core',
  res: [[TIPNR, 'be4191f0'], [OB, '7eb18a5e'], [THEO, '744355c7']],
  coverage: new Map(),
  topics: new Map(Object.keys(VERSES).sort().map((id) => [id, topic(id.startsWith('ev:') ? 'event' : id.startsWith('per:') ? 'person' : 'place', id.slice(id.indexOf(':') + 1, id.indexOf(':') + 2).toUpperCase() + id.slice(id.indexOf(':') + 2))])),
  occurrences: new Map(Object.entries(VERSES).map(([id, list]) => [id, new Map([['act', [list.length, list.length] as [number, number]]])])),
  relations: [
    { from: 'per:paul', to: 'lug:tarsus', type: 'born-in', source: THEO, confidence: 80 },
    { from: 'ev:journey', to: 'lug:perga', type: 'place', source: THEO, confidence: 80 },
    { from: 'tw:names/antioch', to: 'lug:antioch', type: 'same-as', source: TIPNR, confidence: 70 },
  ],
  geo: GEO,
  routes: [
    { event: 'ev:journey', stops: ['lug:antioch', 'lug:seleucia', 'lug:salamis', 'lug:perga', 'lug:antioch'] },
    { event: 'ev:journey', stops: ['lug:antioch', 'lug:perga'] }, // an alternative route of the same event
  ],
}
const parts = new Map<string, XtopicsPart>([['act', { part: 'act', occurrences: new Map(Object.entries(VERSES)) }]])
const topics: TopicsCore = {
  lang: 'es-419',
  part: 'core',
  res: [],
  coverage: new Map(),
  names: {},
  places: { names: { 'lug:tarsus': 'Tarso' }, notes: { 'lug:perga': 'de Panfilia' }, aliases: {} },
}

function reader(has: { xtopics?: boolean; routes?: boolean } = {}): PackReader {
  const o = { xtopics: true, routes: true, ...has }
  const c = o.routes ? core : { ...core, routes: undefined }
  return {
    lang: 'es-419',
    revisions: () => ({ lang: 3, common: 5 }),
    unitRevision: () => 5,
    listed: () => true,
    size: () => 1234,
    xtopicsParts: async (books: readonly string[]) => new Map([...parts].filter(([b]) => books.includes(b))),
    mapsOf: async (units: readonly string[], how?: { coreOnly?: boolean }) => {
      const m: MapSet = { revision: 3 }
      if (units.includes('xtopics') && o.xtopics) m.xtopics = { core: c, parts: how?.coreOnly === true ? new Map() : parts }
      if (units.includes('topics')) m.topics = { core: topics, parts: new Map() }
      if (units.includes('map')) m.map = { core: { names: { 'tw:names/antioch': ['Antioquía'] } } as never, parts: new Map() }
      return m
    },
  } as unknown as PackReader
}

describe('place', () => {
  test('Tarso: the name in the language, the point, who was born here', async () => {
    const a = await placeQuery(reader(), 'lug:tarsus')
    expect(a.data).toMatchObject({ id: 'lug:tarsus', name: 'Tarso', lat: 36.91, lon: 34.89, sure: 2, form: 1, verses: 1, born: [{ id: 'per:paul', name: 'Paul' }], died: [] })
    expect(a.cites.map((c) => c.res)).toContain(THEO)
  })
  test('a name from the tW article joined by same-as, and a note', async () => {
    expect((await placeQuery(reader(), 'lug:antioch')).data!.name).toBe('Antioquía')
    expect((await placeQuery(reader(), 'lug:perga')).data!).toMatchObject({ note: 'de Panfilia', events: [{ id: 'ev:journey', title: 'Journey' }] })
  })
  test('not a place, not installed, a bad id', async () => {
    expect((await placeQuery(reader(), 'lug:nowhere')).data).toBeNull()
    const none = await placeQuery(reader({ xtopics: false }), 'lug:tarsus')
    expect(none.data).toBeNull()
    expect(none.notInstalled.map((n) => n.unit)).toEqual(['xtopics'])
    await expect(placeQuery(reader(), 'per:paul')).rejects.toThrow()
  })
})

describe('placesOf and passagePlaces', () => {
  test('the places of a verse, every form', async () => {
    const a = await placesOf(reader(), act(13, 17))
    expect(a.data!.map((p) => [p.id, p.form])).toEqual([['lug:egypt', 2]])
  })
  test('named places of a passage, in order of first verse, without regions', async () => {
    const a = await passagePlaces(reader(), act(13, 1), act(14, 28))
    expect(a.data!.map((p) => [p.id, p.verse])).toEqual([
      ['lug:antioch', act(13, 1)],
      ['lug:seleucia', act(13, 4)],
      ['lug:salamis', act(13, 5)],
      ['lug:perga', act(13, 13)],
    ])
  })
  test('a bad range', async () => {
    await expect(passagePlaces(reader(), act(14, 1), act(13, 1))).rejects.toThrow()
  })
})

describe('route', () => {
  test('the verse of a stop is the first after the stop before: Antioch is at the start and at the end', async () => {
    const a = await route(reader(), 'ev:journey')
    expect(a.data!.event).toEqual({ id: 'ev:journey', title: 'Journey' })
    expect(a.data!.stops.map((s) => [s.place.id, s.verse])).toEqual([
      ['lug:antioch', act(13, 1)],
      ['lug:seleucia', act(13, 4)],
      ['lug:salamis', act(13, 5)],
      ['lug:perga', act(13, 13)],
      ['lug:antioch', act(14, 26)],
    ])
  })
  test('an event with two routes: the first by default, the other by its index, and how many there are', async () => {
    const first = await route(reader(), 'ev:journey')
    expect([first.data!.index, first.data!.count]).toEqual([0, 2])
    const second = await route(reader(), 'ev:journey', 1)
    expect(second.data!.stops.map((x) => x.place.id)).toEqual(['lug:antioch', 'lug:perga'])
    expect((await route(reader(), 'ev:journey', 2)).data).toBeNull()
  })
  test('no routes table, or an event without a route: null', async () => {
    expect((await route(reader({ routes: false }), 'ev:journey')).data).toBeNull()
    expect((await route(reader(), 'ev:other')).data).toBeNull()
  })
})

describe('the sample built with the maps (buildSample({ geo: true }))', () => {
  test('the common core has geo, born-in and the basemap complement; the es-419 core has places', async () => {
    const { buildSample } = await import('../../test/sample')
    const { KNOWN, readHeader, readSegment, topicsView, xtopicsView, decodeBasemap } = await import('@bt-synergy/language-pack-v3')
    const sample = await buildSample({ geo: true })
    let x: XtopicsCore | undefined
    let t: TopicsCore | undefined
    for (const bytes of sample.segments.values()) {
      const h = readHeader(bytes).header.h as { class?: string; part?: string }
      if (h.part !== 'core') continue
      if (h.class === 'xtopics') x = xtopicsView((await readSegment(bytes, { known: KNOWN.xtopics })).seg) as XtopicsCore
      if (h.class === 'topics') t = topicsView((await readSegment(bytes, { known: KNOWN.topics })).seg) as TopicsCore
    }
    expect(x?.geo?.['lug:jerusalem']).toMatchObject({ sure: 2, form: 1, lat: 3178, lon: 3523 })
    expect(x?.geo?.['lug:bethlehem-gen-35-16']).toMatchObject({ sure: 3 })
    expect(x?.geo?.['lug:egypt']).toMatchObject({ sure: 1, form: 2 })
    expect(x?.geo?.['lug:ur']).toMatchObject({ form: 5 })
    expect(x?.res.map(([k]) => k)).toContain('openbibleinfo/Bible-Geocoding-Data')
    expect(Object.keys(t?.places?.names ?? {}).length).toBeGreaterThan(0)
    expect([...(sample.complements?.values() ?? [])].map((b) => decodeBasemap(b).paths.length)).toEqual([3])
  })
});

describe('the samples for old clients (old-clients.ts --geo and --geo-bad)', () => {
  test('the geo sample has a route and a born-in; the bad-rows sample has the same tables and a common core a reader of this version rejects', async () => {
    const { buildSample } = await import('../../test/sample')
    const { KNOWN, readHeader, readSegment, xtopicsView } = await import('@bt-synergy/language-pack-v3')
    const read = async (badRows: boolean): Promise<XtopicsCore | 'rejected'> => {
      const sample = await buildSample({ geo: true, badRows })
      for (const bytes of sample.segments.values()) {
        const h = readHeader(bytes).header.h as { class?: string; part?: string }
        if (h.class !== 'xtopics' || h.part !== 'core') continue
        try {
          return xtopicsView((await readSegment(bytes, { known: KNOWN.xtopics })).seg) as XtopicsCore
        } catch {
          return 'rejected'
        }
      }
      throw new Error('no core')
    }
    const good = await read(false)
    expect(good).not.toBe('rejected')
    expect((good as XtopicsCore).routes).toEqual([{ event: 'ev:exodus-from-egypt', stops: ['lug:egypt', 'lug:jerusalem'] }])
    expect((good as XtopicsCore).relations?.some((r) => r.type === 'born-in' && r.from === 'per:abraham' && r.to === 'lug:ur')).toBe(true)
    expect(await read(true)).toBe('rejected')
  })
});
