/**
 * The chain without a model: fixed phrases and rules, then the classifier on the masked question, then a choice of its two best
 * queries, then search. Every step answers with the reader's own query names and args.
 */
import { QUERIES_VERSION } from '@bt-synergy/language-pack-client'
import { mask, predict } from './classifier'
import type { ClassifierComplement } from './complements'
import type { Decision } from './decision'
import { interpret } from './interpret'
import type { Lexicon } from './lexicon'
import type { Phrases } from './phrases'
import { MAX_OPTIONS, outcomeFor, readQuestion, type Reading, ruleOutcome, type Outcome, type RuleCtx, view } from './rules'
import { contentWordsOutside } from './words'

/**
 * The classifier's answer is taken alone when its best probability leads the second by at least this much; below it, the two best
 * become a choice. Frozen from the tune sets (`eval/tune.ts`, 2026-11-12: calls correct flat from margin 0 to 0.9, correct among
 * accepted flat from 0.2 to 0.6), counted per R28 (accepted = a call by a rule or the classifier; the search fallback is not
 * accepted) on the refreshed staging packs of 2026-11-15 (`eval/run.ts`): calls correct es 76/100, pt 49/100, en 55/60; accepted
 * es 80 (61 correct), pt 62 (38), en 47 (45); counting the fallback, pt 88 (39) and en 48 (45). The classifier alone decides few
 * tune questions (pt 3, en 1), so the plateau is kept at C0's value.
 */
export const DEFAULT_MARGIN = 0.3

/**
 * R37 f, general form (C2.1): a question with a concept other than a tA article (a name, a tW term or a topic) and at least N other
 * content words, and no concept, books or renderings phrase, describes something to find ("Jonah and the big fish", "the prodigal
 * son"): it goes to search, not to the classifier. N is set on the tune data (`eval/tune.ts --sets tune,test --words 1,2,3`,
 * 2026-11-16, margin 0.3, tune+C2 test sets): calls correct es 185/178/178 of 250, pt 128/128/124 of 250, en 171/167/165 of 210 for
 * N = 1/2/3, and correct among accepted is highest at N = 1 in all three (es 84.0 %, pt 66.9 %, en 89.7 %), so N = 1.
 */
export const DEFAULT_DESCRIPTION_WORDS = 1

/** Whether a question undecided by the rules is a free description around a concept (R37 f). */
export function describesWithName(question: string, reading: Reading, tag: string, n: number): boolean {
  if (reading.kinds.has('concept') || reading.kinds.has('books') || reading.kinds.has('renderings')) return false
  const named = reading.entities.filter((e) => e.kind === 'concept' && e.cls !== 'ta')
  if (named.length === 0) return false
  return contentWordsOutside(question, tag, reading.tokens, named).length >= n
}

export type DecideCtx = {
  lexicon: Lexicon
  phrases: Phrases
  /** Absent, or not for these queries: the chain runs rules and search only. */
  classifier?: ClassifierComplement
  margin: number
  listed: RuleCtx['listed']
  lastVerse: RuleCtx['lastVerse']
  strongsOf: RuleCtx['strongsOf']
  /** With `tag` and `names` (a name for a concept id or a book code), `decide` fills `interpretation`; without them it stays `''`. */
  tag?: string
  names?: (id: string) => string | undefined
  /** The xmap kind of a concept id: a `tw:names/*` place is shown as a place, not a person. */
  kinds?: (id: string) => string | undefined
  /** R37 f's N; `DEFAULT_DESCRIPTION_WORDS` when absent. */
  descriptionWords?: number
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
  // Without a tag the chain cannot tell content words from stop words, so fix (f) does not apply (as in the rules).
  if (ctx.tag !== undefined && describesWithName(question, reading, ctx.tag, ctx.descriptionWords ?? DEFAULT_DESCRIPTION_WORDS)) return { decision: search, step: 'search' }
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
  // Below the margin with nothing to choose between: search rather than guess.
  return { decision: search, step: 'search' }
}

/** What the assistant decides for a question (R4: `interpretation` is the one-line reading when the ctx has `tag` and `names`, else `''`). */
export function decide(question: string, ctx: DecideCtx): Decision {
  const { decision } = decideStep(question, ctx)
  if (ctx.tag === undefined || ctx.names === undefined) return decision
  return { ...decision, interpretation: interpret(decision, ctx.tag, ctx.names, ctx.kinds) }
}
