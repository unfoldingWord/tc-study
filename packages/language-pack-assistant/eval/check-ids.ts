/**
 * Checks that the fragment ids of a question file (`pieces`) and the ids in the `expect` calls exist in the installed packs.
 * Eval only (Node and Bun). `bun eval/check-ids.ts --lang es-419 --file eval/questions/es-tune.jsonl` (with `LP3_STAGING=1` the first time).
 *
 * The id grammar (spec part 2): `verse:<res> <book> <c>:<v>`, `note:<book>/<rowid>`, `question:<book>/<rowid>`, `link:<book>/<rowid>`,
 * `section:<article id>#<sid>`, `concept:<id>`, `rendering:<strong>/<form>`, `book:<code>`, `topic:<id>`.
 * `<res>` is the resource key (`es-419_gl/es-419/glt`) or its last part (`glt`).
 */
import { readFileSync } from 'node:fs'
import { namesById, parsePassage, type PackReader } from '@bt-synergy/language-pack-client'
import { BOOKS, verseId } from '@bt-synergy/language-pack-v3'
import type { Call } from '../src/decision'
import { installPacks } from './packs'

export type IdCheck = { id: string; ok: boolean; why?: string }

type Events = [number, string, string][]
const CATEGORIES = ['person', 'place', 'event', 'topic', 'story', 'section']
const isBook = (b: unknown): b is string => typeof b === 'string' && (BOOKS as readonly string[]).includes(b)
const lastPart = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

/** The verse ids a text has, from its chapter and verse events (`1-2` has both; chapter `c` has verse 0). */
function verseSet(book: string, events: Events): Set<number> {
  const out = new Set<number>()
  let chapter = 0
  for (const [, kind, arg] of events) {
    const m = /^(\d+)(?:-(\d+))?/.exec(arg)
    if (m === null) continue
    if (kind === 'chapter') {
      chapter = Number(m[1])
      out.add(verseId(book, chapter, 0))
    } else if (kind === 'verse') {
      for (let v = Number(m[1]); v <= Number(m[2] ?? m[1]); v++) out.add(verseId(book, chapter, v))
    }
  }
  return out
}

/** The last verse of a chapter in the installed texts of a book, or `undefined` when no text has the chapter. */
export async function lastVerse(reader: PackReader, book: string, chapter: number): Promise<number | undefined> {
  const model = await reader.book(book)
  let last: number | undefined
  for (const t of model?.texts ?? []) {
    const set = verseSet(book, t.events as Events)
    for (let v = 176; v >= 1; v--) {
      if (set.has(verseId(book, chapter, v))) {
        last = Math.max(last ?? 0, v)
        break
      }
    }
  }
  return last
}

type Spread = { drop: Set<string>; concepts: Map<string, number> }
const spreads = new WeakMap<PackReader, Promise<Spread>>()

/**
 * For each Strong key, how many tW concepts list it in `strongs`; `drop` holds the keys of more than 2 % of them (`G35880`, `H0853`),
 * which say nothing of one concept. Once per reader.
 */
function spreadOf(reader: PackReader): Promise<Spread> {
  let found = spreads.get(reader)
  if (found === undefined) {
    found = reader.mapsOf(['xmap'], { coreOnly: true }).then((m) => {
      const lists = Object.entries(m.xmap?.core.strongs ?? {}).filter(([id]) => id.startsWith('tw:'))
      const concepts = new Map<string, number>()
      for (const [, keys] of lists) for (const k of new Set(keys)) concepts.set(k, (concepts.get(k) ?? 0) + 1)
      return { drop: new Set([...concepts].filter(([, n]) => n > lists.length * 0.02).map(([k]) => k)), concepts }
    })
    spreads.set(reader, found)
  }
  return found
}

/**
 * The Strong keys the xmap lists for a concept (`strongs`) without the catch-all keys (R10b), ranked by use and specificity (R10d):
 * `log1p(occurrences) / conceptsListing` descending (occurrences: the sum of the `strong` counts over the books; conceptsListing: how many
 * tW concepts list the key), ties in code-point order. Empty when none
 * is left or the xmap is not installed. Callers take the first 3. Reusable by the rules.
 */
export async function strongsOf(reader: PackReader, conceptId: string): Promise<string[]> {
  const core = (await reader.mapsOf(['xmap'], { coreOnly: true })).xmap?.core
  const { drop, concepts } = await spreadOf(reader)
  const keys = (core?.strongs?.[conceptId] ?? []).filter((k) => !drop.has(k))
  const total = (k: string): number => [...(core?.strong.rows.get(k)?.values() ?? [])].reduce((n, [c]) => n + c, 0)
  const score = (k: string): number => Math.log1p(total(k)) / Math.max(1, concepts.get(k) ?? 1)
  return [...keys].sort((x, y) => score(y) - score(x) || (x < y ? -1 : x > y ? 1 : 0))
}

export function checkIds(reader: PackReader, ids: string[]): Promise<IdCheck[]> {
  const verses = new Map<string, Promise<Map<string, Set<number>> | undefined>>()
  const versesOf = (book: string) => {
    if (!verses.has(book)) {
      verses.set(
        book,
        reader.book(book).then((m) => (m === undefined ? undefined : new Map(m.texts.map((t) => [t.res, verseSet(book, t.events as Events)] as const)))),
      )
    }
    return verses.get(book)!
  }
  let names: Promise<Map<string, string[]>> | undefined
  const known = () => (names ??= reader.maps().then(namesById))
  let topicIds: Promise<Set<string>> | undefined
  const topics = () =>
    (topicIds ??= reader.mapsOf(['xtopics'], { coreOnly: true }).then((m) => new Set((m.xtopics?.core as { topics?: Map<string, unknown> } | undefined)?.topics?.keys() ?? [])))

  async function one(id: string): Promise<IdCheck> {
    const bad = (why: string): IdCheck => ({ id, ok: false, why })
    const good: IdCheck = { id, ok: true }
    const colon = id.indexOf(':')
    const kind = colon < 0 ? '' : id.slice(0, colon)
    const rest = id.slice(colon + 1)
    switch (kind) {
      case 'verse': {
        const m = /^(\S+) ([a-z0-9]{3}) (\d+):(\d+)$/.exec(rest)
        if (m === null) return bad('not a verse id')
        const [, res, book, c, v] = m
        if (!isBook(book)) return bad(`not a book: ${book}`)
        const texts = await versesOf(book)
        if (texts === undefined) return bad(`book ${book} is not installed`)
        const key = [...texts.keys()].find((k) => k === res || lastPart(k) === res)
        if (key === undefined) return bad(`no text ${res} in ${book} (has ${[...texts.keys()].join(', ')})`)
        return texts.get(key)!.has(verseId(book, Number(c), Number(v))) ? good : bad(`${book} ${c}:${v} is not in ${key}`)
      }
      case 'note':
      case 'question':
      case 'link': {
        const m = /^([a-z0-9]{3})\/(.+)$/.exec(rest)
        if (m === null) return bad(`not a ${kind} id`)
        const model = await reader.book(m[1]!)
        if (model === undefined) return bad(`book ${m[1]} is not installed`)
        const table = kind === 'note' ? model.notes : kind === 'question' ? model.questions : model.links
        if (table === undefined) return bad(`${m[1]} has no ${kind} table`)
        return table.rows.some((r) => r.id === m[2]) ? good : bad(`no row ${m[2]} in the ${kind} table of ${m[1]}`)
      }
      case 'section': {
        const hash = rest.lastIndexOf('#')
        if (hash < 0) return bad('no # in a section id')
        const a = await reader.article(rest.slice(0, hash), 'all')
        if (a.data === null) return bad(`no article ${rest.slice(0, hash)}`)
        return a.data.sections.some((s) => s.sid === rest.slice(hash + 1)) ? good : bad(`no section ${rest.slice(hash + 1)} in ${rest.slice(0, hash)}`)
      }
      case 'concept':
        return (await known()).has(rest) ? good : bad(`the maps do not name ${rest}`)
      case 'rendering': {
        const slash = rest.indexOf('/')
        if (slash < 0) return bad('not a rendering id')
        const a = await reader.renderings({ strong: rest.slice(0, slash) })
        if (a.data === null) return bad(`no renderings for ${rest.slice(0, slash)}`)
        return a.data.renderings.some((r) => r.text === rest.slice(slash + 1)) ? good : bad(`${rest.slice(0, slash)} has no rendering ${rest.slice(slash + 1)}`)
      }
      case 'book':
        return isBook(rest) ? good : bad(`not a book code: ${rest}`)
      case 'topic':
        return (await topics()).has(rest) ? good : bad(`no topic ${rest} in xtopics`)
      default:
        return bad('unknown id kind')
    }
  }
  return Promise.all(ids.map(one))
}

/** Whether the args of a call parse and name things that exist: passage refs with `parsePassage`, concept and article ids in the maps and articles. */
export async function checkCall(reader: PackReader, call: Call): Promise<IdCheck[]> {
  const label = `${call.query} ${JSON.stringify(call.args)}`
  const ok: IdCheck[] = [{ id: label, ok: true }]
  const fail = (why: string): IdCheck[] => [{ id: label, ok: false, why }]
  const a = call.args
  switch (call.query) {
    case 'passage':
    case 'context': {
      try {
        parsePassage(String(a.ref))
      } catch {
        return fail(`not a reference: ${String(a.ref)}`)
      }
      return ok
    }
    case 'concept':
      return (await checkIds(reader, [`concept:${String(a.id)}`])).map((c) => ({ ...c, id: label }))
    case 'article': {
      const r = await reader.article(String(a.id), 'all')
      if (r.data === null) return fail(`no article ${String(a.id)}`)
      return a.section === undefined || r.data.sections.some((s) => s.sid === a.section) ? ok : fail(`no section ${String(a.section)}`)
    }
    case 'renderings':
      if (typeof a.strong === 'string') return /^[GH]\d{1,5}[a-z]?$/.test(a.strong) ? ok : fail('not a Strong number')
      return isBook(a.book) && Number.isInteger(a.word) ? ok : fail('renderings needs {strong} or {book, word}')
    case 'search':
      return typeof a.text === 'string' && a.text.trim() !== '' ? ok : fail('search needs text')
    case 'topics':
      if (a.category !== undefined && !CATEGORIES.includes(String(a.category))) return fail(`not a category: ${String(a.category)}`)
      if (a.book !== undefined && !isBook(a.book)) return fail(`not a book: ${String(a.book)}`)
      return ok
    case 'books': {
      const id = a.article ?? a.concept
      if ((a.article === undefined) === (a.concept === undefined) || typeof id !== 'string') return fail('books needs exactly one of article and concept')
      if (a.concept !== undefined && /^[GH]\d{1,5}[a-z]?$/.test(id)) return ok
      return (await checkIds(reader, [`concept:${id}`])).map((c) => ({ ...c, id: label }))
    }
    default:
      return fail('unknown query')
  }
}

/** Every id of a question file: its pieces, and the calls its `expect` holds. */
export async function checkFile(reader: PackReader, text: string): Promise<{ line: number; q: string; check: IdCheck }[]> {
  const out: { line: number; q: string; check: IdCheck }[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  for (const [i, l] of lines.entries()) {
    const item = JSON.parse(l) as { q: string; expect?: { call?: Call; choose?: Call[]; search?: true }; pieces?: string[] }
    if (item.expect === undefined || (item.expect.call === undefined && item.expect.choose === undefined && item.expect.search !== true)) {
      out.push({ line: i + 1, q: item.q, check: { id: 'expect', ok: false, why: 'expect has none of call, choose and search' } })
      continue
    }
    const calls = item.expect.call !== undefined ? [item.expect.call] : (item.expect.choose ?? [])
    const checks = [...(await checkIds(reader, item.pieces ?? [])), ...(await Promise.all(calls.map((c) => checkCall(reader, c)))).flat()]
    for (const check of checks) out.push({ line: i + 1, q: item.q, check })
  }
  return out
}

if (process.argv[1]?.endsWith('check-ids.ts')) {
  const arg = (name: string): string | undefined => process.argv[process.argv.indexOf(`--${name}`) + 1]
  const lang = arg('lang')
  const file = arg('file')
  if (lang === undefined || file === undefined) throw new Error('usage: bun eval/check-ids.ts --lang es-419 --file <jsonl>')
  const { reader } = await installPacks(lang)
  const results = await checkFile(reader, readFileSync(file, 'utf8'))
  const failed = results.filter((r) => !r.check.ok)
  for (const r of failed) console.log(`line ${r.line} (${r.q}): ${r.check.id}: ${r.check.why}`)
  console.log(`${results.length} ids checked, ${failed.length} failed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}
