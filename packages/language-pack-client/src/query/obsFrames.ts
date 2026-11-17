/**
 * `frameVerses` and `framesAt`: the verses each frame of Open Bible Stories tells, and the frames that tell a verse or a passage, from the
 * `obs-frames` table of the `xtopics` core (source: bible-story-builder). The other direction, verse to frames, is built here in memory
 * once per core (the pack does not carry it). No Node module here.
 */
import { BOOKS, formatRef, type XtopicsCore } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export const OBS_FRAMES_SOURCE = 'bcv-commons/bible-story-builder'

/** One verse range of a frame: its book, its reference in that book (`1:6-8`), and its first and last verse ids. */
export type FrameRange = { book: string; ref: string; first: number; last: number }
export type FrameVersesData = { story: number; frame: number; ranges: FrameRange[]; source: typeof OBS_FRAMES_SOURCE }
/** A frame that tells a verse: `verses` is how many verses all its ranges cover (a range across chapters counts 1000), the order's measure. */
export type FrameAt = { story: number; frame: number; verses: number }
export type FramesAtData = { first: number; last: number; frames: FrameAt[]; source: typeof OBS_FRAMES_SOURCE }

type Index = { size: Map<string, number>; byVerse: Map<number, string[]> }
const indexes = new WeakMap<XtopicsCore, Index>()

/** How many verses a range covers: exact in one chapter; a range across chapters counts 1000 (the reader has no chapter lengths). */
const span = (a: number, b: number): number => (Math.floor(a / 1000) === Math.floor(b / 1000) ? b - a + 1 : 1000)

function indexOf(core: XtopicsCore): Index {
  let ix = indexes.get(core)
  if (ix !== undefined) return ix
  const size = new Map<string, number>()
  const byVerse = new Map<number, string[]>()
  for (const [key, list] of Object.entries(core.obsFrames ?? {})) {
    const seen = new Set<number>()
    let crossing = 0
    for (const [a, b] of list) {
      if (span(a, b) === 1000) {
        crossing += 1000
        continue
      }
      for (let v = a; v <= b; v++) seen.add(v)
    }
    size.set(key, seen.size + crossing)
    for (const v of seen) {
      const at = byVerse.get(v)
      if (at === undefined) byVerse.set(v, [key])
      else if (!at.includes(key)) at.push(key)
    }
  }
  ix = { size, byVerse }
  indexes.set(core, ix)
  return ix
}

const keyOf = (k: string): { story: number; frame: number } => {
  const [s, f] = k.split(':')
  return { story: Number(s), frame: Number(f) }
}

/** The xtopics core, or the answer saying it is not installed. */
async function coreOf(reader: PackReader, out: Answer<unknown>): Promise<XtopicsCore | undefined> {
  const m = await reader.mapsOf(['xtopics'], { coreOnly: true })
  const x = m.xtopics
  if (x === undefined) {
    missingUnit(out, { unit: 'xtopics', bytes: reader.listed('xtopics') ? reader.size('xtopics') : 0 })
    return undefined
  }
  usedUnit(out, reader, 'xtopics')
  return x.core
}

export async function frameVersesQuery(reader: PackReader, story: number, frame: number): Promise<Answer<FrameVersesData | null>> {
  if (!Number.isInteger(story) || story < 1 || story > 50) throw new ClientError('E_ARG', `not a story: ${JSON.stringify(story)}`)
  if (!Number.isInteger(frame) || frame < 1 || frame > 99) throw new ClientError('E_ARG', `not a frame: ${JSON.stringify(frame)}`)
  const out = newAnswer<FrameVersesData | null>(reader, 'frameVerses')
  const core = await coreOf(reader, out)
  if (core === undefined) return out
  const list = core.obsFrames?.[`${story}:${frame}`]
  out.data = {
    story,
    frame,
    ranges: (list ?? []).map(([first, last]) => {
      const book = BOOKS[Math.floor(first / 1_000_000) - 1]
      return { book, ref: formatRef(book, first, last), first, last }
    }),
    source: OBS_FRAMES_SOURCE,
  }
  // No table (an older common catalog): no source, `none`. A frame the table has no key for tells no verse: `count` with no range.
  out.coverage = { [OBS_FRAMES_SOURCE]: core.obsFrames === undefined ? 'none' : 'count' }
  if (core.obsFrames !== undefined) out.cites.push({ res: OBS_FRAMES_SOURCE, release: releaseOf(core.res, OBS_FRAMES_SOURCE) })
  return out
}

/**
 * The frames whose ranges meet the verses `first` to `last` (verse ids of one book), most specific first: the fewest `verses`, then story
 * and frame order.
 */
export async function framesAtQuery(reader: PackReader, first: number, last: number = first): Promise<Answer<FramesAtData | null>> {
  const ok = (v: number) => Number.isSafeInteger(v) && v >= 1_000_000 && v < 67_000_000
  if (!ok(first) || !ok(last) || first > last || Math.floor(first / 1_000_000) !== Math.floor(last / 1_000_000)) {
    throw new ClientError('E_ARG', `not a passage of one book: ${first}-${last}`)
  }
  const out = newAnswer<FramesAtData | null>(reader, 'framesAt')
  const core = await coreOf(reader, out)
  if (core === undefined) return out
  const ix = indexOf(core)
  const keys = new Set<string>()
  if (last - first < 200_000) {
    for (let v = first; v <= last; v++) for (const k of ix.byVerse.get(v) ?? []) keys.add(k)
  } else for (const [v, at] of ix.byVerse) if (v >= first && v <= last) for (const k of at) keys.add(k)
  // Frames whose range crosses chapters are not in byVerse: look at them directly
  for (const [k, list] of Object.entries(core.obsFrames ?? {})) {
    if (list.some(([a, b]) => span(a, b) === 1000 && a <= last && b >= first)) keys.add(k)
  }
  const frames = [...keys]
    .map((k) => ({ ...keyOf(k), verses: ix.size.get(k)! }))
    .sort((x, y) => x.verses - y.verses || x.story - y.story || x.frame - y.frame)
  out.data = { first, last, frames, source: OBS_FRAMES_SOURCE }
  out.coverage = { [OBS_FRAMES_SOURCE]: core.obsFrames === undefined ? 'none' : 'count' }
  if (core.obsFrames !== undefined) out.cites.push({ res: OBS_FRAMES_SOURCE, release: releaseOf(core.res, OBS_FRAMES_SOURCE) })
  return out
}
