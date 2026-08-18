import { describe, expect, test } from 'bun:test'
import { ResourceFormat } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import {
  buildCompositionResourceInfo,
  compositionBaseKey,
  findConsumedKeys,
  resolveResourceTypeForKey,
  shouldInjectComposition,
} from './compositionInjection'

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

const SCRIPTURE_CONSUMES = [
  RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
] as const
const OBS_CONSUMES = [RESOURCE_TYPE_IDS.OBS_NOTES, RESOURCE_TYPE_IDS.OBS_WORDS_LINKS] as const

describe('compositionInjection', () => {
  test('shouldInjectComposition injects when any consumed type exists', () => {
    expect(shouldInjectComposition({ notes: 'a', 'words-links': 'b' }, SCRIPTURE_CONSUMES, 'any')).toBe(
      true
    )
    expect(shouldInjectComposition({ notes: 'a' }, SCRIPTURE_CONSUMES, 'any')).toBe(true)
    expect(shouldInjectComposition({ 'words-links': 'b' }, SCRIPTURE_CONSUMES, 'any')).toBe(true)
    expect(shouldInjectComposition({}, SCRIPTURE_CONSUMES, 'any')).toBe(false)
  })

  test('findConsumedKeys finds scripture and OBS pairs', () => {
    const resources = [
      fakeResource({ key: 'uw/en/tn', type: 'notes' }),
      fakeResource({ key: 'uw/en/twl', type: 'twl' }),
      fakeResource({ key: 'uw/en/obs-tn', type: 'obs-notes' }),
      fakeResource({ key: 'uw/en/obs-twl', type: 'obs-words-links' }),
    ]
    expect(findConsumedKeys(resources, SCRIPTURE_CONSUMES, { langCode: 'en' })).toEqual({
      notes: 'uw/en/tn',
      'words-links': 'uw/en/twl',
    })
    expect(findConsumedKeys(resources, OBS_CONSUMES, { langCode: 'en' })).toEqual({
      'obs-notes': 'uw/en/obs-tn',
      'obs-words-links': 'uw/en/obs-twl',
    })
  })

  test('en URL matches helps catalog keyed under eng (and reverse)', () => {
    const engCatalog = [
      fakeResource({
        key: 'unfoldingWord/eng/tn',
        type: 'notes',
        language: 'eng',
        languageCode: 'eng',
      }),
      fakeResource({
        key: 'unfoldingWord/eng/twl',
        type: 'twl',
        language: 'eng',
        languageCode: 'eng',
      }),
    ]
    const fromEn = findConsumedKeys(engCatalog, SCRIPTURE_CONSUMES, { langCode: 'en' })
    expect(shouldInjectComposition(fromEn, SCRIPTURE_CONSUMES, 'any')).toBe(true)
    expect(fromEn).toEqual({
      notes: 'unfoldingWord/eng/tn',
      'words-links': 'unfoldingWord/eng/twl',
    })

    const enCatalog = [
      fakeResource({ key: 'unfoldingWord/en/tn', type: 'notes' }),
      fakeResource({ key: 'unfoldingWord/en/twl', type: 'twl' }),
    ]
    const fromEng = findConsumedKeys(enCatalog, SCRIPTURE_CONSUMES, { langCode: 'eng' })
    expect(shouldInjectComposition(fromEng, SCRIPTURE_CONSUMES, 'any')).toBe(true)
    expect(fromEng).toEqual({
      notes: 'unfoldingWord/en/tn',
      'words-links': 'unfoldingWord/en/twl',
    })
  })

  test('injects when only one side present', () => {
    const resources = [fakeResource({ key: 'uw/en/tn', type: 'notes' })]
    const found = findConsumedKeys(resources, SCRIPTURE_CONSUMES, { langCode: 'en' })
    expect(shouldInjectComposition(found, SCRIPTURE_CONSUMES, 'any')).toBe(true)
  })

  test('buildCompositionResourceInfo writes consumedKeys + product TN/TWL bindings', () => {
    const scripture = buildCompositionResourceInfo({
      composition: {
        id: RESOURCE_TYPE_IDS.COMBINED_HELPS,
        displayName: 'Helps',
        consumes: SCRIPTURE_CONSUMES,
        injectWhen: 'any',
        kind: 'composition',
        entryType: 'helps',
        scope: 'scripture',
        persistId: COMBINED_HELPS_RESOURCE_ID,
      },
      languageCode: 'en',
      consumedKeys: { notes: 'a', 'words-links': 'b' },
    })
    expect(scripture.key).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(scripture.type).toBe('combined-helps')
    expect(scripture.consumedKeys).toEqual({ notes: 'a', 'words-links': 'b' })
    expect(scripture.helpsTnResourceKey).toBe('a')
    expect(scripture.helpsTwlResourceKey).toBe('b')

    const obs = buildCompositionResourceInfo({
      composition: {
        id: RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS,
        displayName: 'OBS Helps',
        consumes: OBS_CONSUMES,
        injectWhen: 'any',
        kind: 'composition',
        entryType: 'helps',
        scope: 'obs',
        persistId: OBS_COMBINED_HELPS_RESOURCE_ID,
      },
      languageCode: 'en',
      consumedKeys: { 'obs-notes': 'a', 'obs-words-links': 'b' },
    })
    expect(obs.key).toBe(OBS_COMBINED_HELPS_RESOURCE_ID)
    expect(obs.type).toBe('obs-combined-helps')
  })

  test('resolveResourceTypeForKey uses #N and :panel-N base keys', () => {
    expect(compositionBaseKey('u/en/tn#2')).toBe('u/en/tn')
    expect(compositionBaseKey('u/en/twl:panel-1')).toBe('u/en/twl')
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', fakeResource({ key: 'u/en/tn', type: 'notes' })],
    ])
    expect(resolveResourceTypeForKey(resources, 'u/en/tn#2')).toBe('notes')
    expect(resolveResourceTypeForKey(resources, 'u/en/tn:panel-1')).toBe('notes')
    expect(resolveResourceTypeForKey(resources, 'u/en/twl#2')).toBeUndefined()
  })
})
