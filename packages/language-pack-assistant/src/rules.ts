/**
 * The rules of the chain: what a question's entities and fixed phrases decide on their own, before the classifier. The order
 * follows C0's `decide` (`cadena.py`), step 1. Every rule is general: it reads entity kinds and phrase kinds, never one question.
 */
import type { Call, Decision, QueryName } from './decision'
import { type Entity, FILLERS, type Lexicon } from './lexicon'
import { fold } from './fold'
import { matchPhrases, type PhraseKind, type Phrases } from './phrases'

export type RuleCtx = {
  phrases: Phrases
  /** Whether the language's catalogs list the book (`reader.listed('book:<code>')`). */
  listed: (code: string) => boolean
  /** The last verse of a chapter in the installed book, or `undefined` when it is not known. */
  lastVerse: (code: string, chapter: number) => number | undefined
  /** The ranked Strong keys of a concept (`src/strongs.ts`). */
  strongsOf: (conceptId: string) => string[]
}

/** What a rule or the classifier gives before `via` and `interpretation` are added. */
export type Outcome = { kind: 'call'; call: Call } | { kind: 'choose'; options: Call[] }

type Concept = Extract<Entity, { kind: 'concept' }>
type Ref = Extract<Entity, { kind: 'ref' }>
type Book = Extract<Entity, { kind: 'book' }>

/** The verse a chapter-only reference ends at when the book's last verse is not known (R6). */
export const UNKNOWN_LAST_VERSE = 999
/** At most this many options in a `choose`. */
export const MAX_OPTIONS = 3

const call = (query: QueryName, args: Record<string, unknown>): Call => ({ query, args })

/** A reference entity as the reader's `ref`: a verse, a verse range, or a whole chapter as `1-<last>` (R6). */
export function refArg(e: Ref, lastVerse: RuleCtx['lastVerse']): string {
  if (e.verse === undefined) return `${e.book} ${e.chapter}:1-${lastVerse(e.book, e.chapter) ?? UNKNOWN_LAST_VERSE}`
  return `${e.book} ${e.chapter}:${e.verse}${e.verseEnd !== undefined ? `-${e.verseEnd}` : ''}`
}

/** R17: when a person has a tW names article, the `per:*` topic ids of the same name are not offered. */
export function preferTw(ids: string[]): string[] {
  return ids.some((id) => id.startsWith('tw:names/')) ? ids.filter((id) => !id.startsWith('per:')) : ids
}

const isPerson = (id: string): boolean => id.startsWith('tw:names/') || id.startsWith('per:')

/** One id gives a call; several give a `choose` of the same query over them. */
function overIds(ids: string[], make: (id: string) => Call): Outcome | undefined {
  const list = preferTw(ids)
  if (list.length === 0) return undefined
  if (list.length === 1) return { kind: 'call', call: make(list[0]!) }
  return { kind: 'choose', options: list.slice(0, MAX_OPTIONS).map(make) }
}

/** The entities of a question, sorted by kind, with the names that are also a book's name set apart. */
export type View = {
  refs: Ref[]
  books: Book[]
  strongs: Extract<Entity, { kind: 'strong' }>[]
  ta: Concept[]
  /** Concepts other than tA, by preference: tW names, tW terms, then topics. */
  named: Concept[]
  categories: Extract<Entity, { kind: 'category' }>[]
  all: Entity[]
}

export function view(entities: Entity[]): View {
  const books = entities.filter((e): e is Book => e.kind === 'book')
  const categories = entities.filter((e): e is View['categories'][number] => e.kind === 'category')
  const onBook = (e: Entity): boolean => books.some((b) => b.start === e.start && b.end === e.end)
  const concepts = entities.filter((e): e is Concept => e.kind === 'concept')
  const order = { name: 0, tw: 1, topic: 2, ta: 3 }
  return {
    refs: entities.filter((e): e is Ref => e.kind === 'ref'),
    books,
    strongs: entities.filter((e): e is View['strongs'][number] => e.kind === 'strong'),
    ta: concepts.filter((c) => c.cls === 'ta'),
    // A category word asks for a list, so a name that is also a book's name is read as the book there ("characters in Ruth").
    named: concepts.filter((c) => c.cls !== 'ta' && !(categories.length > 0 && onBook(c))).sort((a, b) => order[a.cls] - order[b.cls] || a.start - b.start),
    categories,
    all: entities,
  }
}

/** `renderings` for a concept (R10, R10b, R10d): its Strong keys; one gives a call, several a choice of the first 3, none a choice of the concept and a search. */
function renderingsOfConcept(c: Concept, question: string, strongsOf: RuleCtx['strongsOf']): Outcome {
  const id = preferTw(c.ids)[0]!
  const keys = strongsOf(id)
  if (keys.length === 1) return { kind: 'call', call: call('renderings', { strong: keys[0] }) }
  if (keys.length > 1) return { kind: 'choose', options: keys.slice(0, MAX_OPTIONS).map((k) => call('renderings', { strong: k })) }
  return { kind: 'choose', options: [call('concept', { id }), call('search', { text: question })] }
}

/** `books` takes an article id (`tw:*`, `ta:*`) or a concept (a Strong key or a topic id). */
const booksCall = (id: string): Call => call('books', /^(tw|ta):/.test(id) ? { article: id } : { concept: id })

/**
 * The call a query needs, filled from the question's entities; `undefined` when an argument is missing (C0's `need`).
 * Used by the classifier step, and by the rules once they know the query.
 */
export function outcomeFor(query: QueryName, question: string, v: View, ctx: RuleCtx): Outcome | undefined {
  switch (query) {
    case 'passage':
    case 'context': {
      const r = v.refs[0]
      return r === undefined ? undefined : { kind: 'call', call: call(query, { ref: refArg(r, ctx.lastVerse) }) }
    }
    case 'concept': {
      const c = v.named[0]
      return c === undefined ? undefined : overIds(c.ids, (id) => call('concept', { id }))
    }
    case 'article': {
      const c = v.ta[0]
      return c === undefined ? undefined : overIds(c.ids, (id) => call('article', { id }))
    }
    case 'renderings': {
      const s = v.strongs[0]
      if (s !== undefined) return { kind: 'call', call: call('renderings', { strong: s.value }) }
      // The word asked about is the first tW name or term of the question, by position: "bendecir en Rut" asks about bendecir.
      const c = v.named.filter((x) => x.cls === 'name' || x.cls === 'tw').sort((a, b) => a.start - b.start)[0]
      return c === undefined || v.ta.length > 0 ? undefined : renderingsOfConcept(c, question, ctx.strongsOf)
    }
    case 'books': {
      const s = v.strongs[0]
      if (s !== undefined) return { kind: 'call', call: booksCall(s.value) }
      const c = v.ta[0] ?? v.named[0]
      return c === undefined ? undefined : overIds(c.ids, booksCall)
    }
    case 'topics': {
      const b = v.books[0]
      if (b !== undefined) return { kind: 'call', call: call('topics', { book: b.book }) }
      const cat = v.categories[0]
      return cat === undefined ? undefined : { kind: 'call', call: call('topics', { category: cat.value }) }
    }
    case 'search':
      return { kind: 'call', call: call('search', { text: question }) }
  }
}

/** A book name alone that is also a person's name ("Juan"): the book's introduction when the catalogs list it, and each person (R5, R14, R17). */
function ambiguousBook(v: View, ctx: RuleCtx): Outcome | undefined {
  for (const b of v.books) {
    const same = v.all.filter((e) => e.kind === 'concept' && e.start === b.start && e.end === b.end) as Concept[]
    const people = preferTw(same.flatMap((c) => c.ids.filter(isPerson)))
    if (people.length === 0) continue
    const others = v.all.filter((e) => e !== b && !same.includes(e as Concept))
    if (others.length > 0) continue
    const options = [...(ctx.listed(b.book) ? [call('passage', { ref: `${b.book} front:intro` })] : []), ...people.map((id) => call('concept', { id }))]
    return options.length === 1 ? { kind: 'call', call: options[0]! } : { kind: 'choose', options }
  }
  return undefined
}

/** A question read for the rules: its folded tokens, the phrase kinds it holds, and its entities. */
export type Reading = { tokens: string[]; entities: Entity[]; kinds: Set<PhraseKind> }

/** The fixed phrases first, then the entities: a word of a fixed phrase is never part of a name ("fue" in "quien fue Booz", "era" in "o que era"). */
export function readQuestion(question: string, lexicon: Lexicon, phrases: Phrases): Reading {
  const tokens = fold(question).split(' ').filter((w) => w !== '')
  const matches = matchPhrases(tokens, phrases)
  const phraseTokens = new Set(matches.flatMap((m) => Array.from({ length: m.end - m.start }, (_, k) => m.start + k)))
  return { tokens, entities: lexicon.entities(question, { phraseTokens }).entities, kinds: new Set(matches.map((m) => m.kind)) }
}

const FILLER_WORDS = new Set(Object.values(FILLERS).flatMap((f) => [...f]))
const isDigits = (t: string | undefined): boolean => t !== undefined && /^\d+(-\d+)?$/.test(t)

/**
 * Whether the question writes a chapter and a verse ("8:28", "12, versiculo 1", "capitulo 15 versiculo 11"): a word, a number, and a
 * second number after at most filler words. With no reference entity the book is one this language's map does not name (R24, R26).
 */
export function looksLikeRef(question: string, tokens: string[]): boolean {
  if (/\d+\s*:\s*\d+/.test(question)) return true
  for (let i = 1; i < tokens.length; i++) {
    if (isDigits(tokens[i - 1]) || !isDigits(tokens[i])) continue
    let j = i + 1
    while (j < tokens.length && FILLER_WORDS.has(tokens[j]!)) j++
    if (isDigits(tokens[j])) return true
  }
  return false
}

/** The rules, in order; the first that applies decides. */
export function ruleOutcome(question: string, reading: Reading, ctx: RuleCtx): Outcome | undefined {
  const v = view(reading.entities)
  const has = (k: PhraseKind): boolean => reading.kinds.has(k)
  const booksPhrase = has('books')
  const renderingsPhrase = has('renderings')

  // 1. A reference: the passage, or its context when the question asks for everything about it.
  if (v.refs.length > 0) return outcomeFor(has('context') ? 'context' : 'passage', question, v, ctx)
  // 1b. A chapter and verse of a book this map does not name: no other query can use it, so the text is searched (R26).
  if (looksLikeRef(question, reading.tokens)) return outcomeFor('search', question, v, ctx)
  // 2. A book name alone that is also a person's name.
  if (!booksPhrase && !renderingsPhrase) {
    const amb = ambiguousBook(v, ctx)
    if (amb !== undefined) return amb
  }
  // 3. Where something appears: a Strong key, an Academy article or a concept.
  if (booksPhrase) {
    const o = outcomeFor('books', question, v, ctx)
    if (o !== undefined) return o
  }
  // 4. How something was translated: a Strong key, or a tW concept through its keys.
  if (renderingsPhrase) {
    const o = outcomeFor('renderings', question, v, ctx)
    if (o !== undefined) return o
  }
  // 5. An Academy article.
  if (v.ta.length > 0 && v.strongs.length === 0) return outcomeFor('article', question, v, ctx)
  // 6. A list: a category alone, or a book with a list word (by book, never both: the reader takes one).
  const onlyBookNames = v.named.every((c) => v.books.some((b) => b.start === c.start && b.end === c.end))
  if (v.strongs.length === 0 && onlyBookNames && (v.categories.length > 0 || (v.books.length > 0 && has('topics')))) {
    return outcomeFor('topics', question, v, ctx)
  }
  // 7. What a concept is.
  if (has('concept') && v.named.length > 0) return outcomeFor('concept', question, v, ctx)
  // 8. A search phrase: the question as typed.
  if (has('search')) return outcomeFor('search', question, v, ctx)
  return undefined
}

export function applyRules(question: string, reading: Reading, ctx: RuleCtx): { decided: Decision } | { undecided: true } {
  const o = ruleOutcome(question, reading, ctx)
  if (o === undefined) return { undecided: true }
  return { decided: o.kind === 'call' ? { kind: 'call', call: o.call, via: 'rule', interpretation: '' } : { kind: 'choose', options: o.options, interpretation: '' } }
}
