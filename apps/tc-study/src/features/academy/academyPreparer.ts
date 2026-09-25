/**
 * Translation Academy preparer — article units (entryId as bookId).
 * Cache key: `{resourceKey}/{entryId}` (raw markdown string).
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

export const ACADEMY_PREPARE_VERSION = 1

export type AcademySource = {
  resourceKey: string
  entryId: string
  markdown: string
}

function readMarkdown(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && 'content' in entry) {
    const c = (entry as { content: unknown }).content
    if (typeof c === 'string') return c
  }
  return null
}

export const academyPreparer: ResourcePreparer<AcademySource, string> = {
  id: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  version: ACADEMY_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, entryId: string) {
    const key = `${resourceKey}/${entryId}`
    const entry = await ctx.cacheAdapter.get(key)
    const markdown = readMarkdown(entry)
    if (markdown == null) return null
    return { resourceKey, entryId, markdown }
  },

  unitsFor(source) {
    return [source.entryId]
  },

  prepareLight(source, _unit) {
    return {
      version: ACADEMY_PREPARE_VERSION,
      unit: source.entryId,
      body: stripMarkdownLight(source.markdown),
    }
  },

  prepareFull(source, _unit) {
    return {
      version: ACADEMY_PREPARE_VERSION,
      unit: source.entryId,
      bodyHast: markdownToHastSync(source.markdown) as HastRoot,
      markdown: source.markdown,
    }
  },
}

registerPreparer(academyPreparer)
