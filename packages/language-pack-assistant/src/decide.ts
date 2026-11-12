/**
 * The chain without a model: fixed phrases and rules, then the classifier on the masked question, then a choice of its two best
 * queries, then search. Every step answers with the reader's own query names and args.
 */
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import { mask, predict } from './classifier'
import type { ClassifierComplement } from './complements'
import type { Decision } from './decision'
import type { Lexicon } from './lexicon'
import type { Phrases } from './phrases'
import { MAX_OPTIONS, outcomeFor, readQuestion, ruleOutcome, type Outcome, type RuleCtx, view } from './rules'

/**
 * The classifier's answer is taken alone when its best probability leads the second by at least this much; below it, the two best
 * become a choice. Frozen from the tune sets (`eval/tune.ts`, 2026-11-12): calls correct es 77/100, pt 50/100, en 58/60 at every
 * margin from 0 to 0.9; correct among accepted is flat from 0.2 to 0.6 (es 62/75, pt 40/86, en 47/48), 0 to 0.1 accepts one wrong
 * es call more, 0.7 and above moves one wrong es call to a choice. The classifier decides few tune questions (es 9, pt 7, en 2), so
 * the plateau is kept at C0's value.
 */
export const DEFAULT_MARGIN = 0.3

export type DecideCtx = {
  lexicon: Lexicon
  phrases: Phrases
  /** Absent, or not for these queries: the chain runs rules and search only. */
  classifier?: ClassifierComplement
  margin: number
  listed: RuleCtx['listed']
  lastVerse: RuleCtx['lastVerse']
  strongsOf: RuleCtx['strongsOf']
}

/** Which step decided: a rule, the classifier alone, a choice of the classifier's two best, or search as the fallback. */
export type Step = 'rule' | 'classifier' | 'choose' | 'search'

const asDecision = (o: Outcome, via: 'rule' | 'classifier'): Decision =>
  o.kind === 'call' ? { kind: 'call', call: o.call, via, interpretation: '' } : { kind: 'choose', options: o.options, interpretation: '' }

/** `decide` with the step that decided, for the evaluation. */
export function decideStep(question: string, ctx: DecideCtx): { decision: Decision; step: Step } {
  const reading = readQuestion(question, ctx.lexicon, ctx.phrases)
  const { tokens, entities } = reading
  const search: Decision = { kind: 'call', call: { query: 'search', args: { text: question } }, via: 'search', interpretation: '' }
  const r = ruleOutcome(question, reading, ctx)
  if (r !== undefined) return { decision: asDecision(r, 'rule'), step: 'rule' }
  const model = ctx.classifier?.for === QUERIES_VERSION ? ctx.classifier : undefined
  if (model === undefined) return { decision: search, step: 'search' }

  const ranked = predict(model, mask(tokens, entities))
  const [c1, p1] = ranked[0]!
  const [c2, p2] = ranked[1] ?? [c1, 0]
  const v = view(entities)
  // The first choice must have its arguments; otherwise the question goes to search (C0's `need`).
  const first = outcomeFor(c1, question, v, ctx)
  if (first === undefined || (first.kind === 'call' && first.call.query === 'search')) return { decision: search, step: 'search' }
  if (p1 - p2 >= ctx.margin || first.kind === 'choose') return { decision: asDecision(first, 'classifier'), step: 'classifier' }
  const second = c2 === c1 ? undefined : outcomeFor(c2, question, v, ctx)
  const options = [first, second].flatMap((o) => (o === undefined ? [] : o.kind === 'call' ? (o.call.query === 'search' ? [] : [o.call]) : o.options))
  if (options.length >= 2) return { decision: { kind: 'choose', options: options.slice(0, MAX_OPTIONS), interpretation: '' }, step: 'choose' }
  return { decision: asDecision(first, 'classifier'), step: 'classifier' }
}

/** What the assistant decides for a question (R4: `interpretation` is `''` until the interpretation step fills it). */
export function decide(question: string, ctx: DecideCtx): Decision {
  return decideStep(question, ctx).decision
}
