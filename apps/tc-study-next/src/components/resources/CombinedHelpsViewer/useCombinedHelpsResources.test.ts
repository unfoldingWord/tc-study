import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../../contexts/types'
import { resolveCombinedHelpsResourceKeys } from './useCombinedHelpsResources'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

describe('resolveCombinedHelpsResourceKeys', () => {
  test('ignores English injected keys when wantLang is Spanish', () => {
    const loadedResources = {
      'u/en/tn': res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }),
      'u/en/twl': res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }),
      'u/es/tn': res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' }),
      'u/es/twl': res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' }),
    }

    const result = resolveCombinedHelpsResourceKeys({
      loadedResources,
      wantLang: 'es',
      injectedTnKey: 'u/en/tn',
      injectedTwlKey: 'u/en/twl',
      helpsScope: 'scripture',
    })

    expect(result.tnKey).toBe('u/es/tn')
    expect(result.twlKey).toBe('u/es/twl')
  })

  test('keeps matching injected keys for wantLang', () => {
    const loadedResources = {
      'u/es/tn': res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' }),
      'u/es/twl': res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' }),
    }

    const result = resolveCombinedHelpsResourceKeys({
      loadedResources,
      wantLang: 'es',
      injectedTnKey: 'u/es/tn',
      injectedTwlKey: 'u/es/twl',
      helpsScope: 'scripture',
    })

    expect(result).toEqual({ tnKey: 'u/es/tn', twlKey: 'u/es/twl' })
  })

  test('finds TWL in the workspace package when Unlock 1 left it off loadedResources', () => {
    const loadedResources = {
      '__combined-helps__': res({
        key: '__combined-helps__',
        type: 'combined-helps',
        language: 'en',
        languageCode: 'en',
      }),
    }
    const packageResources = new Map<string, ResourceInfo>([
      ['__combined-helps__', loadedResources['__combined-helps__']!],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
    ])

    const result = resolveCombinedHelpsResourceKeys({
      loadedResources,
      packageResources,
      wantLang: 'en',
      helpsScope: 'scripture',
    })

    expect(result).toEqual({ tnKey: 'u/en/tn', twlKey: 'u/en/twl' })
  })

  test('keeps English helps keys when minority scripture is also loaded', () => {
    const loadedResources = {
      'u/bho/glt': res({ key: 'u/bho/glt', type: 'scripture', language: 'bho', languageCode: 'bho' }),
      'u/en/tn': res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }),
      'u/en/twl': res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }),
    }

    const result = resolveCombinedHelpsResourceKeys({
      loadedResources,
      wantLang: 'en',
      injectedTnKey: 'u/en/tn',
      injectedTwlKey: 'u/en/twl',
      helpsScope: 'scripture',
    })

    expect(result).toEqual({ tnKey: 'u/en/tn', twlKey: 'u/en/twl' })
  })
})

