/**
 * Behavioral suite: AppStore enrichment + anchor invariants (not arch-freeze).
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { ResourceType } from '@bt-synergy/resource-catalog'
import { upsertLoadedResourceMembership } from '../features/workspace/appStoreMembership'
import { useAppStore } from './AppContext'
import type { ResourceInfo } from './types'

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

describe('appStore behavior', () => {
  beforeEach(() => {
    useAppStore.setState({
      loadedResources: {},
      anchorResourceId: null,
      lastActiveScriptureResourceId: null,
      isInitialized: false,
    })
  })

  test('setAnchorResource does not stub-create missing membership', () => {
    useAppStore.getState().setAnchorResource('missing/key', {
      books: [{ code: 'GEN', name: 'Genesis' }],
      resourceId: 'ult',
      resourceType: 'scripture',
    })
    expect(useAppStore.getState().loadedResources['missing/key']).toBeUndefined()
    expect(useAppStore.getState().anchorResourceId).toBeNull()
    expect(useAppStore.getState().isInitialized).toBe(false)
  })

  test('setAnchorResource patches toc on existing membership', () => {
    upsertLoadedResourceMembership(res({ id: 'u/en/ult' }))
    useAppStore.getState().setAnchorResource('u/en/ult', {
      books: [{ code: 'TIT', name: 'Titus' }],
      resourceId: 'ult',
      resourceType: 'scripture',
    })
    expect(useAppStore.getState().anchorResourceId).toBe('u/en/ult')
    expect(useAppStore.getState().loadedResources['u/en/ult']?.toc?.books?.[0]?.code).toBe('TIT')
    expect(useAppStore.getState().isInitialized).toBe(true)
  })

  test('public AppStore has no membership mutators', () => {
    const state = useAppStore.getState() as Record<string, unknown>
    expect(state.addResource).toBeUndefined()
    expect(state.removeResource).toBeUndefined()
    expect(typeof state.patchLoadedResources).toBe('function')
  })

  test('patchLoadedResources enriches existing keys only', () => {
    upsertLoadedResourceMembership(
      res({ id: 'u/en/ult', title: 'ULT', verifiedIngredients: [] })
    )
    useAppStore.getState().patchLoadedResources([
      res({
        id: 'u/en/ult',
        title: 'Unlocked Literal Text',
        ingredients: [{ identifier: 'tit', path: './tit.usfm' }],
      }),
      res({ id: 'u/en/ghost', title: 'Should not create' }),
    ])
    expect(useAppStore.getState().loadedResources['u/en/ult']?.title).toBe(
      'Unlocked Literal Text'
    )
    // Premature empty verification reset when real ingredients arrive
    expect(useAppStore.getState().loadedResources['u/en/ult']?.verifiedIngredients).toBeUndefined()
    expect(useAppStore.getState().loadedResources['u/en/ghost']).toBeUndefined()
  })
})
