/**
 * The Five Movements tables of the obs segment (`spec/cddl/obs.cddl`, "OBS Five Movements"): `tf-parts`, `tf-questions`,
 * `tf-terms`, `tf-shared`, `tf-frames` and `tf-framework`, written from an {@link ObsTfModel}. The same model gives the same
 * bytes. The tables never use the segment's string table, so every other table of the segment is the same with them or without.
 *
 * The reader of the manual is `source/obsTf.ts`; the reader of the tables is `read/obs.ts`.
 */
import type { CborValue } from '../codec/cbor'
import { encodeBits, encodeTexts, encodeUvarints } from '../codec/columns'
import type { ObsTfModel } from '../model'
import { TF_LISTS, TF_PARTS } from '../source/obsTf'
import type { TablePart } from './book'

/** The codes of `tf-parts`, `tf-questions`: the parts, then the lists, in the fixed order; only those a table uses. */
const FIXED_CODES: readonly string[] = [...TF_PARTS, ...TF_LISTS]
/** The codes of `tf-framework`. */
const FRAMEWORK_CODES: readonly string[] = ['m1', 'm2', 'm3', 'm4', 'm5', 'overview']

function codesUsed(fixed: readonly string[], used: Iterable<string>, where: string): string[] {
  const set = new Set(used)
  for (const code of set) if (!fixed.includes(code)) throw new Error(`${where}: the code ${JSON.stringify(code)} is not a fixed code`)
  return fixed.filter((code) => set.has(code))
}

/** A text column; `has` only when some rows lack the value. An empty text is never stored (the value is lacking). */
function textColumn(values: (string | undefined)[], needsHas: boolean, where: string): CborValue {
  const present = values.filter((v): v is string => v !== undefined)
  if (present.some((v) => v === '')) throw new Error(`${where}: an empty text is not stored`)
  const out: Record<string, CborValue> = { texts: encodeTexts(present) }
  if (present.length !== values.length) {
    if (!needsHas) throw new Error(`${where}: a row has no value`)
    out.has = encodeBits(values.map((v) => v !== undefined))
  }
  return out
}

function uintColumn(values: (number | undefined)[], needsHas: boolean, where: string): CborValue {
  const present = values.filter((v): v is number => v !== undefined)
  const out: Record<string, CborValue> = { uints: encodeUvarints(present) }
  if (present.length !== values.length) {
    if (!needsHas) throw new Error(`${where}: a row has no value`)
    out.has = encodeBits(values.map((v) => v !== undefined))
  }
  return out
}

const refTextOf = (rows: { refText?: string }[]): CborValue[] => rows.flatMap((row, i): CborValue[] => (row.refText === undefined ? [] : [[i, row.refText]]))

/** The tables of the manual; `resIndex` maps the keys of the header's `res`. Throws `Error` for a model the tables cannot hold. */
export function obsTfPart(tf: ObsTfModel, resIndex: ReadonlyMap<string, number>): TablePart {
  const res = resIndex.get(tf.res)
  if (res === undefined) throw new Error('The tables of the manual are of a resource that res does not list')
  const coverage = new Set<number>()
  let last = 0
  for (const n of tf.stories) {
    if (!Number.isSafeInteger(n) || n <= last) throw new Error('The coverage of the manual is not ascending, from 1, without repeats')
    last = n
    coverage.add(n)
  }
  if (tf.parts.length === 0) throw new Error('The manual has no part rows')
  const inCoverage = (story: number, where: string): void => {
    if (!coverage.has(story)) throw new Error(`${where}: the story ${story} is not in the coverage`)
  }

  const sharedIndex = new Map<string, number>()
  tf.shared.forEach((block, i) => {
    if (sharedIndex.has(block.key)) throw new Error(`tf-shared: the key ${JSON.stringify(block.key)} is in the table twice`)
    sharedIndex.set(block.key, i)
  })

  const tables: Record<string, [number, boolean]> = {}
  const t: Record<string, CborValue> = {}

  // tf-parts
  {
    const codes = codesUsed(FIXED_CODES, tf.parts.flatMap((b) => (b.list === undefined ? [b.part] : [b.part, b.list])), 'tf-parts')
    const num = (c: string): number => codes.indexOf(c)
    for (const b of tf.parts) {
      inCoverage(b.story, 'tf-parts')
      if (b.shared !== undefined && (b.title !== undefined || b.text !== undefined)) throw new Error('tf-parts: a row with shared has no title or text of its own')
    }
    t['tf-parts'] = {
      res,
      stories: encodeUvarints(tf.stories),
      codes,
      n: tf.parts.length,
      story: encodeUvarints(tf.parts.map((b) => b.story)),
      part: encodeUvarints(tf.parts.map((b) => num(b.part))),
      list: uintColumn(tf.parts.map((b) => (b.list === undefined ? undefined : num(b.list))), true, 'tf-parts list'),
      title: textColumn(tf.parts.map((b) => b.title), true, 'tf-parts title'),
      text: textColumn(tf.parts.map((b) => b.text), true, 'tf-parts text'),
      shared: uintColumn(
        tf.parts.map((b) => {
          if (b.shared === undefined) return undefined
          const i = sharedIndex.get(b.shared)
          if (i === undefined) throw new Error(`tf-parts: the block ${JSON.stringify(b.shared)} is not in tf-shared`)
          return i
        }),
        true,
        'tf-parts shared',
      ),
    }
    tables['tf-parts'] = [1, false]
  }

  // tf-questions
  if (tf.questions.length > 0) {
    const codes = codesUsed(FIXED_CODES, tf.questions.flatMap((q) => [q.part, q.list]), 'tf-questions')
    const num = (c: string): number => codes.indexOf(c)
    for (const q of tf.questions) inCoverage(q.story, 'tf-questions')
    const out: Record<string, CborValue> = {
      res,
      codes,
      n: tf.questions.length,
      story: encodeUvarints(tf.questions.map((q) => q.story)),
      part: encodeUvarints(tf.questions.map((q) => num(q.part))),
      list: encodeUvarints(tf.questions.map((q) => num(q.list))),
      k: encodeUvarints(tf.questions.map((q) => q.k)),
      frames: { count: encodeUvarints(tf.questions.map((q) => q.frames.length)), ids: encodeUvarints(tf.questions.flatMap((q) => q.frames)) },
      q: textColumn(tf.questions.map((q) => q.q), false, 'tf-questions q'),
      a: textColumn(tf.questions.map((q) => q.a), true, 'tf-questions a'),
    }
    const refText = refTextOf(tf.questions)
    if (refText.length > 0) out.refText = refText
    t['tf-questions'] = out
    tables['tf-questions'] = [1, false]
  }

  // tf-terms
  if (tf.terms.length > 0) {
    for (const x of tf.terms) inCoverage(Math.floor(x.frame / 100), 'tf-terms')
    const out: Record<string, CborValue> = {
      res,
      n: tf.terms.length,
      frame: encodeUvarints(tf.terms.map((x) => x.frame)),
      k: encodeUvarints(tf.terms.map((x) => x.k)),
      term: textColumn(tf.terms.map((x) => x.term), true, 'tf-terms term'),
      text: textColumn(tf.terms.map((x) => x.text), false, 'tf-terms text'),
    }
    const refText = refTextOf(tf.terms)
    if (refText.length > 0) out.refText = refText
    t['tf-terms'] = out
    tables['tf-terms'] = [1, false]
  }

  // tf-shared
  if (tf.shared.length > 0) {
    t['tf-shared'] = {
      res,
      n: tf.shared.length,
      key: textColumn(tf.shared.map((b) => b.key), false, 'tf-shared key'),
      title: textColumn(tf.shared.map((b) => b.title), false, 'tf-shared title'),
      text: textColumn(tf.shared.map((b) => b.text), true, 'tf-shared text'),
    }
    tables['tf-shared'] = [1, false]
  }

  // tf-frames
  if (tf.frames.length > 0) {
    t['tf-frames'] = {
      res,
      n: tf.frames.length,
      frame: encodeUvarints(tf.frames.map((f) => f.frame)),
      text: textColumn(tf.frames.map((f) => f.text), false, 'tf-frames text'),
    }
    tables['tf-frames'] = [1, false]
  }

  // tf-framework
  if (tf.framework.length > 0) {
    const codes = codesUsed(FRAMEWORK_CODES, tf.framework.map((r) => r.code), 'tf-framework')
    const out: Record<string, CborValue> = {
      res,
      codes,
      n: tf.framework.length,
      code: encodeUvarints(tf.framework.map((r) => codes.indexOf(r.code))),
      name: textColumn(tf.framework.map((r) => r.name), true, 'tf-framework name'),
    }
    if (tf.framework.some((r) => r.text !== undefined)) out.text = textColumn(tf.framework.map((r) => r.text), true, 'tf-framework text')
    t['tf-framework'] = out
    tables['tf-framework'] = [1, false]
  }

  return { tables, uses: [], encode: () => t }
}
