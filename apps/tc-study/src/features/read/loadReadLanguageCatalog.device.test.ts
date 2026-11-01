/**
 * loadReadLanguageCatalog run for real, with the app's own stores and panel mutations, against a Door43 that fails
 * or answers and a device catalog that holds what the es-419 language pack and the originals pack bring.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useAppStore } from '../../contexts/AppContext'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useNavigationStore } from '../nav/navigationStore'
import { addResource, getBaseResourceKey } from '../workspace/resourceMutations'
import { loadReadLanguageCatalog } from './loadReadLanguageCatalog'

enableMapSet()

const g = globalThis as typeof globalThis & { localStorage?: Storage }
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

const ES = 'es-419'
const GLT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const GST = 'es-419_gl/es-419/gst'
const HELPS = ['tq', 'twl', 'tw', 'ta'].map((id) => `es-419_gl/es-419/${id}`)
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

const row = (resourceKey: string, subject: string, title: string, version: string, type: string) => {
  const [owner, language, resourceId] = resourceKey.split('/')
  return {
    resourceKey,
    owner,
    language,
    resourceId,
    subject,
    title,
    version,
    type,
    availability: { online: false, offline: true, bundled: false, partial: false },
  }
}
const DEVICE: Record<string, ReturnType<typeof row>> = {
  [GLT]: row(GLT, 'Aligned Bible', 'Texto Puente Literal', 'v42', 'scripture'),
  [TN]: row(TN, 'TSV Translation Notes', 'Notas de traducción', 'v66', 'notes'),
  [UGNT]: row(UGNT, 'Greek New Testament', 'unfoldingWord Greek New Testament', 'v0.34', 'scripture'),
  [GST]: row(GST, 'Aligned Bible', 'Texto Puente Simplificado', 'v40', 'scripture'),
  [HELPS[0]]: row(HELPS[0], 'TSV Translation Questions', 'Preguntas', 'v38', 'questions'),
  [HELPS[1]]: row(HELPS[1], 'TSV Translation Words Links', 'Enlaces de palabras', 'v18', 'words-links'),
  [HELPS[2]]: row(HELPS[2], 'Translation Words', 'Palabras', 'v37', 'words'),
  [HELPS[3]]: row(HELPS[3], 'Translation Academy', 'Academia', 'v4', 'academy'),
}

const TYPES: Record<string, { type: string; contentRole: string }> = {
  'Aligned Bible': { type: 'scripture', contentRole: 'primary' },
  'Greek New Testament': { type: 'scripture', contentRole: 'primary' },
  'TSV Translation Notes': { type: 'notes', contentRole: 'companion' },
  'TSV Translation Questions': { type: 'questions', contentRole: 'companion' },
  'TSV Translation Words Links': { type: 'words-links', contentRole: 'companion' },
  'Translation Words': { type: 'words', contentRole: 'companion' },
  'Translation Academy': { type: 'academy', contentRole: 'companion' },
}
const registry = {
  getTypeForSubject: (subject: string) => TYPES[subject]?.type,
  get: (type: string) => Object.values(TYPES).find((t) => t.type === type),
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

const panelKeys = (id: string) =>
  (useWorkspaceStore.getState().currentPackage?.panels.find((p) => p.id === id)?.resourceKeys ?? []).map(getBaseResourceKey)

function setup() {
  const counts = { keys: 0, written: 0 }
  const catalogManager = {
    getAllResourceKeys: async () => {
      counts.keys++
      return Object.keys(DEVICE)
    },
    getResourceMetadata: async (key: string) => DEVICE[key] ?? null,
    addResourceToCatalog: async () => {
      counts.written++
    },
    catalogAdapter: { get: async (key: string) => DEVICE[key] ?? null },
  }
  const deps = {
    textLanguageCode: ES,
    helpsLanguageCode: ES,
    loadTarget: 'both' as const,
    navigationScope: 'bible',
    catalogManager: catalogManager as never,
    resourceTypeRegistry: registry as never,
    viewerRegistry: { hasViewer: () => true },
    getPanel: (id: string) => useWorkspaceStore.getState().currentPackage?.panels.find((p) => p.id === id),
    addResource: addResource as never,
    setActiveResourceInPanel: () => {},
    setExpectedResources: () => {},
    onMetadataBatch: () => {},
  }
  return { deps, counts }
}

/** The metadata phase runs after the load returns; wait until the catalog title reaches the loaded GLT. */
async function loadedTitle(key: string, expected: string): Promise<string | undefined> {
  for (let i = 0; i < 100; i++) {
    const found = Object.values(useAppStore.getState().loadedResources).find((r) => getBaseResourceKey(String(r?.id ?? '')) === key)
    if (found?.title === expected) return found.title
    await new Promise((r) => setTimeout(r, 10))
  }
  return Object.values(useAppStore.getState().loadedResources).find((r) => getBaseResourceKey(String(r?.id ?? '')) === key)?.title
}

const spies: Array<{ mockRestore(): void }> = []

describe('loadReadLanguageCatalog with a language from a pack', () => {
  beforeEach(resetStores)
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  test('no Door43: text, helps and the Greek come from the device catalog, into their panels', async () => {
    spies.push(
      spyOn(getDoor43ApiClient(), 'searchCatalog').mockImplementation(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const { deps, counts } = setup()
    const result = await loadReadLanguageCatalog(deps)

    expect(result.textKeys).toEqual(expect.arrayContaining([GLT, GST, UGNT]))
    expect(result.helpsKeys).toEqual(expect.arrayContaining([TN, ...HELPS]))
    expect(panelKeys('panel-1')).toEqual(expect.arrayContaining([GLT, GST, UGNT]))
    expect(panelKeys('panel-2')).toEqual(expect.arrayContaining([TN, ...HELPS]))
    // Nothing of another language, and no helps in the text panel.
    expect(panelKeys('panel-1').some((key) => [TN, ...HELPS].includes(key))).toBe(false)

    expect(await loadedTitle(GLT, 'Texto Puente Literal')).toBe('Texto Puente Literal')
    expect(await loadedTitle(UGNT, 'unfoldingWord Greek New Testament')).toBe('unfoldingWord Greek New Testament')
    // The pack's catalog rows are read as they are, never rebuilt from Door43 and written over.
    expect(counts.written).toBe(0)
  })

  test('Door43 answers: its hits are used and the device catalog is not read for them', async () => {
    spies.push(
      spyOn(getDoor43ApiClient(), 'searchCatalog').mockImplementation(async () => [
        { owner: 'es-419_gl', name: 'es-419_glt', language: ES, subject: 'Aligned Bible', title: 'From Door43', release: { tag_name: 'v42' } },
      ] as never)
    )
    const { deps, counts } = setup()
    const result = await loadReadLanguageCatalog(deps)

    expect(result.textKeys).toEqual(expect.arrayContaining([GLT]))
    expect(result.helpsKeys).not.toContain(TN)
    expect(panelKeys('panel-1')).toEqual(expect.arrayContaining([GLT]))
    expect(counts.keys).toBe(0)
  })
})
