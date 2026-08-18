import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { shouldInjectCombinedHelps } from '../helps/combinedHelpsInjection'
import { HELPS_EMPTY_COPY, resolveHelpsPaneNoSourcesView } from '../helps/helpsEmptyCopy'
import { addResource } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  applyReadModeMembership,
  panelHasHelpsMembership,
} from './applyReadModeMembership'
import { shouldLoadCatalogOnModeSwitch } from './downloadIsolationPolicy'
import { OBS_HELPS_SUBJECTS } from './languageAvailability'
import { catalogSearchRequestsForTarget } from './readCatalogSearch'
import { resolveHelpsCatalogScope } from './resolveHelpsCatalogScope'
import { catalogLoadForSinglePanel } from './runReadPanelCatalog'

enableMapSet()

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

function res(partial: Partial<ResourceInfo> & { key: string; type?: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: partial.key.split('/')[0] || 'u',
    language: 'en',
    languageCode: 'en',
    title: partial.title || partial.key,
    subject: 'Aligned Bible',
    version: '1.0.0',
    type: (partial.type || 'scripture') as ResourceType,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: partial.type || 'scripture',
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
}

describe('scripture → helps mode switch (helps catalog + CombinedHelps)', () => {
  beforeEach(() => {
    resetStores()
  })

  test('en scripture with ULT and no CombinedHelps loads helps catalog; empty is pending not no-sources', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), {
      panelId: 'panel-2',
      allowMultipleInstances: true,
    })

    const textKeys = ['unfoldingWord/en/ult']
    const helpsKeys: string[] = []
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'helps',
        languageCode: 'en',
        textKeys,
        helpsKeys,
      })
    ).toBe(true)

    applyReadModeMembership('panel-1', 'helps', 'en', textKeys)
    expect(panelHasHelpsMembership('panel-1')).toBe(false)
    expect(shouldInjectCombinedHelps({})).toBe(false)

    const pending = resolveHelpsPaneNoSourcesView({
      mode: 'helps',
      languageCode: 'en',
      isLoading: false,
      hasResource: false,
      languageName: 'English',
      catalogSettled: false,
    })
    expect(pending).toBeNull()
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'en',
        isLoading: true,
        hasResource: false,
        languageName: 'English',
        catalogSettled: false,
      })
    ).toBeNull()

    const load = catalogLoadForSinglePanel(
      {
        'panel-1': { mode: 'helps', languageCode: 'en' },
        'panel-2': { mode: 'scripture', languageCode: 'en' },
      },
      'panel-1'
    )
    expect(load).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      loadTarget: 'helps',
      destPanelId: 'panel-1',
    })

    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }))
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }))
    addResource(res({ key: 'unfoldingWord/en/tq', type: 'questions' }))
    applyReadModeMembership('panel-1', 'helps', 'en', textKeys)

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    const scoped = `${COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(shouldInjectCombinedHelps({ tnKey: 'unfoldingWord/en/tn', twlKey: 'unfoldingWord/en/twl' })).toBe(
      true
    )
    expect(p1.resourceKeys).toContain(scoped)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p1.resourceKeys).toContain('unfoldingWord/en/ult')
    expect(panelHasHelpsMembership('panel-1')).toBe(true)
    expect(p2.resourceKeys).toContain('unfoldingWord/en/ult#2')
    expect(p2.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(p2.resourceKeys).not.toContain(scoped)
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'en',
        isLoading: false,
        hasResource: true,
        languageName: 'English',
        catalogSettled: true,
      })
    ).toBeNull()
    expect(HELPS_EMPTY_COPY.noSources('English')).toBe("English doesn't have translation helps yet.")
  })

  test('already-loaded helps is membership swap only (en/eng aliases)', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }), { panelId: 'panel-2' })
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }), { panelId: 'panel-2' })
    addResource(res({ key: 'unfoldingWord/en/tq', type: 'questions' }), { panelId: 'panel-2' })
    applyReadModeMembership('panel-2', 'helps', 'en', ['unfoldingWord/en/ult'])

    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'helps',
        languageCode: 'eng',
        textKeys: ['unfoldingWord/en/ult'],
        helpsKeys: ['unfoldingWord/en/tn', 'unfoldingWord/en/twl', 'unfoldingWord/en/tq'],
      })
    ).toBe(false)

    const p2Before = useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === 'panel-2')!
    applyReadModeMembership('panel-1', 'helps', 'eng', ['unfoldingWord/en/ult'])
    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(p1.resourceKeys).toContain(`${COMBINED_HELPS_RESOURCE_ID}:panel-1`)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p2.resourceKeys).toEqual(p2Before.resourceKeys)
  })

  test('en OBS + empty OBS membership loads OBS subjects; CombinedHelps OBS injects after OBS-TN', () => {
    addResource(res({ key: 'unfoldingWord/en/obs', type: 'obs', subject: 'Open Bible Stories' }), {
      panelId: 'panel-1',
    })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }))
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }))

    const textKeys = ['unfoldingWord/en/obs']
    const helpsKeys = ['unfoldingWord/en/tn', 'unfoldingWord/en/twl']
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        thisPaneHasObsPrimary: true,
      })
    ).toBe('obs')
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'helps',
        languageCode: 'en',
        textKeys,
        helpsKeys,
        helpsScope: 'obs',
      })
    ).toBe(true)

    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'obs')
    expect(panelHasHelpsMembership('panel-1', 'obs')).toBe(false)
    expect(shouldInjectCombinedHelps({})).toBe(false)

    const pending = resolveHelpsPaneNoSourcesView({
      mode: 'helps',
      languageCode: 'en',
      isLoading: false,
      hasResource: false,
      languageName: 'English',
      catalogSettled: false,
    })
    expect(pending).toBeNull()

    const load = catalogLoadForSinglePanel(
      {
        'panel-1': { mode: 'helps', languageCode: 'en' },
        'panel-2': { mode: 'scripture', languageCode: 'en' },
      },
      'panel-1'
    )
    expect(load).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      loadTarget: 'helps',
      destPanelId: 'panel-1',
    })
    expect(
      catalogSearchRequestsForTarget({
        languageCode: 'en',
        target: 'helps',
        navigationScope: 'obs',
      }).map((r) => r.params.subject)
    ).toEqual([...OBS_HELPS_SUBJECTS])

    addResource(res({ key: 'unfoldingWord/en/obs-tn', type: 'obs-notes', subject: 'TSV OBS Translation Notes' }))
    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'obs')

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const scopedObs = `${OBS_COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(shouldInjectCombinedHelps({ tnKey: 'unfoldingWord/en/obs-tn' })).toBe(true)
    expect(p1.resourceKeys).toContain(scopedObs)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/obs')
    expect(panelHasHelpsMembership('panel-1', 'obs')).toBe(true)
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'en',
        isLoading: false,
        hasResource: true,
        languageName: 'English',
        catalogSettled: true,
      })
    ).toBeNull()
  })

  test('mode-switch handler hydrates helps without scripture reclear or URL hydrate', () => {
    const handler = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const mode = handler.slice(handler.indexOf('const handlePanelModeSwitch'))
    expect(mode).toContain('shouldLoadCatalogOnModeSwitch')
    expect(mode).toContain('resolveHelpsCatalogScope')
    expect(mode).toContain('navigationScope: helpsScope')
    expect(mode).toContain('resetCatalogSettled([panelId])')
    expect(mode).toContain('skipPanelClear: true')
    expect(mode).toContain('catalogLoadForSinglePanel')
    expect(mode).not.toContain('clearReadPanelsForLanguageSwitch')
    expect(mode).not.toContain('coldStartCatalogLoads')
    expect(mode).not.toContain('hydrateLanguagesFromUrl')
    expect(mode).not.toContain('maybeCancelDownloads')

    const load = readFileSync(join(import.meta.dir, 'useReadCatalogLoad.ts'), 'utf8')
    expect(load).toContain('skipPanelClear')
    expect(load).toContain('skipPanelClear: options.skipPanelClear')
  })
})
