import { describe, expect, test } from 'bun:test'
import type { Topic } from '../../model'
import type { AcaiPlace } from '../../source/acai'
import { joinAcaiPlaces } from '../../source/acai'
import { type ObPlace, parseOpenBible } from '../../source/openbible'
import { parseTipnr, type TipnrRecord } from '../../source/tipnr'
import { buildGeo, haversineKm, refBase, sureOf } from './geo'
import { buildXtopics } from './xtopics'

const place = (ref: string): Topic => ({ kind: 'place', source: 'tipnr', ref, title: ref.split('@')[0], ustrong: '' })
const record = (id: string, unique: string, point?: { lat: number; lon: number }): TipnrRecord => ({ kind: 'place', unique, uStrong: 'H0001', id, names: [], relations: [], ...(point === undefined ? {} : { point }) })
const ob = (friendlyId: string, unique: string[], ids: [number, number?, number?][], types: string[] = ['settlement']): ObPlace => ({
  friendlyId,
  unique,
  types,
  identifications: ids.map(([score, lon, lat]) => (lon === undefined ? { score } : { score, lon, lat })),
})

describe('refBase', () => {
  test('the range suffix goes, a hyphen before the @ stays', () => {
    expect(refBase('Bethel@Gen.12.8-Zec')).toBe('Bethel@Gen.12.8')
    expect(refBase('Abel-meholah@Jdg.7.22')).toBe('Abel-meholah@Jdg.7.22')
    expect(refBase('Jerusalem@Jos.10.1-Rev')).toBe('Jerusalem@Jos.10.1')
  })
})

describe('sureOf: the four cases of ids.md', () => {
  test('3 for 900 or more with one identification, 2 for 500 or more (and 900 with several), 1 below', () => {
    expect(sureOf(1000, 1)).toBe(3)
    expect(sureOf(950, 3)).toBe(2)
    expect(sureOf(500, 4)).toBe(2)
    expect(sureOf(499, 1)).toBe(1)
  })
})

describe('buildGeo', () => {
  const topics = new Map<string, Topic>([
    ['lug:abel', place('Abel@1Sa.6.18')],
    ['lug:bethel-gen-12-8', place('Bethel@Gen.12.8-Zec')],
    ['lug:bethel-jos-19-4', place('Bethel@Jos.12.16-1Sa')],
    ['lug:india', place('India@Est.1.1-Est')],
    ['lug:jerusalem', place('Jerusalem@Jos.10.1-Rev')],
    ['lug:nowhere', place('Nowhere@Gen.1.1')],
    ['lug:seleucia', place('Seleucia@Act.13.4')],
    ['per:paul', { kind: 'person', source: 'tipnr', ref: 'Paul@Act.13.9', title: 'Paul', ustrong: '' }],
  ])
  const records = [
    record('lug:abel', 'Abel@1Sa.6.18'),
    record('lug:india', 'India@Est.1.1-Est', { lat: 22, lon: 77 }),
    record('lug:nowhere', 'Nowhere@Gen.1.1', { lat: 0, lon: 14 }),
    record('lug:seleucia', 'Seleucia@Act.13.4', { lat: 36, lon: 36 }),
  ]
  const openbible = [
    ob('Bethel 1', ['Bethel@Gen.12.8', 'Bethel@Jos.12.16'], [[716, 35.24, 31.92], [99, 35.21, 31.9]]),
    ob('Bethel 2', ['Bethel@Jos.12.16'], [[277, 35.12, 31.34]]),
    ob('Bethel 3', ['Bethel@Gen.12.8'], [[577, 35.24, 31.92], [328]]),
    ob('Jerusalem', ['Jerusalem@Jos.10.1'], [[1000, 35.234167, 31.776667]]),
    ob('Seleucia', ['Seleucia@Act.13.4'], [[950, 35.92, 36.12]]),
  ]
  const acai: AcaiPlace[] = [{ id: 'place:Seleucia', primary: 'place:Seleucia', tipnr: ['Seleucia@Act.13.4'], tw: [], types: ['city', 'seaport'], labels: {} }]
  const report: string[] = []
  const { geo } = buildGeo({ topics, records, openbible, acaiByLug: new Map([['lug:seleucia', acai[0]]]), report })

  test('OpenBible: the unique name without its range suffix joins; the best identification with a point is the point (0.01 degrees)', () => {
    expect(geo['lug:jerusalem']).toEqual({ lat: 3178, lon: 3523, sure: 3, form: 1 })
  })
  test('a record that names two places (Bethel 1: Gen.12.8 and Jos.12.16) joins neither and is reported; Bethel 3 then gives the first Bethel its point', () => {
    expect(geo['lug:bethel-gen-12-8']).toMatchObject({ lat: 3192, lon: 3524, sure: 2 })
  })
  test('the other Bethel has only Bethel 2: a low certainty', () => {
    expect(geo['lug:bethel-jos-19-4']).toMatchObject({ sure: 1, lat: 3134 })
    expect(report.join(' ')).toContain('review: openbible: 1 records name more than one place')
  })
  test('a place with no OpenBible record uses TIPNR: certainty 1; whole degrees make it an area (form 2)', () => {
    expect(geo['lug:india']).toEqual({ lat: 2200, lon: 7700, sure: 1, form: 2 })
  })
  test('the point "0, 14" and no point at all give sure 0 and 0, 0; a place always has a form', () => {
    expect(geo['lug:nowhere']).toEqual({ lat: 0, lon: 0, sure: 0, form: 1 })
    expect(geo['lug:abel']).toEqual({ lat: 0, lon: 0, sure: 0, form: 1 })
  })
  test('a seaport among the ACAI types of a point place is form 5; only places have an entry', () => {
    expect(geo['lug:seleucia']).toMatchObject({ form: 5, sure: 3 })
    expect(geo['per:paul']).toBeUndefined()
  })
  test('the report counts the points', () => {
    expect(report.some((l) => l.startsWith('geo: 7 places'))).toBe(true)
  })
})

describe('haversineKm', () => {
  test('Jerusalem to Damascus is about 217 km', () => {
    expect(Math.round(haversineKm({ lat: 31.78, lon: 35.22 }, { lat: 33.51, lon: 36.29 }))).toBe(217)
  })
})

describe('joinAcaiPlaces', () => {
  const p = (id: string, tipnr: string[], primary = id): AcaiPlace => ({ id, primary, tipnr, tw: [], types: [], labels: {} })
  test('step 1 by the unique name after the last |, step 2 by the name before @ when it is the only one; more than one is not joined', () => {
    const report: string[] = []
    const refs = new Map([['Bethel@Gen.12.8-Zec', 'lug:bethel-gen-12-8'], ['Bethel@Jos.12.16-1Sa', 'lug:bethel-jos-19-4']])
    const byName = new Map([['Bethel', ['lug:bethel-gen-12-8', 'lug:bethel-jos-19-4']], ['Jerusalem', ['lug:jerusalem']]])
    const j = joinAcaiPlaces(
      [p('place:Bethel', ['Luz|Bethel@Gen.12.8-Zec']), p('place:Jerusalem', ['Zion|Jerusalem@Jos.10.1-Rev']), p('place:Salem', ['Salem|Jerusalem@Jos.10.1-Rev'], 'place:Jerusalem'), p('place:Bethel9', ['Bethel@Old.1.1']), p('place:Both', ['Bethel@Gen.12.8-Zec', 'Bethel@Jos.12.16-1Sa'])],
      refs,
      byName,
      report,
    )
    expect([...j.byLug].map(([lug, rec]) => [lug, rec.id])).toEqual([['lug:bethel-gen-12-8', 'place:Bethel'], ['lug:jerusalem', 'place:Jerusalem']])
    expect(j.aliases.map((a) => [a.place.id, a.lug])).toEqual([['place:Salem', 'lug:jerusalem']])
    expect(report.some((l) => l.startsWith('review: acai place:Both'))).toBe(true)
  })
})

describe('parseOpenBible', () => {
  test('the unique names of linked_data, the types and the identifications with their point', () => {
    const line = JSON.stringify({
      friendly_id: 'Bethel 1',
      linked_data: { a: { ids: ['Bethel 1', 'Bethel@Gen.12.8'] }, b: { id: 'Q3876767' }, c: { id: 'Luz@Gen.28.19' } },
      types: ['settlement'],
      identifications: [{ score: { time_total: 716 }, resolutions: [{ lonlat: '35.241389,31.922778' }] }, { score: { time_total: 5 }, resolutions: [{}] }],
    })
    const issues: string[] = []
    expect(parseOpenBible(`${line}\n\n{bad\n{"x":1}\n`, issues)).toEqual([
      { friendlyId: 'Bethel 1', unique: ['Bethel@Gen.12.8', 'Luz@Gen.28.19'], types: ['settlement'], identifications: [{ score: 716, lon: 35.241389, lat: 31.922778 }, { score: 5 }] },
    ])
    expect(issues.length).toBe(2)
  })
})

describe('parseTipnr: the point of a place record', () => {
  test('the Google Maps link gives the point; a link with none gives no point', () => {
    const header = '$========== PLACE\t\t\t\t\t\t\t\t\t'
    const row = (name: string, link: string): string => `${name}\tX\t\t\t${link}\tpal\t>\t#A location\tPlace`
    const text = [header, row('Abana@2Ki.5.12=H0071', 'https://www.google.com/maps/@33.545097,36.224661,14z'), row('Abel@1Sa.6.18=H0059G', 'https://www.google.com/maps/@,14z')].join('\n')
    const issues: string[] = []
    const out = parseTipnr(text, issues)
    expect(out.find((r) => r.unique.startsWith('Abana'))?.point).toEqual({ lat: 33.545097, lon: 36.224661 })
    expect(out.find((r) => r.unique.startsWith('Abel'))?.point).toBeUndefined()
  })
})

describe('buildXtopics with the maps', () => {
  const tipnr = [record('lug:tarsus', 'Tarsus@Act.9.11-Act'), record('lug:egypt', 'Egypt@Gen.12.10-Rev', { lat: 30, lon: 31 }), { ...record('per:paul', 'Paul@Act.13.9-Rev'), kind: 'person' as const, names: [{ name: 'Paul', dStrong: 'G3972', refs: [{ verse: 44009011 }] }] }]
  tipnr[0].names = [{ name: 'Tarsus', dStrong: 'G5019', refs: [{ verse: 44009011 }] }]
  tipnr[1].names = [{ name: 'Egypt', dStrong: 'H4714', refs: [{ verse: 1012010 }] }]
  const events = [{ eventID: 1, id: 'ev:journey', title: 'Journey', verses: [44013004], partOf: [], predecessor: [], participants: [], places: [] }]
  const base = {
    tipnr,
    events,
    obs: new Map(),
    outlines: new Map(),
    origs: [],
    res: { tipnr: ['t', '1'], theographic: ['theo', '1'], obs: ['obs', '1'], acai: ['acai', '1'], openbible: ['ob', '1'] } as never,
  }
  const maps = { openbible: [ob('Tarsus', ['Tarsus@Act.9.11'], [[1000, 34.89, 36.91]])], acaiPlaces: [], birthDeath: [{ kind: 'born' as const, person: { name: 'Paul', verses: [44009011] }, place: { name: 'Tarsus', verses: [44009011] } }], routes: [], exclude: [], placeNames: {} }
  test('geo, born-in with the source and confidence, and OpenBible in res', () => {
    const { core } = buildXtopics({ ...base, maps })
    expect(core.geo?.['lug:tarsus']).toMatchObject({ sure: 3, form: 1 })
    expect(core.relations?.find((r) => r.type === 'born-in')).toEqual({ from: 'per:paul', to: 'lug:tarsus', type: 'born-in', source: 'theo', confidence: 80 })
    expect(core.res.map(([k]) => k)).toContain('ob')
  })
  test('an exclusion removes a birth', () => {
    const { core, report } = buildXtopics({ ...base, maps: { ...maps, exclude: [{ kind: 'born', person: 'Paul', place: 'Tarsus' }] } })
    expect(core.relations?.some((r) => r.type === 'born-in')).toBeFalsy()
    expect(report.join('\n')).toContain('on the list of exclusions')
  })
  test('a name equivalence joins an event place TIPNR does not name', () => {
    const e = [{ ...events[0], places: [{ name: 'Mount X', verses: [44013004] }] }]
    const { core } = buildXtopics({ ...base, events: e, maps: { ...maps, placeNames: { 'Mount X': 'lug:tarsus' } } })
    expect(core.relations?.find((r) => r.type === 'place')).toMatchObject({ from: 'ev:journey', to: 'lug:tarsus' })
  })
  test('a route: kept in the order given; an event or a stop that is not there is an error; so is a repeat in a row', () => {
    const route = { event: 'ev:journey', stops: ['lug:tarsus', 'lug:egypt', 'lug:tarsus'] }
    expect(buildXtopics({ ...base, maps: { ...maps, routes: [route] } }).core.routes).toEqual([route])
    expect(() => buildXtopics({ ...base, maps: { ...maps, routes: [{ event: 'ev:nope', stops: ['lug:tarsus', 'lug:egypt'] }] } })).toThrow()
    expect(() => buildXtopics({ ...base, maps: { ...maps, routes: [{ event: 'ev:journey', stops: ['lug:tarsus', 'per:paul'] }] } })).toThrow()
    expect(() => buildXtopics({ ...base, maps: { ...maps, routes: [{ event: 'ev:journey', stops: ['lug:tarsus', 'lug:tarsus'] }] } })).toThrow()
  })
  test('without maps the core has none of the tables', () => {
    const { core } = buildXtopics(base)
    expect(core.geo).toBeUndefined()
    expect(core.routes).toBeUndefined()
  })
})
