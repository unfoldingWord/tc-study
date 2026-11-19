/**
 * Aquifer translation notes and questions as the helps of a book (`spec/cddl/book.cddl`, "Notes, questions and word links"): the same
 * {@link HelpTable} that `extractHelps` (`bookHelps.ts`) returns, so that `bookSegment` can encode a book with `texts: []` and only
 * `notes` and/or `questions` (a patch catalog, `hi-x-aquifer`).
 *
 * - {@link buildTaMap} maps the content id of an Aquifer UWTranslationManual article to the `ta:{manual}/{slug}` id of the Door43
 *   `en_ta` article that is the same one: the Aquifer Hindi article, its English article (by `reference_id`), the English title, and
 *   the `en_ta` slug that has that title;
 * - {@link aquiferNotes} and {@link aquiferQuestions} turn the articles of a book (the array of one `NN.content.json`) into rows;
 * - {@link htmlToMarkdown} is the converter of their HTML.
 *
 * Rows, as `extractHelps` makes them for Door43 rows: `id` is the `content_id`; `from` and `to` are the verse ids `LLCCCVVV` (the
 * book's own number, `verseId`), `ref` the canonical text of that range (`formatRef`); `cols` has the Door43 column names (`quote` and
 * `note` for the notes, `question` and `response` for the questions); `concept` is the `ta:` id of the first Manual link. A book
 * introduction and a chapter introduction (Aquifer `index_reference` with verse 000, whose `passage` is verse 1) are kept, placed at
 * `front:intro` and `N:intro` as `extractHelps` places the rows with that reference; they have a note and no quote.
 *
 * Nothing is dropped silently: each unmatched link, repeated id, unreadable reference or odd article adds a line to `issues`. No Node
 * module is used.
 */
import { compareCodePoints } from '../codec/columns'
import { formatRef, verseId } from '../ids'
import type { HelpRow, HelpTable } from '../model'
import { uniqueIds } from './bookHelps'

// Input shapes (the fields of the Aquifer JSON that are read)

type Passage = { start_ref?: string; end_ref?: string }
type AssociatedResource = { content_id?: string | number; reference_id?: string | number; resource_code?: string; label?: string }
/** An article of an Aquifer resource (`{book}.content.json` is an array of them). */
export type AquiferArticle = {
  content_id: string | number
  reference_id?: string | number
  title?: string
  index_reference?: string
  content?: string
  associations?: { passage?: Passage[]; resource?: AssociatedResource[] }
}
/** An article of the Manual, as `buildTaMap` reads it. */
export type TaArticle = { content_id: string | number; reference_id?: string | number; title?: string }
/** `fetch-en-ta-titles.ts` writes it: title to `ta:{manual}/{slug}`; the titles two articles share are in `ambiguous` and never matched. */
export type EnTaTitles = { tag?: string; titles: Record<string, string>; ambiguous?: Record<string, string[]> }

export const MANUAL_CODE = 'UWTranslationManual'

// The TA map

/**
 * A stand-in for a Manual Aquifer does not publish in a language (es-419 has none): the Manual articles the notes themselves are associated
 * with (`associations.resource` with the Manual code), each with its `content_id`, its `reference_id` (the one of its English twin) and its
 * label as the title. `buildTaMap` takes it as the language's Manual. A `content_id` seen twice keeps the first `reference_id`; a resource with no
 * `content_id` or no `reference_id` is left out (its links stay text).
 */
export function taFromNotes(notes: readonly AquiferArticle[]): TaArticle[] {
  const seen = new Map<string, TaArticle>()
  for (const note of notes) {
    for (const r of note.associations?.resource ?? []) {
      if (r.resource_code !== MANUAL_CODE || r.content_id === undefined || r.reference_id === undefined) continue
      const id = String(r.content_id)
      if (!seen.has(id)) seen.set(id, { content_id: id, reference_id: r.reference_id, ...(r.label === undefined ? {} : { title: r.label }) })
    }
  }
  return [...seen.values()]
}

/** Why an article of the Hindi Manual has no `ta:` id. */
export type TaUnmatched = { contentId: string; title: string; reason: 'no-english-article' | 'no-door43-title' | 'ambiguous-title' }

/**
 * The comparison key of a title: NFC, `unfoldingWord®` and any other `®` left out (the Aquifer titles carry the decoration, the Door43
 * ones do not), spaces collapsed and trimmed, lower case.
 */
export function titleKey(title: string): string {
  return title
    .normalize('NFC')
    .replace(/unfoldingWord\s*®/gi, '')
    .replace(/®/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The three en_ta articles titled "Word Order" are told apart by hand, keyed by the `reference_id` of the English Aquifer article. Evidence
 * (`ta-eng.json`, Manual at 1c3178f): the English article 33295 (ref 26709, "Word Order") links "Koiné Greek" to 33296 (ref 26710) and "Biblical
 * Hebrew" to 33297 (ref 26711); 26709 is the general article, so it is `figs-order`, 26710 the Greek one and 26711 the Hebrew one.
 */
export const TITLE_OVERRIDES: Readonly<Record<string, string>> = {
  '26709': 'ta:translate/figs-order',
  '26710': 'ta:translate/figs-ordergrk',
  '26711': 'ta:translate/figs-orderheb',
}

/**
 * The map from the `content_id` of each Hindi Manual article to its `ta:{manual}/{slug}` id (the slug in lower case, `ids.md`). An
 * article is matched through its English twin (the same `reference_id`) and the title of that twin in `enTaTitles`; one with no twin, no
 * Door43 title or an ambiguous title (the three "Word Order" articles are settled by {@link TITLE_OVERRIDES}) is listed in `unmatched` with the reason, and is not in the map.
 */
export function buildTaMap(langTa: TaArticle[], engTa: TaArticle[], enTaTitles: EnTaTitles): { map: Map<string, string>; unmatched: TaUnmatched[] } {
  const english = new Map<string, TaArticle>()
  for (const article of engTa) if (article.reference_id !== undefined) english.set(String(article.reference_id), article)
  const byTitle = new Map<string, string>()
  const ambiguous = new Set(Object.keys(enTaTitles.ambiguous ?? {}).map(titleKey))
  for (const [title, id] of Object.entries(enTaTitles.titles)) {
    // Two titles that compare equal (case, spaces, decoration) are one shared title, whatever `ambiguous` says: never matched.
    const key = titleKey(title)
    if (byTitle.has(key)) ambiguous.add(key)
    else byTitle.set(key, id.toLowerCase())
  }

  const map = new Map<string, string>()
  const unmatched: TaUnmatched[] = []
  for (const article of langTa) {
    const contentId = String(article.content_id)
    const title = article.title ?? ''
    const twin = article.reference_id === undefined ? undefined : english.get(String(article.reference_id))
    if (twin === undefined || twin.title === undefined) {
      unmatched.push({ contentId, title, reason: 'no-english-article' })
      continue
    }
    const override = TITLE_OVERRIDES[String(twin.reference_id)]
    if (override !== undefined) {
      map.set(contentId, override)
      continue
    }
    const key = titleKey(twin.title)
    const id = byTitle.get(key)
    if (ambiguous.has(key)) unmatched.push({ contentId, title, reason: 'ambiguous-title' })
    else if (id === undefined) unmatched.push({ contentId, title, reason: 'no-door43-title' })
    else map.set(contentId, id)
  }
  unmatched.sort((a, b) => compareCodePoints(a.contentId, b.contentId))
  return { map, unmatched }
}

// HTML

type Node = { tag: string; attrs: string; children: Node[] } | string

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' }

/** Decodes the named entities above and the numeric ones (`&#39;`, `&#x27;`); any other `&…;` stays as written. NUL and the C0 controls (and DEL) except tab and newline are dropped. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (all, dec, hex, name) => {
    if (name !== undefined) return ENTITIES[name] ?? all
    const code = dec !== undefined ? Number(dec) : parseInt(hex, 16)
    // NUL and the C0 controls other than tab and newline (and DEL) are dropped; a surrogate or a code past U+10FFFF stays as written.
    if (code === 0 || (code < 0x20 && code !== 9 && code !== 10) || code === 0x7f) return ''
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all
  })
}

/** Elements whose content is not text a reader should get: they and everything under them are dropped. */
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript'])

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link'])

function parseHtml(html: string): Node[] {
  const root: { tag: string; attrs: string; children: Node[] } = { tag: '', attrs: '', children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]
  const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let last = 0
  for (let match = token.exec(html); match !== null; match = token.exec(html)) {
    if (match.index > last) top().children.push(html.slice(last, match.index))
    last = token.lastIndex
    if (match[2] === undefined) continue
    const tag = match[2].toLowerCase()
    if (match[1] === '/') {
      // Close the nearest open element of that name; a stray close tag is ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
    } else {
      const node = { tag, attrs: match[3], children: [] as Node[] }
      top().children.push(node)
      if (!VOID.has(tag) && !match[3].endsWith('/')) stack.push(node)
    }
  }
  if (last < html.length) top().children.push(html.slice(last))
  return root.children
}

const attr = (node: { attrs: string }, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(node.attrs)
  return match === null ? undefined : decodeEntities(match[1] ?? match[2])
}

/** The text of a node and everything under it, with the entities decoded; `br` is a space. */
function textOf(node: Node): string {
  if (typeof node === 'string') return decodeEntities(node)
  if (node.tag === 'br') return ' '
  if (DROPPED.has(node.tag)) return ''
  return node.children.map(textOf).join('')
}

const SAFE_HREF = /^(https?:|mailto:)/i

// U+E000 and U+E001 stand for bold while the text is built (`wrap`), so the input never keeps them.
const clean = (text: string): string => text.replace(/\\n/g, '\n').replace(/[]/g, '')

/** What the converter calls for a Manual link: the text it becomes. */
export type LinkResolver = (link: { code: string; contentId: string; label: string }) => string

const BLOCKS = new Set(['p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Private-use marks that stand for `**` while the text is built, so that adjacent and nested bold can be merged (`boldText`). */
const BOLD_OPEN = '\uE000'
const BOLD_CLOSE = '\uE001'

/**
 * Emphasis markers around the text, with the spaces moved outside (`**a **` is not emphasis in markdown); no text, no markers. Bold is
 * written with {@link BOLD_OPEN} and {@link BOLD_CLOSE}, and bold inside bold is just the text.
 */
function wrap(marker: string, text: string): string {
  const [open, close] = marker === '**' ? [BOLD_OPEN, BOLD_CLOSE] : [marker, marker]
  const flat = marker === '**' ? text.replace(/[\uE000\uE001]/g, '') : text
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(flat)!
  return match[2] === '' ? flat : `${match[1]}${open}${match[2]}${close}${match[3]}`
}

/** The bold runs written with the marks become `**`; two runs with nothing between them are one, and an empty one is dropped. */
function boldText(text: string): string {
  return text
    .replace(/\uE001\uE000/g, '')
    .replace(/\uE000\uE001/g, '')
    .replace(/\uE000/g, '**')
    .replace(/\uE001/g, '**')
    // The Hindi data also has literal `**` around a `<strong>` (`**<strong>\u0938\u0941\u0928</strong>**`): four stars on each side are two.
    .replace(/\*{4}([^*\n]+?)\*{4}/g, '**$1**')
}

/** The blocks of nodes as markdown paragraphs (what the whole article and every list item come to). */
function render(nodes: Node[], link: LinkResolver | undefined): string {
  return boldText(blocks(nodes, link, '').join('\n\n'))
}

function inline(nodes: Node[], link: LinkResolver | undefined): string {
  let out = ''
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += clean(decodeEntities(node))
    } else if (node.tag === 'strong' || node.tag === 'b') {
      out += wrap('**', inline(node.children, link))
    } else if (node.tag === 'em' || node.tag === 'i') {
      out += wrap('*', inline(node.children, link))
    } else if (DROPPED.has(node.tag)) {
      continue
    } else if (node.tag === 'br') {
      out += '\n'
    } else if (node.tag === 'a') {
      const text = inline(node.children, link).trim()
      const href = attr(node, 'href')
      // Only http(s) and mailto links are kept; `javascript:`, `data:` and the like leave the text alone.
      out += href === undefined || text === '' || !SAFE_HREF.test(href.trim()) ? text : `[${text}](${href.trim().replace(/[()<> ]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)})`
    } else if (node.tag === 'data' && attr(node, 'class') === 'resource-ref' && link !== undefined) {
      out += link({ code: attr(node, 'data-resource-code') ?? '', contentId: attr(node, 'data-content-id') ?? '', label: inline(node.children, undefined).trim() })
    } else if (BLOCKS.has(node.tag)) {
      out += ` ${inline(node.children, link)} `
    } else {
      out += inline(node.children, link)
    }
  }
  return out
}

function blocks(nodes: Node[], link: LinkResolver | undefined, indent: string): string[] {
  const out: string[] = []
  let run: Node[] = []
  const flush = () => {
    const text = inline(run, link).replace(/[ \t]+\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
    if (text !== '') out.push(indent + text)
    run = []
  }
  for (const node of nodes) {
    if (typeof node === 'string' || !(BLOCKS.has(node.tag) && node.tag !== 'li')) {
      run.push(node)
      continue
    }
    flush()
    if (node.tag === 'p') {
      const text = inline(node.children, link).replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
      if (text !== '') out.push(indent + text)
    } else if (node.tag === 'ul' || node.tag === 'ol') {
      let n = 0
      const items = node.children.filter((child) => typeof child !== 'string' && child.tag === 'li') as Exclude<Node, string>[]
      const lines = items.flatMap((item) => {
        n++
        const marker = node.tag === 'ol' ? `${n}. ` : '- '
        const inner = blocks(item.children, link, '')
        const [first = '', ...rest] = inner.flatMap((block) => block.split('\n'))
        return [`${indent}${marker}${first}`, ...rest.map((line) => `${indent}${' '.repeat(marker.length)}${line}`)]
      })
      if (lines.length > 0) out.push(lines.join('\n'))
    } else {
      // h1 to h6: a markdown heading (Aquifer's introductions are written with them)
      const text = inline(node.children, link).replace(/\s+/g, ' ').trim()
      if (text !== '') out.push(`${indent}${'#'.repeat(Number(node.tag[1]))} ${text}`)
    }
  }
  flush()
  return out
}

/**
 * The markdown of an Aquifer article's HTML. `<p>` (a paragraph, a blank line between), `<strong>`/`<b>`, `<em>`/`<i>`, `<ul>`/`<ol>`/`<li>`,
 * `<a>` and `<br>` are kept; headings `<h1>`–`<h6>` become `#` lines (the introductions have them); any other tag becomes its text. The
 * entities are decoded and a literal `\n` (TSV's escape, which the Hindi notes still carry) is a line break. `link` gives the text of a
 * Manual link (`<data class="resource-ref">`); without it a link is its label.
 *
 * Safety: a link keeps its `href` only for `http:`, `https:` and `mailto:`; `script`, `style`, `iframe`, `object`, `embed` and `noscript` are dropped
 * with their content; NUL and control characters (entities included) are dropped. Headings become `#` on purpose (the introductions have them).
 * The output is still markdown from a third party: the client must not render raw HTML from note markdown (Door43 notes have the same exposure).
 */
export function htmlToMarkdown(html: string, link?: LinkResolver): string {
  return render(parseHtml(html), link)
}

// Articles to rows

const firstBlocks = (nodes: Node[]): number[] =>
  nodes.flatMap((node, i) => (textOf(node).trim() === '' ? [] : [i]))

/** Hebrew or Greek (the scripts of the originals: Hebrew U+0590-05FF, Greek U+0370-03FF and U+1F00-1FFF) is all the letters the text has, and it has some. */
const ORIGINAL_LETTER = /^[\p{Script=Hebrew}\p{Script=Greek}]$/u
export function isOriginalScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  return letters.length > 0 && letters.every((letter) => ORIGINAL_LETTER.test(letter))
}

/** The quote the text of a paragraph is: spaces collapsed, one pair of enclosing parentheses taken off. `&` stays, as in the Door43 quotes. */
function quoteOf(text: string): string {
  const flat = clean(text).replace(/\s+/g, ' ').trim()
  return /^[(（][^()（）]*[)）]$/.test(flat) ? flat.slice(1, -1).trim() : flat
}

/**
 * The original-language quote at the head of a note: one of the first two paragraphs, when all its letters are Hebrew or Greek, whatever the
 * `direction` of its span, whether it is in `<strong>` or not, with parentheses or without (the Hindi OT notes put a gloss in parentheses
 * before it). A Hindi or Latin paragraph is never a quote. The paragraph is taken out of the note; the others stay. Returns the quote (text)
 * and the nodes that remain, or `quote: undefined` and all of them.
 */
function splitQuote(nodes: Node[]): { quote?: string; rest: Node[] } {
  for (const at of firstBlocks(nodes).slice(0, 2)) {
    const head = nodes[at]
    if (typeof head === 'string' || head.tag !== 'p') return { rest: nodes }
    const text = textOf(head)
    if (!isOriginalScript(text)) continue
    const quote = quoteOf(text)
    return quote === '' ? { rest: nodes } : { quote, rest: [...nodes.slice(0, at), ...nodes.slice(at + 1)] }
  }
  return { rest: nodes }
}

const INDEX = /^(\d{2})(\d{3})(\d{3})$/

/**
 * `from`, `to` and `ref` of an article. A book or chapter introduction (`index_reference` with verse 000) is at `front:intro` or
 * `N:intro`; otherwise the lowest and the highest verse of the `passage` associations, else the `index_reference`. `null` when none
 * names a verse of `book` (the row is then placed at the book introduction, as `extractHelps` does).
 */
function rangeOf(article: AquiferArticle, book: string): { from: number; to: number; note?: string } | null {
  const own = Math.floor(verseId(book, 0, 0) / 1_000_000)
  const toId = (text: string | undefined): number | null => {
    const match = text === undefined ? null : INDEX.exec(text)
    if (match === null || Number(match[1]) !== own) return null
    return own * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3])
  }
  const index = toId(article.index_reference)
  if (index !== null && index % 1_000 === 0) return { from: index, to: index }
  let from: number | undefined
  let to: number | undefined
  for (const passage of article.associations?.passage ?? []) {
    const start = toId(passage.start_ref)
    const end = toId(passage.end_ref ?? passage.start_ref)
    if (start === null || end === null) continue
    from = from === undefined ? Math.min(start, end) : Math.min(from, start, end)
    to = to === undefined ? Math.max(start, end) : Math.max(to, start, end)
  }
  if (from !== undefined && to !== undefined) return { from, to }
  return index === null ? null : { from: index, to: index, note: 'its passage names no verse; the index_reference is used' }
}

function canonical(book: string, from: number, to: number): string {
  try {
    return formatRef(book, from, to)
  } catch (error) {
    if (error instanceof RangeError) return `${from}-${to}`
    throw error
  }
}

type Built = { article: AquiferArticle; row: HelpRow; nodes: Node[]; report: (text: string) => void }

/** The rows' common part: id, reference, and the parsed content. */
function* articles(items: AquiferArticle[], book: string, res: string, issues: string[]): Generator<Built> {
  const unique = uniqueIds()
  for (const [index, article] of items.entries()) {
    if (article.content_id === undefined || article.content_id === null || String(article.content_id) === '') {
      issues.push(`${res}: article ${index} has no content_id; it is left out`)
      continue
    }
    const published = String(article.content_id)
    const id = unique(published)
    const report = (text: string) => issues.push(`${res} ${id}: ${text}`)
    if (id !== published) report(`the content_id ${published} is in the source twice; this row is ${id}`)
    let range = rangeOf(article, book)
    if (range === null) {
      const intro = verseId(book, 0, 0)
      range = { from: intro, to: intro }
      report(`the references ${JSON.stringify(article.index_reference ?? '')} and ${JSON.stringify(article.associations?.passage ?? [])} name no verse of ${book}; the row is placed at the book introduction`)
    } else if (range.note !== undefined) report(range.note)
    const row: HelpRow = { id, ref: canonical(book, range.from, range.to), from: range.from, to: range.to, cols: {} }
    yield { article, row, nodes: parseHtml(article.content ?? ''), report }
  }
}

/** What `aquiferNotes` counts when given one: the links in the text left as plain text, and the associated Manual articles with no `ta:` id (no concept for the row). */
export type NoteCounts = { inlineLinks: number; conceptArticles: number }

/**
 * The notes of a book from the articles of an Aquifer tN resource (`NN.content.json`). `res` is the key of the resource (`aquifer/hi/tn`);
 * `taMap` is {@link buildTaMap}'s map. `cols.quote` is the original-language quote (Hebrew or Greek, by script) when the note begins with one, `cols.note` the rest as
 * markdown. Each Manual link in the text becomes `[[ta:{manual}/{slug}]]`, or its label when the map has no id for it (a line in
 * `issues`); `concept` is the first link that maps, in the text and then in `associations.resource` (by `content_id`, whatever the code it carries). A link to another resource stays
 * its label, with a line in `issues`.
 */
export function aquiferNotes(items: AquiferArticle[], book: string, res: string, taMap: ReadonlyMap<string, string>, issues: string[] = [], counts?: NoteCounts): HelpTable {
  const rows: HelpRow[] = []
  for (const { article, row, nodes, report } of articles(items, book, res, issues)) {
    const inText: string[] = []
    const link: LinkResolver = ({ code, contentId, label }) => {
      const id = code === MANUAL_CODE ? taMap.get(contentId) : undefined
      if (id === undefined) {
        if (counts !== undefined) counts.inlineLinks++
        report(code === MANUAL_CODE ? `the link to the Manual article ${contentId} (${JSON.stringify(label)}) has no ta: id; it stays as text` : `the link to ${code || 'a resource'} ${contentId} (${JSON.stringify(label)}) is not a Manual link; it stays as text`)
        return label
      }
      inText.push(id)
      return `[[${id}]]`
    }
    const { quote, rest } = splitQuote(nodes)
    const note = render(rest, link)
    if (quote !== undefined) row.cols.quote = quote
    if (note !== '') row.cols.note = note
    else report('the note has no text')

    let concept = inText[0]
    if (concept === undefined) {
      for (const linked of article.associations?.resource ?? []) {
        // Aquifer labels 98 of the 169 Manual links of the Hindi Titus notes `UWTranslationNotes` (their content_id is a Manual article), so the code
        // is not a filter: the map decides, and only a link that says Manual or Notes is reported when the map lacks it.
        const id = taMap.get(String(linked.content_id))
        if (id !== undefined) {
          concept = id
          break
        }
        if (linked.resource_code !== MANUAL_CODE && linked.resource_code !== 'UWTranslationNotes') continue
        if (counts !== undefined) counts.conceptArticles++
        report(`the associated Manual article ${linked.content_id} (${JSON.stringify(linked.label ?? '')}) has no ta: id`)
      }
    }
    if (concept !== undefined) row.concept = concept
    rows.push(row)
  }
  return { res, rows }
}

/**
 * The questions of a book from the articles of an Aquifer tQ resource. The first paragraph is the question (as plain text, its emphasis
 * dropped), the rest the response (markdown). A row without a response is kept with a line in `issues`. Questions have no concept and no
 * quote.
 */
export function aquiferQuestions(items: AquiferArticle[], book: string, res: string, issues: string[] = []): HelpTable {
  const rows: HelpRow[] = []
  for (const { row, nodes, report } of articles(items, book, res, issues)) {
    const at = nodes.findIndex((node) => typeof node !== 'string' && node.tag === 'p' && textOf(node).trim() !== '')
    if (at < 0) {
      report('the article has no paragraph; the row has no question')
    } else {
      const question = clean(textOf(nodes[at])).replace(/\s+/g, ' ').trim()
      const response = render(nodes.slice(at + 1), undefined)
      row.cols.question = question
      if (response !== '') row.cols.response = response
      else report('the question has no response')
    }
    rows.push(row)
  }
  return { res, rows }
}
