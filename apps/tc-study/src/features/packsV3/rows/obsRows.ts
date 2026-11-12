import type { PackReader } from '@bt-synergy/language-pack-client'
import { obsView } from '@bt-synergy/language-pack-v3'
import type { ObsStory } from '@bt-synergy/language-pack-v3'
import { type ParsedObsStory, obsStoryCacheKey } from '@bt-synergy/resource-pipeline'
import { linksRows, notesRows, questionsRows } from './helpsRows'
import type { Row } from './scriptureRows'

/** The book code the OBS helps carry in their keys (`tn:{res}:obs:{story}`). */
const OBS_BOOK = 'obs'

/**
 * A story as `parseObsStoryMarkdown` gives it. The segment keeps a frame's image as published, so `imageUrl` is that text (a
 * frame without an image has `''`) and `resolvedSrc` is set where the loader's own rule makes it the same text: an absolute
 * `http(s)` address. A relative address is resolved by the loader against the repository's release URL, which the segment
 * does not keep, so it has no `resolvedSrc` here.
 */
function parsedStory(story: ObsStory): ParsedObsStory {
  return {
    storyNumber: story.n,
    title: story.title,
    sourceReference: story.reference ?? null,
    frames: story.frames.map((f) => {
      const imageUrl = f.image ?? ''
      return { frameNumber: f.n, imageUrl, ...(/^https?:\/\//.test(imageUrl.trim()) ? { resolvedSrc: imageUrl.trim() } : {}), text: f.text }
    }),
  }
}

/**
 * The rows of the Open Bible Stories of a language as the Door43 loaders write them: `obs:{res}:{NN}` as `ObsLoader` stores a
 * story (`{content: ParsedObsStory, timestamp, resourceKey, storyId}`, the key from the loader's own `obsStoryCacheKey`), and
 * the OBS notes, questions and word links under the `tn:`, `tq:` and `twl:` keys of the book `obs`, through the writers of
 * `helpsRows` (a note's `Reference` is `story:frame`, so the parser's chapter is the story). Empty when the language has no
 * OBS segment. The study notes and study questions the segment can carry have no rows in format 2.0 and give none.
 */
export async function obsRows(reader: PackReader): Promise<Row[]> {
  const segments = await reader.segments('obs')
  const seg = segments?.find((s) => s.h.class === 'obs')
  if (!seg) return []
  const model = obsView(seg)
  const now = Date.now()
  const rows: Row[] = model.stories.map((story) => {
    const storyId = String(story.n).padStart(2, '0')
    return { key: obsStoryCacheKey(story.res, storyId), value: { content: parsedStory(story), timestamp: now, resourceKey: story.res, storyId } }
  })
  if (model.notes) rows.push(...(await notesRows(model.notes, OBS_BOOK, model.lang)))
  if (model.questions) rows.push(...(await questionsRows(model.questions, OBS_BOOK, model.lang)))
  if (model.links) rows.push(...(await linksRows(model.links, OBS_BOOK)))
  return rows
}
