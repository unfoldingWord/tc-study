/**
 * `obsSession` and `obsPart`: the Five Movements session of an Open Bible Stories story, from the `tf-*` tables of the `obs` segment
 * (`spec/cddl/obs.cddl`). They are plain reads of the model, with no envelope: the session is one story of one language. A pack without
 * the tables, or a story outside the language's coverage, gives `null`. No Node module here.
 */
import type { ObsModel, ObsTfModel } from '@bt-synergy/language-pack-v3'

/** A question. `id` is positional and valid only for the release in `release` of the session (`spec/cddl/obs.cddl`, "Ids"). */
export type TfQuestionData = { id: string; q: string; a?: string; frames: number[]; refText?: string }
/** A translation term. */
export type TfTermData = { id: string; term?: string; text: string; refText?: string }
/** The terms of one frame, in order. */
export type TfTermsOfFrame = { frame: number; terms: TfTermData[] }
/** A list of a part: its heading and lead text, and its questions or its terms by frame. */
export type TfListData = { code: string; title?: string; text?: string; questions: TfQuestionData[]; terms: TfTermsOfFrame[] }
/** A part of the session. `block` is the shared block of the part (drafting, checking, M4, M5, the conclusion, a devotional). */
export type TfPartData = { code: string; title?: string; text?: string; block?: { key: string; title: string; text?: string }; lists: TfListData[] }
/** A frame of the story, with where its text comes from: `obs` (the language's own unit) or `manual` (the fallback of `tf-frames`). */
export type TfFrameData = { n: number; id: number; text: string; image?: string; source: 'obs' | 'manual' }
export type TfSessionData = {
  story: number
  title: string
  reference?: string
  /** The release of the manual the ids belong to. */
  release: string
  /** The stories that have a session in this language. */
  coverage: number[]
  frames: TfFrameData[]
  parts: TfPartData[]
}

const sessionParts = (tf: ObsTfModel, n: number): TfPartData[] => {
  const parts: TfPartData[] = []
  for (const b of tf.parts) {
    if (b.story !== n) continue
    if (b.list === undefined) {
      const block = b.shared === undefined ? undefined : tf.shared.find((s) => s.key === b.shared)
      const part: TfPartData = { code: b.part, lists: [] }
      if (b.title !== undefined) part.title = b.title
      if (b.text !== undefined) part.text = b.text
      if (block !== undefined) part.block = { ...block }
      parts.push(part)
    } else {
      // A list row follows the heading row of its part; a part that has no heading row of its own still gets one.
      let part = [...parts].reverse().find((p) => p.code === b.part)
      if (part === undefined) {
        part = { code: b.part, lists: [] }
        parts.push(part)
      }
      const list: TfListData = { code: b.list, questions: [], terms: [] }
      if (b.title !== undefined) list.title = b.title
      if (b.text !== undefined) list.text = b.text
      for (const q of tf.questions) {
        if (q.story !== n || q.part !== b.part || q.list !== b.list) continue
        const item: TfQuestionData = { id: `${n}/${q.part}/${q.k}`, q: q.q, frames: [...q.frames] }
        if (q.a !== undefined) item.a = q.a
        if (q.refText !== undefined) item.refText = q.refText
        list.questions.push(item)
      }
      if (b.list === 'terms') {
        for (const t of tf.terms) {
          if (Math.floor(t.frame / 100) !== n) continue
          let group = list.terms.find((g) => g.frame === t.frame)
          if (group === undefined) list.terms.push((group = { frame: t.frame, terms: [] }))
          const item: TfTermData = { id: `${n}:${t.frame % 100}/${t.k}`, text: t.text }
          if (t.term !== undefined) item.term = t.term
          if (t.refText !== undefined) item.refText = t.refText
          group.terms.push(item)
        }
      }
      part.lists.push(list)
    }
  }
  return parts
}

/** The session of story `n` (1 to 50): the parts in order, with their lists, and the frames of the story. `null` without the manual or outside its coverage. */
export function obsSessionOf(model: ObsModel | undefined, n: number): TfSessionData | null {
  const tf = model?.tf
  if (model === undefined || tf === undefined || !Number.isInteger(n) || !tf.stories.includes(n)) return null
  const story = model.stories.find((s) => s.n === n)
  const frames: TfFrameData[] = []
  if (story !== undefined) {
    for (const f of story.frames) frames.push({ n: f.n, id: n * 100 + f.n, text: f.text, ...(f.image === undefined ? {} : { image: f.image }), source: 'obs' })
  }
  for (const f of tf.frames) if (Math.floor(f.frame / 100) === n) frames.push({ n: f.frame % 100, id: f.frame, text: f.text, source: 'manual' })
  frames.sort((a, b) => a.n - b.n)
  const parts = sessionParts(tf, n)
  const title = story?.title ?? parts.find((p) => p.code === 'frames')?.title ?? ''
  const out: TfSessionData = {
    story: n,
    title,
    release: model.res.find(([key]) => key === tf.res)?.[1] ?? '',
    coverage: [...tf.stories],
    frames,
    parts,
  }
  if (story?.reference !== undefined) out.reference = story.reference
  return out
}

/** One part of a story's session by its fixed code (`intro`, `m1`…); `null` when the story has no such part. */
export function obsPartOf(model: ObsModel | undefined, n: number, code: string): TfPartData | null {
  return obsSessionOf(model, n)?.parts.find((p) => p.code === code) ?? null
}
