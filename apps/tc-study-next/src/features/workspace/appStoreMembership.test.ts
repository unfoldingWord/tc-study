/**
 * Sealed membership helpers + patchLoadedResources cannot invent keys.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  removeLoadedResourceMembership,
  upsertLoadedResourceMembership,
} from './appStoreMembership'

function res(partial: Partial<ResourceInfo> & { id: string }): ResourceInfo {
  return {
    id: partial.id,
    key: partial.key ?? partial.id,
    resourceKey: partial.resourceKey ?? partial.id,
    title: partial.title ?? partial.id,
    type: (partial.type as ResourceInfo['type']) ?? ResourceType.SCRIPTURE,
    category: partial.category ?? 'scripture',
    ...partial,
  }
}

describe('appStoreMembership', () => {
  beforeEach(() => {
    useAppStore.setState({
      loadedResources: {},
      anchorResourceId: null,
      lastActiveScriptureResourceId: null,
      isInitialized: false,
    })
  })

  test('upsert and remove mutate loadedResources keys', () => {
    upsertLoadedResourceMembership(res({ id: 'u/en/ult', title: 'ULT' }))
    expect(useAppStore.getState().loadedResources['u/en/ult']?.title).toBe('ULT')

    upsertLoadedResourceMembership(res({ id: 'u/en/ult', title: 'Updated' }))
    expect(useAppStore.getState().loadedResources['u/en/ult']?.title).toBe('Updated')

    removeLoadedResourceMembership('u/en/ult')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
  })

  test('patchLoadedResources cannot invent membership', () => {
    useAppStore.getState().patchLoadedResources([
      res({ id: 'u/en/ghost', title: 'Phantom' }),
    ])
    expect(useAppStore.getState().loadedResources['u/en/ghost']).toBeUndefined()

    upsertLoadedResourceMembership(res({ id: 'u/en/ult', title: 'ULT' }))
    useAppStore.getState().patchLoadedResources([
      res({ id: 'u/en/ult', title: 'Enriched' }),
      res({ id: 'u/en/ghost', title: 'Still phantom' }),
    ])
    expect(useAppStore.getState().loadedResources['u/en/ult']?.title).toBe('Enriched')
    expect(useAppStore.getState().loadedResources['u/en/ghost']).toBeUndefined()
  })
})
