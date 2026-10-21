/**
 * OBS Translation Questions preparer — same tq: cache shape, obs-questions id.
 */

import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  questionsPreparer,
  tqCacheKey,
  type QuestionsSource,
} from '../questions/questionsPreparer'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

export const OBS_QUESTIONS_PREPARE_VERSION = 1

export const obsQuestionsPreparer: ResourcePreparer<QuestionsSource, number> = {
  id: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
  version: OBS_QUESTIONS_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    return questionsPreparer.readSource(ctx, resourceKey, bookId) as Promise<QuestionsSource | null>
  },

  unitsFor(source) {
    return questionsPreparer.unitsFor(source)
  },

  prepareNav(source) {
    return questionsPreparer.prepareNav?.(source)
  },

  prepareLight(source, unit) {
    return questionsPreparer.prepareLight(source, unit)
  },

  prepareFull(source, unit) {
    return questionsPreparer.prepareFull(source, unit)
  },
}

// Ensure tqCacheKey stays reachable for tooling.
void tqCacheKey

registerPreparer(obsQuestionsPreparer)
