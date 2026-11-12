/**
 * The assistant over one reader: everything the chain needs is built once (the lexicon, the last verses, the Strong keys of the
 * concepts, the names), then `ask` decides and makes the card, and `run` makes the card of a call chosen by the person. No Node
 * module here.
 */
import { baseLang, namesById, type PackReader } from '@bt-synergy/language-pack-client'
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'
import { type Card, cardOf, DEFAULT_LIMIT, now } from './card'
import { type AssistantProblem, type ClassifierComplement, loadComplement, type NumbersComplement } from './complements'
import { type DecideCtx, decide, DEFAULT_MARGIN } from './decide'
import type { Call, Decision } from './decision'
import { interpret } from './interpret'
import { buildLexicon } from './lexicon'
import { phrasesFor } from './phrases'
import { strongsIndex } from './strongs'

export type Assistant = {
  ask(question: string, o?: { limit?: number }): Promise<Card>
  /** The card of a call the person chose (an option of a `choose`, a button): the same card, with no chain. */
  run(call: Call, o?: { limit?: number }): Promise<Card>
  problems: AssistantProblem[]
}

const NUMBER = /^(\d+)/

/** The last verse of every chapter of the installed books, from the chapter and verse events of their texts. */
async function lastVerses(reader: PackReader): Promise<Map<string, number>> {
  const last = new Map<string, number>()
  const books = BOOKS.filter((code) => reader.installed(`book:${code}`))
  const models = await Promise.all(books.map((code) => reader.book(code)))
  books.forEach((code, i) => {
    for (const t of models[i]?.texts ?? []) {
      let chapter = 0
      for (const [, kind, arg] of t.events) {
        if (kind !== 'chapter' && kind !== 'verse') continue
        if (kind === 'chapter') {
          chapter = Number(NUMBER.exec(arg)?.[1] ?? 0)
          continue
        }
        // A verse span `4-5` ends at its last verse.
        const end = Number(/(\d+)\s*$/.exec(arg)?.[1] ?? 0)
        const key = `${code} ${chapter}`
        if (chapter > 0 && end > (last.get(key) ?? 0)) last.set(key, end)
      }
    }
  })
  return last
}

/** A concept id by its first name, a book code by the map's name of the book; `undefined` when the maps name neither. */
function namesOf(maps: MapSet): (id: string) => string | undefined {
  const byId = namesById(maps)
  const books = maps.map?.core.books ?? []
  return (id) => {
    const i = (BOOKS as readonly string[]).indexOf(id)
    if (i >= 0) return books[i]?.[0] || undefined
    return byId.get(id)?.[0]
  }
}

export async function createAssistant(o: { reader: PackReader; tag: string; complements?: Uint8Array[]; margin?: number }): Promise<Assistant> {
  const { reader, tag } = o
  const base = baseLang(tag)
  const problems: AssistantProblem[] = []
  let numbers: NumbersComplement | undefined
  let classifier: ClassifierComplement | undefined
  for (const bytes of o.complements ?? []) {
    const r = loadComplement(bytes)
    if (!r.ok) {
      problems.push(r.problem)
      continue
    }
    if (r.value.lang !== base) continue
    if (r.value.kind === 'numbers') numbers = r.value
    else classifier = r.value
  }
  const maps = await reader.maps()
  const last = await lastVerses(reader)
  const names = namesOf(maps)
  const kinds = (id: string): string | undefined => maps.xmap?.core.concepts.get(id)?.kind
  const ctx: DecideCtx = {
    lexicon: buildLexicon(maps, tag, numbers),
    phrases: phrasesFor(tag),
    ...(classifier !== undefined ? { classifier } : {}),
    margin: o.margin ?? DEFAULT_MARGIN,
    listed: (code) => reader.listed(`book:${code}`),
    lastVerse: (code, chapter) => last.get(`${code} ${chapter}`),
    strongsOf: strongsIndex(maps.xmap?.core),
    tag,
    names,
    kinds,
  }
  return {
    problems,
    async ask(question, opts) {
      const started = now()
      return cardOf(reader, question, decide(question, ctx), opts?.limit ?? DEFAULT_LIMIT, started)
    },
    async run(call, opts) {
      const started = now()
      const decision: Decision = { kind: 'call', call, via: 'chosen', interpretation: '' }
      decision.interpretation = interpret(decision, tag, names, kinds)
      return cardOf(reader, '', decision, opts?.limit ?? DEFAULT_LIMIT, started)
    },
  }
}
