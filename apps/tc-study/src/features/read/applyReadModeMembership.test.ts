import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enableMapSet } from 'immer'
import {
  paneTypeIdsForHelpsCatalogLoad,
  subjectsForHelpsCatalogLoad,
  typeIdsForHelpsCatalogLoad,
} from '@bt-synergy/resource-types'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import * as plugins from '../../resourceTypes'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from '../../resourceTypes/pluginRegistry'
import { COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { shouldInjectComposition } from '../helps/compositionInjection'
import {
  bindCombinedHelpsCompositionsForTest,
  bindFakeCompositionForTest,
  FAKE_COMPOSITION_PERSIST_ID,
} from '../helps/testCompositionRegistry'
import { HELPS_EMPTY_COPY, resolveHelpsPaneNoSourcesView } from '../helps/helpsEmptyCopy'
import { resetApplyEnsureFingerprint } from '../helps/applyCombinedHelpsEnsure'
import { addResource } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  applyReadModeMembership,
  packageHasHelpsCatalogTypes,
  panelHasHelpsMembership,
} from './applyReadModeMembership'
import { shouldLoadCatalogOnModeSwitch } from './downloadIsolationPolicy'
import { catalogSearchRequestsForTarget } from './readCatalogSearch'
import { resolveHelpsCatalogScope } from './resolveHelpsCatalogScope'
import { catalogLoadForSinglePanel } from './runReadPanelCatalog'

const registered = RESOURCE_TYPE_PLUGIN_EXPORTS.map((name) => plugins[name])
const scriptureCatalogTypeIds = typeIdsForHelpsCatalogLoad(registered, 'scripture')
const scripturePaneTypeIds = paneTypeIdsForHelpsCatalogLoad(registered, 'scripture')
const obsCatalogTypeIds = typeIdsForHelpsCatalogLoad(registered, 'obs')
const obsPaneTypeIds = paneTypeIdsForHelpsCatalogLoad(registered, 'obs')
const obsCatalogSubjects = subjectsForHelpsCatalogLoad(registered, 'obs')
const scriptureCompanionIds = registered
  .filter(
    (def) =>
      def.contentRole === 'companion' &&
      scriptureCatalogTypeIds.includes(def.id)
  )
  .map((def) => def.id)
const obsCompanionIds = registered
  .filter((def) => def.contentRole === 'companion' && obsCatalogTypeIds.includes(def.id))
  .map((def) => def.id)

enableMapSet()

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

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
    resetApplyEnsureFingerprint()
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

    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'scripture', scripturePaneTypeIds)
    expect(panelHasHelpsMembership('panel-1', 'scripture', scripturePaneTypeIds)).toBe(false)
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(false)
    expect(shouldInjectComposition({}, ['notes', 'words-links'], 'any')).toBe(false)

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
    addResource(res({ key: 'unfoldingWord/en/tw', type: 'words' }))
    addResource(res({ key: 'unfoldingWord/en/ta', type: 'academy' }))
    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'scripture', scripturePaneTypeIds)

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    const scoped = `${COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(
      shouldInjectComposition(
        { notes: 'unfoldingWord/en/tn', 'words-links': 'unfoldingWord/en/twl' },
        ['notes', 'words-links'],
        'any'
      )
    ).toBe(true)
    expect(p1.resourceKeys).toContain(scoped)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p1.resourceKeys).toContain('unfoldingWord/en/ult')
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(true)
    for (const id of scriptureCompanionIds) {
      expect([...pkg.resources.values()].some((r) => String(r.type) === id)).toBe(true)
    }
    expect(
      scriptureCompanionIds.some((id) =>
        p1.resourceKeys.some((key) => String(pkg.resources.get(key)?.type || '') === id)
      )
    ).toBe(true)
    expect(panelHasHelpsMembership('panel-1', 'scripture', scripturePaneTypeIds)).toBe(true)
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
    addResource(res({ key: 'unfoldingWord/en/tw', type: 'words' }))
    addResource(res({ key: 'unfoldingWord/en/ta', type: 'academy' }))
    applyReadModeMembership(
      'panel-2',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )

    expect(packageHasHelpsCatalogTypes('eng', scriptureCatalogTypeIds)).toBe(true)

    const p2Before = useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === 'panel-2')!
    applyReadModeMembership(
      'panel-1',
      'helps',
      'eng',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )
    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(p1.resourceKeys).toContain(`${COMBINED_HELPS_RESOURCE_ID}:panel-1`)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p2.resourceKeys).toEqual(p2Before.resourceKeys)
  })

  test('switch-back to helps projects companion content (not settled-empty skip)', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-2' })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }))
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }))
    addResource(res({ key: 'unfoldingWord/en/tq', type: 'questions' }))
    addResource(res({ key: 'unfoldingWord/en/tw', type: 'words' }))
    addResource(res({ key: 'unfoldingWord/en/ta', type: 'academy' }))
    applyReadModeMembership(
      'panel-2',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(true)
    expect(useAppStore.getState().loadedResources[COMBINED_HELPS_RESOURCE_ID]).toBeTruthy()
    expect(useAppStore.getState().loadedResources['unfoldingWord/en/tq']).toBeTruthy()

    applyReadModeMembership('panel-2', 'scripture', 'en', ['unfoldingWord/en/ult'], 'scripture')
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(true)

    applyReadModeMembership(
      'panel-2',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )
    const loaded = useAppStore.getState().loadedResources
    expect(loaded[COMBINED_HELPS_RESOURCE_ID]).toBeTruthy()
    expect(loaded['unfoldingWord/en/tq']).toBeTruthy()
    expect(loaded[COMBINED_HELPS_RESOURCE_ID]?.helpsTnResourceKey).toBe('unfoldingWord/en/tn')
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(true)
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

    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'obs', obsPaneTypeIds)
    expect(panelHasHelpsMembership('panel-1', 'obs', obsPaneTypeIds)).toBe(false)
    expect(packageHasHelpsCatalogTypes('en', obsCatalogTypeIds)).toBe(false)
    expect(shouldInjectComposition({}, ['notes', 'words-links'], 'any')).toBe(false)

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
        helpsSubjects: obsCatalogSubjects,
      }).map((r) => r.params.subject)
    ).toEqual(obsCatalogSubjects)
    expect(obsCatalogSubjects).toContain('TSV OBS Translation Questions')
    expect(obsCatalogSubjects).toContain('Translation Words')

    addResource(res({ key: 'unfoldingWord/en/obs-tn', type: 'obs-notes', subject: 'TSV OBS Translation Notes' }))
    applyReadModeMembership('panel-1', 'helps', 'en', textKeys, 'obs', obsPaneTypeIds)

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const scopedObs = `${OBS_COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(
      shouldInjectComposition({ 'obs-notes': 'unfoldingWord/en/obs-tn' }, ['obs-notes', 'obs-words-links'], 'any')
    ).toBe(true)
    expect(p1.resourceKeys).toContain(scopedObs)
    expect(p1.resourceKeys).toContain('unfoldingWord/en/obs')
    expect(packageHasHelpsCatalogTypes('en', obsCatalogTypeIds)).toBe(false)
    expect(panelHasHelpsMembership('panel-1', 'obs', obsPaneTypeIds)).toBe(true)
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

  test('OBS CombinedHelps only still hydrates every registered companion for obs', () => {
    addResource(res({ key: 'unfoldingWord/en/obs', type: 'obs' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/obs-tn', type: 'obs-notes' }))
    applyReadModeMembership('panel-1', 'helps', 'en', ['unfoldingWord/en/obs'], 'obs', obsPaneTypeIds)
    expect(packageHasHelpsCatalogTypes('en', obsCatalogTypeIds)).toBe(false)

    for (const def of registered) {
      if (!obsCatalogTypeIds.includes(def.id)) continue
      addResource(res({ key: `unfoldingWord/en/${def.id}`, type: def.id }))
    }
    applyReadModeMembership('panel-1', 'helps', 'en', ['unfoldingWord/en/obs'], 'obs', obsPaneTypeIds)

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    expect(packageHasHelpsCatalogTypes('en', obsCatalogTypeIds)).toBe(true)
    for (const id of obsCompanionIds) {
      expect([...pkg.resources.values()].some((r) => String(r.type) === id)).toBe(true)
    }
    expect(
      obsCompanionIds.some((id) =>
        p1.resourceKeys.some((key) => String(pkg.resources.get(key)?.type || '') === id)
      )
    ).toBe(true)
    expect(p1.resourceKeys).toContain(`${OBS_COMBINED_HELPS_RESOURCE_ID}:panel-1`)
    expect(p1.resourceKeys.some((key) => key.includes('obs-questions') || key.endsWith('/obs-questions'))).toBe(
      true
    )
  })

  test('Bible CombinedHelps only still hydrates every registered companion for scripture', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }))
    applyReadModeMembership(
      'panel-1',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(false)

    for (const def of registered) {
      if (!scriptureCatalogTypeIds.includes(def.id)) continue
      addResource(res({ key: `unfoldingWord/en/${def.id}`, type: def.id }))
    }
    applyReadModeMembership(
      'panel-1',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      scripturePaneTypeIds
    )

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    expect(packageHasHelpsCatalogTypes('en', scriptureCatalogTypeIds)).toBe(true)
    for (const id of scriptureCompanionIds) {
      expect([...pkg.resources.values()].some((r) => String(r.type) === id)).toBe(true)
    }
    expect(
      scriptureCompanionIds.some((id) =>
        p1.resourceKeys.some((key) => String(pkg.resources.get(key)?.type || '') === id)
      )
    ).toBe(true)
    expect(p1.resourceKeys.some((key) => key.includes('/questions'))).toBe(true)
  })

  test('TQ-only package injects questions without CombinedHelps; hideConsumed still hides TN/TWL', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/tq', type: 'questions' }))

    applyReadModeMembership(
      'panel-1',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      ['questions']
    )

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    expect(p1.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p1.resourceKeys.some((key) => key.includes('combined-helps'))).toBe(false)
    expect(p1.resourceKeys).not.toContain('unfoldingWord/en/tn')

    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }))
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }))
    applyReadModeMembership(
      'panel-1',
      'helps',
      'en',
      ['unfoldingWord/en/ult'],
      'scripture',
      ['questions']
    )

    const after = useWorkspaceStore.getState().currentPackage!
    const p1After = after.panels.find((p) => p.id === 'panel-1')!
    expect(p1After.resourceKeys).toContain(`${COMBINED_HELPS_RESOURCE_ID}:panel-1`)
    expect(p1After.resourceKeys).toContain('unfoldingWord/en/tq')
    expect(p1After.resourceKeys).not.toContain('unfoldingWord/en/tn')
    expect(p1After.resourceKeys).not.toContain('unfoldingWord/en/twl')
    expect(panelHasHelpsMembership('panel-1', 'scripture', ['questions'])).toBe(true)
  })

  test('es-419 scripture → helps uses companion membership, not no-sources empty', () => {
    addResource(
      res({
        key: 'es-419_gl/es-419/glt',
        type: 'scripture',
        language: 'es-419',
        languageCode: 'es-419',
      }),
      { panelId: 'panel-2' }
    )
    addResource(
      res({
        key: 'es-419_gl/es-419/tn',
        type: 'notes',
        language: 'es-419',
        languageCode: 'es-419',
      })
    )
    addResource(
      res({
        key: 'es-419_gl/es-419/twl',
        type: 'words-links',
        language: 'es-419',
        languageCode: 'es-419',
      })
    )
    addResource(
      res({
        key: 'es-419_gl/es-419/tq',
        type: 'questions',
        language: 'es-419',
        languageCode: 'es-419',
      })
    )
    addResource(
      res({
        key: 'es-419_gl/es-419/tw',
        type: 'words',
        language: 'es-419',
        languageCode: 'es-419',
      })
    )
    addResource(
      res({
        key: 'es-419_gl/es-419/ta',
        type: 'academy',
        language: 'es-419',
        languageCode: 'es-419',
      })
    )

    applyReadModeMembership(
      'panel-2',
      'helps',
      'es-419',
      ['es-419_gl/es-419/glt'],
      'scripture',
      scripturePaneTypeIds
    )

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(
      p2.resourceKeys.some(
        (key) => key === COMBINED_HELPS_RESOURCE_ID || key.startsWith(`${COMBINED_HELPS_RESOURCE_ID}:`)
      )
    ).toBe(true)
    expect(p2.resourceKeys).toContain('es-419_gl/es-419/tq')
    expect(panelHasHelpsMembership('panel-2', 'scripture', scripturePaneTypeIds)).toBe(true)
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'es-419',
        isLoading: false,
        hasResource: true,
        languageName: {
          code: 'es-419',
          name: 'Español Latin America',
          anglicizedName: 'Latin American Spanish',
        },
        catalogSettled: true,
      })
    ).toBeNull()
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'es-419',
        isLoading: false,
        hasResource: false,
        languageName: {
          code: 'es-419',
          name: 'Español Latin America',
          anglicizedName: 'Latin American Spanish',
        },
        catalogSettled: false,
      })
    ).toBeNull()
  })

  test('mode-switch handler hydrates helps without scripture reclear or URL hydrate', () => {
    const handler = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const mode = handler.slice(handler.indexOf('const handlePanelModeSwitch'))
    expect(mode).toContain('packageHasHelpsCatalogTypes')
    expect(mode).toContain('requestHelpsContentHydrate')
    expect(mode).toContain('consumedTypeIdsForHelpsMode')
    expect(mode).toContain('paneMemberConsumedTypeIdsForHelpsMode')
    expect(mode).toContain('helpsCatalogTypeIds')
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
    expect(load).toContain('!options.skipPanelClear &&')
  })
})

describe('fake composition membership (not isCombinedHelpsId)', () => {
  test('test-only persist id is helps membership via resolvePanelEntry', () => {
    const restore = bindFakeCompositionForTest()
    try {
      resetStores()
      const pkg = useWorkspaceStore.getState().currentPackage!
      pkg.resources.set(
        FAKE_COMPOSITION_PERSIST_ID,
        res({ key: FAKE_COMPOSITION_PERSIST_ID, type: 'fake-pair' })
      )
      const panel = pkg.panels.find((p) => p.id === 'panel-2')!
      panel.resourceKeys = [FAKE_COMPOSITION_PERSIST_ID]
      expect(panelHasHelpsMembership('panel-2', 'scripture', [])).toBe(true)
      expect(panelHasHelpsMembership('panel-2', 'obs', [])).toBe(false)
      expect(panelHasHelpsMembership('panel-2', 'scripture', scripturePaneTypeIds)).toBe(true)
    } finally {
      restore()
    }
  })
})
