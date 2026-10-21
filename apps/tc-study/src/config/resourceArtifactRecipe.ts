/**
 * Resource artifact recipes — SoT grain, prepare tiers, and derived artifacts.
 *
 * Lives next to `loaderConfig` (download / plugin surfaces). Recipes declare
 * what to build from SoT; they do not download zips or crawl the canon.
 *
 * Lane 1 may hydrate one DCS file when local SoT is missing.
 * Lanes 2–3 read local SoT only (blocked if absent).
 */

import { RESOURCE_TYPE_IDS, type ResourceTypeId } from '../resourceTypes/resourceTypeIds'

export type SoTGrain = 'book' | 'chapter' | 'article' | 'story'

export type ArtifactKind = 'prepare' | 'quotes' | 'align' | 'preview'

export type RecipeNeed = 'ol-by-book'

export type PrepareTierKind = 'light' | 'full' | 'nav' | 'article'

export interface ResourceArtifactRecipe {
  typeId: ResourceTypeId
  /** How SoT is stored / fetched (book USFM/TSV, article body, OBS story). */
  sotGrain: SoTGrain
  /** IndexedDB key prefix for local SoT backend A (`scripture-usj:`, `tn:`, …). */
  sotPrefix: string
  prepareTiers: PrepareTierKind[]
  artifacts: ArtifactKind[]
  needs: RecipeNeed[]
}

const QUOTE_ALIGN_OL: Pick<ResourceArtifactRecipe, 'artifacts' | 'needs' | 'prepareTiers'> =
  {
    prepareTiers: ['light', 'full', 'nav'],
    artifacts: ['prepare', 'quotes', 'align'],
    needs: ['ol-by-book'],
  }

const PREPARE_ONLY: Pick<ResourceArtifactRecipe, 'artifacts' | 'needs' | 'prepareTiers'> = {
  prepareTiers: ['light', 'full', 'nav'],
  artifacts: ['prepare'],
  needs: [],
}

const PREPARE_ARTICLE_PREVIEW: Pick<
  ResourceArtifactRecipe,
  'artifacts' | 'needs' | 'prepareTiers'
> = {
  prepareTiers: ['article'],
  artifacts: ['prepare', 'preview'],
  needs: [],
}

/**
 * Recipe table keyed by canonical ResourceTypeId.
 * Extensibility: add a row here when a new type needs SoT → artifacts.
 */
export const ARTIFACT_RECIPES: ResourceArtifactRecipe[] = [
  {
    typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
    sotGrain: 'chapter',
    sotPrefix: 'scripture-usj:',
    ...PREPARE_ONLY,
  },
  {
    typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
    sotGrain: 'book',
    sotPrefix: 'tn:',
    ...QUOTE_ALIGN_OL,
  },
  {
    typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
    sotGrain: 'book',
    sotPrefix: 'twl:',
    ...QUOTE_ALIGN_OL,
  },
  {
    typeId: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
    sotGrain: 'book',
    sotPrefix: 'tq:',
    prepareTiers: ['light', 'full', 'nav'],
    artifacts: ['prepare'],
    needs: [],
  },
  {
    typeId: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
    sotGrain: 'article',
    sotPrefix: '',
    ...PREPARE_ARTICLE_PREVIEW,
  },
  {
    typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sotGrain: 'article',
    sotPrefix: '',
    ...PREPARE_ARTICLE_PREVIEW,
  },
  {
    typeId: RESOURCE_TYPE_IDS.OBS,
    sotGrain: 'story',
    sotPrefix: 'obs:',
    prepareTiers: ['light', 'full'],
    artifacts: ['prepare'],
    needs: [],
  },
  {
    typeId: RESOURCE_TYPE_IDS.OBS_NOTES,
    sotGrain: 'book',
    sotPrefix: 'tn:',
    ...PREPARE_ONLY,
  },
  {
    typeId: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
    sotGrain: 'book',
    sotPrefix: 'tq:',
    ...PREPARE_ONLY,
  },
  {
    typeId: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
    sotGrain: 'book',
    sotPrefix: 'twl:',
    prepareTiers: [],
    artifacts: [],
    needs: [],
  },
]

const BY_ID = new Map(ARTIFACT_RECIPES.map((r) => [r.typeId, r]))

export function getArtifactRecipe(typeId: string): ResourceArtifactRecipe | undefined {
  return BY_ID.get(typeId as ResourceTypeId)
}

export function recipeNeedsOlByBook(typeId: string): boolean {
  return getArtifactRecipe(typeId)?.needs.includes('ol-by-book') ?? false
}

export function recipeHasQuotes(typeId: string): boolean {
  return getArtifactRecipe(typeId)?.artifacts.includes('quotes') ?? false
}

export function recipeHasAlign(typeId: string): boolean {
  return getArtifactRecipe(typeId)?.artifacts.includes('align') ?? false
}

/** Every download/plugin loader row should have a recipe (compositions do not). */
export function loaderIdsMissingRecipe(loaderIds: readonly string[]): string[] {
  return loaderIds.filter((id) => !BY_ID.has(id as ResourceTypeId))
}
