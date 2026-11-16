/**
 * The runner: the assistant (`createAssistant` with the committed complements) over a question set, with the staging packs and the
 * SQL index (R30). Writes `eval/results/<lang>-<set>.json` (every question, its decision, interpretation, top 3 piece ids and score)
 * and prints a summary row. Node and Bun only.
 *   `LP3_STAGING=1 bun eval/run.ts --lang <es|pt|en> --set <tune|test|test2> [--out <name>]`
 * `--out run2` writes `eval/results/<lang>-<set>-run2.json` (the second gate run keeps the first run's files).
 * `--set test2` is refused unless `LP3_GATE=1`: the second held-out sets are run once (R35); `test` is tune data since C2.1. Card time is warm (R34): the
 * assistant is created and one question is asked before the timing starts.
 * An existing `test2` result file is never overwritten unless `--out` names a new file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAssistant } from '../src/assistant'
import { loadPacks } from './packs'
import { type Item, scoreQuestion } from './score'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** es and pt use the `es-419` reader (pt has no pack of its own yet). */
export const LANGS: Record<string, { reader: string; tag: string }> = {
  es: { reader: 'es-419', tag: 'es-419' },
  pt: { reader: 'es-419', tag: 'pt-BR' },
  en: { reader: 'en', tag: 'en' },
}

export type Row = {
  lang: string
  set: string
  n: number
  callsCorrect: number
  /** Accepted by a rule or the classifier (R28: the search fallback is the chain not deciding). */
  accepted: number
  correctAccepted: number
  /** The other reading: the search fallback counted as accepted. */
  acceptedWithSearch: number
  correctAcceptedWithSearch: number
  top3: { hit: number; of: number }
  cardMs: { median: number; p95: number; over300: number }
  steps: { rule: number; classifier: number; choose: number; search: number }
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!
}
const r1 = (x: number): number => Math.round(x * 10) / 10

export function summarize(lang: string, set: string, rows: { decision: { kind: string; via?: string }; score: { callCorrect: boolean; accepted: boolean; top3: boolean | null }; ms: number }[]): Row {
  const row: Row = {
    lang, set, n: rows.length, callsCorrect: 0, accepted: 0, correctAccepted: 0, acceptedWithSearch: 0, correctAcceptedWithSearch: 0,
    top3: { hit: 0, of: 0 }, cardMs: { median: 0, p95: 0, over300: 0 }, steps: { rule: 0, classifier: 0, choose: 0, search: 0 },
  }
  for (const r of rows) {
    const d = r.decision
    const withSearch = d.kind === 'call'
    if (r.score.callCorrect) row.callsCorrect++
    if (r.score.accepted) row.accepted++
    if (r.score.accepted && r.score.callCorrect) row.correctAccepted++
    if (withSearch) row.acceptedWithSearch++
    if (withSearch && r.score.callCorrect) row.correctAcceptedWithSearch++
    if (r.score.top3 !== null) {
      row.top3.of++
      if (r.score.top3) row.top3.hit++
    }
    row.steps[d.kind === 'choose' ? 'choose' : (d.via as 'rule' | 'classifier' | 'search')]++
  }
  const ms = rows.map((r) => r.ms)
  row.cardMs = { median: r1(pct(ms, 0.5)), p95: r1(pct(ms, 0.95)), over300: ms.filter((m) => m > 300).length }
  return row
}

/** Where a run writes. A `test2` result is never overwritten: the held-out set is run once (R35), so an existing file stops the run unless `--out` names a new one. */
export function resultPath(root: string, lang: string, set: string, out: string | undefined): string {
  if (out !== undefined && !/^[a-z0-9]+$/.test(out)) throw new Error('--out must be letters and digits')
  const path = join(root, 'eval/results', `${lang}-${set}${out !== undefined ? `-${out}` : ''}.json`)
  if (set === 'test2' && existsSync(path)) throw new Error(`${path} exists: a test2 result is not overwritten; name a new file with --out`)
  return path
}

if (process.argv[1]?.endsWith('run.ts')) {
  const arg = (k: string): string | undefined => {
    const i = process.argv.indexOf(k)
    return i < 0 ? undefined : process.argv[i + 1]
  }
  const lang = arg('--lang') ?? ''
  const set = arg('--set') ?? ''
  const spec = LANGS[lang]
  if (!spec) throw new Error('--lang must be es, pt or en')
  if (set !== 'tune' && set !== 'test' && set !== 'test2') throw new Error('--set must be tune, test or test2')
  // C2.1: `test` is tune data now; `test2` is the held-out set, run once.
  if (set === 'test2' && process.env.LP3_GATE !== '1') throw new Error('the test2 sets are held out: --set test2 needs LP3_GATE=1')
  const target = resultPath(ROOT, lang, set, arg('--out')) // before the questions are read: a refused run opens nothing
  const items = readFileSync(join(ROOT, 'eval/questions', `${lang}-${set}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Item)
  const complements = ['numbers', 'classifier'].map((k) => new Uint8Array(readFileSync(join(ROOT, 'complements', `${lang}.${k}.json`))))
  const reader = await loadPacks(spec.reader)
  const assistant = await createAssistant({ reader, tag: spec.tag, complements })
  if (assistant.problems.length > 0) console.warn('problems:', JSON.stringify(assistant.problems))
  await assistant.ask(items[0]!.q) // warm-up (R34)
  const out = []
  for (const it of items) {
    const card = await assistant.ask(it.q)
    const ids = card.pieces.map((p) => p.id)
    const score = scoreQuestion(it, card.decision, ids)
    out.push({
      q: it.q,
      decision: card.decision,
      interpretation: card.interpretation,
      top3: ids.slice(0, 3),
      score,
      ms: Math.round(card.elapsed * 10) / 10,
    })
  }
  const summary = summarize(lang, set, out)
  mkdirSync(join(ROOT, 'eval/results'), { recursive: true })
  writeFileSync(target, JSON.stringify({ summary, questions: out }, null, 1) + '\n')
  console.log(JSON.stringify(summary))
}
