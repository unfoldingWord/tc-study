/**
 * Runs the chain (`decide`) over the tune sets with the staging readers and the committed complements, and prints, per language
 * and margin: calls correct, accepted, correct among accepted, and how many questions each step decided. Only the `-tune` sets:
 * the `-test` sets are held out. Node and Bun only. `LP3_STAGING=1 bun eval/tune.ts [--margins 0,0.1,...] [--misses <file>]`.
 * es and pt use the `es-419` reader (pt has no pack of its own yet); one reader is open at a time.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { type ClassifierComplement, loadComplement, type NumbersComplement } from '../src/complements'
import { type DecideCtx, decideStep, DEFAULT_MARGIN, type Step } from '../src/decide'
import { buildLexicon } from '../src/lexicon'
import { phrasesFor } from '../src/phrases'
import { strongsIndexOf } from '../src/strongs'
import { lastVerse } from './check-ids'
import { loadPacks } from './packs'
import { type Item, scoreQuestion } from './score'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SETS: { set: string; reader: string; tag: string }[] = [
  { set: 'es', reader: 'es-419', tag: 'es-419' },
  { set: 'pt', reader: 'es-419', tag: 'pt-BR' },
  { set: 'en', reader: 'en', tag: 'en' },
]

function complement<T>(name: string): T | undefined {
  const r = loadComplement(new Uint8Array(readFileSync(join(ROOT, 'complements', name))))
  return r.ok ? (r.value as T) : undefined
}

export type Tally = { n: number; correct: number; accepted: number; correctAccepted: number; steps: Record<Step, number> }

async function contextFor(reader: PackReader, tag: string, items: Item[]): Promise<Omit<DecideCtx, 'margin'>> {
  const base = tag.split('-')[0]!
  const lexicon = buildLexicon(await reader.maps(), tag, complement<NumbersComplement>(`${base}.numbers.json`))
  // The chain asks for last verses synchronously: read the ones the tune questions need first.
  const last = new Map<string, number | undefined>()
  for (const it of items) {
    for (const e of lexicon.entities(it.q).entities) {
      if (e.kind === 'ref' && e.verse === undefined && !last.has(`${e.book} ${e.chapter}`)) last.set(`${e.book} ${e.chapter}`, await lastVerse(reader, e.book, e.chapter))
    }
  }
  const classifier = complement<ClassifierComplement>(`${base}.classifier.json`)
  return {
    lexicon,
    phrases: phrasesFor(tag),
    ...(classifier ? { classifier } : {}),
    listed: (code) => reader.listed(`book:${code}`),
    lastVerse: (code, chapter) => last.get(`${code} ${chapter}`),
    strongsOf: await strongsIndexOf(reader),
  }
}

export function tally(items: Item[], ctx: DecideCtx, misses?: string[]): Tally {
  const t: Tally = { n: 0, correct: 0, accepted: 0, correctAccepted: 0, steps: { rule: 0, classifier: 0, choose: 0, search: 0 } }
  for (const it of items) {
    const { decision, step } = decideStep(it.q, ctx)
    const s = scoreQuestion(it, decision, [])
    t.n++
    t.steps[step]++
    if (s.callCorrect) t.correct++
    if (s.accepted) t.accepted++
    if (s.accepted && s.callCorrect) t.correctAccepted++
    if (!s.callCorrect && misses) {
      const got = decision.kind === 'call' ? decision.call : { choose: decision.options }
      misses.push(`${it.q}\t${step}\tgot ${JSON.stringify(got)}\twant ${JSON.stringify(it.expect)}`)
    }
  }
  return t
}

const line = (set: string, margin: number, t: Tally): string =>
  `${set} margin ${margin.toFixed(2)}: correct ${t.correct}/${t.n}, accepted ${t.accepted}, correct among accepted ${t.correctAccepted}/${t.accepted}` +
  ` (${t.accepted ? ((100 * t.correctAccepted) / t.accepted).toFixed(1) : '-'} %); steps ${JSON.stringify(t.steps)}`

if (process.argv[1]?.endsWith('tune.ts')) {
  const arg = (k: string): string | undefined => {
    const i = process.argv.indexOf(k)
    return i < 0 ? undefined : process.argv[i + 1]
  }
  const margins = (arg('--margins') ?? String(DEFAULT_MARGIN)).split(',').map(Number)
  const missFile = arg('--misses')
  const misses: string[] = []
  let reader: PackReader | undefined
  let readerLang = ''
  for (const { set, reader: lang, tag } of SETS) {
    const items = readFileSync(join(ROOT, 'eval/questions', `${set}-tune.jsonl`), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as Item)
    if (readerLang !== lang) {
      reader = undefined
      reader = await loadPacks(lang)
      readerLang = lang
    }
    const ctx = await contextFor(reader!, tag, items)
    for (const m of margins) {
      const sink: string[] = []
      console.log(line(set, m, tally(items, { ...ctx, margin: m }, sink)))
      if (m === margins[0]) misses.push(...sink.map((x) => `${set}\t${x}`))
    }
  }
  if (missFile) writeFileSync(missFile, misses.join('\n') + '\n')
}
