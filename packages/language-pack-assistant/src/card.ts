/**
 * The card ("la ficha"): the decision, its interpretation, the ranked pieces, what is missing and the coverage (spec part 5). It
 * runs the reader's query for a call and builds the fragments of its answer. No Node module here.
 */
import { type Answer, languageTn, type PackReader } from '@bt-synergy/language-pack-client'
import { UGNT, UHB } from '@bt-synergy/language-pack-v3'
import type { Call, Decision } from './decision'
import { type Fragment, fragmentsOf } from './fragments'

export type Card = {
  question: string
  decision: Decision
  interpretation: string
  pieces: Fragment[]
  missing: Answer<unknown>['notInstalled']
  coverage?: Answer<unknown>['coverage']
  elapsed: number
}

export const DEFAULT_LIMIT = 8

const TWL = 'unfoldingWord/en/twl'
const TN = 'unfoldingWord/en/tn'

type Res = readonly (readonly [string, string])[] | undefined
const release = (res: Res, key: string): string | undefined => res?.find((r) => r[0] === key)?.[1]

/**
 * The answers of the maps (`concept`, `books`, `topics`) carry no cites: their data comes from the maps. The card cites the
 * resource the maps name for each datum (a concept's `source`, the usage source of an article, a topic's `source`), with the release
 * the map core lists for it. Nothing is cited that the maps do not name.
 */
async function citeMaps(reader: PackReader, call: Call, a: Answer<unknown>): Promise<void> {
  if (a.data === null || !['concept', 'books', 'topics'].includes(a.query)) return
  const m = await reader.maps()
  const push = (res: string | undefined, rel: string | undefined, id: string): void => {
    if (res !== undefined && rel !== undefined) a.cites.push({ res, release: rel, id })
  }
  if (a.query === 'concept') {
    const d = a.data as { found?: boolean; id?: string; concept?: { source?: string } }
    if (d.found === true && d.id !== undefined) push(d.concept?.source, release(m.xmap?.core.res, d.concept?.source ?? ''), d.id)
    return
  }
  if (a.query === 'books') {
    if (typeof call.args.strong === 'string') {
      // The counts of a Strong key come from the original text of the book: the Greek or the Hebrew source of the xmap.
      const orig = call.args.strong.startsWith('H') ? UHB : UGNT
      push(orig, release(m.xmap?.core.res, orig), call.args.strong)
      return
    }
    const id = (call.args.article ?? call.args.concept) as string | undefined
    if (id === undefined) return
    if (id.startsWith('tw:')) push(TWL, release(m.xmap?.core.res, TWL), id)
    else if (id.startsWith('ta:')) {
      const own = languageTn(m)
      if (own !== undefined) push(own, release(m.map?.core.res, own), id)
      else push(TN, release(m.xmap?.core.res, TN) ?? release(m.map?.core.res, TN), id)
    } else {
      const source = m.xtopics?.core.topics.get(id)?.source
      push(source, release(m.xtopics?.core.res, source ?? ''), id)
    }
    return
  }
  const d = a.data as { ids?: string[]; topics?: { id: string }[] }
  for (const id of d.topics?.map((t) => t.id) ?? d.ids ?? []) {
    const source = m.xtopics?.core.topics.get(id)?.source
    push(source, release(m.xtopics?.core.res, source ?? ''), id)
  }
}

/** A Strong key as the reader's table keys it (R31): the digits padded to four (G26 is G0026, which the reader resolves to G00260). */
export function normalizeStrong(key: string): string {
  const m = /^([GH])(\d+)([a-z]?)$/i.exec(key.trim())
  return m === null ? key : `${m[1]!.toUpperCase()}${m[2]!.padStart(4, '0')}${m[3]!.toLowerCase()}`
}

type RenderingsAnswer = Answer<{ renderings: unknown[] }>

/** The renderings of a Strong key; with none and no letter suffix, the first of the suffixes a, b, c that has some (H2617 shows H2617a). */
export async function renderingsOf(reader: PackReader, key: string): Promise<RenderingsAnswer> {
  const k = normalizeStrong(key)
  const first = await reader.renderings({ strong: k })
  if (first.data !== null && first.data.renderings.length > 0) return first
  if (!/\d$/.test(k)) return first
  for (const s of ['a', 'b', 'c']) {
    const next = await reader.renderings({ strong: k + s })
    if (next.data !== null && next.data.renderings.length > 0) return next
  }
  return first
}

type BooksAnswer = Answer<{ books: Record<string, { state: string }> }>
const hasBooks = (a: BooksAnswer): boolean => a.data !== null && Object.values(a.data.books ?? {}).some((b) => b.state !== 'none')

/** The books of a Strong key, padded like renderings; all none and no letter suffix, the first of a, b, c with some. */
export async function booksOf(reader: PackReader, key: string): Promise<BooksAnswer> {
  const k = normalizeStrong(key)
  const first = (await reader.books({ strong: k })) as BooksAnswer
  if (hasBooks(first) || !/\d$/.test(k)) return first
  for (const s of ['a', 'b', 'c']) {
    const next = (await reader.books({ strong: k + s })) as BooksAnswer
    if (hasBooks(next)) return next
  }
  return first
}

type Hit = { kind: string; res?: string; book?: string; ref?: string; id?: string; score: number }

/**
 * Search by the content words of the question (R33), not the whole sentence (the index wants every word to match). With no hits, each
 * word alone (the longest four) and the hits merged by score. The call's `text` stays as typed; `words` only decides what is sent.
 */
async function searchWords(reader: PackReader, text: string, words: ((t: string) => string[]) | undefined): Promise<Answer<unknown>> {
  const content = words?.(text) ?? []
  if (content.length === 0) return reader.search(text)
  const all = await reader.search(content.join(' '))
  if (((all.data as Hit[] | null) ?? []).length > 0 || content.length === 1) return all
  const alone = [...content].sort((a, b) => b.length - a.length).slice(0, 4)
  const answers = await Promise.all(alone.map((w) => reader.search(w)))
  const seen = new Set<string>()
  const merged: { hit: Hit; cite: Answer<unknown>['cites'][number] }[] = []
  for (const a of answers) {
    ;((a.data as Hit[] | null) ?? []).forEach((hit, i) => {
      const key = [hit.kind, hit.res, hit.book, hit.ref, hit.id].join('|')
      const cite = a.cites[i]
      if (cite === undefined || seen.has(key)) return
      seen.add(key)
      merged.push({ hit, cite })
    })
  }
  merged.sort((x, y) => y.hit.score - x.hit.score)
  const out = { ...all, data: merged.map((m) => m.hit), cites: merged.map((m) => m.cite), notInstalled: [...all.notInstalled] }
  for (const a of answers) for (const n of a.notInstalled) if (!out.notInstalled.some((x) => x.unit === n.unit)) out.notInstalled.push(n)
  return out
}

/** Runs one call; an argument the reader refuses (an empty search) is an answer with no data, not an error. */
async function query(reader: PackReader, call: Call, words?: (t: string) => string[]): Promise<Answer<unknown> | undefined> {
  const a = call.args
  try {
    switch (call.query) {
      case 'passage':
        return await reader.passage(String(a.ref))
      case 'context':
        return await reader.context(String(a.ref))
      case 'article':
        return await reader.article(String(a.id), typeof a.section === 'string' ? a.section : undefined)
      case 'concept':
        return await reader.concept(String(a.id))
      case 'books':
        return typeof a.strong === 'string' ? await booksOf(reader, a.strong) : await reader.books(typeof a.article === 'string' ? { article: a.article } : { concept: String(a.concept) })
      case 'topics':
        return await reader.topics({ ...(typeof a.category === 'string' ? { category: a.category } : {}), ...(typeof a.book === 'string' ? { book: a.book } : {}) })
      case 'renderings':
        return typeof a.strong === 'string' ? await renderingsOf(reader, a.strong) : await reader.renderings({ book: String(a.book), word: Number(a.word) })
      case 'search':
        return await searchWords(reader, String(a.text ?? ''), words)
    }
  } catch (e) {
    if ((e as { code?: string }).code === 'E_ARG') return undefined
    throw e
  }
}

/** The pieces, missing units and coverage of a call. A concept reads its article (the default section) and the books it is used in. */
export async function piecesOf(reader: PackReader, call: Call, limit: number, words?: (t: string) => string[]): Promise<Pick<Card, 'pieces' | 'missing' | 'coverage'>> {
  const pieces: Fragment[] = []
  const missing: Answer<unknown>['notInstalled'] = []
  let coverage: Answer<unknown>['coverage']
  const take = async (c: Call, a: Answer<unknown> | undefined, first: boolean): Promise<void> => {
    if (a === undefined) return
    await citeMaps(reader, c, a)
    pieces.push(...fragmentsOf(c, a, reader))
    for (const n of a.notInstalled) if (!missing.some((x) => x.unit === n.unit)) missing.push(n)
    if (first && a.coverage !== undefined) coverage = a.coverage
  }
  const a = await query(reader, call, words)
  await take(call, a, true)
  if (call.query === 'concept') {
    // A concept reached by an alias names its article and its books by the concept's own id.
    const found = a?.data as { found?: boolean; id?: string } | null | undefined
    const id = found?.found === true && found.id !== undefined ? found.id : String(call.args.id)
    const article = id.startsWith('tw:') || id.startsWith('ta:')
    const more: Call[] = article ? [{ query: 'article', args: { id } }, { query: 'books', args: { article: id } }] : [{ query: 'books', args: { concept: id } }]
    for (const c of more) await take(c, await query(reader, c), false)
  }
  return { pieces: pieces.slice(0, limit), missing, ...(coverage !== undefined ? { coverage } : {}) }
}

/** The card of a decision: a `choose` has no pieces (R16), only its options and interpretation. */
export async function cardOf(reader: PackReader, question: string, decision: Decision, limit: number, started: number, words?: (t: string) => string[]): Promise<Card> {
  const body: Pick<Card, 'pieces' | 'missing' | 'coverage'> = decision.kind === 'choose' ? { pieces: [], missing: [] } : await piecesOf(reader, decision.call, limit, words)
  return { question, decision, interpretation: decision.interpretation, ...body, elapsed: Math.max(0, now() - started) }
}

/** Milliseconds from the platform's clock (`performance` in browsers and Bun). */
export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())
