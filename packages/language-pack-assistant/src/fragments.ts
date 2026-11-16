/**
 * Fragments: the one shape of a piece in a card, built from a query answer (spec part 2). A fragment holds only what the answer
 * gives: a field the answer lacks is left out, and a datum with no cite in the answer gives no fragment. No Node module here.
 */
import type { Answer, ArticleData, BooksData, ContextData, Hit, PackReader, PassageData, RenderingsData } from '@bt-synergy/language-pack-client'
import type { HelpRow } from '@bt-synergy/language-pack-v3'
import type { Call } from './decision'

export type Cite = Answer<unknown>['cites'][number]

export type FragmentKind = 'verse' | 'note' | 'question' | 'link' | 'section' | 'concept' | 'rendering' | 'book' | 'topic'

export type Fragment = {
  /** `verse:<last part of res> <book> <c>:<v>`, `note:<book>/<rowid>`, `section:<article id>#<sid>`, `rendering:<key>/<form>`, … (R29). */
  id: string
  kind: FragmentKind
  title: string
  ref?: string
  concepts: string[]
  /** The character count of the text the fragment shows. */
  length: number
  cite: Cite
  license?: string
  /** `ref:<book> <c>:<v>`, `concepto:<id>`, `articulo:<id>#<role>` or `pieza:<fragment id>`. */
  link: string
}

const lastPart = (key: string): string => key.slice(key.lastIndexOf('/') + 1)
const foldForm = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** A Strong key in its canonical form: upper case, a 5-digit key loses a last digit 0 (`G54850` → `G5485`), no leading zeros (`G0026` → `G26`), a letter suffix kept. */
export function canonStrong(key: string): string {
  const m = /^([GH])(\d+)([a-z]?)$/i.exec(key.trim())
  if (m === null) return key.trim().toUpperCase()
  let digits = m[2]!
  if (digits.length === 5 && digits.endsWith('0')) digits = digits.slice(0, -1)
  digits = digits.replace(/^0+(?=\d)/, '')
  return `${m[1]!.toUpperCase()}${digits}${m[3]!.toLowerCase()}`
}

/** A fragment id in the form ids compare in (R29): `verse:` with the last part of the resource key, `rendering:` with a canonical key and a folded form; others as written. */
export function canonId(id: string): string {
  if (id.startsWith('verse:')) {
    const rest = id.slice('verse:'.length)
    const sp = rest.indexOf(' ')
    return sp < 0 ? id : `verse:${lastPart(rest.slice(0, sp))}${rest.slice(sp)}`
  }
  if (id.startsWith('rendering:')) {
    const rest = id.slice('rendering:'.length)
    const sl = rest.indexOf('/')
    return sl < 0 ? `rendering:${canonStrong(rest)}` : `rendering:${canonStrong(rest.slice(0, sl))}/${foldForm(rest.slice(sl + 1))}`
  }
  return id
}

/** The license of a resource, when the reader can list its catalogs' resources (`resources()`, added to the client elsewhere). */
function licenses(reader: PackReader): (res: string) => string | undefined {
  const list = (reader as { resources?: () => readonly { key?: string; license?: string }[] }).resources
  if (typeof list !== 'function') return () => undefined
  let byKey: Map<string, string> | undefined
  return (res) => {
    if (byKey === undefined) {
      byKey = new Map()
      for (const r of list.call(reader) ?? []) if (typeof r.key === 'string' && typeof r.license === 'string') byKey.set(r.key, r.license)
    }
    return byKey.get(res)
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)
const firstLine = (md: string): string => md.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find((l) => l !== '') ?? ''
/** `1:1-3` → `1:1`: the first verse of a reference, for a `ref:` link. */
const startOf = (ref: string): string => ref.split('-')[0]!
/** The language's literal text first: a resource whose last part is `ult` or `glt`, else the first text with the verse. */
function preferred(texts: PassageData['texts']): number {
  const shown = texts.map((t, i) => [t, i] as const).filter(([t]) => t.text !== '')
  return (shown.find(([t]) => ['ult', 'glt'].includes(lastPart(t.res))) ?? shown[0])?.[1] ?? -1
}

type Build = { cites: Cite[]; license: (res: string) => string | undefined }

const withLicense = (b: Build, f: Omit<Fragment, 'license'>): Fragment => {
  const license = b.license(f.cite.res)
  return license === undefined ? f : { ...f, license }
}

function verse(b: Build, book: string, ref: string, res: string, text: string): Fragment[] {
  const cite = b.cites.find((c) => c.res === res && c.ref === `${book} ${ref}` && c.id === undefined)
  if (cite === undefined) return []
  const where = `${book} ${ref}`
  return [withLicense(b, { id: `verse:${lastPart(res)} ${where}`, kind: 'verse', title: where, ref: where, concepts: [], length: text.length, cite, link: `ref:${book} ${startOf(ref)}` })]
}

/** The text a help row shows, and its title: the note, the question and its answer, or the original words of a word link. */
function shownRow(kind: 'note' | 'question' | 'link', row: HelpRow): { title: string; text: string } {
  const c = row.cols
  if (kind === 'note' && str(c.note) !== undefined) return { title: str(c.quote) ?? firstLine(c.note as string), text: c.note as string }
  if (kind === 'question' && str(c.question) !== undefined) return { title: c.question as string, text: [c.question, str(c.response)].filter((x) => x !== undefined).join('\n') }
  if (kind === 'link') {
    const words = str(c.origWords) ?? row.concept ?? row.id
    return { title: words, text: words }
  }
  const text = Object.values(c).filter((v): v is string => typeof v === 'string' && v !== '').join('\n')
  return { title: firstLine(text) || row.ref, text }
}

function rows(b: Build, book: string, kind: 'note' | 'question' | 'link', list: HelpRow[]): Fragment[] {
  const out: Fragment[] = []
  // Notes in verse order, then row order (a sort by `from` is stable).
  for (const row of [...list].sort((x, y) => x.from - y.from)) {
    const cite = b.cites.find((c) => c.id === row.id && c.ref === row.ref)
    if (cite === undefined) continue
    const { title, text } = shownRow(kind, row)
    const id = `${kind}:${book}/${row.id}`
    const link = kind === 'link' && row.concept !== undefined ? `concepto:${row.concept}` : `pieza:${id}`
    out.push(withLicense(b, { id, kind, title, ref: `${book} ${row.ref}`, concepts: row.concept !== undefined ? [row.concept] : [], length: text.length, cite, link }))
  }
  return out
}

/** The verse fragments of one passage answer: the language's literal text first, then the other texts. */
function verses(b: Build, d: PassageData): Fragment[] {
  const first = preferred(d.texts)
  const texts = first < 0 ? [] : [d.texts[first]!, ...d.texts.filter((t, i) => i !== first && t.text !== '')]
  return texts.flatMap((t) => verse(b, d.book, d.ref, t.res, t.text))
}

/** One passage answer for each verse of a range, with its own cites: the card then shows a fragment per verse (spec part 5). */
export type VerseAnswers = Answer<PassageData>[]

function passage(b: Build, d: PassageData, each?: VerseAnswers): Fragment[] {
  let leads: Fragment[]
  let rest: Fragment[]
  if (each !== undefined && each.length > 0) {
    // One fragment per verse, in text order, from the literal text; the other texts of each verse come after the helps.
    const per = each.map((a) => (a.data === null ? [] : verses({ ...b, cites: a.cites }, a.data)))
    leads = per.flatMap((v) => v.slice(0, 1))
    rest = per.flatMap((v) => v.slice(1))
  } else {
    const all = verses(b, d)
    leads = all.slice(0, 1)
    rest = all.slice(1)
  }
  return [
    ...leads,
    ...rows(b, d.book, 'note', d.notes),
    ...rows(b, d.book, 'question', d.questions),
    ...rows(b, d.book, 'link', d.links),
    // The other texts of the verses come after the helps.
    ...rest,
  ]
}

function sections(b: Build, d: ArticleData): Fragment[] {
  const out: Fragment[] = []
  for (const s of d.sections) {
    const cite = b.cites.find((c) => c.id === d.id && c.section === s.sid)
    if (cite === undefined) continue
    out.push(withLicense(b, { id: `section:${d.id}#${s.sid}`, kind: 'section', title: s.title ?? d.title, concepts: [d.id], length: s.md.length, cite, link: `articulo:${d.id}#${s.role}` }))
  }
  return out
}

type ConceptData = { id?: string; found?: boolean; names?: string[] }

function concept(b: Build, d: ConceptData): Fragment[] {
  if (d.found !== true || d.id === undefined) return []
  const cite = b.cites.find((c) => c.id === d.id && c.section === undefined && c.ref === undefined)
  if (cite === undefined) return []
  const title = d.names?.[0] ?? d.id
  return [withLicense(b, { id: `concept:${d.id}`, kind: 'concept', title, concepts: [d.id], length: title.length, cite, link: `concepto:${d.id}` })]
}

function books(b: Build, d: BooksData, about: string | undefined): Fragment[] {
  // A Strong key is cited as the key that answered (padded, or with a suffix), which may differ from the one asked.
  const strong = about !== undefined && /^[GH]\d+[a-z]?$/i.test(about)
  const cite = b.cites.find((c) => c.section === undefined && (strong ? c.id !== undefined && /^[GH]\d+[a-z]?$/i.test(c.id) : c.id === about))
  if (cite === undefined) return []
  const cells = Object.entries(d.books).filter(([, c]) => c.state !== 'none' && c.state !== 'zero')
  cells.sort(([, x], [, y]) => (y.count ?? 0) - (x.count ?? 0))
  return cells.map(([code]) => {
    const id = `book:${code}`
    return withLicense(b, { id, kind: 'book' as const, title: code, concepts: about !== undefined ? [about] : [], length: code.length, cite, link: `pieza:${id}` })
  })
}

type TopicsData = { ids?: string[]; topics?: { id: string; title?: string; names?: string[] }[] }

function topics(b: Build, d: TopicsData): Fragment[] {
  const list = d.topics ?? (d.ids ?? []).map((id) => ({ id }) as { id: string; title?: string; names?: string[] })
  const out: Fragment[] = []
  for (const t of list) {
    const cite = b.cites.find((c) => c.id === t.id)
    if (cite === undefined) continue
    const title = t.names?.[0] ?? t.title ?? t.id
    out.push(withLicense(b, { id: `topic:${t.id}`, kind: 'topic', title, concepts: [t.id], length: title.length, cite, link: `concepto:${t.id}` }))
  }
  return out
}

function renderings(b: Build, d: RenderingsData): Fragment[] {
  const cite = b.cites[0]
  if (cite === undefined) return []
  const key = canonStrong(d.strong)
  return [...d.renderings]
    .sort((x, y) => y.count - x.count)
    .map((r) => {
      const ref = r.refs[0]
      const f: Omit<Fragment, 'license'> = {
        id: `rendering:${key}/${foldForm(r.text)}`,
        kind: 'rendering',
        title: r.text,
        concepts: [],
        length: r.text.length,
        cite,
        link: ref !== undefined ? `ref:${startOf(ref)}` : `pieza:rendering:${key}/${foldForm(r.text)}`,
      }
      return withLicense(b, ref !== undefined ? { ...f, ref } : f)
    })
}

const HIT_KIND: Record<string, FragmentKind> = { text: 'verse', note: 'note', question: 'question', link: 'link', section: 'section' }

function search(b: Build, hits: Hit[]): Fragment[] {
  // The search query pushes one cite per hit, in the hits' order.
  const out: { f: Fragment; score: number }[] = []
  hits.forEach((h, i) => {
    const cite = b.cites[i]
    const kind = HIT_KIND[h.kind]
    if (cite === undefined || kind === undefined) return
    const where = `${h.book} ${h.ref}`
    let id: string
    if (kind === 'verse') id = `verse:${lastPart(h.res)} ${where}`
    else if (kind === 'section') id = `section:${h.id ?? ''}`
    else id = `${kind}:${h.book}/${h.id ?? ''}`
    if (kind !== 'verse' && h.id === undefined) return
    const article = kind === 'section' ? h.id!.split('#')[0]! : undefined
    const f: Omit<Fragment, 'license'> = {
      id,
      kind,
      title: kind === 'section' ? h.id! : where,
      ...(kind !== 'section' ? { ref: where } : {}),
      concepts: article !== undefined ? [article] : [],
      length: h.snippet.length,
      cite,
      link: kind === 'verse' ? `ref:${h.book} ${startOf(h.ref)}` : `pieza:${id}`,
    }
    out.push({ f: withLicense(b, f), score: h.score })
  })
  return out.sort((x, y) => y.score - x.score).map((x) => x.f)
}

/** The fragments of an answer, in the spec's ranking order for its query (part 5). */
export function fragmentsOf(call: Call, answer: Answer<unknown>, reader: PackReader, each?: VerseAnswers): Fragment[] {
  const d = answer.data
  if (d === null || d === undefined) return []
  const b: Build = { cites: answer.cites, license: licenses(reader) }
  switch (answer.query) {
    case 'passage':
      return passage(b, d as PassageData, each)
    case 'context': {
      const c = d as ContextData
      return [...passage(b, c.passage, each), ...c.concepts.flatMap((x) => (x.article !== null ? sections(b, x.article) : []))]
    }
    case 'article':
      return sections(b, d as ArticleData)
    case 'concept':
      return concept(b, d as ConceptData)
    case 'books': {
      const a = call.args
      return books(b, d as BooksData, typeof a.article === 'string' ? a.article : typeof a.concept === 'string' ? a.concept : typeof a.strong === 'string' ? a.strong : undefined)
    }
    case 'topics':
      return topics(b, d as TopicsData)
    case 'renderings':
      return renderings(b, d as RenderingsData)
    case 'search':
      return search(b, d as Hit[])
    default:
      return []
  }
}
