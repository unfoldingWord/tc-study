import { describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import {
  classifyWarmResource,
  sharesCurrentMode,
  typeIdFromCatalogId,
} from './warmResourceClass'

describe('warmResourceClass', () => {
  test('obs-tn / tn-obs are helps, not scripture', () => {
    const obsTn = classifyWarmResource('unfoldingWord/en/obs-tn')
    expect(obsTn.typeId).toBe(RESOURCE_TYPE_IDS.OBS_NOTES)
    expect(obsTn.isScripture).toBe(false)
    expect(obsTn.quotesOl).toBe(false)
    expect(obsTn.unitScope).toBe('obs-book')

    expect(typeIdFromCatalogId('tn-obs')).toBe(RESOURCE_TYPE_IDS.OBS_NOTES)
    expect(typeIdFromCatalogId('OBS-TN')).toBe(RESOURCE_TYPE_IDS.OBS_NOTES)
    expect(classifyWarmResource('uw/hi/tn-obs').isScripture).toBe(false)
  })

  test('bible ids map to prepare / quote / article scopes', () => {
    expect(classifyWarmResource('uw/en/ult')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      isScripture: true,
      hasPrepare: true,
      unitScope: 'canon',
    })
    expect(classifyWarmResource('uw/en/tn')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      quotesOl: true,
      aligns: true,
      helpsType: 'notes',
    })
    expect(classifyWarmResource('uw/en/twl')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
      helpsType: 'words-links',
      quotesOl: true,
    })
    expect(classifyWarmResource('uw/en/tq')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
      quotesOl: false,
      aligns: false,
      hasPrepare: true,
      unitScope: 'canon',
    })
    expect(classifyWarmResource('uw/en/tw')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
      isArticle: true,
      unitScope: 'articles',
    })
    expect(classifyWarmResource('uw/en/ta')).toMatchObject({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
      isArticle: true,
      unitScope: 'articles',
    })
  })

  test('unknown bible ids are scripture; obs-twl has no prepare surface', () => {
    expect(classifyWarmResource('uw/en/irv').isScripture).toBe(true)
    const obsTwl = classifyWarmResource('uw/en/obs-twl')
    expect(obsTwl.typeId).toBe(RESOURCE_TYPE_IDS.OBS_WORDS_LINKS)
    expect(obsTwl.hasPrepare).toBe(false)
    expect(obsTwl.unitScope).toBe('none')
  })

  test('Bible vs OBS mode filter', () => {
    expect(sharesCurrentMode(RESOURCE_TYPE_IDS.SCRIPTURE, 'tit')).toBe(true)
    expect(sharesCurrentMode(RESOURCE_TYPE_IDS.OBS_NOTES, 'tit')).toBe(false)
    expect(sharesCurrentMode(RESOURCE_TYPE_IDS.OBS, 'obs')).toBe(true)
    expect(sharesCurrentMode(RESOURCE_TYPE_IDS.SCRIPTURE, 'obs')).toBe(false)
  })
})
