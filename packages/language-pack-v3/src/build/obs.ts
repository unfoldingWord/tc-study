/**
 * The Open Bible Stories segment of format 3 (`spec/cddl/obs.cddl`): one language, the stories with their frames, and the
 * helps that point to frames instead of verses.
 *
 * - {@link extractObs} reads the stories and the helps of a language from a {@link RowSource} into an {@link ObsModel}.
 * - {@link obsSegment} turns the model into the segment, the same bytes for the same model. All the short values of the helps
 *   share one string table, built as in the book segment (`book.ts`).
 *
 * The reader of the segment is `read/obs.ts`. No Node module is used.
 *
 * ## The rows (format 2.0)
 *
 * No part of a real language has OBS rows yet; the shapes are those the loaders write
 * (`resource-pipeline/src/loaders/ObsLoader.ts`, `obs/parseObsMarkdown.ts`, and the notes, questions and links loaders).
 *
 * - **Stories**: a resource whose Door43 subject is `Open Bible Stories`. Its `sot` rows are keyed `obs:{res}:{NN}` (`NN`
 *   from `01` to `50`), the value is `{content, timestamp, resourceKey, storyId}` and `content` is
 *   `{storyNumber, title, sourceReference, frames: [{frameNumber, imageUrl, resolvedSrc?, text}]}`. `resolvedSrc` (the
 *   image's absolute URL, which the loader works out) is dropped. The story number is the `NN` of the key.
 * - **Helps**: resources whose subjects are `TSV OBS Translation Notes`, `TSV OBS Translation Questions` and `TSV OBS
 *   Translation Words Links` (without `TSV` as well). The rows are as the book helps' (`bookHelps.ts`) with the book `obs`:
 *   `tn:{res}:obs:{story}` chunks (or the book row `tn:{res}:obs`), `tq:…`, `twl:{res}:obs`. Their `reference` is
 *   `story:frame`.
 * - **Study notes and study questions** have no rows in format 2.0: the model and the segment carry them
 *   (`studyNotes`, `studyQuestions`, the tables `study-notes` and `study-questions`), and {@link extractObs} never produces them.
 */
import type { CborValue } from '../codec/cbor'
import { compareCodePoints, encodeUvarints, stringTable } from '../codec/columns'
import type { Segment } from '../codec/container'
import { isMap, isUint as isCount } from '../codec/values'
import type { ObsHelpRow, ObsHelpTable, ObsModel, ObsStory } from '../model'
import type { ResourceRef, Row, RowSource } from '../source/rows'
import { columnPlans, encodeColumn, resIndexOf, type TablePart } from './book'
import { type HelpsKind, helpColumns, sourceRows, uniqueIds } from './bookHelps'

const STORIES_SUBJECT = 'Open Bible Stories'
const HELPS_SUBJECTS: Record<HelpsKind, string[]> = {
  notes: ['TSV OBS Translation Notes', 'OBS Translation Notes'],
  questions: ['TSV OBS Translation Questions', 'OBS Translation Questions'],
  links: ['TSV OBS Translation Words Links', 'OBS Translation Words Links'],
}
const HELPS_KINDS: readonly HelpsKind[] = ['notes', 'questions', 'links']
const PREFIXES: Record<HelpsKind, string> = { notes: 'tn', questions: 'tq', links: 'twl' }
/** The book code the helps rows of OBS carry in their keys. */
const OBS_BOOK = 'obs'

const DIGITS = /^[0-9]+$/
const FRAME_FACTOR = 100
/** The last story (1 to 50) and the last frame (0 to 99, so that `story × 100 + frame` names one frame). */
const MAX_STORY = 50
const MAX_FRAME = FRAME_FACTOR - 1

// Frames

/** `10:3`, `10:03`, `01:03`, `10:intro`, `10:front`, `10:0`: the story and the frame, without leading zeros. */
const FRAME_REF = /^0*([0-9]{1,3}):(?:0*([0-9]{1,2})|(intro|front))$/i

/**
 * The frame id a reference text names, `story × 100 + frame`, or `null` when the text is not `story:frame` with a story from 1
 * and a frame from 0 to 99 (`intro`, `front` and `0` as the frame all mean frame 0, the title or introduction of the story).
 */
export function parseFrameRef(text: string): number | null {
  const m = FRAME_REF.exec(text.trim())
  if (m === null) return null
  const story = Number(m[1])
  if (story < 1) return null
  return story * FRAME_FACTOR + (m[2] === undefined ? 0 : Number(m[2]))
}

/** The canonical text of a frame id: `10:3`, and `10:intro` for frame 0. */
export function formatFrameRef(frame: number): string {
  const story = Math.floor(frame / FRAME_FACTOR)
  const n = frame % FRAME_FACTOR
  return n === 0 ? `${story}:intro` : `${story}:${n}`
}

// Rows

/** The resource of a subject (the first by key, and a line in `issues` when there are more), or `undefined`. */
function pick(resources: ResourceRef[], subjects: string[], issues: string[]): ResourceRef | undefined {
  const found = resources.filter((ref) => subjects.includes(ref.kind)).sort((a, b) => compareCodePoints(a.key, b.key))
  if (found.length > 1) issues.push(`${found.length} resources of ${subjects[0]} (${found.map((ref) => ref.key).join(', ')}); ${found[0].key} is used`)
  return found[0]
}

async function collect(source: RowSource, lang: string, ref: ResourceRef): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of source.rows({ lang, resource: ref.key, layer: 'sot' })) out.push(row)
  return out
}

/** The stories of an OBS resource, ordered by number. */
function extractStories(rows: Row[], ref: ResourceRef, issues: string[]): ObsStory[] {
  const prefix = `obs:${ref.key}:`
  const stories = new Map<number, ObsStory>()
  for (const row of rows) {
    if (!row.key.startsWith(prefix)) continue
    const tail = row.key.slice(prefix.length)
    if (!DIGITS.test(tail) || Number(tail) < 1) {
      issues.push(`${row.key} is not the key of a story of ${ref.key}: left out`)
      continue
    }
    const n = Number(tail)
    const where = `${ref.key} story ${n}`
    if (n > MAX_STORY) {
      issues.push(`${where}: the story number is above ${MAX_STORY}: left out`)
      continue
    }
    const value = isMap(row.value) ? row.value : undefined
    const content = value !== undefined && isMap(value.content) ? value.content : undefined
    if (content === undefined) throw new Error(`${row.key}: the row has no content`)
    if (typeof content.title !== 'string') throw new Error(`${row.key}: the title is not text`)
    if (!Array.isArray(content.frames)) throw new Error(`${row.key}: frames is not a list`)
    if (stories.has(n)) {
      issues.push(`${where}: the row ${row.key} repeats the story: kept the first`)
      continue
    }
    if (content.storyNumber !== undefined && content.storyNumber !== n) {
      issues.push(`${where}: the row says it is story ${String(content.storyNumber)}; the number of the key is used`)
    }

    const frames: ObsStory['frames'] = []
    for (const [i, frame] of content.frames.entries()) {
      if (!isMap(frame)) throw new Error(`${row.key}: frame ${i} is not an object`)
      if (typeof frame.text !== 'string') throw new Error(`${row.key}: the text of frame ${i} is not text`)
      let number = i + 1
      if (typeof frame.frameNumber === 'number' && Number.isSafeInteger(frame.frameNumber) && frame.frameNumber >= 0) number = frame.frameNumber
      else issues.push(`${where}: frame ${i} has no frame number: ${number} is used`)
      const out: ObsStory['frames'][number] = { n: number, text: frame.text }
      if (frame.imageUrl !== undefined && frame.imageUrl !== null) {
        if (typeof frame.imageUrl !== 'string') throw new Error(`${row.key}: the image of frame ${i} is not text`)
        if (frame.imageUrl !== '') out.image = frame.imageUrl
      }
      if (number > MAX_FRAME) {
        issues.push(`${where}: frame ${i} has the number ${number}, above ${MAX_FRAME}: left out`)
        continue
      }
      frames.push(out)
    }
    if (frames.length === 0) {
      issues.push(`${where} has no frames${content.frames.length > 0 ? ' that can be kept' : ''}: left out`)
      continue
    }
    const numbers = new Set<number>()
    for (const frame of frames) {
      if (numbers.has(frame.n)) throw new Error(`${row.key}: the frame number ${frame.n} is in the story twice`)
      numbers.add(frame.n)
    }

    const story: ObsStory = { res: ref.key, n, title: content.title, frames }
    if (typeof content.sourceReference === 'string' && content.sourceReference !== '') story.reference = content.sourceReference
    stories.set(n, story)
  }
  return [...stories.values()].sort((a, b) => a.n - b.n)
}

/**
 * The notes, questions or links of an OBS helps resource, in file order: the chunks `{prefix}:{res}:obs:{story}` in story order,
 * or, when there is no chunk, the book row `{prefix}:{res}:obs`.
 *
 * - **Ids** are the `id` field; one that repeats gets `~2`, `~3`….
 * - **Frame.** The `reference` field, `story:frame`, becomes `frame = story × 100 + frame` (`parseFrameRef`); the text stays in
 *   `ref`. A reference that cannot be read puts the row at frame 0, keeps the text in `ref`, and adds a line to `issues`. The row
 *   is never dropped.
 * - **Concept and columns** as the book helps: SupportReference and TWLink become `concept`; the escapes and links of note,
 *   question and response are undone and rewritten (`rewriteLinks(text, null)`: there is no book). The text of a quote stays in
 *   `cols.quote`: OBS quotes have no positions in the original.
 */
function extractHelps(rows: Row[], ref: ResourceRef, kind: HelpsKind, issues: string[]): ObsHelpTable {
  const unique = uniqueIds()
  const table: ObsHelpRow[] = []
  for (const [index, { where, item }] of sourceRows(rows, OBS_BOOK, ref.key, kind).entries()) {
    if (!isMap(item)) throw new Error(`${where}: row ${index} is not an object`)
    const published = item.id
    if (typeof published !== 'string' || published === '') throw new Error(`${where}: row ${index} has no id`)
    const id = unique(published)
    const report = (text: string) => issues.push(`${ref.key} ${id}: ${text}`)
    if (id !== published) report(`the id ${JSON.stringify(published)} is in the source twice; this row is ${JSON.stringify(id)}`)

    const reference = typeof item.reference === 'string' ? item.reference : ''
    let frame = parseFrameRef(reference)
    if (frame === null) {
      frame = 0
      report(`the reference ${JSON.stringify(reference)} is not story:frame; the row is placed at frame 0`)
    }
    const { cols, concept } = helpColumns(item, kind, null, where, published, report)
    const row: ObsHelpRow = { id, ref: reference, frame, cols }
    if (concept !== undefined) row.concept = concept
    table.push(row)
  }
  return { res: ref.key, rows: table }
}

/**
 * Puts one line in `issues` for the OBS helps that have rows when there are no stories to point to: they are left out, and the
 * language would otherwise lose them without a word.
 */
async function reportHelpsWithoutStories(source: RowSource, lang: string, resources: ResourceRef[], issues: string[]): Promise<void> {
  const found: string[] = []
  for (const kind of HELPS_KINDS) {
    const ref = pick(resources, HELPS_SUBJECTS[kind], [])
    if (ref === undefined) continue
    const bookKey = `${PREFIXES[kind]}:${ref.key}:${OBS_BOOK}`
    if ((await collect(source, lang, ref)).some((row) => row.key === bookKey || row.key.startsWith(`${bookKey}:`))) found.push(ref.key)
  }
  if (found.length > 0) issues.push(`The OBS helps ${found.join(', ')} have rows, and the language has no stories for them to point to: left out`)
}

/**
 * The Open Bible Stories of a language: its stories and the notes, questions and word links the source has of them, or
 * `null` when the language has no story rows.
 *
 * - **Resources.** `source.resources(lang)` lists them; the stories by the subject `Open Bible Stories`, the helps by the
 *   subjects of `HELPS_SUBJECTS` (the first by key, and a line in `issues` when there are more). A helps resource with no
 *   row of OBS is left out with a line.
 * - **Header.** `res` is `[key, release tag]` of every resource used, in the order of the keys; the release tag is the stamp
 *   before the `#`.
 * - **Study notes and study questions** have no rows in format 2.0: the model never has them.
 *
 * Throws `Error` for rows that are not what format 2.0 writes: a story without content, title or frames, a row of helps
 * without an id, a field that is not text or true and false.
 */
export async function extractObs(source: RowSource, lang: string, issues: string[] = []): Promise<ObsModel | null> {
  const resources = await source.resources(lang)
  const storiesRef = pick(resources, [STORIES_SUBJECT], issues)
  const stories = storiesRef === undefined ? [] : extractStories(await collect(source, lang, storiesRef), storiesRef, issues)
  if (storiesRef === undefined || stories.length === 0) {
    await reportHelpsWithoutStories(source, lang, resources, issues)
    return null
  }

  const model: ObsModel = { lang, res: [], stories }
  const used: ResourceRef[] = [storiesRef]
  for (const kind of HELPS_KINDS) {
    const ref = pick(resources, HELPS_SUBJECTS[kind], issues)
    if (ref === undefined) continue
    const rows = await collect(source, lang, ref)
    const bookKey = `${PREFIXES[kind]}:${ref.key}:${OBS_BOOK}`
    if (!rows.some((row) => row.key === bookKey || row.key.startsWith(`${bookKey}:`))) {
      issues.push(`${ref.key} has no rows of OBS: left out`)
      continue
    }
    model[kind] = extractHelps(rows, ref, kind, issues)
    used.push(ref)
  }
  model.res = used.sort((a, b) => compareCodePoints(a.key, b.key)).map((ref): [string, string] => [ref.key, ref.stamp.split('#')[0]])
  return model
}

// Segment


function encodeStory(story: ObsStory, resIndex: ReadonlyMap<string, number>): CborValue {
  const where = `The story ${String(story.n)}`
  if (!isCount(story.n) || story.n < 1) throw new Error(`${where}: the number is not an integer from 1 to 2^53 - 1`)
  if (story.n > MAX_STORY) throw new RangeError(`${where}: the number is above ${MAX_STORY}`)
  const res = resIndex.get(story.res)
  if (res === undefined) throw new Error(`${where} is of a resource that res does not list`)
  if (typeof story.title !== 'string') throw new Error(`${where} has no title`)
  if (!Array.isArray(story.frames) || story.frames.length === 0) throw new Error(`${where} has no frames`)

  const numbers = new Set<number>()
  const frames = story.frames.map((frame): CborValue => {
    if (!isCount(frame.n)) throw new Error(`${where}: a frame number is not an integer from 0 to 2^53 - 1`)
    if (frame.n > MAX_FRAME) throw new RangeError(`${where}: the frame number ${frame.n} is above ${MAX_FRAME}`)
    if (numbers.has(frame.n)) throw new Error(`${where} has the frame ${frame.n} twice`)
    numbers.add(frame.n)
    if (typeof frame.text !== 'string') throw new Error(`${where}, frame ${frame.n}: the text is not text`)
    const out: Record<string, CborValue> = { n: frame.n, text: frame.text }
    if (frame.image !== undefined) {
      if (typeof frame.image !== 'string') throw new Error(`${where}, frame ${frame.n}: the image is not text`)
      out.image = frame.image
    }
    return out
  })

  const out: Record<string, CborValue> = { res, n: story.n, title: story.title, frames }
  if (story.reference !== undefined) {
    if (typeof story.reference !== 'string') throw new Error(`${where}: the reference is not text`)
    out.reference = story.reference
  }
  if (story.refs !== undefined) {
    out.refs = story.refs.map((range): CborValue => {
      if (!Array.isArray(range) || range.length !== 2 || !isCount(range[0]) || !isCount(range[1]) || range[0] > range[1]) throw new Error(`${where}: a ref is not [from, to], two verse ids in order`)
      return [range[0], range[1]]
    })
  }
  return out
}

/** The tables of the helps, in the order of `obs.cddl`: the name in the segment and the key in the model. */
const HELPS_TABLES = [
  ['notes', 'notes'],
  ['questions', 'questions'],
  ['links', 'links'],
  ['study-notes', 'studyNotes'],
  ['study-questions', 'studyQuestions'],
] as const

/** A table of helps against what the segment can hold: a violation is a builder's bug, so it throws `Error`. */
function checkHelps(name: string, table: ObsHelpTable, resIndex: ReadonlyMap<string, number>): void {
  if (!resIndex.has(table.res)) throw new Error(`The table ${name} is of a resource that res does not list`)
  const ids = new Set<string>()
  table.rows.forEach((row, i) => {
    const where = `The table ${name}, row ${i}`
    if (typeof row.id !== 'string' || row.id === '') throw new Error(`${where} has no id`)
    if (ids.has(row.id)) throw new Error(`${where}: the id ${JSON.stringify(row.id)} is in the table twice`)
    ids.add(row.id)
    if (typeof row.ref !== 'string') throw new Error(`${where} has no reference text`)
    if (!isCount(row.frame)) throw new Error(`${where}: frame is story × 100 + frame, an integer from 0 to 2^53 - 1`)
    if (row.concept !== undefined && (typeof row.concept !== 'string' || row.concept === '')) throw new Error(`${where}: the concept is not text`)
    if (typeof row.cols !== 'object' || row.cols === null) throw new Error(`${where} has no cols`)
  })
}

/** The table `notes`, `questions`, `links`, `study-notes` or `study-questions` (`obs-helps` in `obs.cddl`). */
function helpsPart(name: string, table: ObsHelpTable, resIndex: ReadonlyMap<string, number>): TablePart {
  checkHelps(name, table, resIndex)
  const rows = table.rows
  const columns = columnPlans(name, rows)
  const ascii4 = rows.every((row) => /^[\x00-\x7f]{4}$/.test(row.id))
  const withConcept = rows.map((row) => row.concept !== undefined)
  const concepts = rows.flatMap((row) => (row.concept === undefined ? [] : [row.concept]))

  const uses: string[] = [...concepts]
  if (!ascii4) uses.push(...rows.map((row) => row.id))
  for (const column of columns) if (column.kind === 'strings') uses.push(...(column.values as string[]))

  return {
    tables: { [name]: [1, false] },
    uses,
    encode(index) {
      const ids: CborValue = ascii4
        ? { ascii4: Uint8Array.from(rows.flatMap((row) => [...row.id].map((char) => char.charCodeAt(0)))) }
        : { strings: encodeUvarints(rows.map((row) => index.get(row.id)!)) }
      const out: Record<string, CborValue> = {
        res: resIndex.get(table.res)!,
        n: rows.length,
        id: ids,
        frame: encodeUvarints(rows.map((row) => row.frame)),
      }
      // The reference text is kept for the rows whose text is not the canonical one of their frame.
      const refText = rows.flatMap((row, i): CborValue[] => (formatFrameRef(row.frame) === row.ref ? [] : [[i, row.ref]]))
      if (refText.length > 0) out.refText = refText
      if (concepts.length > 0) out.concept = encodeColumn({ kind: 'strings', present: withConcept, values: concepts }, index)
      out.cols = Object.fromEntries(columns.map((column) => [column.name, encodeColumn(column, index)]))
      return { [name]: out }
    },
  }
}

/**
 * The segment of a model (`obs.cddl`): the tables `strings` and `stories` (ordered by number, whatever the order given) and the
 * `notes`, `questions`, `links`, `study-notes` and `study-questions` the model has. The same model gives the same segment. The
 * header's `res` is the model's, as it is: the caller gives the release tag of each resource (`v42`), not its whole stamp.
 *
 * Throws `Error` when the model is not one the segment can hold: no resource or one twice, a story or a table of a resource the
 * header does not list, a story number twice or below 1, `RangeError` for a story number above 50 or a frame number above 99, a story without frames, a frame number twice, a row without id or with an
 * id twice, a frame that is not a whole number, a column of mixed values.
 */
export function obsSegment(m: ObsModel): Segment {
  const resIndex = resIndexOf(m)

  const numbers = new Set<number>()
  const stories = [...m.stories]
    .sort((a, b) => a.n - b.n)
    .map((story) => {
      if (numbers.has(story.n)) throw new Error(`The story ${story.n} is in the model twice`)
      numbers.add(story.n)
      return encodeStory(story, resIndex)
    })

  const parts: TablePart[] = []
  for (const [name, key] of HELPS_TABLES) {
    const table = m[key]
    if (table !== undefined) parts.push(helpsPart(name, table, resIndex))
  }

  const strings = stringTable(parts.flatMap((part) => part.uses))
  const tables: Record<string, [number, boolean]> = { strings: [1, true], stories: [1, true] }
  const t: Record<string, CborValue> = { strings: strings.list, stories }
  for (const part of parts) {
    Object.assign(tables, part.tables)
    Object.assign(t, part.encode(strings.index))
  }
  return { h: { class: 'obs', v: 1, tables, lang: m.lang, res: m.res.map(([key, tag]) => [key, tag]) }, t }
}
