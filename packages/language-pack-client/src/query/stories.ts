/**
 * `stories` and `story`: the Open Bible Stories of a passage, and one whole story. The ranges and the titles come from the maps
 * (`xtopics` and `topics`, which every language has); the frames and the helps come from the `obs` unit, which may not be
 * installed. No Node module here.
 */
import { BOOKS, formatRef, type ObsHelpRow, type ObsModel, type ObsStory, parseRef, type MapSet } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, type CellState, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'
import { parsePassage } from './passage'

/** `refs` are texts such as `"gen 1:1-2:3"`; `id` is `obs:N`. */
export type StoryRef = { n: number; id: string; title: string; refs: string[] }
/** `ref` is `"NN:FF"`; `image` is the segment's image of the frame, when it has one. */
export type StoryFrame = { ref: string; text: string; image?: string; notes: ObsHelpRow[]; questions: ObsHelpRow[]; links: ObsHelpRow[] }
export type StoryData = StoryRef & {
  /** The language's own source line ("A Bible story from: …") as the segment keeps it. */
  reference?: string
  frames?: StoryFrame[]
  helps: { notes: CellState; questions: CellState; links: CellState }
}

const pad = (n: number): string => String(n).padStart(2, '0')
const MAX_STORY = 50

/** A passage as `passage` takes it, or `"<book> <chapter>"` (verse 1 to the end of the chapter). */
function parseScope(input: string): [number, number] {
  const m = /^([a-z0-9]{3})\s+([1-9][0-9]{0,2})$/.exec(input.trim().toLowerCase())
  if (m !== null) {
    const range = parseRef(m[1]!, `${m[2]}:1-${m[2]}:999`)
    if (range !== null) return range
  }
  return parsePassage(input).range
}

function textOfRange(from: number, to: number): string {
  const book = BOOKS[Math.floor(from / 1_000_000) - 1]
  if (book === undefined) return `${from}-${to}`
  try {
    return `${book} ${formatRef(book, from, to)}`
  } catch {
    return `${book} ${from}-${to}`
  }
}

type Known = { refs: [number, number][]; title: string | undefined }

/** The stories the xtopics has, with their parsed ranges and the name the language's topics give them. `undefined`: no xtopics. */
async function fromMaps(out: Answer<unknown>, reader: PackReader): Promise<Map<number, Known> | undefined> {
  const m: MapSet = await reader.mapsOf(['xtopics', 'topics'])
  if (m.xtopics === undefined) {
    missingUnit(out, { unit: 'xtopics', bytes: reader.listed('xtopics') ? reader.size('xtopics') : 0 })
    return undefined
  }
  usedUnit(out, reader, 'xtopics')
  if (m.topics === undefined) missingUnit(out, { unit: 'topics', bytes: reader.listed('topics') ? reader.size('topics') : 0, what: 'titles' })
  else usedUnit(out, reader, 'topics')
  const found = new Map<number, Known>()
  for (const [id, topic] of m.xtopics.core.topics) {
    const n = /^obs:([0-9]+)$/.exec(id)
    if (n === null || topic.kind !== 'story') continue
    const title = m.topics?.core.names[id]?.find((x) => x[1] === 'obs' && x[0].trim() !== '')?.[0]
    found.set(Number(n[1]), { refs: m.xtopics.core.ranges?.[id] ?? [], title })
  }
  return found
}

const refOf = (n: number, k: Known | undefined, segment?: ObsStory): StoryRef => ({
  n,
  id: `obs:${n}`,
  title: k?.title ?? (segment !== undefined && segment.title.trim() !== '' ? segment.title : `Story ${n}`),
  refs: (k?.refs ?? []).map(([a, z]) => textOfRange(a, z)),
})

/** The stories of a passage (any form `passage` takes, or `"<book> <chapter>"`), or all of them in number order. */
export async function storiesQuery(reader: PackReader, input?: string): Promise<Answer<{ ref?: string; stories: StoryRef[] }>> {
  const scope = input === undefined ? undefined : parseScope(input)
  const out = newAnswer<{ ref?: string; stories: StoryRef[] }>(reader, 'stories')
  const known = await fromMaps(out, reader)
  if (known === undefined) return out
  const stories: StoryRef[] = []
  for (const [n, k] of [...known].sort((a, b) => a[0] - b[0])) {
    if (scope !== undefined && !k.refs.some(([a, z]) => a <= scope[1] && z >= scope[0])) continue
    stories.push(refOf(n, k))
  }
  out.data = { ...(input !== undefined ? { ref: input.trim() } : {}), stories }
  return out
}

/** One story: its title and ranges from the maps; the frames and the helps when the `obs` unit is installed. */
export async function storyQuery(reader: PackReader, n: number): Promise<Answer<StoryData>> {
  if (!Number.isInteger(n) || n < 1 || n > MAX_STORY) throw new ClientError('E_ARG', `not a story number from 1 to ${MAX_STORY}: ${JSON.stringify(n)}`)
  const out = newAnswer<StoryData>(reader, 'story')
  const known = await fromMaps(out, reader)
  const model: ObsModel | undefined = reader.installed('obs') ? await reader.obs() : undefined
  const none: StoryData['helps'] = { notes: 'none', questions: 'none', links: 'none' }
  if (model === undefined) {
    missingUnit(out, { unit: 'obs', bytes: reader.size('obs') })
    out.data = { ...refOf(n, known?.get(n)), helps: none }
    return out
  }
  usedUnit(out, reader, 'obs')
  const story = model.stories.find((s) => s.n === n)
  const data: StoryData = { ...refOf(n, known?.get(n), story), helps: { ...none } }
  if (story === undefined) {
    out.data = data
    return out
  }
  if (story.reference !== undefined) data.reference = story.reference
  const frames = new Map<number, StoryFrame>()
  const frameOf = (k: number): StoryFrame => {
    let f = frames.get(k)
    if (f === undefined) frames.set(k, (f = { ref: `${pad(n)}:${pad(k)}`, text: '', notes: [], questions: [], links: [] }))
    return f
  }
  for (const fr of story.frames) {
    const f = frameOf(fr.n)
    f.text = fr.text
    if (fr.image !== undefined && fr.image !== '') f.image = fr.image
  }
  out.cites.push({ res: story.res, release: releaseOf(model.res, story.res), id: `obs:${n}` })
  for (const kind of ['notes', 'questions', 'links'] as const) {
    const table = model[kind]
    if (table === undefined) continue
    const mine = table.rows.filter((r) => Math.floor(r.frame / 100) === n)
    // A help on a frame the story does not have (frame 0 is often only in the helps) keeps its place in a frame with no text.
    for (const row of mine) {
      frameOf(row.frame % 100)[kind].push(row)
      out.cites.push({ res: table.res, release: releaseOf(model.res, table.res), id: row.id, ref: row.ref })
    }
    data.helps[kind] = mine.length > 0 ? 'count' : 'zero'
  }
  data.frames = [...frames].sort((a, b) => a[0] - b[0]).map(([, f]) => f)
  out.data = data
  return out
}
