/**
 * The reader of the Open Bible Stories segment (`spec/cddl/obs.cddl`): a {@link Segment} that `readSegment` has accepted, back
 * into an {@link ObsModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a table of the wrong
 * shape, a column of another length, a number outside its string table or its resources, a story number twice, a story without
 * frames, a frame twice in a story, a `has` that does not match the values of a column. It drops no table: the notes,
 * questions, links, study notes and study questions the segment has are all in the model. It imports no builder code and no
 * Node module.
 */
import { ColumnError, decodeBits, decodeTexts, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap, isUint } from '../codec/values'
import type { ObsFrame, ObsHelpRow, ObsHelpTable, ObsModel, ObsStory } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the obs segment is malformed: ${what}`)
}


function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) bad(`${what} is not a list`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad(`${what} is not text`)
  return value
}

function numbers(value: unknown, what: string): number[] {
  if (!(value instanceof Uint8Array)) bad(`${what} is not a byte string`)
  return decodeUvarints(value)
}

// Stories

function readStory(value: unknown, i: number, res: [string, string][]): ObsStory {
  const what = `stories[${i}]`
  const fields = map(value, what)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)
  if (!isUint(fields.n) || fields.n < 1 || fields.n > 50) bad(`${what}.n is not a story number (an integer from 1 to 50)`)
  if (!Array.isArray(fields.frames) || fields.frames.length === 0) bad(`${what}.frames is not a list with at least one frame`)

  const numbersSeen = new Set<number>()
  const frames = fields.frames.map((item, k): ObsFrame => {
    const here = `${what}.frames[${k}]`
    const frame = map(item, here)
    if (!isUint(frame.n) || frame.n > 99) bad(`${here}.n is not a frame number (an integer from 0 to 99)`)
    if (numbersSeen.has(frame.n)) bad(`${what} has the frame ${frame.n} twice`)
    numbersSeen.add(frame.n)
    const out: ObsFrame = { n: frame.n, text: text(frame.text, `${here}.text`) }
    if (hasOwn(frame, 'image')) out.image = text(frame.image, `${here}.image`)
    return out
  })

  const story: ObsStory = { res: res[fields.res][0], n: fields.n, title: text(fields.title, `${what}.title`), frames }
  if (hasOwn(fields, 'reference')) story.reference = text(fields.reference, `${what}.reference`)
  if (hasOwn(fields, 'refs')) {
    story.refs = list(fields.refs, `${what}.refs`).map((range, k): [number, number] => {
      if (!Array.isArray(range) || range.length !== 2 || !isUint(range[0]) || !isUint(range[1])) bad(`${what}.refs[${k}] is not [from, to], two verse ids`)
      if (range[0] > range[1]) bad(`${what}.refs[${k}] runs backwards (${range[0]} to ${range[1]})`)
      return [range[0], range[1]]
    })
  }
  return story
}

// Helps

/**
 * A column of `n` rows (`common.cddl`, `column`): for each row its value, or `undefined` for a row the column lacks. The
 * values are text (`strings`, `texts`; a `uints` column gives the number as text, the model has no numbers) or true and
 * false (`flags`). `has` says which rows have a value and the column lists only those.
 */
function readColumn(value: unknown, n: number, what: string, table: string[]): (string | boolean | undefined)[] {
  const fields = map(value, what)
  const kinds = ['strings', 'texts', 'flags', 'uints'].filter((kind) => fields[kind] !== undefined)
  if (kinds.length !== 1) bad(`${what} has ${kinds.length} of strings, texts, flags and uints, and it needs one`)
  const kind = kinds[0]

  let present: boolean[] = new Array<boolean>(n).fill(true)
  if (fields.has !== undefined) {
    if (!(fields.has instanceof Uint8Array)) bad(`${what}.has is not a byte string`)
    present = decodeBits(fields.has, n)
  }
  const count = present.reduce((sum, has) => sum + (has ? 1 : 0), 0)
  const length = (found: number, name: string) => {
    if (found !== count) bad(`${what}.${name} has ${found} values and ${count} rows have one`)
  }

  let values: (string | boolean)[]
  if (kind === 'strings') {
    const nums = numbers(fields.strings, `${what}.strings`)
    length(nums.length, 'strings')
    values = nums.map((number) => {
      const item = table[number]
      if (item === undefined) bad(`${what}.strings names the string ${number}, and the table has ${table.length}`)
      return item
    })
  } else if (kind === 'texts') {
    const texts = map(fields.texts, `${what}.texts`)
    if (!(texts.utf8 instanceof Uint8Array) || !(texts.len instanceof Uint8Array)) bad(`${what}.texts needs utf8 and len as byte strings`)
    values = decodeTexts({ utf8: texts.utf8, len: texts.len })
    length(values.length, 'texts')
  } else if (kind === 'flags') {
    if (!(fields.flags instanceof Uint8Array)) bad(`${what}.flags is not a byte string`)
    values = decodeBits(fields.flags, count)
  } else {
    values = numbers(fields.uints, `${what}.uints`).map(String)
    length(values.length, 'uints')
  }

  let next = 0
  return present.map((has) => (has ? values[next++] : undefined))
}

/** The canonical text of a frame id, as `build/obs.ts` writes it (`10:3`, and `10:intro` for frame 0). */
function frameText(frame: number): string {
  const story = Math.floor(frame / 100)
  const n = frame % 100
  return n === 0 ? `${story}:intro` : `${story}:${n}`
}

/** One of the tables of helps (`obs-helps` in `obs.cddl`). */
function readHelps(value: unknown, name: string, table: string[], res: [string, string][]): ObsHelpTable {
  const what = `the table "${name}"`
  const fields = map(value, what)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)
  if (!isUint(fields.n)) bad(`${what}.n is not a count`)
  const n = fields.n

  const idFields = map(fields.id, `${what}.id`)
  let ids: string[]
  if ((idFields.ascii4 !== undefined) === (idFields.strings !== undefined)) bad(`${what}.id has both ascii4 and strings, or neither: it has one`)
  if (idFields.ascii4 !== undefined) {
    const bytes = idFields.ascii4
    if (!(bytes instanceof Uint8Array) || bytes.length !== 4 * n) bad(`${what}.id.ascii4 is not ${4 * n} bytes`)
    if (bytes.some((byte) => byte > 0x7f)) bad(`${what}.id.ascii4 has a byte that is not ASCII`)
    ids = Array.from({ length: n }, (_, i) => String.fromCharCode(...bytes.subarray(4 * i, 4 * i + 4)))
  } else {
    const nums = numbers(idFields.strings, `${what}.id.strings`)
    if (nums.length !== n) bad(`${what}.id.strings has ${nums.length} numbers and the table has ${n} rows`)
    ids = nums.map((number) => {
      const id = table[number]
      if (id === undefined) bad(`${what}.id.strings names the string ${number}, and the table has ${table.length}`)
      return id
    })
  }
  const seen = new Set<string>()
  for (const id of ids) {
    if (id === '') bad(`${what} has an empty id`)
    if (seen.has(id)) bad(`${what} has the id ${JSON.stringify(id)} twice`)
    seen.add(id)
  }

  const frames = numbers(fields.frame, `${what}.frame`)
  if (frames.length !== n) bad(`${what}.frame has ${frames.length} numbers and the table has ${n} rows`)
  frames.forEach((frame, i) => {
    if (!isUint(frame)) bad(`${what}.frame: row ${i} has the value ${frame}`)
  })

  const refText = new Map<number, string>()
  if (fields.refText !== undefined) {
    for (const [k, item] of list(fields.refText, `${what}.refText`).entries()) {
      if (!Array.isArray(item) || item.length !== 2) bad(`${what}.refText[${k}] is not [row, text]`)
      const [row, reference] = item
      if (!isUint(row) || row >= n) bad(`${what}.refText[${k}] names the row ${String(row)}, and the table has ${n}`)
      if (typeof reference !== 'string') bad(`${what}.refText[${k}] is not text`)
      if (refText.has(row)) bad(`${what}.refText names the row ${row} twice`)
      refText.set(row, reference)
    }
  }

  let concepts: (string | boolean | undefined)[] | undefined
  if (fields.concept !== undefined) {
    concepts = readColumn(fields.concept, n, `${what}.concept`, table)
    if (concepts.some((concept) => typeof concept === 'boolean')) bad(`${what}.concept has flags, and a concept is text`)
  }
  const colFields = map(fields.cols, `${what}.cols`)
  const columns = Object.keys(colFields).map((column): [string, (string | boolean | undefined)[]] => [
    column,
    readColumn(colFields[column], n, `${what}.cols[${JSON.stringify(column)}]`, table),
  ])

  const rows: ObsHelpRow[] = ids.map((id, i) => {
    // `fromEntries` defines every key, a column named "__proto__" included.
    const cols = Object.fromEntries(columns.flatMap(([column, values]) => (values[i] === undefined ? [] : [[column, values[i]!]])))
    const row: ObsHelpRow = { id, ref: refText.get(i) ?? frameText(frames[i]), frame: frames[i], cols }
    const concept = concepts?.[i]
    if (typeof concept === 'string') row.concept = concept
    return row
  })
  return { res: res[fields.res][0], rows }
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const OBS_TABLES: Readonly<Record<string, number[]>> = {
  strings: [1],
  stories: [1],
  notes: [1],
  questions: [1],
  links: [1],
  'study-notes': [1],
  'study-questions': [1],
}

/** The tables of helps, by their name in the segment and their key in the model. */
const HELPS_TABLES = [
  ['notes', 'notes'],
  ['questions', 'questions'],
  ['links', 'links'],
  ['study-notes', 'studyNotes'],
  ['study-questions', 'studyQuestions'],
] as const

/**
 * The model of an Open Bible Stories segment: its header, its stories in the order the segment has them, and every table of
 * helps it has. A help row has `frame` (story × 100 + frame) and `ref`, the reference text (the canonical `10:3`, or the one
 * `refText` keeps). `res` of a story or a table is the key of its resource.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not an OBS segment or its tables are not what `obs.cddl` says.
 */
export function obsView(seg: Segment): ObsModel {
  try {
    const { h, t } = seg
    if (h.class !== 'obs') bad(`the class is "${h.class}"`)
    if (h.lang === undefined) bad('the header has no lang')
    if (h.res === undefined || h.res.length === 0) bad('the header has no resource (res)')
    const res = h.res

    if (!Array.isArray(t.strings) || !t.strings.every((item) => typeof item === 'string')) bad('the table "strings" is not a list of text')
    const table = t.strings as string[]

    const numbersSeen = new Set<number>()
    const stories = list(t.stories, 'the table "stories"').map((value, i) => {
      const story = readStory(value, i, res)
      if (numbersSeen.has(story.n)) bad(`the story ${story.n} is in the table twice`)
      numbersSeen.add(story.n)
      return story
    })

    const model: ObsModel = { lang: h.lang, res: res.map(([key, tag]): [string, string] => [key, tag]), stories }
    for (const [name, key] of HELPS_TABLES) {
      if (t[name] !== undefined) model[key] = readHelps(t[name], name, table, res)
    }
    return model
  } catch (error) {
    // A malformed column: a varint that is cut short or not minimal.
    if (error instanceof ColumnError) throw new FormatError('E_BODY', `the obs segment is malformed: ${error.message}`)
    throw error
  }
}
