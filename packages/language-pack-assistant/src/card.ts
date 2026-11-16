/**
 * The card ("la ficha"): the decision, its interpretation, the ranked pieces, what is missing and the coverage (spec part 5). It
 * runs the reader's query for a call and builds the fragments of its answer. No Node module here.
 */
import { type Answer, languageTn, type PackReader } from '@bt-synergy/language-pack-client'
import { UGNT, UHB } from '@bt-synergy/language-pack-v3'
import type { Call, Decision } from './decision'
import { type Fragment, fragmentsOf, type VerseAnswers } from './fragments'

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

type ObsField = { stories?: { n: number; frames?: string[] }[] }
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** The OBS help table an article's use in the stories comes from (the links for `tw:`, the notes for `ta:`), and its release. */
async function obsTable(reader: PackReader, id: string): Promise<[string, string] | undefined> {
  const model = reader.installed('obs') ? await reader.obs() : undefined
  const table = id.startsWith('tw:') ? model?.links : model?.notes
  if (model === undefined || table === undefined) return undefined
  const rel = release(model.res, table.res)
  return rel === undefined ? undefined : [table.res, rel]
}

/**
 * The answers of the maps (`concept`, `books`, `topics`) carry no cites: their data comes from the maps. The card cites the
 * resource the maps name for each datum (a concept's `source`, the usage source of an article, a topic's `source`), with the release
 * the map core lists for it. Nothing is cited that the maps do not name. The use of an article in the Open Bible Stories is cited
 * from the `obs` unit's links (tW) or notes (tA), with `ref` `obs NN:FF` (a frame), `obs NN` (a story) or `obs` (the books cell).
 */
async function citeMaps(reader: PackReader, call: Call, a: Answer<unknown>): Promise<void> {
  if (a.data === null || !['concept', 'books', 'topics'].includes(a.query)) return
  const m = await reader.maps()
  const push = (res: string | undefined, rel: string | undefined, id: string, ref?: string): void => {
    if (res !== undefined && rel !== undefined) a.cites.push({ res, release: rel, id, ...(ref !== undefined ? { ref } : {}) })
  }
  if (a.query === 'concept') {
    const d = a.data as { found?: boolean; id?: string; concept?: { source?: string }; obs?: ObsField }
    if (d.found === true && d.id !== undefined) push(d.concept?.source, release(m.xmap?.core.res, d.concept?.source ?? ''), d.id)
    const stories = d.obs?.stories ?? []
    if (d.id === undefined || stories.length === 0) return
    const id = d.id
    // An article's stories come from the obs unit; a person, place or event's from its topic in xtopics.
    const from: [string, string] | undefined =
      id.startsWith('tw:') || id.startsWith('ta:')
        ? await obsTable(reader, id)
        : (() => {
            const source = m.xtopics?.core.topics.get(id)?.source
            const rel = release(m.xtopics?.core.res, source ?? '')
            return source !== undefined && rel !== undefined ? [source, rel] : undefined
          })()
    if (from === undefined) return
    for (const s of stories) {
      if (s.frames !== undefined && s.frames.length > 0) for (const f of s.frames) push(from[0], from[1], id, `obs ${f}`)
      else push(from[0], from[1], id, `obs ${pad2(s.n)}`)
    }
    return
  }
  if (a.query === 'books') {
    const obsCell = (a.data as { obs?: { state: string } }).obs
    const asked = (call.args.article ?? call.args.concept) as string | undefined
    if (asked !== undefined && obsCell !== undefined && obsCell.state !== 'none' && obsCell.state !== 'zero' && /^t[wa]:/.test(asked)) {
      const from = await obsTable(reader, asked)
      if (from !== undefined) push(from[0], from[1], asked, 'obs')
    }
    if (typeof call.args.strong === 'string') {
      // The counts of a Strong key come from the original text of the book: the Greek or the Hebrew source of the xmap.
      const orig = call.args.strong.startsWith('H') ? UHB : UGNT
      push(orig, release(m.xmap?.core.res, orig), answeredKey.get(a) ?? normalizeStrong(call.args.strong))
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

/** The Strong key (padded, with its letter suffix) that actually answered a `books` call, by answer: the card cites that key. */
const answeredKey = new WeakMap<object, string>()

type BooksAnswer = Answer<{ books: Record<string, { state: string }> }>
const hasBooks = (a: BooksAnswer): boolean => a.data !== null && Object.values(a.data.books ?? {}).some((b) => b.state !== 'none')

/** The books of a Strong key, padded like renderings; all none and no letter suffix, the first of a, b, c with some. */
export async function booksOf(reader: PackReader, key: string): Promise<BooksAnswer> {
  const k = normalizeStrong(key)
  const first = (await reader.books({ strong: k })) as BooksAnswer
  answeredKey.set(first, k)
  if (hasBooks(first) || !/\d$/.test(k)) return first
  for (const s of ['a', 'b', 'c']) {
    const next = (await reader.books({ strong: k + s })) as BooksAnswer
    if (hasBooks(next)) {
      answeredKey.set(next, k + s)
      return next
    }
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

type ArticleAnswer = Awaited<ReturnType<PackReader['article']>>

/**
 * Every section of an article (spec part 5): the section asked for, or else the default sections, first; then the others in the
 * article's order. The client chooses the default sections; this only orders the answer of `article(id, 'all')`.
 */
export async function articleAll(reader: PackReader, id: string, section?: string): Promise<ArticleAnswer> {
  const lead = await reader.article(id, section)
  const all = await reader.article(id, 'all')
  if (all.data === null) return lead.data === null ? lead : all
  const first = new Set((lead.data?.sections ?? []).map((s) => s.sid))
  const sections = [...all.data.sections.filter((s) => first.has(s.sid)), ...all.data.sections.filter((s) => !first.has(s.sid))]
  return { ...all, data: { ...all.data, sections } }
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
        return await articleAll(reader, String(a.id), typeof a.section === 'string' ? a.section : undefined)
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

/** The verses of a range in one chapter ("jon 3:5-10" gives jon 3:5 … jon 3:10), at most `max`; `undefined` for one verse or another form. */
export function versesOf(ref: string, max: number): string[] | undefined {
  const m = /^([a-z0-9]{3}) (\d+):(\d+)-(\d+)$/.exec(ref.trim())
  if (m === null) return undefined
  const [from, to] = [Number(m[3]), Number(m[4])]
  if (to <= from) return undefined
  return Array.from({ length: Math.min(to - from + 1, max) }, (_, k) => `${m[1]} ${m[2]}:${from + k}`)
}

/** The passage answer of each verse of a range (a card shows at most `limit` pieces, so no more verses are read). */
async function verseAnswers(reader: PackReader, call: Call, limit: number): Promise<VerseAnswers | undefined> {
  if (call.query !== 'passage' && call.query !== 'context') return undefined
  const list = versesOf(String(call.args.ref ?? ''), limit)
  if (list === undefined) return undefined
  const out: VerseAnswers = []
  for (const ref of list) {
    try {
      out.push(await reader.passage(ref))
    } catch (e) {
      if ((e as { code?: string }).code !== 'E_ARG') throw e
    }
  }
  return out
}

/**
 * The pieces, missing units and coverage of a call. A concept reads its article (every section, the default first) and the books it is
 * used in; its pieces are the sections, then the concept, then where it is used (spec part 5).
 */
export async function piecesOf(reader: PackReader, call: Call, limit: number, words?: (t: string) => string[]): Promise<Pick<Card, 'pieces' | 'missing' | 'coverage'>> {
  const missing: Answer<unknown>['notInstalled'] = []
  let coverage: Answer<unknown>['coverage']
  const take = async (c: Call, a: Answer<unknown> | undefined, first: boolean): Promise<Fragment[]> => {
    if (a === undefined) return []
    await citeMaps(reader, c, a)
    const each = a.data !== null && first ? await verseAnswers(reader, c, limit) : undefined
    for (const n of a.notInstalled) if (!missing.some((x) => x.unit === n.unit)) missing.push(n)
    if (first && a.coverage !== undefined) coverage = a.coverage
    return fragmentsOf(c, a, reader, each)
  }
  const a = await query(reader, call, words)
  let pieces = await take(call, a, true)
  if (call.query === 'concept') {
    // A concept reached by an alias names its article and its books by the concept's own id.
    const found = a?.data as { found?: boolean; id?: string } | null | undefined
    const id = found?.found === true && found.id !== undefined ? found.id : String(call.args.id)
    const article = id.startsWith('tw:') || id.startsWith('ta:')
    const sections: Fragment[] = []
    if (article) {
      const c: Call = { query: 'article', args: { id } }
      sections.push(...(await take(c, await query(reader, c), false)))
    }
    const books = article ? { query: 'books' as const, args: { article: id } } : { query: 'books' as const, args: { concept: id } }
    const own = pieces.filter((p) => p.kind === 'concept')
    const stories = pieces.filter((p) => p.kind !== 'concept')
    // The frames or stories of the concept say more than the OBS cell of its books: that cell is left out then.
    const used = (await take(books, await query(reader, books), false)).filter((p) => p.id !== 'book:obs' || stories.length === 0)
    pieces = [...sections, ...own, ...used, ...stories]
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
