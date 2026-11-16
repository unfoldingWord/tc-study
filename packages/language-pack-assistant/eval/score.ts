/** Scoring of one question against the assistant's decision. Eval only: nothing in `src/` imports this. */
import type { Call, Decision } from '../src/decision'
import { canonId } from '../src/fragments'

export type Item = {
  q: string
  expect: { call: Call } | { choose: Call[] } | { search: true }
  /** Fragment ids in the order a good card would show them. May be empty. */
  pieces: string[]
  note?: string
}

export type Score = { callCorrect: boolean; accepted: boolean; top3: boolean | null }

/** Lower case, no accents, trimmed. */
export const foldText = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Strings compare folded, arrays element by element, objects key by key (a key whose value is `undefined` is absent). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return foldText(a) === foldText(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => k in b && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return a === b
}

const STRONG = /^[GH]\d+[a-z]?$/

/**
 * `books {concept:<Strong key>}` and `books {strong:<key>}` are the same call (R32). `books {article:X}` and `books {concept:X}` are
 * the same call when X is a `tw:` or `ta:` id (R37 b): the client's `booksQuery` takes `article ?? concept` and reads the same usage
 * cells for either key. They differ for any other id (a topic, `per:*`): `article` refuses it (`E_ARG`), `concept` reads the topic's
 * occurrences; so those stay apart.
 */
function canonCall(c: Call): Call {
  if (c.query !== 'books') return c
  const k = c.args.concept
  if (typeof k === 'string' && STRONG.test(k)) return { query: 'books', args: { strong: k } }
  const a = c.args.article
  if (typeof a === 'string' && c.args.concept === undefined && /^(tw|ta):/.test(a)) return { query: 'books', args: { concept: a } }
  return c
}

export const sameCall = (a: Call, b: Call): boolean => {
  const [x, y] = [canonCall(a), canonCall(b)]
  return x.query === y.query && sameValue(x.args, y.args)
}

export function scoreQuestion(item: Item, decision: Decision, cardPieceIds: string[]): Score {
  const e = item.expect
  let callCorrect: boolean
  if ('search' in e) {
    callCorrect = decision.kind === 'call' && decision.call.query === 'search'
  } else if ('call' in e) {
    callCorrect = decision.kind === 'call' ? sameCall(decision.call, e.call) : decision.options.some((o) => sameCall(o, e.call))
  } else {
    callCorrect =
      decision.kind === 'choose' &&
      decision.options.length === e.choose.length &&
      e.choose.every((x) => decision.options.some((o) => sameCall(o, x))) &&
      decision.options.every((o) => e.choose.some((x) => sameCall(o, x)))
  }
  // Ids compare in canonical form (R29): `verse:` by the last part of the resource, `rendering:` by a canonical key and a folded form.
  const top3 = item.pieces.length === 0 ? null : cardPieceIds.slice(0, 3).map(canonId).includes(canonId(item.pieces[0]!))
  return { callCorrect, accepted: decision.kind === 'call' && decision.via !== 'search', top3 }
}
