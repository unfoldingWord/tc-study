import { describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '../resourceTypes/resourceTypeIds'
import { LOADER_CONFIGS } from './loaderConfig'
import {
  ARTIFACT_RECIPES,
  getArtifactRecipe,
  loaderIdsMissingRecipe,
  recipeHasAlign,
  recipeHasQuotes,
  recipeNeedsOlByBook,
} from './resourceArtifactRecipe'

describe('resourceArtifactRecipe', () => {
  test('TN needs ol-by-book + quotes + align', () => {
    const tn = getArtifactRecipe(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)
    expect(tn).toBeDefined()
    expect(tn!.needs).toContain('ol-by-book')
    expect(tn!.artifacts).toContain('quotes')
    expect(tn!.artifacts).toContain('align')
    expect(recipeNeedsOlByBook(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)).toBe(true)
    expect(recipeHasQuotes(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)).toBe(true)
    expect(recipeHasAlign(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)).toBe(true)
  })

  test('TWL matches TN quote/align needs', () => {
    const twl = getArtifactRecipe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS)
    expect(twl!.needs).toContain('ol-by-book')
    expect(twl!.artifacts).toEqual(
      expect.arrayContaining(['prepare', 'quotes', 'align'])
    )
  })

  test('scripture has prepare only — no quotes', () => {
    const s = getArtifactRecipe(RESOURCE_TYPE_IDS.SCRIPTURE)
    expect(s!.sotGrain).toBe('chapter')
    expect(s!.artifacts).toEqual(['prepare'])
    expect(s!.needs).toEqual([])
    expect(recipeHasQuotes(RESOURCE_TYPE_IDS.SCRIPTURE)).toBe(false)
  })

  test('TQ has no align', () => {
    const tq = getArtifactRecipe(RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS)
    expect(tq!.artifacts).not.toContain('align')
    expect(recipeHasAlign(RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS)).toBe(false)
    expect(tq!.artifacts).toContain('prepare')
  })

  test('TA/TW declare prepare-article + optional preview', () => {
    const ta = getArtifactRecipe(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY)
    const tw = getArtifactRecipe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS)
    expect(ta!.sotGrain).toBe('article')
    expect(ta!.prepareTiers).toContain('article')
    expect(ta!.artifacts).toContain('preview')
    expect(tw!.sotGrain).toBe('article')
    expect(tw!.artifacts).toContain('preview')
  })

  test('OBS has prepare; every loaderConfig id has a recipe', () => {
    expect(getArtifactRecipe(RESOURCE_TYPE_IDS.OBS)?.artifacts).toContain('prepare')
    expect(loaderIdsMissingRecipe(LOADER_CONFIGS.map((c) => c.id))).toEqual([])
    const recipeIds = new Set(ARTIFACT_RECIPES.map((r) => r.typeId))
    for (const cfg of LOADER_CONFIGS) {
      expect(recipeIds.has(cfg.id)).toBe(true)
    }
  })
})
