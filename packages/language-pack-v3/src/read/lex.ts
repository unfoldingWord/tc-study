/**
 * The reader of the lexicon segment (`spec/cddl/lex.cddl`): a {@link Segment} that `readSegment` has accepted, back into the
 * group and its entries, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the table against the schema and rejects the segment with `E_BODY` at the first defect: a value of the wrong
 * type, a resource index outside the header's `res`, a Strong number of another group than the header's, a ref that is not
 * a range of verse ids. It imports no builder code and no Node module.
 */
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap, isUint } from '../codec/values'
import type { LexEntry, LexSense } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the lexicon segment is malformed: ${what}`)
}


function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad(`${what} is not text`)
  return value
}

/** A key of a map that may be missing: `undefined` when it is, else the value, which has to be text. */
function optionalText(fields: CborMap, key: string, what: string): string | undefined {
  return hasOwn(fields, key) ? text(fields[key], `${what}.${key}`) : undefined
}

function optionalTexts(fields: CborMap, key: string, what: string): string[] | undefined {
  if (!hasOwn(fields, key)) return undefined
  const value = fields[key]
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) bad(`${what}.${key} is not a list of text`)
  return [...(value as string[])]
}

const SENSE_TEXTS = ['code', 'definition', 'domain', 'domainCode', 'comments', 'etymology', 'lang', 'definitionLang'] as const

function readSense(value: unknown, what: string): LexSense {
  const fields = map(value, what)
  const sense: LexSense = {}
  for (const key of SENSE_TEXTS) {
    const item = optionalText(fields, key, what)
    if (item !== undefined) sense[key] = item
  }
  const glosses = optionalTexts(fields, 'glosses', what)
  if (glosses !== undefined) sense.glosses = glosses
  if (hasOwn(fields, 'refs')) {
    const refs = fields.refs
    if (!Array.isArray(refs)) bad(`${what}.refs is not a list`)
    sense.refs = refs.map((range, i): [number, number] => {
      if (!Array.isArray(range) || range.length !== 2 || !isUint(range[0]) || !isUint(range[1])) bad(`${what}.refs[${i}] is not [from, to], two verse ids`)
      if (range[0] > range[1]) bad(`${what}.refs[${i}] runs backwards (${range[0]} to ${range[1]})`)
      return [range[0], range[1]]
    })
  }
  return sense
}

/** The group a Strong number belongs to, or `undefined` when it is not a G or an H and a number. */
function groupOf(strong: string): string | undefined {
  const m = /^([GH])([0-9]+)/.exec(strong)
  if (m === null || !Number.isSafeInteger(Number(m[2]))) return undefined
  return `${m[1]}${Math.floor(Number(m[2]) / 1000)}`
}

function readEntry(value: unknown, i: number, group: string, res: [string, string][]): LexEntry {
  const what = `entries[${i}]`
  const fields = map(value, what)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)
  const strong = text(fields.strong, `${what}.strong`)
  const own = groupOf(strong)
  if (own === undefined) bad(`${what}.strong is ${JSON.stringify(strong)}, which is not a G or an H and a number`)
  if (own !== group) bad(`${what}.strong is ${JSON.stringify(strong)}, of the group ${own}, and the header's group is ${group}`)
  if (!Array.isArray(fields.senses)) bad(`${what}.senses is not a list`)

  const entry: LexEntry = {
    res: res[fields.res][0],
    strong,
    lemma: text(fields.lemma, `${what}.lemma`),
    senses: fields.senses.map((sense, n) => readSense(sense, `${what}.senses[${n}]`)),
  }
  for (const key of ['brief', 'long', 'source', 'review'] as const) {
    const item = optionalText(fields, key, what)
    if (item !== undefined) entry[key] = item
  }
  for (const key of ['pos', 'notes'] as const) {
    const item = optionalTexts(fields, key, what)
    if (item !== undefined) entry[key] = item
  }
  if (hasOwn(fields, 'aramaic')) {
    if (typeof fields.aramaic !== 'boolean') bad(`${what}.aramaic is not true or false`)
    entry.aramaic = fields.aramaic
  }
  return entry
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const LEX_TABLES: Readonly<Record<string, number[]>> = { entries: [1] }

/**
 * The group of a lexicon segment and its entries, in the order the segment has them. `res` of an entry is the key of its
 * resource (the header lists the release tag of each).
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not a lexicon segment or its table is not what `lex.cddl` says.
 */
export function lexView(seg: Segment): { group: string; entries: LexEntry[] } {
  const { h, t } = seg
  if (h.class !== 'lex') bad(`the class is "${h.class}"`)
  if (h.lang === undefined) bad('the header has no lang')
  if (h.group === undefined) bad('the header has no group')
  if (!/^[GH][0-9]+$/.test(h.group)) bad(`the group ${JSON.stringify(h.group)} is not a letter G or H and a number`)
  if (h.res === undefined || h.res.length === 0) bad('the header has no resource (res)')
  if (!Array.isArray(t.entries)) bad('the table "entries" is not a list')

  const group = h.group
  const res = h.res
  return { group, entries: t.entries.map((value, i) => readEntry(value, i, group, res)) }
}
