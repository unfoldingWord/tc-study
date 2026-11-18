import { describe, expect, test } from 'bun:test'
import type { Topic, XtopicsCore } from '../../model'
import type { AcaiPerson } from '../../source/acai'
import type { TipnrRecord } from '../../source/tipnr'
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

describe('buildPeople: an alias that names its person rarely and another person often', () => {
  // TIPNR lists «David» in Judah's record as a textual variant of one verse (2 Chronicles 25:28); ACAI makes it an alias
  // record of Judah. Saul and Paul, Simon and Peter, Levi and Matthew are the other shapes of the same question.
  const v = (n: number): number[] => Array.from({ length: n }, (_, i) => 1_000_000 + (i + 1) * 1000 + 1)
  const occ = (n: number) => new Map([['gen', [n, n] as [number, number]]])
  const core: Pick<XtopicsCore, 'topics' | 'relations' | 'occurrences'> = {
    topics: new Map([
      ['per:david', person('David', 'David@Rut.4.17-Rev')],
      ['per:judah', person('Judah', 'Judah@Gen.29.35-Rev')],
      ['per:levi', person('Levi', 'Levi@Gen.29.34-Rev')],
      ['per:matthew', person('Matthew', 'Matthew@Mat.9.9-Act')],
      ['per:peter', person('Peter', 'Peter@Mat.4.18-2Pe')],
      ['per:simon', person('Simon', 'Simon@Mat.27.32-')],
      ['per:jehoram', person('Jehoram', 'Jehoram@1Ki.22.50-Mat')],
      ['per:jehoram-2', person('Jehoram', 'Jehoram@2Ch.17.8')],
      ['per:joram', person('Joram', 'Joram@2Ki.1.17-2Ch')],
    ]),
    relations: [],
    strongs: { 'per:jehoram': ['H3088', 'H3141'], 'per:jehoram-2': ['H9999'] },
    occurrences: new Map([
      ['per:david', occ(964)],
      ['per:judah', occ(1022)],
      ['per:levi', occ(329)],
      ['per:matthew', occ(8)],
      ['per:peter', occ(179)],
      ['per:simon', occ(3)],
      ['per:jehoram', occ(21)],
      ['per:jehoram-2', occ(1)],
      ['per:joram', occ(19)],
    ]),
  }
  const rec = (id: string, unique: string, names: [string, number][]): TipnrRecord =>
    ({ id, unique, kind: 'person', uStrong: '', names: names.map(([name, n]) => ({ name, dStrong: '', refs: v(n).map((verse) => ({ verse })) })), relations: [] }) as unknown as TipnrRecord
  const records = [
    rec('per:judah', 'Judah@Gen.29.35-Rev', [['Judah', 1021], ['David', 1]]),
    rec('per:matthew', 'Matthew@Mat.9.9-Act', [['Matthew', 5], ['Levi', 3]]),
    rec('per:peter', 'Peter@Mat.4.18-2Pe', [['Peter', 134], ['Simon', 45]]),
    // TIPNR files «Jehoram» for Joram under a line named Joram, written with H3088 (Jehoram's Strong number)
    { ...rec('per:joram', 'Joram@2Ki.1.17-2Ch', [['Joram', 13]]), names: [{ name: 'Joram', dStrong: 'H3088I', refs: v(13).map((verse) => ({ verse })) }] } as TipnrRecord,
  ]
  const own = (id: string, ref: string, eng: string, spa: string) => acai(id, ref, { eng, spa })
  const alias = (id: string, primary: string, eng: string, spa: string) => acai(id, undefined, { eng, spa }, primary)
  const people = [
    own('person:David', 'David@Rut.4.17-Rev', 'David', 'David'),
    own('person:Judah', 'Judah@Gen.29.35-Rev', 'Judah', 'Judá'),
    alias('person:David.2', 'person:Judah', 'David (Judah)', 'David (Judá)'),
    own('person:Levi', 'Levi@Gen.29.34-Rev', 'Levi', 'Leví'),
    own('person:Matthew', 'Matthew@Mat.9.9-Act', 'Matthew', 'Mateo'),
    alias('person:Levi.2', 'person:Matthew', 'Levi (Matthew)', 'Leví (Mateo)'),
    own('person:Peter', 'Peter@Mat.4.18-2Pe', 'Peter', 'Pedro'),
    own('person:Simon', 'Simon@Mat.27.32-', 'Simon', 'Simón'),
    alias('person:Simon.2', 'person:Peter', 'Simon (Peter)', 'Simón (Pedro)'),
    own('person:Joram', 'Joram@2Ki.1.17-2Ch', 'Joram', 'Joram'),
    own('person:Jehoram', 'Jehoram@1Ki.22.50-Mat', 'Jehoram', 'Jehoram'),
    own('person:Jehoram.2', 'Jehoram@2Ch.17.8', 'Jehoram', 'Jehoram'),
    alias('person:Jehoram.3', 'person:Joram', 'Jehoram (Joram)', 'Jehoram (Joram)'),
  ]
  for (const lang of ['en', 'es-419']) {
    test(`${lang}: «David» is not an alias of Judah; Simon of Peter and Levi of Matthew stay`, () => {
      const report: string[] = []
      const t = buildPeople({ lang, xtopics: core, mapNames: {}, acai: people, records, report })!
      const david = 'David'
      expect(t.aliases[david]).toBeUndefined()
      expect(t.aliases[lang === 'en' ? 'Simon' : 'Simón']).toEqual(['per:peter'])
      expect(t.aliases[lang === 'en' ? 'Levi' : 'Leví']).toEqual(['per:matthew'])
      // compared with the person the name mostly means (Jehoram, 21 verses), not with a lesser Jehoram of 1 verse; by Strong number
      expect(t.aliases.Jehoram).toEqual(['per:joram'])
      expect(report.some((l) => l.includes('«David» → per:judah'))).toBe(true)
    })
  }
})
