/**
 * The card ("la ficha"): the decision, its interpretation, the ranked pieces, what is missing and the coverage (spec part 5). It
 * runs the reader's query for a call and builds the fragments of its answer. No Node module here.
 */
import { type Answer, languageTn, type PackReader } from '@bt-synergy/language-pack-client'
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

/** Runs one call; an argument the reader refuses (an empty search) is an answer with no data, not an error. */
async function query(reader: PackReader, call: Call): Promise<Answer<unknown> | undefined> {
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
        return await reader.books(typeof a.article === 'string' ? { article: a.article } : { concept: String(a.concept) })
      case 'topics':
        return await reader.topics({ ...(typeof a.category === 'string' ? { category: a.category } : {}), ...(typeof a.book === 'string' ? { book: a.book } : {}) })
      case 'renderings':
        return await reader.renderings(typeof a.strong === 'string' ? { strong: a.strong } : { book: String(a.book), word: Number(a.word) })
      case 'search':
        return await reader.search(String(a.text ?? ''))
    }
  } catch (e) {
    if ((e as { code?: string }).code === 'E_ARG') return undefined
    throw e
  }
}

/** The pieces, missing units and coverage of a call. A concept reads its article (the default section) and the books it is used in. */
export async function piecesOf(reader: PackReader, call: Call, limit: number): Promise<Pick<Card, 'pieces' | 'missing' | 'coverage'>> {
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
  const a = await query(reader, call)
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
export async function cardOf(reader: PackReader, question: string, decision: Decision, limit: number, started: number): Promise<Card> {
  const body: Pick<Card, 'pieces' | 'missing' | 'coverage'> = decision.kind === 'choose' ? { pieces: [], missing: [] } : await piecesOf(reader, decision.call, limit)
  return { question, decision, interpretation: decision.interpretation, ...body, elapsed: Math.max(0, now() - started) }
}

/** Milliseconds from the platform's clock (`performance` in browsers and Bun). */
export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())
