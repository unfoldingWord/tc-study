/**
 * loadReadLanguageCatalog with the packs server on staging: a language format 3 serves is synced first and read from the
 * rows that sync wrote (the Door43 search is replaced by [] and the load is forced offline), never searched on Door43.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { memoryStore } from '@bt-synergy/language-pack-client'
import { enableMapSet } from 'immer'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useAppStore } from '../../contexts/AppContext'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useNavigationStore } from '../nav/navigationStore'
import { addResource, getBaseResourceKey } from '../workspace/resourceMutations'
import { packsV3, resetPacksV3 } from '../packsV3/client'
import { readV3Mode, resetReadV3 } from '../packsV3/readV3'
import { buildSample, fakeFetch } from '../packsV3/testing/sample'
import { loadReadLanguageCatalog } from './loadReadLanguageCatalog'

enableMapSet()

const g = globalThis as typeof globalThis & { localStorage?: Storage; location?: { search: string } }
const savedLocation = g.location
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

const GLT = 'es-419_gl/es-419/glt'
const registry = {
  getTypeForSubject: () => 'scripture',
  get: () => ({ type: 'scripture', contentRole: 'primary' }),
  getScopeForType: () => 'scripture',
  subjectsForHelpsCatalogLoad: () => [],
}

function resetStores() {
  useAppStore.setState({ loadedResources: {}, anchorResourceId: null, lastActiveScriptureResourceId: null, isInitialized: false })
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
  } as never)
  useNavigationStore.setState({
    currentReference: { ...useNavigationStore.getState().currentReference, book: 'tit', chapter: 1, verse: 1 },
  } as never)
}


describe('loadReadLanguageCatalog with format 3 on staging', () => {
  beforeEach(() => {
    resetStores()
    resetReadV3()
    resetPacksV3()
    g.location = { search: '?packs=staging' }
  })
  afterEach(() => {
    resetReadV3()
    resetPacksV3()
    g.location = savedLocation
  })

  test('a v3 language is read from its format 3 rows, with no Door43 search', async () => {
    const sample = await buildSample()
    await packsV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    const rows = new Map<string, unknown>()
    const catalogRows = new Map<string, unknown>()
    const catalogManager = {
      getAdapters: () => ({
        cache: {
          get: async (k: string) => rows.get(k) ?? null,
          getByPrefix: async (p: string) => [...rows].filter(([k]) => k.startsWith(p)).map(([key, entry]) => ({ key, entry })),
          putRawMany: async (rs: Array<{ key: string; entry: unknown }>) => void rs.forEach((r) => rows.set(r.key, r.entry)),
          deleteMany: async (ks: string[]) => void ks.forEach((k) => rows.delete(k)),
        },
        catalog: { get: async (k: string) => catalogRows.get(k) ?? null, set: async (k: string, m: unknown) => void catalogRows.set(k, m) },
      }),
      getAllResourceKeys: async () => [...catalogRows.keys()],
      getResourceMetadata: async (key: string) => catalogRows.get(key) ?? null,
      addResourceToCatalog: async () => {},
    }
    const search = spyOn(getDoor43ApiClient(), 'searchCatalog').mockImplementation(async () => {
      throw new Error('Door43 must not be searched for a v3 language')
    })
    try {
      const result = await loadReadLanguageCatalog({
        textLanguageCode: 'es-419',
        helpsLanguageCode: 'es-419',
        loadTarget: 'both',
        navigationScope: 'bible',
        catalogManager: catalogManager as never,
        resourceTypeRegistry: registry as never,
        viewerRegistry: { hasViewer: () => true },
        getPanel: (id: string) => useWorkspaceStore.getState().currentPackage?.panels.find((p) => p.id === id),
        addResource: addResource as never,
        setActiveResourceInPanel: () => {},
        setExpectedResources: () => {},
        onMetadataBatch: () => {},
      })
      expect(readV3Mode('es-419')).toBe('v3')
      expect(search).not.toHaveBeenCalled()
      expect(result.textKeys.concat(result.helpsKeys)).toContain(GLT)
    } finally {
      search.mockRestore()
      resetReadV3()
    }
  }, 120_000)
})
