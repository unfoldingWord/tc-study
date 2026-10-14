/**
 * tc-study's resource types without viewers, registered as the app registers them, so a run with no screen maps
 * Door43 subjects to the same types and builds the same catalog metadata (ingredients included).
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { ResourceTypeRegistry, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { obsResourceTypeBase } from '../resourceTypes/obs'
import { obsTranslationNotesResourceTypeBase } from '../resourceTypes/obsTranslationNotes'
import { obsTranslationQuestionsResourceTypeBase } from '../resourceTypes/obsTranslationQuestions'
import { obsTranslationWordsLinksResourceTypeBase } from '../resourceTypes/obsTranslationWordsLinks'
import { scriptureResourceTypeBase } from '../resourceTypes/scripture'
import { translationAcademyResourceTypeBase } from '../resourceTypes/translationAcademy'
import { translationNotesResourceTypeBase } from '../resourceTypes/translationNotes'
import { translationQuestionsResourceTypeBase } from '../resourceTypes/translationQuestions'
import { translationWordsResourceTypeBase } from '../resourceTypes/translationWords'
import { translationWordsLinksResourceTypeBase } from '../resourceTypes/translationWordsLinks'

/** In the order of tc-study's `resourceTypes/index.ts`. */
export const RESOURCE_TYPE_BASES: readonly ResourceTypeDefinition[] = [
  scriptureResourceTypeBase,
  obsResourceTypeBase,
  translationAcademyResourceTypeBase,
  translationNotesResourceTypeBase,
  translationQuestionsResourceTypeBase,
  translationWordsResourceTypeBase,
  translationWordsLinksResourceTypeBase,
  obsTranslationNotesResourceTypeBase,
  obsTranslationWordsLinksResourceTypeBase,
  obsTranslationQuestionsResourceTypeBase,
]

export function createHeadlessResourceTypeRegistry(catalogManager: CatalogManager): ResourceTypeRegistry {
  const registry = new ResourceTypeRegistry({
    catalogManager,
    viewerRegistry: { registerViewer: () => {} },
  })
  for (const definition of RESOURCE_TYPE_BASES) registry.register(definition)
  return registry
}
