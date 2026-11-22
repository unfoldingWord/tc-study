import { describe, expect, test } from 'bun:test'
import type { Relation, Topic } from '../../model'
import type { AcaiPlace } from '../../source/acai'
import type { TipnrRecord } from '../../source/tipnr'
import { buildPeople, personName, twOfPlaces } from './people'

const topic = (kind: Topic['kind'], ref: string): Topic => ({ kind, source: 'tipnr', ref, title: ref.split('@')[0], ustrong: '' })
const topics = new Map<string, Topic>([
  ['lug:bethel-gen-12-8', topic('place', 'Bethel@Gen.12.8-Zec')],
  ['lug:bethel-jos-19-4', topic('place', 'Bethel@Jos.12.16-1Sa')],
  ['lug:jerusalem', topic('place', 'Jerusalem@Jos.10.1-Rev')],
  ['lug:judah-place', topic('place', 'Judah@Gen.35.23-Mat')],
  ['per:judah', topic('person', 'Judah@Gen.29.35')],
  ['per:david', topic('person', 'David@Rut.4.17')],
])
const place = (id: string, tipnr: string[], labels: Record<string, string>, primary = id): AcaiPlace => ({ id, primary, tipnr, tw: [], types: [], labels })
const acai: AcaiPlace[] = [
  place('place:Bethel', ['Luz|Bethel@Gen.12.8-Zec'], { spa: 'Betel (de Efraín)', eng: 'Bethel (of Ephraim)' }),
  place('place:Bethel.2', ['Bethel@Jos.12.16-1Sa'], { spa: 'Betel (de Simeón)' }),
  place('place:Jerusalem', ['Jerusalem@Jos.10.1-Rev'], { spa: 'Jerusalén' }),
  place('place:Zion', ['Zion|Jerusalem@Jos.10.1-Rev'], { spa: 'Sión' }, 'place:Jerusalem'),
  place('place:Judah', ['Judah@Gen.35.23-Mat'], { spa: 'Judá' }),
  // an alias that names another person in most verses ("David"), as a place's alias may
  place('place:David', ['Judah@Gen.35.23-Mat'], { spa: 'David' }, 'place:Judah'),
]
const relations: Relation[] = [{ from: 'tw:names/jerusalem', to: 'lug:jerusalem', type: 'same-as', source: 'tipnr', confidence: 70 }, { from: 'tw:names/jerusalem', to: 'per:david', type: 'same-as', source: 'tipnr', confidence: 70 }]

describe('the places table (same rules as people, with lug: ids)', () => {
  const report: string[] = []
  const t = buildPeople({ lang: 'es-419', kind: 'place', xtopics: { topics, relations }, mapNames: { 'tw:names/jerusalem': ['Jerusalén'] }, acai, report })
  test('a name is stored only when the rule without the table would not give it; a note only for a repeated name; aliases by the joined alias records', () => {
    expect(t).toBeDefined()
    expect(t!.names).toEqual({ 'lug:bethel-gen-12-8': 'Betel', 'lug:bethel-jos-19-4': 'Betel', 'lug:judah-place': 'Judá' })
    expect(t!.notes).toEqual({ 'lug:bethel-gen-12-8': 'de Efraín', 'lug:bethel-jos-19-4': 'de Simeón' })
    expect(t!.aliases['Sión']).toEqual(['lug:jerusalem'])
  })
  test('a tW article joined to a person and to a place: the place name comes from the article of the place', () => {
    expect(twOfPlaces({ relations }).get('lug:jerusalem')).toEqual(['tw:names/jerusalem'])
    expect(personName('lug:jerusalem', { topics }, twOfPlaces({ relations }), { 'tw:names/jerusalem': ['Jerusalén'] }, t)).toBe('Jerusalén')
  })
  test('the alias of a place that names another topic mostly is left out when the records show it (the rule of people)', () => {
    const records: TipnrRecord[] = [{ kind: 'place', unique: 'Judah@Gen.35.23-Mat', uStrong: 'H3063', id: 'lug:judah-place', names: [{ name: 'Judah', dStrong: 'H3063', refs: [{ verse: 1035023 }] }], relations: [] }]
    const counts = { occurrences: new Map([['lug:judah-place', new Map([['gen', [1, 1] as [number, number]]])]]) }
    const out = buildPeople({ lang: 'es-419', kind: 'place', xtopics: { topics, relations, ...counts }, mapNames: {}, acai, records, report: [] })
    expect(out?.aliases.David).toEqual(['lug:judah-place']) // no other topic named David is a place, so nothing dominates
  })
  test('a language ACAI has no names in: no table; a table with nothing to store is not written', () => {
    expect(buildPeople({ lang: 'sw', kind: 'place', xtopics: { topics, relations }, mapNames: {}, acai, report: [] })).toBeUndefined()
    expect(buildPeople({ lang: 'es-419', kind: 'place', xtopics: { topics, relations }, mapNames: {}, acai: [], report: [] })).toBeUndefined()
  })
})
