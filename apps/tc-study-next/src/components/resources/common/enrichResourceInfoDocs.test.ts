import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../../contexts/types'
import {
  mergeResourceInfoDocs,
  resolveResourceMetadataUrl,
} from './enrichResourceInfoDocs'

function res(partial: Partial<ResourceInfo> & { key: string }): ResourceInfo {
  return {
    id: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'tn',
    language: 'en',
    languageCode: 'en',
    owner: 'unfoldingWord',
    category: 'notes',
    format: ResourceFormat.TSV,
    type: ResourceType.NOTES,
    title: 'TN',
    ...partial,
  } as ResourceInfo
}

describe('resolveResourceMetadataUrl', () => {
  test('prefers urls.metadata', () => {
    const url = resolveResourceMetadataUrl(
      res({
        key: 'u/en/tn',
        urls: { metadata: 'https://git.door43.org/u/en_tn/raw/tag/v1/manifest.yaml' },
      })
    )
    expect(url).toBe('https://git.door43.org/u/en_tn/raw/tag/v1/manifest.yaml')
  })

  test('constructs tag URL from release.tag_name', () => {
    const url = resolveResourceMetadataUrl(
      res({
        key: 'unfoldingWord/en/tn',
        owner: 'unfoldingWord',
        language: 'en',
        resourceId: 'tn',
        release: { tag_name: 'v86' },
      })
    )
    expect(url).toBe(
      'https://git.door43.org/unfoldingWord/en_tn/raw/tag/v86/manifest.yaml'
    )
  })

  test('falls back to master branch', () => {
    const url = resolveResourceMetadataUrl(
      res({
        key: 'unfoldingWord/en/tn',
        owner: 'unfoldingWord',
        language: 'en',
        resourceId: 'tn',
      })
    )
    expect(url).toBe(
      'https://git.door43.org/unfoldingWord/en_tn/raw/branch/master/manifest.yaml'
    )
  })
})

describe('mergeResourceInfoDocs', () => {
  test('hydrates missing readme from secondary', () => {
    const primary = res({ key: 'u/en/tn', title: 'Notes' })
    const secondary = res({ key: 'u/en/tn', readme: '# Hello' })
    expect(mergeResourceInfoDocs(primary, secondary).readme).toBe('# Hello')
  })

  test('keeps primary readme when present', () => {
    const primary = res({ key: 'u/en/tn', readme: '# Primary' })
    const secondary = res({ key: 'u/en/tn', readme: '# Secondary' })
    expect(mergeResourceInfoDocs(primary, secondary).readme).toBe('# Primary')
  })
})
