/**
 * Mid-session scripture language change: leftover UGNT/ULT must not hide
 * the switch-to-OBS empty (issue #25).
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { addResource } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { saveLanguagesCache } from './languagesCache'
import { UGNT_RESOURCE_KEY } from './originalLanguageForBook'
import { syncOriginalLanguageOnScripturePanels } from './originalLanguagePanelMembership'
import {
  applyScripturePanelMismatch,
  scriptureKeysForMismatchDisplay,
  shouldSkipTextCatalogForMismatch,
} from './scriptureLanguageMismatch'
import { TEXT_MODE_MISMATCH_COPY } from './textModeMismatch'

enableMapSet()

const SUBJECTS = ['Aligned Bible', 'Open Bible Stories']

const g = globalThis as typeof globalThis & { localStorage?: Storage }
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

function res(partial: Partial<ResourceInfo> & { key: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: partial.key.split('/')[0] || 'u',
    language: partial.languageCode || 'en',
    languageCode: partial.languageCode || 'en',
    title: partial.title || partial.key,
    subject: 'Aligned Bible',
    version: '1.0.0',
    type: ResourceType.SCRIPTURE,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: 'scripture',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    ...partial,
  } as ResourceInfo
}

function resetStores() {
  useAppStore.setState({
    loadedResources: {},
    anchorResourceId: null,
    lastActiveScriptureResourceId: null,
    isInitialized: false,
  })
  useWorkspaceStore.setState({
    currentPackage: {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      resources: new Map(),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
        { id: 'panel-2', name: 'P2', resourceKeys: [], activeIndex: 0, position: 1 },
      ],
    },
    isPackageModified: false,
  })
  localStorage.clear()
  saveLanguagesCache(
    [
      {
        code: 'en',
        name: 'English',
        anglicizedName: 'English',
        source: 'catalog',
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
      },
      {
        code: 'fr',
        name: 'Français',
        anglicizedName: 'French',
        source: 'catalog',
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
      },
    ],
    SUBJECTS
  )
}

function panelKeys(id: 'panel-1' | 'panel-2'): string[] {
  return useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === id)!.resourceKeys
}

function seedEnglishUltAndUgnt() {
  addResource(res({ key: 'unfoldingWord/en/ult', languageCode: 'en' }), { panelId: 'panel-1' })
  addResource(res({ key: UGNT_RESOURCE_KEY, languageCode: 'el-x-koine' }), { panelId: 'panel-1' })
}

describe('scripture language change to OBS-only (mid-session)', () => {
  beforeEach(() => {
    resetStores()
  })

  test('panel with UGNT+ULT set to OBS-only fr → switch-to-OBS empty, not UGNT', () => {
    seedEnglishUltAndUgnt()
    expect(panelKeys('panel-1')).toContain(UGNT_RESOURCE_KEY)
    expect(panelKeys('panel-1')).toContain('unfoldingWord/en/ult')

    const mismatch = applyScripturePanelMismatch({
      languageCode: 'fr',
      navigationScope: 'scripture',
      supportedSubjects: SUBJECTS,
      panelId: 'panel-1',
    })

    expect(mismatch?.kind).toBe('obs-only')
    expect(mismatch?.actionLabel).toBe(TEXT_MODE_MISMATCH_COPY.switchToStories)
    expect(mismatch?.actionShortLabel).toBe(TEXT_MODE_MISMATCH_COPY.stories)
    expect(mismatch?.message).toBe(TEXT_MODE_MISMATCH_COPY.noBibleHasObs('French (Français)'))
    expect(panelKeys('panel-1')).toEqual([])
    expect(scriptureKeysForMismatchDisplay([UGNT_RESOURCE_KEY, 'unfoldingWord/en/ult'], mismatch)).toEqual(
      []
    )
    expect(shouldSkipTextCatalogForMismatch({
      loadTarget: 'text',
      languageCode: 'fr',
      navigationScope: 'scripture',
      supportedSubjects: SUBJECTS,
    })).toBe(true)

    syncOriginalLanguageOnScripturePanels({
      bookCode: 'tit',
      scripturePanelIds: ['panel-1'],
    })
    expect(panelKeys('panel-1')).toEqual([])
    expect(panelKeys('panel-1')).not.toContain(UGNT_RESOURCE_KEY)
  })

  test('switching back to English is not a mismatch (catalog may hydrate ULT/UGNT)', () => {
    seedEnglishUltAndUgnt()
    applyScripturePanelMismatch({
      languageCode: 'fr',
      navigationScope: 'scripture',
      supportedSubjects: SUBJECTS,
      panelId: 'panel-1',
    })
    expect(panelKeys('panel-1')).toEqual([])

    const back = applyScripturePanelMismatch({
      languageCode: 'en',
      navigationScope: 'scripture',
      supportedSubjects: SUBJECTS,
      panelId: 'panel-1',
    })
    expect(back).toBeNull()
    expect(
      shouldSkipTextCatalogForMismatch({
        loadTarget: 'text',
        languageCode: 'en',
        navigationScope: 'scripture',
        supportedSubjects: SUBJECTS,
      })
    ).toBe(false)
  })

  test('helps catalog load is not skipped by a scripture mismatch', () => {
    expect(
      shouldSkipTextCatalogForMismatch({
        loadTarget: 'helps',
        languageCode: 'fr',
        navigationScope: 'scripture',
        supportedSubjects: SUBJECTS,
      })
    ).toBe(false)
  })
})
