/**
 * Writes `complements/<lang>.classifier.json` from `templates/<lang>.json`: each template is folded, its `{slot}` becomes the slot word,
 * and a naive Bayes model is trained on it. Run `bun build/train.ts` from `packages/language-pack-assistant`; a rerun gives the same
 * bytes. Node and Bun only.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import { train } from '../src/classifier'
import type { QueryName } from '../src/decision'
import { fold } from '../src/fold'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
export const LANGS = ['es', 'pt', 'en']

export function examplesOf(lang: string): [string, QueryName][] {
  const tpl = JSON.parse(readFileSync(join(ROOT, 'templates', `${lang}.json`), 'utf8')) as Record<string, string[]>
  const out: [string, QueryName][] = []
  for (const label of Object.keys(tpl).sort()) {
    for (const t of tpl[label]!) out.push([fold(t).replace(/\{(\w+)\}/g, '$1'), label as QueryName])
  }
  return out
}

export function render(lang: string): string {
  const m = train(examplesOf(lang), { lang, version: 'templates-1' })
  const { kind, version, labels, vocab, counts, totals, docs } = m
  return JSON.stringify({ kind, lang, version, for: QUERIES_VERSION, labels, vocab, counts, totals, docs }) + '\n'
}

if ((import.meta as { main?: boolean }).main) {
  for (const lang of LANGS) writeFileSync(join(ROOT, 'complements', `${lang}.classifier.json`), render(lang))
}
