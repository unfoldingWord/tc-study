import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRules, spellout } from './rbnf'
import { LANGS, numbersFile } from './numbers'

const RBNF = join(import.meta.dir, '../node_modules/cldr-rbnf/rbnf')
const rules = (lang: string) => parseRules(readFileSync(join(RBNF, `${lang}-SpelloutRules.txt`), 'utf8'))

test('Spanish spellout', () => {
  const es = rules('es')
  expect(spellout(es, 21)).toBe('veintiuno')
  expect(spellout(es, 101)).toBe('ciento uno')
  expect(spellout(es, 150)).toBe('ciento cincuenta')
  expect(spellout(es, 31)).toBe('treinta y uno')
})

test('Portuguese spellout, masculine and feminine', () => {
  const pt = rules('pt')
  expect(spellout(pt, 2)).toBe('dois')
  expect(spellout(pt, 2, 'spellout-cardinal-feminine')).toBe('duas')
  expect(spellout(pt, 101)).toBe('cento e um')
})

test('English spellout', () => {
  const en = rules('en')
  expect(spellout(en, 42)).toBe('forty-two')
  expect(spellout(en, 100)).toBe('one hundred')
  expect(spellout(en, 200)).toBe('two hundred')
})

test('the generated files hold the words and a rerun gives the same bytes', () => {
  for (const lang of LANGS) {
    const bytes = readFileSync(join(import.meta.dir, '../complements', `${lang}.numbers.json`), 'utf8').split(String.fromCharCode(13)).join('')
    expect(numbersFile(lang)).toBe(bytes)
  }
  const es = JSON.parse(readFileSync(join(import.meta.dir, '../complements/es.numbers.json'), 'utf8'))
  expect(es.version).toBe('cldr-49')
  expect(es.words.once).toBe(11)
  expect(es.words['treinta y uno']).toBe(31)
  const en = JSON.parse(readFileSync(join(import.meta.dir, '../complements/en.numbers.json'), 'utf8'))
  expect(en.words['forty two']).toBe(42)
})
