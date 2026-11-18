/**
 * Writes `acai-people.json`: a trimmed ACAI file (`trimAcai`) for the people of `tipnr-subset.txt`, made by hand in the shape of ACAI's
 * `people/json/` files (not copied from ACAI: the labels are written here). Run from `packages/language-pack-v3`:
 *   bun spec/tests/data/topics/make-acai-people.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { trimAcai } from '../../../../src/source/acai'

type P = { id: string; primary?: string; tipnr?: string; tw?: string; gender?: 'male' | 'female'; eng: string; spa: string; arb?: string }
const people: P[] = [
  { id: 'person:Abraham', tipnr: 'Abraham@Gen.11.26-1Pe', tw: 'Abraham', gender: 'male', eng: 'Abraham', spa: 'Abraham', arb: 'إبراهيم' },
  { id: 'person:Abram', primary: 'person:Abraham', gender: 'male', eng: 'Abram', spa: 'Abram' },
  { id: 'person:Sarah', tipnr: 'Sarah@Gen.11.29-1Pe', tw: 'Sarah', gender: 'female', eng: 'Sarah', spa: 'Sara', arb: 'سارة' },
  { id: 'person:Sarai', primary: 'person:Sarah', gender: 'female', eng: 'Sarai', spa: 'Saray' },
  { id: 'person:Isaac', tipnr: 'Isaac@Gen.17.19-Jas', tw: 'Isaac', gender: 'male', eng: 'Isaac', spa: 'Isaac', arb: 'إسحاق' },
  { id: 'person:Rebekah', tipnr: 'Rebekah@Gen.22.23-Rom', tw: 'Rebekah', gender: 'female', eng: 'Rebekah', spa: 'Rebeca', arb: 'رفقة' },
  { id: 'person:Ishmael', tipnr: 'Ishmael@Gen.16.11-Psa', tw: 'Ishmael', gender: 'male', eng: 'Ishmael', spa: 'Ismael', arb: 'إسماعيل' },
  { id: 'person:Esau', tipnr: 'Esau@Gen.25.25-Heb', tw: 'Esau', gender: 'male', eng: 'Esau', spa: 'Esaú', arb: 'عيسو' },
  { id: 'person:Israel', tipnr: 'Israel@Gen.25.26-Rev', tw: 'Jacob', gender: 'male', eng: 'Israel (patriarch)', spa: 'Israel (patriarca)', arb: 'إسرائيل (رئيس الآباء)' },
  { id: 'person:Jacob', primary: 'person:Israel', gender: 'male', eng: 'Jacob (patriarch)', spa: 'Jacob (patriarca)', arb: 'يعقوب (رئيس الآباء)' },
  { id: 'person:Keturah', tipnr: 'Keturah@Gen.25.1-1Ch', gender: 'female', eng: 'Keturah', spa: 'Cetura', arb: 'قطورة' },
  { id: 'person:Zimran', tipnr: 'Zimran@Gen.25.2-1Ch', gender: 'male', eng: 'Zimran', spa: 'Zimrán', arb: 'زمران' },
  { id: 'person:Terah', tipnr: 'Terah@Gen.11.24-Luk', gender: 'male', eng: 'Terah', spa: 'Taré', arb: 'تارح' },
  { id: 'person:Zechariah', tipnr: 'Zechariah@Luk.1.5-', gender: 'male', eng: 'Zechariah (father of John)', spa: 'Zacarías (padre de Juan)', arb: 'زكريا (أبو يوحنا)' },
]
const files = new Map(
  people.map((p) => [
    `people/json/${p.id.slice('person:'.length)}.json`,
    JSON.stringify({
      id: p.id,
      primary_id: p.primary ?? p.id,
      gender: p.gender,
      alternate_sources: { tipnr: p.tipnr === undefined ? [] : [p.tipnr], aquifer: p.tw === undefined ? [] : [`1|${p.tw}|UWTranslationWords`] },
      localizations: Object.fromEntries(
        Object.entries({ eng: p.eng, spa: p.spa, arb: p.arb }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { preferred_label: v }]),
      ),
    }),
  ]),
)
const issues: string[] = []
writeFileSync(join(import.meta.dir, 'acai-people.json'), trimAcai(files, '0123456789abcdef0123456789abcdef01234567', issues))
if (issues.length > 0) throw new Error(issues.join('\n'))
