/**
 * The lexicon segment of format 3 (`spec/cddl/lex.cddl`): one language, one group of entries (the Strong numbers of one
 * thousand: `G5` holds G5000 to G5999).
 *
 * - {@link extractLexicon} reads the Greek and the Hebrew lexicon of a language from a {@link RowSource} and groups their entries.
 * - {@link lexSegment} turns the entries of one group into the segment, the same bytes for the same entries.
 *
 * The reader of the segment is `read/lex.ts`. No Node module is used.
 *
 * ## The rows
 *
 * - A lexicon is a resource whose Door43 subject is `Greek Lexicon` (`ugl`) or `Hebrew Lexicon` (`uhl`). Its `sot` rows are
 *   keyed `{res}/content/{n}.json`: the file of the Strong number `n`, `{brief, entries, long}`. A homonym file holds more
 *   than one entry (`G127` and `G127a`). The rows `{res}/domains/{code}.json` (the semantic domains) are **not part of
 *   `lex` in phase 1**: they are left out and one line in the report says how many.
 * - **Strong** is kept as published (`G976`, `H0001`, `G127a`, `H0138b`). The number is the digits after the letter; the
 *   letters after them only tell homonyms apart. The group is the letter and the thousands of the number
 *   (`G976` is `G0`, `H0001` is `H0`, `G5485` is `G5`, `H8674` is `H8`).
 * - **brief and long** belong to the file, so every entry of the file gets a copy of both.
 * - **Nothing is dropped** for being a placeholder (`[Glosses - es]`, `NEW NOTE`) or empty: the report only counts them.
 * - **refs** of a sense are `{BOOK: "ch:v,v;ch:v"}`: `;` ends a chapter's verses, `,` separates verses, a dash makes a range
 *   (`3:1-4`, and `3:1-4:2` across chapters). Each verse, and each dash range, is one `[from, to]` range of verse ids. The
 *   Hebrew lexicon numbers verses as the Hebrew Bible does, and the ranges are in the UHB's numbering
 *   (`hebrewNumbering.ts`). A reference that cannot be read (a book that is not one of the 66, a form that is none of these) is
 *   kept out of `refs` and counted in `issues`, one line for each entry.
 */
import type { CborValue } from '../codec/cbor'
import { compareCodePoints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { isMap, isUint as isCount } from '../codec/values'
import { BOOKS, verseId } from '../ids'
import type { LexEntry, LexSense } from '../model'
import type { ResourceRef, RowSource } from '../source/rows'
import { fromHebrewNumbering } from './hebrewNumbering'

const GREEK_SUBJECT = 'Greek Lexicon'
const HEBREW_SUBJECT = 'Hebrew Lexicon'

const STRONG = /^([GH])([0-9]+)/
const CONTENT_PATH = /^content\/[0-9]+\.json$/
const DOMAINS_PATH = /^domains\/[^/]+\.json$/
/** A text that stands where a translator's text should be. */
const PLACEHOLDER = /\[Glosses[^\]]*\]|NEW NOTE/

const BOOK_CODES: ReadonlySet<string> = new Set(BOOKS)

// Strong numbers and groups

/** The letter and the number of a Strong number as published (`G127a` is `['G', 127]`), or `null`. */
export function parseStrong(strong: string): [letter: 'G' | 'H', number: number] | null {
  const m = STRONG.exec(strong)
  if (m === null) return null
  const number = Number(m[2])
  return Number.isSafeInteger(number) ? [m[1] as 'G' | 'H', number] : null
}

/** The group of a Strong number: its letter and the thousands of its number (`G976` is `G0`, `H0001` is `H0`), or `null`. */
export function lexGroupOf(strong: string): string | null {
  const parsed = parseStrong(strong)
  return parsed === null ? null : `${parsed[0]}${Math.floor(parsed[1] / 1000)}`
}

/** Groups in the order of their letter and then of their number (`G9` before `G10`). */
const compareGroups = (a: string, b: string): number => compareCodePoints(a[0], b[0]) || Number(a.slice(1)) - Number(b.slice(1))

// References

/** `3:1,4-6` after the chapter: verses and runs of verses. */
const GROUP = /^([0-9]{1,3}):([0-9]{1,3}(?:-[0-9]{1,3})?(?:,[0-9]{1,3}(?:-[0-9]{1,3})?)*)$/
/** `3:1-4:2`: a run from a verse of one chapter to a verse of another. */
const ACROSS = /^([0-9]{1,3}):([0-9]{1,3})-([0-9]{1,3}):([0-9]{1,3})$/

/**
 * The ranges of a reference text of one book (`2:17,44` is the ranges of 2:17 and of 2:44), in the original's numbering, or
 * `null` when the text is not one the lexicon writes. `code` is the book's USFM code in lowercase; `hebrew` says that the text
 * numbers verses as the Hebrew Bible does.
 */
export function readRefs(code: string, text: string, hebrew: boolean): [number, number][] | null {
  const place = (chapter: number, verse: number): number => {
    const ours = hebrew ? fromHebrewNumbering(code, { chapter, verse }) : { chapter, verse }
    return verseId(code, ours.chapter, ours.verse)
  }
  const out: [number, number][] = []
  try {
    for (const raw of text.split(';')) {
      const group = raw.replace(/\s+/g, '')
      let m: RegExpExecArray | null
      if ((m = GROUP.exec(group))) {
        for (const item of m[2].split(',')) {
          const [a, b] = item.split('-').map(Number)
          const from = place(Number(m[1]), a)
          const to = place(Number(m[1]), b ?? a)
          if (to < from) return null
          out.push([from, to])
        }
      } else if ((m = ACROSS.exec(group))) {
        const from = place(Number(m[1]), Number(m[2]))
        const to = place(Number(m[3]), Number(m[4]))
        if (to < from) return null
        out.push([from, to])
      } else {
        return null
      }
    }
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
  return out
}

// Rows

const text = (value: unknown, where: string, name: string): string => {
  if (typeof value !== 'string') throw new Error(`${where}: ${name} is not text`)
  return value
}

const texts = (value: unknown, where: string, name: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error(`${where}: ${name} is not a list of text`)
  return [...(value as string[])]
}

const SENSE_TEXTS = ['code', 'definition', 'domain', 'domainCode', 'comments', 'etymology', 'lang', 'definitionLang'] as const
const ENTRY_TEXTS = ['source', 'review'] as const

type Counts = { placeholders: number; empty: number; unreadable: number }

/** A sense as the lexicon publishes it. `problems` receives a phrase for what the builder worked around. */
function readSense(value: unknown, where: string, hebrew: boolean, problems: string[], counts: Counts): LexSense {
  if (!isMap(value)) throw new Error(`${where}: a sense is not an object`)
  const sense: LexSense = {}
  const unknown: string[] = []
  const unreadable: string[] = []
  for (const [name, item] of Object.entries(value)) {
    if ((SENSE_TEXTS as readonly string[]).includes(name)) {
      ;(sense as Record<string, unknown>)[name] = text(item, where, `the ${name} of a sense`)
    } else if (name === 'glosses') {
      sense.glosses = texts(item, where, 'the glosses of a sense')
    } else if (name === 'refs') {
      if (!isMap(item)) throw new Error(`${where}: the refs of a sense are not an object`)
      const ranges: [number, number][] = []
      for (const [book, ref] of Object.entries(item)) {
        const found = typeof ref === 'string' && BOOK_CODES.has(book.toLowerCase()) ? readRefs(book.toLowerCase(), ref, hebrew) : null
        if (found === null) unreadable.push(`${book} ${JSON.stringify(ref)}`)
        else ranges.push(...found)
      }
      if (ranges.length > 0) sense.refs = ranges
    } else {
      unknown.push(name)
    }
  }
  if (unknown.length > 0) problems.push(`a sense has ${unknown.length === 1 ? 'a key' : 'keys'} ${unknown.map((name) => JSON.stringify(name)).join(', ')} that lex.cddl does not have: left out`)
  if (unreadable.length > 0) {
    counts.unreadable += unreadable.length
    problems.push(`${unreadable.length} ${unreadable.length === 1 ? 'reference' : 'references'} cannot be read and ${unreadable.length === 1 ? 'is' : 'are'} left out of refs (${unreadable.slice(0, 3).join(', ')}${unreadable.length > 3 ? ', ...' : ''})`)
  }
  if ((sense.definition === undefined || sense.definition === '') && (sense.glosses === undefined || sense.glosses.length === 0)) counts.empty++
  const written = [sense.definition, sense.comments, sense.etymology, ...(sense.glosses ?? [])]
  if (written.some((item) => item !== undefined && PLACEHOLDER.test(item))) counts.placeholders++
  return sense
}

/** The lexicon's resources of a subject, by key: the first is used, and `issues` says when there are more. */
function pick(resources: ResourceRef[], subject: string, issues: string[]): ResourceRef | undefined {
  const found = resources.filter((ref) => ref.kind === subject).sort((a, b) => compareCodePoints(a.key, b.key))
  if (found.length > 1) issues.push(`${found.length} resources of ${subject} (${found.map((ref) => ref.key).join(', ')}); ${found[0].key} is used`)
  return found[0]
}

/**
 * The entries of the Greek and the Hebrew lexicon of a language, by group (`G0`, `G1`, ... and `H0`, `H1`, ..., ordered by
 * letter and number). Each group's entries are ordered by Strong number and then by their place in the source.
 *
 * - `issues` receives a line for everything the builder worked around, one for each entry (a reference that cannot be read, a key
 *   `lex.cddl` does not have), and one for each resource: the rows of domains left out, the files without `entries` (a
 *   lexicon that publishes only `brief` and `long` gives no entry), the placeholders and the senses without definition or
 *   glosses (kept as published), the Strong numbers that two entries share, and a subject that two resources have.
 * - A row that is not what format 2.0 writes (a `content` file that is not an object, an entry without a Strong number of the
 *   resource's letter or without a lemma, a field of another type) throws `Error` naming it.
 */
export async function extractLexicon(source: RowSource, lang: string, issues: string[] = []): Promise<Map<string, LexEntry[]>> {
  const resources = await source.resources(lang)
  const found: { group: string; number: number; order: number; entry: LexEntry }[] = []
  let order = 0

  for (const [subject, letter, hebrew] of [[GREEK_SUBJECT, 'G', false], [HEBREW_SUBJECT, 'H', true]] as const) {
    const ref = pick(resources, subject, issues)
    if (ref === undefined) continue
    const counts: Counts = { placeholders: 0, empty: 0, unreadable: 0 }
    const seen = new Set<string>()
    const shared = new Set<string>()
    let domains = 0
    let withoutEntries = 0
    let entryCount = 0

    for await (const row of source.rows({ lang, resource: ref.key, layer: 'sot' })) {
      const path = row.key.startsWith(`${ref.key}/`) ? row.key.slice(ref.key.length + 1) : undefined
      if (path !== undefined && DOMAINS_PATH.test(path)) {
        domains++
        continue
      }
      if (path === undefined || !CONTENT_PATH.test(path)) {
        issues.push(`${row.key} is not the key of a lexicon file of ${ref.key}: left out`)
        continue
      }
      if (!isMap(row.value)) throw new Error(`${row.key}: the file is not an object`)
      if (row.value.entries === undefined) {
        withoutEntries++
        continue
      }
      if (!Array.isArray(row.value.entries)) throw new Error(`${row.key}: entries is not a list`)
      const brief = row.value.brief === undefined ? undefined : text(row.value.brief, row.key, 'brief')
      const long = row.value.long === undefined ? undefined : text(row.value.long, row.key, 'long')

      for (const [i, item] of row.value.entries.entries()) {
        const where = `${row.key}, entry ${i}`
        if (!isMap(item)) throw new Error(`${where} is not an object`)
        const strong = text(item.strong, where, 'strong')
        const parsed = parseStrong(strong)
        if (parsed === null || parsed[0] !== letter) throw new Error(`${where}: the Strong number ${JSON.stringify(strong)} is not a ${letter} followed by a number`)
        const label = `${strong} (${ref.key})`
        const problems: string[] = []
        const entry: LexEntry = { res: ref.key, strong, lemma: text(item.lemma, where, 'lemma'), senses: [] }
        if (brief !== undefined) entry.brief = brief
        if (long !== undefined) entry.long = long
        if (!Array.isArray(item.senses)) throw new Error(`${where}: senses is not a list`)
        const unknown: string[] = []
        for (const [name, value] of Object.entries(item)) {
          if (name === 'strong' || name === 'lemma' || name === 'senses') continue
          if (name === 'pos' || name === 'notes') entry[name] = texts(value, where, name)
          else if (name === 'aramaic') {
            if (typeof value !== 'boolean') throw new Error(`${where}: aramaic is not true or false`)
            entry.aramaic = value
          } else if ((ENTRY_TEXTS as readonly string[]).includes(name)) (entry as Record<string, unknown>)[name] = text(value, where, name)
          else unknown.push(name)
        }
        if (unknown.length > 0) problems.push(`has ${unknown.length === 1 ? 'a key' : 'keys'} ${unknown.map((name) => JSON.stringify(name)).join(', ')} that lex.cddl does not have: left out`)
        entry.senses = item.senses.map((sense, n) => readSense(sense, `${where}, sense ${n}`, hebrew, problems, counts))
        if (entry.notes?.some((note) => PLACEHOLDER.test(note))) counts.placeholders++
        if (problems.length > 0) issues.push(`${label}: ${problems.join('; ')}`)

        if (seen.has(strong)) shared.add(strong)
        seen.add(strong)
        entryCount++
        found.push({ group: `${parsed[0]}${Math.floor(parsed[1] / 1000)}`, number: parsed[1], order: order++, entry })
      }
    }

    if (domains > 0) issues.push(`${ref.key}: ${domains} rows of domains are not part of lex in phase 1: left out`)
    if (withoutEntries > 0) issues.push(`${ref.key}: ${withoutEntries} files have no entries (only brief and long, which lex.cddl cannot hold without a lemma): left out`)
    if (counts.placeholders > 0 || counts.empty > 0) {
      issues.push(`${ref.key}: ${counts.placeholders} senses or notes hold a placeholder ([Glosses - es], NEW NOTE) and ${counts.empty} senses have no definition and no glosses: kept as published`)
    }
    if (shared.size > 0) issues.push(`${ref.key}: ${shared.size} Strong numbers are in more than one entry (${[...shared].slice(0, 3).join(', ')}${shared.size > 3 ? ', ...' : ''}): all kept`)
    if (entryCount === 0 && withoutEntries === 0 && domains === 0) issues.push(`${ref.key}: the lexicon has no entries`)
  }

  found.sort((a, b) => compareGroups(a.group, b.group) || a.number - b.number || a.order - b.order)
  const groups = new Map<string, LexEntry[]>()
  for (const { group, entry } of found) {
    const list = groups.get(group)
    if (list === undefined) groups.set(group, [entry])
    else list.push(entry)
  }
  return groups
}

/**
 * The `res` of a lexicon segment: the resources of `entries`, as `[key, release tag]` (the tag is the stamp before the `#`),
 * sorted by key. Throws `Error` for an entry of a resource `refs` does not list.
 */
export function lexResources(entries: LexEntry[], refs: ResourceRef[]): [string, string][] {
  const keys = [...new Set(entries.map((entry) => entry.res))].sort(compareCodePoints)
  return keys.map((key): [string, string] => {
    const ref = refs.find((candidate) => candidate.key === key)
    if (ref === undefined) throw new Error(`The resource ${JSON.stringify(key)} is not one of the resources given`)
    return [key, ref.stamp.split('#')[0]]
  })
}

// Segment

const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

function encodeSense(sense: LexSense, where: string): CborValue {
  const out: Record<string, CborValue> = {}
  for (const name of SENSE_TEXTS) {
    const value = sense[name]
    if (value === undefined) continue
    if (typeof value !== 'string') throw new Error(`${where}: the ${name} of a sense is not text`)
    out[name] = value
  }
  if (sense.glosses !== undefined) {
    if (!isTexts(sense.glosses)) throw new Error(`${where}: the glosses of a sense are not a list of text`)
    out.glosses = [...sense.glosses]
  }
  if (sense.refs !== undefined) {
    if (!Array.isArray(sense.refs)) throw new Error(`${where}: the refs of a sense are not a list`)
    out.refs = sense.refs.map((range): CborValue => {
      if (!Array.isArray(range) || range.length !== 2 || !isCount(range[0]) || !isCount(range[1])) throw new Error(`${where}: a ref is not [from, to], two verse ids`)
      if (range[0] > range[1]) throw new Error(`${where}: a ref runs backwards (${range[0]} to ${range[1]})`)
      return [range[0], range[1]]
    })
  }
  return out
}

/**
 * The segment of the entries of one group (`lex.cddl`): the table `entries` (required), ordered by the number of the Strong
 * number whatever the order given, and entries of the same number in the order given. `res` is `[resource key, release tag]`
 * for each resource of the entries ({@link lexResources}); an entry names its resource by the index in it. The same
 * entries give the same segment: a key that an entry lacks is left out.
 *
 * Throws `Error` when the entries are not ones the segment can hold: a group that is not a letter `G` or `H` and a number, no
 * resource or one twice, an entry of a resource `res` does not list, an entry whose Strong number is of another group, a value of
 * another type than the schema's, or a ref that is not a range of verse ids.
 */
export function lexSegment(lang: string, group: string, res: [string, string][], entries: LexEntry[]): Segment {
  if (!/^[GH][0-9]+$/.test(group)) throw new Error(`The group ${JSON.stringify(group)} is not a letter G or H and a number`)
  if (res.length === 0) throw new Error('The header needs at least one resource (res)')
  const resIndex = new Map<string, number>()
  res.forEach(([key], i) => {
    if (resIndex.has(key)) throw new Error(`The resource ${JSON.stringify(key)} is in res twice`)
    resIndex.set(key, i)
  })

  const numbered = entries.map((entry, order) => {
    const parsed = typeof entry.strong === 'string' ? parseStrong(entry.strong) : null
    if (parsed === null) throw new Error(`The entry ${order} has no Strong number (a G or an H and a number)`)
    return { entry, number: parsed[1], order, group: `${parsed[0]}${Math.floor(parsed[1] / 1000)}` }
  })
  numbered.sort((a, b) => a.number - b.number || a.order - b.order)

  const encoded = numbered.map(({ entry, group: own }): CborValue => {
    const where = `The entry ${JSON.stringify(entry.strong)}`
    if (own !== group) throw new Error(`${where} is of the group ${own}, not ${group}`)
    const index = resIndex.get(entry.res)
    if (index === undefined) throw new Error(`${where} is of a resource that res does not list`)
    if (typeof entry.lemma !== 'string') throw new Error(`${where} has no lemma`)
    if (!Array.isArray(entry.senses)) throw new Error(`${where} has no list of senses`)

    const out: Record<string, CborValue> = {
      res: index,
      strong: entry.strong,
      lemma: entry.lemma,
      senses: entry.senses.map((sense) => encodeSense(sense, where)),
    }
    for (const key of ['brief', 'long', 'source', 'review'] as const) {
      const value = entry[key]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new Error(`${where}: ${key} is not text`)
      out[key] = value
    }
    for (const key of ['pos', 'notes'] as const) {
      const value = entry[key]
      if (value === undefined) continue
      if (!isTexts(value)) throw new Error(`${where}: ${key} is not a list of text`)
      out[key] = [...value]
    }
    if (entry.aramaic !== undefined) {
      if (typeof entry.aramaic !== 'boolean') throw new Error(`${where}: aramaic is not true or false`)
      out.aramaic = entry.aramaic
    }
    return out
  })

  return {
    h: { class: 'lex', v: 1, tables: { entries: [1, true] }, lang, group, res: res.map(([key, tag]) => [key, tag]) },
    t: { entries: encoded },
  }
}
