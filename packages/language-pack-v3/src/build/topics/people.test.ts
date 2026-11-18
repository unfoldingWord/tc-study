import { describe, expect, test } from 'bun:test'
import type { Topic, XtopicsCore } from '../../model'
import type { AcaiPerson } from '../../source/acai'
import { buildPeople, derivedPersonName, personName, twOfPeople } from './people'

const TIPNR = 'STEPBible/TIPNR'
const person = (title: string, ref: string): Topic => ({ kind: 'person', source: TIPNR, ref, title, ustrong: '' })
const xtopics: Pick<XtopicsCore, 'topics' | 'relations'> = {
  topics: new Map([
    ['lug:ur', { kind: 'place', source: TIPNR, ref: 'Ur@Gen.11.28-Neh', title: 'Ur', ustrong: '' }],
    ['per:esau', person('Esau', 'Esau@Gen.25.25-Heb')],
    ['per:isaac', person('Isaac', 'Isaac@Gen.17.19-Jas')],
    ['per:israel', person('Israel', 'Israel@Gen.25.26-Rev')],
    ['per:jacob', person('Jacob', 'Jacob@Mat.1.15-')],
    ['per:sarah', person('Sarah', 'Sarah@Gen.11.29-1Pe')],
  ]),
  relations: [
    { from: 'tw:names/isaac', to: 'per:isaac', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'tw:names/jacob', to: 'per:israel', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'tw:names/israel', to: 'per:israel', type: 'same-as', source: TIPNR, confidence: 70 },
  ],
}
const acai = (id: string, ref: string | undefined, labels: Record<string, string>, primary = id): AcaiPerson => ({
  id,
  primary,
  tipnr: ref === undefined ? [] : [ref],
  tw: [],
  gender: 1,
  labels,
})
const ACAI: AcaiPerson[] = [
  acai('person:Esau', 'Esau@Gen.25.25-Heb', { spa: 'Esaú', eng: 'Esau' }),
  acai('person:Isaac', 'Isaac@Gen.17.19-Jas', { spa: 'Isaac' }),
  acai('person:Israel', 'Israel@Gen.25.26-Rev', { spa: 'Israel (patriarca)' }),
  acai('person:Jacob', undefined, { spa: 'Jacob (patriarca)', eng: 'Jacob (patriarch)' }, 'person:Israel'),
  acai('person:Jacob.2', 'Jacob@Mat.1.15-', { spa: 'Jacob (padre de José)', eng: 'Jacob (father of Joseph)' }),
  acai('person:Sarah', 'Sarah@Gen.11.29-1Pe', { spa: 'Sara' }),
  acai('person:Sarai', undefined, { spa: 'Saray' }, 'person:Sarah'),
]
// The es-419 map names the tW articles "Isaac", "Jacob" (joined to the patriarch, per:israel) and "Israel"
const MAP = { 'tw:names/isaac': ['Isaac'], 'tw:names/jacob': ['Jacob'], 'tw:names/israel': ['Israel'] }

describe('the name of a person', () => {
  const tw = twOfPeople(xtopics)
  test('the tW article of the language first (the first by code point), else the English title', () => {
    expect(tw.get('per:israel')).toEqual(['tw:names/israel', 'tw:names/jacob'])
    expect(derivedPersonName('per:israel', xtopics, tw, MAP)).toBe('Israel')
    expect(derivedPersonName('per:israel', xtopics, tw, { 'tw:names/jacob': ['Jacob'] })).toBe('Jacob')
    expect(derivedPersonName('per:esau', xtopics, tw, MAP)).toBe('Esau')
    expect(derivedPersonName('per:nobody', xtopics, tw, MAP)).toBe('')
  })
  test('people.names comes before both', () => {
    expect(personName('per:esau', xtopics, tw, MAP, { names: { 'per:esau': 'Esaú' } })).toBe('Esaú')
    expect(personName('per:esau', xtopics, tw, MAP)).toBe('Esau')
  })
})

describe('buildPeople', () => {
  test('es-419: stores only what the pack cannot derive', () => {
    const report: string[] = []
    const people = buildPeople({ lang: 'es-419', xtopics, mapNames: MAP, acai: ACAI, report })
    // Isaac, Israel and Jacob are what the rule gives already; Esaú and Sara are not
    expect(people!.names).toEqual({ 'per:esau': 'Esaú', 'per:sarah': 'Sara' })
    // "Jacob" for the patriarch is the tW article joined to per:israel: no alias; "Saray" is new
    expect(people!.aliases).toEqual({ Saray: ['per:sarah'] })
    // per:jacob is "Jacob", and the patriarch is found by "Jacob" (his tW article): per:jacob gets its note. per:israel's name,
    // "Israel", nobody else is found by: no note
    expect(people!.notes).toEqual({ 'per:jacob': 'padre de José' })
    expect(report.at(-1)).toBe('people: es-419: 2 names, 1 notes, 1 aliases stored (5 people joined)')
  })
  test('per:israel gets its note when another person is also called "Israel"', () => {
    const more = { ...xtopics, topics: new Map([...xtopics.topics, ['per:israel-2', person('Israel', 'Israel@Gen.1.1')]]) }
    const people = buildPeople({ lang: 'es-419', xtopics: more, mapNames: MAP, acai: ACAI, report: [] })
    expect(people!.notes).toEqual({ 'per:israel': 'patriarca', 'per:jacob': 'padre de José' })
  })
  test('English: the names equal to the English titles are not stored', () => {
    const people = buildPeople({ lang: 'en', xtopics, mapNames: MAP, acai: ACAI, report: [] })
    expect(people!.names).toEqual({})
    expect(people!.aliases).toEqual({})
    expect(people!.notes).toEqual({ 'per:jacob': 'father of Joseph' })
  })
  test('a language ACAI does not name has no table', () => {
    const report: string[] = []
    expect(buildPeople({ lang: 'pt-br', xtopics, mapNames: MAP, acai: ACAI, report })).toBeUndefined()
    expect(report).toEqual(['people: ACAI has no names in pt-br: no people table'])
  })
})
