/**
 * Writes `openbible-subset.jsonl` and `acai-places.json` for the places of `tipnr-subset.txt` (Bethlehem twice, Egypt, Jerusalem, Ur): made by hand in the
 * shape of OpenBible.info's `ancient.jsonl` and of ACAI's `places/json/` files (the points, scores and labels are written here, not copied). The ACAI file
 * goes through `trimAcaiPlaces`. Run from `packages/language-pack-v3`:
 *   bun spec/tests/data/topics/make-maps-fixtures.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { trimAcaiPlaces } from '../../../../src/source/acai'

const here = import.meta.dir

const ob = (friendly: string, unique: string[], ids: [number, string][], types: string[]) =>
  JSON.stringify({
    friendly_id: friendly,
    linked_data: { s1: { ids: unique }, s2: { id: 'Q1' } },
    types,
    identifications: ids.map(([score, lonlat]) => ({ score: { time_total: score }, resolutions: [{ lonlat }] })),
  })

writeFileSync(
  join(here, 'openbible-subset.jsonl'),
  [
    ob('Bethlehem 1', ['Bethlehem@Gen.35.16'], [[1000, '35.2103,31.7054']], ['settlement']),
    ob('Bethlehem 2', ['Bethlehem@Jos.19.15'], [[420, '35.1899,32.7354'], [210, '35.1,32.7']], ['settlement']),
    ob('Jerusalem', ['Jerusalem@Gen.14.18'], [[950, '35.2342,31.7767'], [40, '35.3,31.8']], ['settlement']),
    ob('Ur', ['Ur@Gen.11.28'], [[610, '46.1037,30.9620']], ['settlement']),
  ].join('\n') + '\n',
)

const place = (id: string, tipnr: string[], types: string[], labels: Record<string, string>, tw: string[] = [], primary = id): [string, string] => [
  `places/json/${id.slice(6)}.json`,
  JSON.stringify({
    id,
    primary_id: primary,
    alternate_sources: { tipnr, aquifer: tw.map((t) => `1|${t}|UWTranslationWords`) },
    place_types: { acai: types },
    localizations: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { preferred_label: v }])),
  }),
]
const files = new Map<string, string>([
  place('place:Bethlehem', ['Bethlehem@Gen.35.16-Jhn'], ['town'], { eng: 'Bethlehem (of Judah)', spa: 'Belén (de Judá)', arb: 'بيت لحم (يهوذا)' }, ['Bethlehem']),
  place('place:Bethlehem.2', ['Bethlehem@Jos.19.15'], ['town'], { eng: 'Bethlehem (of Zebulun)', spa: 'Belén (de Zabulón)', arb: 'بيت لحم (زبولون)' }),
  place('place:Jerusalem', ['Zion|Jerusalem@Gen.14.18-Rev'], ['city'], { eng: 'Jerusalem', spa: 'Jerusalén', arb: 'أورشليم' }, ['Jerusalem']),
  place('place:Zion', ['Zion|Jerusalem@Gen.14.18-Rev'], [], { eng: 'Zion', spa: 'Sión' }, [], 'place:Jerusalem'),
  place('place:Egypt', ['Egypt@Gen.12.10-Rev'], ['nation'], { eng: 'Egypt', spa: 'Egipto', arb: 'مصر' }, ['Egypt']),
  place('place:Ur', ['Ur@Gen.11.28-Neh'], ['town', 'seaport'], { eng: 'Ur', spa: 'Ur' }),
])
writeFileSync(join(here, 'acai-places.json'), trimAcaiPlaces(files, '0123456789abcdef0123456789abcdef01234567', []))
console.log('written openbible-subset.jsonl and acai-places.json')
