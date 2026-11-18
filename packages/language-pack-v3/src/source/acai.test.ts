import { describe, expect, test } from 'bun:test'
import { type AcaiPerson, joinAcai, parseAcai, splitLabel, trimAcai } from './acai'

/** A file of ACAI's `people/json/` as the repository has it, with only the fields that matter here. */
const file = (o: { id: string; primary?: string; tipnr?: string[]; aquifer?: string[]; gender?: string; labels?: Record<string, string> }): string =>
  JSON.stringify({
    id: o.id,
    primary_id: o.primary ?? o.id,
    gender: o.gender,
    alternate_sources: { tipnr: o.tipnr ?? [], aquifer: o.aquifer ?? [] },
    localizations: Object.fromEntries(Object.entries(o.labels ?? {}).map(([k, v]) => [k, { preferred_label: v, descriptions: [{ description: 'not read' }] }])),
    explicit_instances: ['not read'],
  })

describe('trimAcai and parseAcai', () => {
  const files = new Map([
    ['people/json/Isaac.json', file({ id: 'person:Isaac', tipnr: ['Isaac@Gen.17.19-Jas'], aquifer: ['6058|Isaac|TyndaleBibleDictionary', '26734|Isaac|UWTranslationWords'], gender: 'male', labels: { eng: 'Isaac', spa: 'Isaac', zhs: '以撒' } })],
    ['people/json/Jacob.json', `[${file({ id: 'person:Jacob', primary: 'person:Israel', gender: 'male', labels: { spa: 'Jacob (patriarca)' } })}]`],
    ['people/json/Bad.json', '{not json'],
    ['people/json/Place.json', JSON.stringify({ id: 'place:Ur' })],
  ])
  const issues: string[] = []
  const text = trimAcai(files, 'abc123', issues)
  const { commit, people } = parseAcai(text)

  test('keeps only the fields the builder reads, for the six languages, sorted by id', () => {
    expect(commit).toBe('abc123')
    expect(people).toEqual([
      { id: 'person:Isaac', primary: 'person:Isaac', tipnr: ['Isaac@Gen.17.19-Jas'], tw: ['Isaac'], gender: 1, labels: { eng: 'Isaac', spa: 'Isaac' } },
      { id: 'person:Jacob', primary: 'person:Israel', tipnr: [], tw: [], gender: 1, labels: { spa: 'Jacob (patriarca)' } },
    ])
    expect(text).not.toContain('not read')
    expect(text).not.toContain('以撒')
  })
  test('a file that is not JSON or not a person goes to the issues', () => {
    expect(issues).toEqual(['acai: people/json/Bad.json is not JSON: left out', 'acai: people/json/Place.json is not a person record: left out'])
  })
  test('the same files give the same text', () => {
    expect(trimAcai(new Map([...files].reverse()), 'abc123', [])).toBe(text)
  })
  test('parseAcai refuses a text that is not a trimmed file', () => {
    expect(() => parseAcai('{"people": []}')).toThrow('not a trimmed ACAI file')
  })
})

test('splitLabel', () => {
  expect(splitLabel('Jacob (padre de José)')).toEqual(['Jacob', 'padre de José'])
  expect(splitLabel('Isaac')).toEqual(['Isaac', ''])
  expect(splitLabel('A (b) c')).toEqual(['A (b) c', ''])
  expect(splitLabel('عبدا (عوبديا)')).toEqual(['عبدا', 'عوبديا'])
})

describe('joinAcai', () => {
  const p = (id: string, tipnr: string[], primary = id): AcaiPerson => ({ id, primary, tipnr, tw: [], gender: 0, labels: {} })
  const refs = new Map([
    ['Isaac@Gen.17.19-Jas', 'per:isaac'],
    ['Israel@Gen.25.26-Rev', 'per:israel'],
    ['Judas@Mat.10.4-Act', 'per:judas'],
    ['Iscariot|Judas@Mat.10.4-Act', 'per:judas'],
    ['Judah@Gen.29.35-Rev', 'per:judah'],
  ])
  test('one topic joins; none is counted; several go to the review list; an alias follows its primary', () => {
    const report: string[] = []
    const { byPer, aliases } = joinAcai(
      [
        p('person:Isaac', ['Isaac@Gen.17.19-Jas', 'Nobody@Gen.1.1']),
        p('person:Israel', ['Israel@Gen.25.26-Rev']),
        p('person:Jacob', ['Jacob@Gen.1.1'], 'person:Israel'),
        p('person:Judas.2', ['Iscariot|Judas@Mat.10.4-Act', 'Judas@Mat.10.4-Act']),
        p('person:Mixed', ['Judas@Mat.10.4-Act', 'Judah@Gen.29.35-Rev']),
        p('person:Nobody', ['Nobody@Gen.1.1']),
        p('person:Chained', [], 'person:Jacob'),
      ],
      refs,
      report,
    )
    expect([...byPer.keys()].sort()).toEqual(['per:isaac', 'per:israel', 'per:judas'])
    expect(aliases.map((a) => [a.person.id, a.per])).toEqual([['person:Jacob', 'per:israel']])
    expect(report).toContain('review: acai person:Mixed: its TIPNR names give 2 people (per:judah, per:judas): not joined')
    expect(report).toContain('acai: 3 person records joined to TIPNR, 1 with no TIPNR person, 1 alias records joined, 1 alias records left out (their primary is not joined, not used, or an alias record)')
  })
})
