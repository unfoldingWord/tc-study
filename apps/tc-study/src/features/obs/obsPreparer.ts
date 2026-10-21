/**
 * OBS story preparer — units are story numbers (1–50).
 * Cache key: obs:{resourceKey}:{NN}
 */

import {
  markdownToHastSync,
  stripMarkdownLight,
  type HastRoot,
} from '../../lib/markdown/markdownToHast'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

export const OBS_PREPARE_VERSION = 1

export function obsCacheKey(resourceKey: string, storyNumber: number): string {
  return `obs:${resourceKey}:${String(storyNumber).padStart(2, '0')}`
}

type ObsFrame = { frameNumber: number; imageUrl?: string; text: string }
type ParsedObsStory = {
  storyNumber: number
  title: string
  sourceReference?: string
  frames: ObsFrame[]
}

export type ObsSource = {
  resourceKey: string
  storyNumber: number
  story: ParsedObsStory
}

function unwrapStory(entry: unknown): ParsedObsStory | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  if (e.content && typeof e.content === 'object') {
    const c = e.content as Record<string, unknown>
    if (typeof c.storyNumber === 'number' && Array.isArray(c.frames)) {
      return c as unknown as ParsedObsStory
    }
  }
  if (typeof e.storyNumber === 'number' && Array.isArray(e.frames)) {
    return e as unknown as ParsedObsStory
  }
  return null
}

export const obsPreparer: ResourcePreparer<ObsSource, number> = {
  id: RESOURCE_TYPE_IDS.OBS,
  version: OBS_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const storyNumber = parseInt(bookId, 10)
    if (!Number.isFinite(storyNumber) || storyNumber < 1) return null
    const entry = await ctx.cacheAdapter.get(obsCacheKey(resourceKey, storyNumber))
    const story = unwrapStory(entry)
    if (!story) return null
    return { resourceKey, storyNumber, story }
  },

  unitsFor(source) {
    return [source.storyNumber]
  },

  prepareLight(source, _unit) {
    return {
      version: OBS_PREPARE_VERSION,
      unit: source.storyNumber,
      title: source.story.title,
      frames: source.story.frames.map((f) => ({
        frameNumber: f.frameNumber,
        text: stripMarkdownLight(f.text || ''),
      })),
    }
  },

  prepareFull(source, _unit) {
    return {
      version: OBS_PREPARE_VERSION,
      unit: source.storyNumber,
      title: source.story.title,
      sourceReference: source.story.sourceReference,
      frames: source.story.frames.map((f) => ({
        frameNumber: f.frameNumber,
        imageUrl: f.imageUrl,
        text: f.text || '',
        textHast: markdownToHastSync(f.text || '') as HastRoot,
      })),
    }
  },
}

registerPreparer(obsPreparer)
