import { describe, expect, test } from 'bun:test'
import { parseAcai, parseAcaiPlaces, trimAcai, trimAcaiPlaces } from './acai'

/** A file of ACAI's `places/json/` as the repository has it, with the fields that are not read as well. */
const place = (o: { id: string; primary?: string; tipnr?: string[]; aquifer?: string[]; types?: string[]; labels?: Record<string, string> }): string =>
  JSON.stringify({
    id: o.id,
    primary_id: o.primary ?? o.id,
    alternate_sources: { tipnr: o.tipnr ?? [], aquifer: o.aquifer ?? [], vizbible: ['not read'] },
    place_types: { obi: ['not read'], acai: o.types ?? [] },
    geocoordinates: { obi: { lat: '1', lon: '2' } },
    references: ['not read'],
    localizations: Object.fromEntries(Object.entries(o.labels ?? {}).map(([k, v]) => [k, { preferred_label: v, descriptions: [{ description: 'not read' }] }])),
  })

describe('trimAcaiPlaces and parseAcaiPlaces', () => {
  const files = new Map([
    [
      'places/json/Bethel.json',
      place({
        id: 'place:Bethel',
        tipnr: ['Luz|Bethel@Gen.12.8-Zec', 'Bethel@Gen.12.8-Zec'],
        aquifer: ['4169|Bethel (God)|TyndaleBibleDictionary', '26387|Bethel|UWTranslationWords'],
        types: ['town', 'seaport '],
        labels: { eng: 'Bethel (of Ephraim)', hin: 'बेतेल', zhs: '伯特利' },
      }),
    ],
    ['places/json/Luz.json', `[${place({ id: 'place:Luz', primary: 'place:Bethel', labels: { spa: 'Luz' } })}]`],
    ['places/json/Bad.json', '{not json'],
    ['places/json/Isaac.json', JSON.stringify({ id: 'person:Isaac' })],
  ])
  const issues: string[] = []
  const text = trimAcaiPlaces(files, 'abc123', issues)
  const { commit, places } = parseAcaiPlaces(text)

  test('keeps only the fields the builder reads, for the six languages, sorted by id', () => {
    expect(commit).toBe('abc123')
    expect(places).toEqual([
      { id: 'place:Bethel', primary: 'place:Bethel', tipnr: ['Bethel@Gen.12.8-Zec', 'Luz|Bethel@Gen.12.8-Zec'], tw: ['Bethel'], types: ['town', 'seaport'], labels: { eng: 'Bethel (of Ephraim)', hin: 'बेतेल' } },
      { id: 'place:Luz', primary: 'place:Bethel', tipnr: [], tw: [], types: [], labels: { spa: 'Luz' } },
    ])
    expect(text).not.toContain('not read')
    expect(text).not.toContain('伯特利')
    expect(Object.keys(JSON.parse(text).places[0]).sort()).toEqual(['id', 'labels', 'primary', 'tipnr', 'tw', 'types'])
  })
  test('a file that is not JSON or not a place goes to the issues', () => {
    expect(issues).toEqual(['acai: places/json/Bad.json is not JSON: left out', 'acai: places/json/Isaac.json is not a place record: left out'])
  })
  test('the same files give the same text, and trimAcai keeps leaving places out', () => {
    expect(trimAcaiPlaces(new Map([...files].reverse()), 'abc123', [])).toBe(text)
    expect(parseAcai(trimAcai(files, 'abc123', [])).people.map((p) => p.id)).toEqual(['person:Isaac'])
  })
  test('parseAcaiPlaces refuses a text that is not a trimmed places file', () => {
    expect(() => parseAcaiPlaces('{"places": []}')).toThrow('not a trimmed ACAI places file')
  })
})
