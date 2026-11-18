/**
 * The reader of the Five Movements tables of the obs segment (`spec/cddl/obs.cddl`, "OBS Five Movements"): the tables
 * `tf-parts`, `tf-questions`, `tf-terms`, `tf-shared`, `tf-frames` and `tf-framework` back into an {@link ObsTfModel}.
 *
 * A segment without `tf-parts` has no manual and gives `undefined`: the other tables are not used without their root. A
 * defect is `E_BODY` at the first one: a column of another encoding, a `has` that is not needed, an empty text, a row out of
 * order, a code that is not fixed, a row for a story outside the coverage, a reference to a row or a frame that is not there.
 * It imports no builder code and no Node module.
 */
import { decodeBits, decodeTexts, decodeUvarints } from '../codec/columns'
import { FormatError } from '../codec/errors'
import { type CborMap, isMap, isUint } from '../codec/values'
import type { ObsStory, ObsTfBlock, ObsTfModel, ObsTfQuestion, ObsTfShared, ObsTfTerm } from '../model'
import { TF_LISTS, TF_PARTS } from '../obsTfCodes'
import { checkRows } from './book'

const FIXED: readonly string[] = [...TF_PARTS, ...TF_LISTS]
const FRAMEWORK: readonly string[] = ['m1', 'm2', 'm3', 'm4', 'm5', 'overview']

function bad(what: string): never {
  throw new FormatError('E_BODY', `the obs segment is malformed: ${what}`)
}
function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}
function bytes(value: unknown, what: string): Uint8Array {
  if (!(value instanceof Uint8Array)) bad(`${what} is not a byte string`)
  return value
}
function uints(value: unknown, what: string, n: number): number[] {
  const out = decodeUvarints(bytes(value, what))
  if (out.length !== n) bad(`${what} has ${out.length} values and the table has ${n} rows`)
  return out
}

/** A text or number column: only `texts` or `uints`, with `has` only when some rows lack the value and only if the column may have one. */
function column(value: unknown, n: number, what: string, kind: 'texts' | 'uints', mayHave: boolean): (string | number | undefined)[] {
  const fields = map(value, what)
  for (const key of Object.keys(fields)) if (key !== kind && key !== 'has') bad(`${what} has "${key}"; the tf tables use only ${kind} and has`)
  let present: boolean[] = new Array<boolean>(n).fill(true)
  if (fields.has !== undefined) {
    if (!mayHave) bad(`${what} has a "has" and cannot`)
    present = decodeBits(bytes(fields.has, `${what}.has`), n)
    if (present.every(Boolean)) bad(`${what}.has is all ones`)
  }
  const count = present.filter(Boolean).length
  let values: (string | number)[]
  if (kind === 'texts') {
    const texts = map(fields.texts, `${what}.texts`)
    values = decodeTexts({ utf8: bytes(texts.utf8, `${what}.texts.utf8`), len: bytes(texts.len, `${what}.texts.len`) })
    if (values.some((v) => v === '')) bad(`${what} stores an empty text`)
  } else values = decodeUvarints(bytes(fields.uints, `${what}.uints`))
  if (values.length !== count) bad(`${what} has ${values.length} values and ${count} rows have one`)
  let next = 0
  return present.map((has) => (has ? values[next++] : undefined))
}
const texts = (v: unknown, n: number, what: string, mayHave: boolean): (string | undefined)[] => column(v, n, what, 'texts', mayHave) as (string | undefined)[]
const nums = (v: unknown, n: number, what: string, mayHave: boolean): (number | undefined)[] => column(v, n, what, 'uints', mayHave) as (number | undefined)[]

function codes(value: unknown, fixed: readonly string[], what: string): string[] {
  if (!Array.isArray(value) || !value.every((c) => typeof c === 'string')) bad(`${what}.codes is not a list of text`)
  let last = -1
  for (const code of value as string[]) {
    const at = fixed.indexOf(code)
    if (at < 0) bad(`${what}.codes has "${code}", which is not a fixed code`)
    if (at <= last) bad(`${what}.codes is not in the fixed order, without repeats`)
    last = at
  }
  return value as string[]
}

/** The common head of a table: the map, its `res` (the same in every table), and its row count. */
function head(value: unknown, what: string, resCount: number, ulen: number | undefined): { f: CborMap; res: number; n: number } {
  const f = map(value, what)
  if (!isUint(f.res) || f.res >= resCount) bad(`${what}.res names the resource ${String(f.res)}, and the header has ${resCount}`)
  if (!isUint(f.n)) bad(`${what}.n is not a count`)
  checkRows(f.n, ulen, what)
  return { f, res: f.res, n: f.n }
}

function refTexts(value: unknown, n: number, what: string): Map<number, string> {
  const out = new Map<number, string>()
  if (value === undefined) return out
  if (!Array.isArray(value)) bad(`${what}.refText is not a list`)
  let last = -1
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !isUint(item[0]) || typeof item[1] !== 'string') bad(`${what}.refText has an item that is not [row, text]`)
    if (item[0] >= n || item[0] <= last) bad(`${what}.refText is not in ascending rows below ${n}`)
    last = item[0]
    out.set(item[0], item[1])
  }
  return out
}

/**
 * The manual of a segment, or `undefined` when it has no `tf-parts`. `stories` are the segment's `stories` table: a frame that a
 * question or term names must be there or in `tf-frames`.
 */
export function readObsTf(t: Record<string, unknown>, res: [string, string][], stories: readonly ObsStory[], ulen?: number): ObsTfModel | undefined {
  if (t['tf-parts'] === undefined) return undefined
  const resCount = res.length

  // tf-parts
  const P = head(t['tf-parts'], 'the table "tf-parts"', resCount, ulen)
  const resIndex = P.res
  const coverage = decodeUvarints(bytes(P.f.stories, 'tf-parts.stories'))
  let lastStory = 0
  for (const s of coverage) {
    if (s < 1 || s > 50 || s <= lastStory) bad('tf-parts.stories is not ascending from 1 to 50, without repeats')
    lastStory = s
  }
  const inCoverage = new Set(coverage)
  const pCodes = codes(P.f.codes, FIXED, 'tf-parts')
  const story = uints(P.f.story, 'tf-parts.story', P.n)
  const part = uints(P.f.part, 'tf-parts.part', P.n)
  const list = nums(P.f.list, P.n, 'tf-parts.list', true)
  const title = texts(P.f.title, P.n, 'tf-parts.title', true)
  const text = texts(P.f.text, P.n, 'tf-parts.text', true)
  const sharedAt = nums(P.f.shared, P.n, 'tf-parts.shared', true)
  const partName = (i: number, what: string): string => {
    const code = pCodes[i]
    if (code === undefined) bad(`${what} names the code ${i}, and the table has ${pCodes.length}`)
    return code
  }
  const rank = (p: string, l: string | undefined): number => TF_PARTS.indexOf(p as (typeof TF_PARTS)[number]) * 10 + (l === undefined ? 0 : 1 + TF_LISTS.indexOf(l as (typeof TF_LISTS)[number]))
  let before = -1
  let beforeStory = 0
  const sharedRows = t['tf-shared'] === undefined ? undefined : head(t['tf-shared'], 'the table "tf-shared"', resCount, ulen)
  const parts: ObsTfBlock[] = []
  for (let i = 0; i < P.n; i++) {
    if (!inCoverage.has(story[i])) bad(`tf-parts row ${i} is of the story ${story[i]}, which is not in the coverage`)
    const p = partName(part[i], `tf-parts.part[${i}]`)
    if (!(TF_PARTS as readonly string[]).includes(p)) bad(`tf-parts.part[${i}] is the list code "${p}"`)
    const l = list[i] === undefined ? undefined : partName(list[i]!, `tf-parts.list[${i}]`)
    if (l !== undefined && !(TF_LISTS as readonly string[]).includes(l)) bad(`tf-parts.list[${i}] is the part code "${l}"`)
    const r = rank(p, l)
    if (story[i] < beforeStory || (story[i] === beforeStory && r < before)) bad(`tf-parts row ${i} is out of order`)
    if (story[i] !== beforeStory) before = -1
    beforeStory = story[i]
    before = r
    const row: ObsTfBlock = { story: story[i], part: p }
    if (l !== undefined) row.list = l
    if (sharedAt[i] !== undefined) {
      if (title[i] !== undefined || text[i] !== undefined) bad(`tf-parts row ${i} has shared and a title or text of its own`)
      if (sharedRows !== undefined && sharedAt[i]! >= sharedRows.n) bad(`tf-parts row ${i} names the shared block ${sharedAt[i]}, and the table has ${sharedRows.n}`)
    }
    if (title[i] !== undefined) row.title = title[i]
    if (text[i] !== undefined) row.text = text[i]
    parts.push(row)
  }

  // tf-shared
  const shared: ObsTfShared[] = []
  if (sharedRows !== undefined) {
    if (sharedRows.res !== resIndex) bad('tf-shared has another res than tf-parts')
    const key = texts(sharedRows.f.key, sharedRows.n, 'tf-shared.key', false)
    const title2 = texts(sharedRows.f.title, sharedRows.n, 'tf-shared.title', false)
    const text2 = texts(sharedRows.f.text, sharedRows.n, 'tf-shared.text', true)
    const seen = new Set<string>()
    for (let i = 0; i < sharedRows.n; i++) {
      if (seen.has(key[i]!)) bad(`tf-shared has the key ${JSON.stringify(key[i])} twice`)
      seen.add(key[i]!)
      const row: ObsTfShared = { key: key[i]!, title: title2[i]! }
      if (text2[i] !== undefined) row.text = text2[i]
      shared.push(row)
    }
    parts.forEach((row, i) => {
      if (sharedAt[i] !== undefined) row.shared = shared[sharedAt[i]!].key
    })
  }

  // tf-frames
  const frames: ObsTfModel['frames'] = []
  const known = new Set<number>(stories.flatMap((s) => s.frames.map((f) => s.n * 100 + f.n)))
  if (t['tf-frames'] !== undefined) {
    const F = head(t['tf-frames'], 'the table "tf-frames"', resCount, ulen)
    if (F.res !== resIndex) bad('tf-frames has another res than tf-parts')
    const frame = uints(F.f.frame, 'tf-frames.frame', F.n)
    const body = texts(F.f.text, F.n, 'tf-frames.text', false)
    frame.forEach((id, i) => {
      if (i > 0 && id <= frame[i - 1]) bad('tf-frames is not in ascending frames, without repeats')
      if (!inCoverage.has(Math.floor(id / 100))) bad(`tf-frames names the frame ${id}, of a story outside the coverage`)
      frames.push({ frame: id, text: body[i]! })
      known.add(id)
    })
  }
  const frameKnown = (id: number, what: string): void => {
    if (!known.has(id)) bad(`${what} names the frame ${id}, which is in neither "stories" nor tf-frames`)
  }

  // tf-questions
  const questions: ObsTfQuestion[] = []
  if (t['tf-questions'] !== undefined) {
    const Q = head(t['tf-questions'], 'the table "tf-questions"', resCount, ulen)
    if (Q.res !== resIndex) bad('tf-questions has another res than tf-parts')
    const qc = codes(Q.f.codes, FIXED, 'tf-questions')
    const code = (i: number, what: string): string => qc[i] ?? bad(`${what} names the code ${i}, and the table has ${qc.length}`)
    const qs = uints(Q.f.story, 'tf-questions.story', Q.n)
    const qp = uints(Q.f.part, 'tf-questions.part', Q.n)
    const ql = uints(Q.f.list, 'tf-questions.list', Q.n)
    const qk = uints(Q.f.k, 'tf-questions.k', Q.n)
    const fr = map(Q.f.frames, 'tf-questions.frames')
    const counts = uints(fr.count, 'tf-questions.frames.count', Q.n)
    const ids = decodeUvarints(bytes(fr.ids, 'tf-questions.frames.ids'))
    if (counts.reduce((a, b) => a + b, 0) !== ids.length) bad('tf-questions.frames.ids does not have as many ids as the counts add up to')
    const qq = texts(Q.f.q, Q.n, 'tf-questions.q', false)
    const qa = texts(Q.f.a, Q.n, 'tf-questions.a', true)
    const ref = refTexts(Q.f.refText, Q.n, 'tf-questions')
    let at = 0
    let last = ''
    let k = 0
    for (let i = 0; i < Q.n; i++) {
      if (!inCoverage.has(qs[i])) bad(`tf-questions row ${i} is of the story ${qs[i]}, which is not in the coverage`)
      const p = code(qp[i], `tf-questions.part[${i}]`)
      const l = code(ql[i], `tf-questions.list[${i}]`)
      if (!(TF_PARTS as readonly string[]).includes(p) || !(TF_LISTS as readonly string[]).includes(l)) bad(`tf-questions row ${i} has a part or list code of the other kind`)
      const place = `${qs[i]}/${p}`
      if (place !== last) {
        if (i > 0) {
          const [pStory, pPart] = last.split('/')
          if (qs[i] < Number(pStory) || (qs[i] === Number(pStory) && TF_PARTS.indexOf(p as (typeof TF_PARTS)[number]) <= TF_PARTS.indexOf(pPart as (typeof TF_PARTS)[number]))) bad(`tf-questions row ${i} is out of order`)
        }
        last = place
        k = 0
      }
      if (qk[i] !== ++k) bad(`tf-questions row ${i} has k ${qk[i]}, and it is ${k}th of its part`)
      const named = ids.slice(at, at + counts[i])
      at += counts[i]
      for (const id of named) frameKnown(id, `tf-questions row ${i}`)
      const row: ObsTfQuestion = { story: qs[i], part: p, list: l, k: qk[i], frames: named, q: qq[i]! }
      if (qa[i] !== undefined) row.a = qa[i]
      if (ref.has(i)) row.refText = ref.get(i)
      questions.push(row)
    }
  }

  // tf-terms
  const terms: ObsTfTerm[] = []
  if (t['tf-terms'] !== undefined) {
    const T = head(t['tf-terms'], 'the table "tf-terms"', resCount, ulen)
    if (T.res !== resIndex) bad('tf-terms has another res than tf-parts')
    const frame = uints(T.f.frame, 'tf-terms.frame', T.n)
    const tk = uints(T.f.k, 'tf-terms.k', T.n)
    const term = texts(T.f.term, T.n, 'tf-terms.term', true)
    const body = texts(T.f.text, T.n, 'tf-terms.text', false)
    const ref = refTexts(T.f.refText, T.n, 'tf-terms')
    let k = 0
    for (let i = 0; i < T.n; i++) {
      if (!inCoverage.has(Math.floor(frame[i] / 100))) bad(`tf-terms row ${i} is of a story outside the coverage`)
      if (i > 0 && frame[i] < frame[i - 1]) bad(`tf-terms row ${i} is out of order`)
      k = i > 0 && frame[i] === frame[i - 1] ? k + 1 : 1
      if (tk[i] !== k) bad(`tf-terms row ${i} has k ${tk[i]}, and it is ${k}th of its frame`)
      frameKnown(frame[i], `tf-terms row ${i}`)
      const row: ObsTfTerm = { frame: frame[i], k, text: body[i]! }
      if (term[i] !== undefined) row.term = term[i]
      if (ref.has(i)) row.refText = ref.get(i)
      terms.push(row)
    }
  }

  // tf-framework
  const framework: ObsTfModel['framework'] = []
  if (t['tf-framework'] !== undefined) {
    const W = head(t['tf-framework'], 'the table "tf-framework"', resCount, ulen)
    if (W.res !== resIndex) bad('tf-framework has another res than tf-parts')
    const wc = codes(W.f.codes, FRAMEWORK, 'tf-framework')
    const code = uints(W.f.code, 'tf-framework.code', W.n)
    const name = texts(W.f.name, W.n, 'tf-framework.name', true)
    const body = W.f.text === undefined ? undefined : texts(W.f.text, W.n, 'tf-framework.text', true)
    code.forEach((c, i) => {
      if (wc[c] === undefined) bad(`tf-framework.code[${i}] names the code ${c}, and the table has ${wc.length}`)
      if (i > 0 && c <= code[i - 1]) bad('tf-framework is not in the fixed order, without repeats')
      const row: ObsTfModel['framework'][number] = { code: wc[c] }
      if (name[i] !== undefined) row.name = name[i]
      if (body?.[i] !== undefined) row.text = body[i]
      framework.push(row)
    })
  }

  return { res: res[resIndex][0], stories: coverage, parts, questions, terms, shared, frames, framework }
}
