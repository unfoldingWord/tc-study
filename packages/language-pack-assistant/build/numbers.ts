/**
 * Writes `complements/<lang>.numbers.json` from CLDR's RBNF rules (`cldr-rbnf@49.0.0`): the words of 1 to 200 as a folded phrase and
 * its number. Run `bun build/numbers.ts` from `packages/language-pack-assistant`; a rerun gives the same bytes. Node and Bun only.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import { fold } from '../src/fold'
import { parseRules, spellout } from './rbnf'

const HERE = dirname(fileURLToPath(import.meta.url))
const RBNF = join(HERE, '../node_modules/cldr-rbnf/rbnf')
export const SETS = ['spellout-numbering', 'spellout-cardinal-masculine', 'spellout-cardinal-feminine']
export const LANGS = ['es', 'pt', 'en']

export function wordsOf(lang: string): Record<string, number> {
  const rules = parseRules(readFileSync(join(RBNF, `${lang}-SpelloutRules.txt`), 'utf8'))
  const words = new Map<string, number>()
  for (const set of SETS) {
    if (rules[set] === undefined) continue
    for (let n = 1; n <= 200; n++) {
      const key = fold(spellout(rules, n, set).replace(/-/g, ' '))
      const old = words.get(key)
      if (old !== undefined && old !== n) throw new Error(`${lang}: "${key}" is ${old} and ${n}`)
      words.set(key, n)
    }
  }
  return Object.fromEntries([...words].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
}

export function numbersFile(lang: string): string {
  return JSON.stringify({ kind: 'numbers', lang, version: 'cldr-49', for: QUERIES_VERSION, words: wordsOf(lang) }, null, 1) + '\n'
}

if ((import.meta as { main?: boolean }).main) for (const lang of LANGS) writeFileSync(join(HERE, '../complements', `${lang}.numbers.json`), numbersFile(lang))
