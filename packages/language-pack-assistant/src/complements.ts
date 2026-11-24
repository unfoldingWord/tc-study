/**
 * The complement files: data the assistant loads next to the packs, per base language. A file that does not parse, or that is for
 * other queries than these (`for` differs from `QUERIES_VERSION`), is not used: `loadComplement` answers with a problem and never throws.
 */
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import type { QueryName } from './decision'

export type AssistantProblem = { code: 'E_COMPLEMENT'; kind?: string; lang?: string; message: string }

/** Number words of a language (from CLDR): a folded phrase and its number. */
export type NumbersComplement = { kind: 'numbers'; lang: string; version: string; for: string; words: Record<string, number> }

/** A trained classifier of questions: counts of words per label (naive Bayes). Task 6 trains it. */
export type ClassifierComplement = {
  kind: 'classifier'
  lang: string
  version: string
  for: string
  labels: QueryName[]
  vocab: string[]
  counts: number[][]
  totals: number[]
  docs: number[]
}

export type Loaded = { ok: true; value: NumbersComplement | ClassifierComplement } | { ok: false; problem: AssistantProblem }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => typeof n === 'number' && Number.isFinite(n))

export function loadComplement(bytes: Uint8Array): Loaded {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, problem: { code: 'E_COMPLEMENT', message: 'the file is not UTF-8 JSON' } }
  }
  if (!isObject(json)) return { ok: false, problem: { code: 'E_COMPLEMENT', message: 'the file is not a JSON object' } }
  const kind = typeof json.kind === 'string' ? json.kind : undefined
  const lang = typeof json.lang === 'string' ? json.lang : undefined
  const bad = (message: string): Loaded => ({
    ok: false,
    problem: { code: 'E_COMPLEMENT', ...(kind !== undefined ? { kind } : {}), ...(lang !== undefined ? { lang } : {}), message },
  })
  if (kind !== 'numbers' && kind !== 'classifier') return bad('unknown kind')
  if (lang === undefined || typeof json.version !== 'string') return bad('the header needs lang and version')
  if (json.for !== QUERIES_VERSION) return bad(`the file is for ${String(json.for)}, not ${QUERIES_VERSION}`)
  if (kind === 'numbers') {
    const words = json.words
    if (!isObject(words) || !Object.values(words).every((n) => Number.isInteger(n))) return bad('words must map phrases to integers')
    return { ok: true, value: { kind, lang, version: json.version, for: json.for, words: words as Record<string, number> } }
  }
  const { labels, vocab, counts, totals, docs } = json
  if (!Array.isArray(labels) || !labels.every((l) => typeof l === 'string')) return bad('labels must be strings')
  if (!Array.isArray(vocab) || !vocab.every((w) => typeof w === 'string')) return bad('vocab must be strings')
  if (!isNumbers(totals) || !isNumbers(docs) || totals.length !== labels.length || docs.length !== labels.length) return bad('totals and docs need one number per label')
  if (!Array.isArray(counts) || counts.length !== labels.length || !counts.every((row) => isNumbers(row) && row.length === vocab.length)) {
    return bad('counts needs one row per label and one column per word')
  }
  return {
    ok: true,
    value: { kind, lang, version: json.version, for: json.for, labels: labels as QueryName[], vocab: vocab as string[], counts: counts as number[][], totals, docs },
  }
}
