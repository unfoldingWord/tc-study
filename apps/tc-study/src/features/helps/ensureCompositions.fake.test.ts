/**
 * Test-only fake composition — not registered in the app.
 * Proves ensure injects / drops from PanelEntryRegistry fields alone.
 */
import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import {
  definePanelEntry,
  defineResourceType,
  PanelEntryRegistry,
  ResourceTypeRegistry,
} from '@bt-synergy/resource-types'
import type { ResourceInfo } from '../../contexts/types'
import { setActiveRegistries } from '../../resourceTypes/activeRegistry'
import { ensureCompositions } from './ensureCompositions'

const FAKE_PERSIST_ID = '__fake-pair__'

class DummyLoader {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_config: unknown) {}
}

function DummyViewer() {
  return null
}

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

function fakeComposition() {
  return definePanelEntry({
    id: 'fake-pair',
    displayName: 'Fake Pair',
    kind: 'composition',
    entryType: 'helps',
    consumes: ['notes', 'words-links'],
    injectWhen: 'any',
    persistId: FAKE_PERSIST_ID,
    viewer: DummyViewer,
    groupId: 'scripture',
    scope: 'scripture',
  })
}

describe('ensureCompositions — test-only fake composition', () => {
  const fake = fakeComposition()

  test('injects a panel entry when any consumed type is present', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
    ])
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/tn'], activeIndex: 0 }]

    const out = ensureCompositions({
      resources,
      panels,
      languageCode: 'en',
      compositions: [fake],
      panelEntries: [fake],
    })
    expect(out.injected).toContain(FAKE_PERSIST_ID)
    expect(out.panels[0]!.resourceKeys).toEqual([FAKE_PERSIST_ID])
    expect(out.panels[0]!.entries?.map((e) => e.instanceId)).toEqual([FAKE_PERSIST_ID])
    expect(out.panels[0]!.entries?.[0]?.bindings).toEqual({ notes: 'u/en/tn' })
    expect(out.resources.has('u/en/tn')).toBe(true)
  })

  test('paints the composition instance, not TN/TWL keys', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const panels = [
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 },
    ]

    const out = ensureCompositions({
      resources,
      panels,
      languageCode: 'en',
      compositions: [fake],
      panelEntries: [fake],
    })
    expect(out.panels[0]!.resourceKeys).toEqual([FAKE_PERSIST_ID])
    expect(out.panels[0]!.entries?.[0]?.bindings).toEqual({
      notes: 'u/en/tn',
      'words-links': 'u/en/twl',
    })
  })

  test('drops the composition entry when inject condition fails', () => {
    const resources = new Map<string, ResourceInfo>([])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [FAKE_PERSIST_ID],
        entries: [
          { instanceId: FAKE_PERSIST_ID, entryId: 'fake-pair', bindings: { notes: 'u/en/tn' } },
        ],
        activeIndex: 0,
      },
    ]

    const out = ensureCompositions({
      resources,
      panels,
      languageCode: 'en',
      compositions: [fake],
      panelEntries: [fake],
    })
    expect(out.removed).toContain(FAKE_PERSIST_ID)
    expect(out.panels[0]!.resourceKeys).toEqual([])
  })

  test('shared consume: second composition can bind the same notes key', () => {
    const other = definePanelEntry({
      id: 'other-pair',
      displayName: 'Other',
      kind: 'composition',
      entryType: 'helps',
      consumes: ['notes'],
      injectWhen: 'any',
      persistId: '__other-pair__',
      viewer: DummyViewer,
      groupId: 'scripture',
    })
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 }]

    const out = ensureCompositions({
      resources,
      panels,
      languageCode: 'en',
      compositions: [fake, other],
      panelEntries: [fake, other],
    })
    const ids = out.panels[0]!.resourceKeys
    expect(ids).toContain(FAKE_PERSIST_ID)
    expect(ids).toContain('__other-pair__')
    const fakeInst = out.panels[0]!.entries?.find((e) => e.entryId === 'fake-pair')
    const otherInst = out.panels[0]!.entries?.find((e) => e.entryId === 'other-pair')
    expect(fakeInst?.bindings.notes).toBe('u/en/tn')
    expect(otherInst?.bindings.notes).toBe('u/en/tn')
  })

  test('honesty: registerPanelEntry alone is enough for the live registry path', () => {
    const types = new ResourceTypeRegistry({
      catalogManager: {
        registerResourceType() {},
        cacheAdapter: {},
        catalogAdapter: {},
        door43Client: {},
      },
      viewerRegistry: { registerViewer() {} },
    })
    types.register(
      defineResourceType({
        id: 'notes',
        displayName: 'Notes',
        subjects: ['TSV Translation Notes'],
        loader: DummyLoader,
      })
    )
    types.register(
      defineResourceType({
        id: 'words-links',
        displayName: 'Words Links',
        subjects: ['TSV Translation Words Links'],
        loader: DummyLoader,
      })
    )
    const entries = new PanelEntryRegistry({
      hasResourceType: (id) => types.has(id),
      getResourceType: (id) => types.get(id),
      getAllResourceTypes: () => types.getAll(),
      viewerRegistry: { registerViewer() {} },
    })
    entries.register(fakeComposition())
    setActiveRegistries({ resourceTypes: types, panelEntries: entries })

    try {
      const resources = new Map<string, ResourceInfo>([
        ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
        ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ])
      const panels = [
        { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 },
      ]
      const out = ensureCompositions({ resources, panels, languageCode: 'en' })
      expect(out.injected).toContain(FAKE_PERSIST_ID)
      expect(out.panels[0]!.resourceKeys).toEqual([FAKE_PERSIST_ID])
      expect(out.panels[0]!.entries?.[0]?.bindings.notes).toBe('u/en/tn')
    } finally {
      setActiveRegistries({ resourceTypes: null, panelEntries: null })
    }
  })

  test('ensure is a no-op before registry bind, then injects after entries register', () => {
    setActiveRegistries({ resourceTypes: null, panelEntries: null })
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
    ])
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/tn'], activeIndex: 0 }]

    const early = ensureCompositions({ resources, panels, languageCode: 'en' })
    expect(early.injected).toEqual([])
    expect(early.removed).toEqual([])
    expect(early.panels[0]!.resourceKeys).toEqual(['u/en/tn'])
    expect(early.resources.has(FAKE_PERSIST_ID)).toBe(false)
    expect(early.resources.has('__combined-helps__')).toBe(false)

    const types = new ResourceTypeRegistry({
      catalogManager: {
        registerResourceType() {},
        cacheAdapter: {},
        catalogAdapter: {},
        door43Client: {},
      },
      viewerRegistry: { registerViewer() {} },
    })
    types.register(
      defineResourceType({
        id: 'notes',
        displayName: 'Notes',
        subjects: ['TSV Translation Notes'],
        loader: DummyLoader,
      })
    )
    types.register(
      defineResourceType({
        id: 'words-links',
        displayName: 'Words Links',
        subjects: ['TSV Translation Words Links'],
        loader: DummyLoader,
      })
    )
    const entries = new PanelEntryRegistry({
      hasResourceType: (id) => types.has(id),
      getResourceType: (id) => types.get(id),
      getAllResourceTypes: () => types.getAll(),
      viewerRegistry: { registerViewer() {} },
    })
    entries.register(fakeComposition())
    setActiveRegistries({ resourceTypes: types, panelEntries: entries })
    try {
      const later = ensureCompositions({
        resources: early.resources,
        panels: early.panels,
        languageCode: 'en',
      })
      expect(later.injected).toContain(FAKE_PERSIST_ID)
      expect(later.panels[0]!.resourceKeys).toEqual([FAKE_PERSIST_ID])
    } finally {
      setActiveRegistries({ resourceTypes: null, panelEntries: null })
    }
  })
})
