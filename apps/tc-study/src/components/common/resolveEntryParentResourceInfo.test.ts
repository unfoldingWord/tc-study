import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { resolveEntryParentResourceInfo } from './resolveEntryParentResourceInfo'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.MARKDOWN,
    title: partial.title,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

describe('resolveEntryParentResourceInfo', () => {
  test('prefers package/loaded parent TW over synthetic catalog stub', () => {
    const tw = res({
      key: 'u/en/tw',
      type: 'words',
      title: 'Translation Words',
      readme: '# TW',
    })
    const found = resolveEntryParentResourceInfo(
      'u/en/tw',
      new Map([['u/en/tw', tw]]),
      {},
      { title: 'Stub', type: 'words' }
    )
    expect(found?.title).toBe('Translation Words')
    expect(found?.readme).toBe('# TW')
    expect(found?.key).toBe('u/en/tw')
  })

  test('uses catalog metadata when workspace has no TW/TA package', () => {
    const catalog = {
      resourceKey: 'u/en/ta',
      owner: 'u',
      language: 'en',
      resourceId: 'ta',
      title: 'Translation Academy',
      type: ResourceType.ACADEMY,
      subject: 'Translation Academy',
      version: 'v12',
      format: ResourceFormat.MARKDOWN,
      contentType: 'text/markdown',
      contentStructure: 'entry' as const,
      server: 'git.door43.org',
      availability: { online: true, offline: false, bundled: false, partial: false },
      locations: [],
      catalogedAt: '2020-01-01T00:00:00Z',
      urls: { metadata: 'https://example.com/manifest.yaml' },
      readme: '# TA README',
    }
    const found = resolveEntryParentResourceInfo('u/en/ta', undefined, {}, catalog)
    expect(found?.title).toBe('Translation Academy')
    expect(found?.readme).toBe('# TA README')
    expect(found?.owner).toBe('u')
    expect(found?.key).toBe('u/en/ta')
  })

  test('returns null for synthetic stub-only metadata (no real parent)', () => {
    expect(
      resolveEntryParentResourceInfo('u/en/tw', undefined, {}, { title: 'x', type: 'words' })
    ).toBeNull()
  })

  test('hydrates package README from loadedResources', () => {
    const twPackage = res({ key: 'u/en/tw', type: 'words', title: 'TW' })
    const twLoaded = res({
      key: 'u/en/tw',
      type: 'words',
      title: 'TW',
      readme: '# from loaded',
    })
    const found = resolveEntryParentResourceInfo(
      'u/en/tw',
      new Map([['u/en/tw', twPackage]]),
      { 'u/en/tw': twLoaded },
      null
    )
    expect(found?.readme).toBe('# from loaded')
  })
})
