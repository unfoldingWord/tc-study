import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../../contexts/types'
import { lookupHelpsSourceResource } from './HelpsSourcesMenu'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    title: partial.title,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

describe('lookupHelpsSourceResource', () => {
  test('prefers workspace package map over loadedResources (Unlock 1 TWL miss)', () => {
    const tn = res({ key: 'u/en/tn', type: 'notes', title: 'Translation Notes' })
    const twl = res({ key: 'u/en/twl', type: 'words-links', title: 'Translation Words List' })
    const packageResources = new Map<string, ResourceInfo>([
      ['u/en/tn', tn],
      ['u/en/twl', twl],
    ])
    // TN orphaned in AppStore; TWL never projected after CombinedHelps strip
    const loadedResources: Record<string, ResourceInfo | undefined> = {
      'u/en/tn': tn,
      '__combined-helps__': res({
        key: '__combined-helps__',
        type: 'combined-helps',
        title: 'Helps',
      }),
    }

    expect(lookupHelpsSourceResource('u/en/tn', packageResources, loadedResources)?.title).toBe(
      'Translation Notes'
    )
    expect(lookupHelpsSourceResource('u/en/twl', packageResources, loadedResources)?.title).toBe(
      'Translation Words List'
    )
    expect(lookupHelpsSourceResource('u/en/twl', undefined, loadedResources)).toBeUndefined()
  })

  test('falls back to loadedResources when package map omits key', () => {
    const twl = res({ key: 'u/en/twl', type: 'words-links', title: 'TWL' })
    expect(
      lookupHelpsSourceResource('u/en/twl', new Map(), { 'u/en/twl': twl })?.title
    ).toBe('TWL')
  })
})
