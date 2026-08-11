import { describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import { TranslationAcademyLoader } from './TranslationAcademyLoader'

describe('TranslationAcademyLoader.resourceType', () => {
  test('uses canonical short id academy (not Door43 repo id ta)', () => {
    const loader = new TranslationAcademyLoader({
      cacheAdapter: {},
      catalogAdapter: {},
      door43Client: {},
      debug: false,
    } as any)
    expect(loader.resourceType).toBe('academy')
    expect(loader.resourceType).toBe(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY)
    expect(loader.resourceType).not.toBe('ta')
  })
})
