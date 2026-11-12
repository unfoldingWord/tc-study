/**
 * The question classifier: multinomial naive Bayes on word unigrams, word bigrams and character trigrams of a question whose names are
 * masked by slot words (`ref book strong tw name ta topic cat`). `train` is deterministic; the model is the `ClassifierComplement`.
 */
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import type { ClassifierComplement } from './complements'
import type { QueryName } from './decision'
import type { Entity } from './lexicon'

const slotOf = (e: Entity): string => (e.kind === 'concept' ? e.cls : e.kind === 'category' ? 'cat' : e.kind)

/** The question's tokens with each entity replaced by its slot word. */
export function mask(tokens: string[], entities: Entity[]): string {
  const out = [...tokens]
  for (const e of [...entities].sort((a, b) => b.start - a.start)) {
    out.splice(e.start, e.end - e.start, slotOf(e))
  }
  return out.join(' ')
}

function features(text: string): string[] {
  const w = text.split(' ').filter((x) => x !== '')
  const f = [...w]
  for (let i = 0; i + 1 < w.length; i++) f.push(`${w[i]}_${w[i + 1]}`)
  const s = ` ${w.join(' ')} `
  for (let i = 0; i + 3 <= s.length; i++) f.push(s.slice(i, i + 3))
  return f
}

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function train(examples: [string, QueryName][], meta: { lang: string; version: string }): ClassifierComplement {
  const labels = [...new Set(examples.map((e) => e[1]))].sort(byCode)
  const per = labels.map(() => new Map<string, number>())
  const totals = labels.map(() => 0)
  const docs = labels.map(() => 0)
  const vocab = new Set<string>()
  for (const [text, label] of examples) {
    const li = labels.indexOf(label)
    const f = features(text)
    for (const x of f) {
      per[li]!.set(x, (per[li]!.get(x) ?? 0) + 1)
      vocab.add(x)
    }
    totals[li]! += f.length
    docs[li]! += 1
  }
  const words = [...vocab].sort(byCode)
  return {
    kind: 'classifier',
    lang: meta.lang,
    version: meta.version,
    for: QUERIES_VERSION,
    labels,
    vocab: words,
    counts: per.map((m) => words.map((x) => m.get(x) ?? 0)),
    totals,
    docs,
  }
}

/** Probabilities of each query for a masked question: they sum to 1, best first, ties by label. */
export function predict(model: ClassifierComplement, text: string): [QueryName, number][] {
  const index = new Map(model.vocab.map((x, i) => [x, i] as const))
  const f = features(text)
  const n = model.docs.reduce((a, b) => a + b, 0)
  const v = model.vocab.length
  const scores = model.labels.map((_, li) => {
    let lp = Math.log(model.docs[li]! / n)
    for (const x of f) {
      const i = index.get(x)
      lp += Math.log(((i === undefined ? 0 : model.counts[li]![i]!) + 1) / (model.totals[li]! + v))
    }
    return lp
  })
  const top = Math.max(...scores)
  const exp = scores.map((s) => Math.exp(s - top))
  const z = exp.reduce((a, b) => a + b, 0)
  return model.labels.map((l, i) => [l, exp[i]! / z] as [QueryName, number]).sort((a, b) => b[1] - a[1] || byCode(a[0], b[0]))
}
