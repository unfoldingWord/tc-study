import { describe, expect, test } from 'bun:test'
import { ResourceFormat } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import {
  buildCombinedHelpsResourceInfo,
  findHelpsKeysAmongResources,
  shouldInjectCombinedHelps,
} from './combinedHelpsInjection'

function fakeResource(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    title: partial.key,
    category: partial.type,
    owner: 'org',
    language: 'en',
    languageCode: 'en',
    languageName: 'English',
    resourceId: 'x',
    server: 'git.door43.org',
    format: ResourceFormat.TSV,
    contentType: 'text/tsv',
    contentStructure: 'book',
    version: '1',
    description: '',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    ...partial,
  } as ResourceInfo
}

describe('combinedHelpsInjection', () => {
  test('shouldInjectCombinedHelps injects when either side exists', () => {
    expect(shouldInjectCombinedHelps({ tnKey: 'a', twlKey: 'b' })).toBe(true)
    expect(shouldInjectCombinedHelps({ tnKey: 'a' })).toBe(true)
    expect(shouldInjectCombinedHelps({ twlKey: 'b' })).toBe(true)
    expect(shouldInjectCombinedHelps({})).toBe(false)
  })

  test('findHelpsKeysAmongResources finds scripture and OBS pairs', () => {
    const resources = [
      fakeResource({ key: 'uw/en/tn', type: 'notes' }),
      fakeResource({ key: 'uw/en/twl', type: 'twl' }),
      fakeResource({ key: 'uw/en/obs-tn', type: 'obs-notes' }),
      fakeResource({ key: 'uw/en/obs-twl', type: 'obs-words-links' }),
    ]
    expect(findHelpsKeysAmongResources(resources, 'scripture', { langCode: 'en' })).toEqual({
      tnKey: 'uw/en/tn',
      twlKey: 'uw/en/twl',
    })
    expect(findHelpsKeysAmongResources(resources, 'obs', { langCode: 'en' })).toEqual({
      tnKey: 'uw/en/obs-tn',
      twlKey: 'uw/en/obs-twl',
    })
  })

  test('injects when only one side present', () => {
    const resources = [fakeResource({ key: 'uw/en/tn', type: 'notes' })]
    const pair = findHelpsKeysAmongResources(resources, 'scripture', { langCode: 'en' })
    expect(shouldInjectCombinedHelps(pair)).toBe(true)
  })

  test('buildCombinedHelpsResourceInfo sets ids and types', () => {
    const scripture = buildCombinedHelpsResourceInfo({
      scope: 'scripture',
      languageCode: 'en',
      tnKey: 'a',
      twlKey: 'b',
    })
    expect(scripture.key).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(scripture.type).toBe('combined-helps')

    const obs = buildCombinedHelpsResourceInfo({
      scope: 'obs',
      languageCode: 'en',
      tnKey: 'a',
      twlKey: 'b',
    })
    expect(obs.key).toBe(OBS_COMBINED_HELPS_RESOURCE_ID)
    expect(obs.type).toBe('obs-combined-helps')
  })
})
