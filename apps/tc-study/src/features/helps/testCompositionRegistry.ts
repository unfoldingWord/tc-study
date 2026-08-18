/**
 * Test-only registry bind. Not imported by production code.
 * CombinedHelps product tests bind CombinedHelps entries + modes;
 * fake-entry tests bind `__fake-pair__` without RESOURCE_TYPE_IDS.
 */

import {
  definePanelEntry,
  definePanelMode,
  defineResourceType,
  PanelEntryRegistry,
  PanelModeRegistry,
  ResourceTypeRegistry,
} from '@bt-synergy/resource-types'
import {
  getActivePanelEntryRegistry,
  getActivePanelModeRegistry,
  getActiveResourceTypeRegistry,
  setActiveRegistries,
} from '../../resourceTypes/activeRegistry'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'

export const FAKE_COMPOSITION_PERSIST_ID = '__fake-pair__'
export const FAKE_COMPOSITION_ID = 'fake-pair'

class DummyLoader {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_config: unknown) {}
}

function DummyViewer() {
  return null
}

function createEmptyTypeRegistry(): ResourceTypeRegistry {
  return new ResourceTypeRegistry({
    catalogManager: {
      registerResourceType() {},
      cacheAdapter: {},
      catalogAdapter: {},
      door43Client: {},
    },
    viewerRegistry: {
      registerViewer() {},
    },
  })
}

function registerConsumedTypes(registry: ResourceTypeRegistry): void {
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      displayName: 'Notes',
      subjects: ['TSV Translation Notes'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
      displayName: 'Words Links',
      subjects: ['TSV Translation Words Links'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.OBS_NOTES,
      displayName: 'OBS Notes',
      subjects: ['TSV OBS Translation Notes'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
      displayName: 'OBS Words Links',
      subjects: ['TSV OBS Translation Words Links'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.SCRIPTURE,
      displayName: 'Scripture',
      subjects: ['Bible'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
      displayName: 'Questions',
      icon: 'MessageCircleQuestion',
      subjects: ['TSV Translation Questions'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.OBS,
      displayName: 'OBS',
      subjects: ['Open Bible Stories'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
      displayName: 'OBS Questions',
      icon: 'MessageCircleQuestion',
      subjects: ['TSV OBS Translation Questions'],
      loader: DummyLoader,
    })
  )
}

function bindModes(): PanelModeRegistry {
  const modes = new PanelModeRegistry()
  modes.register(definePanelMode({ id: 'scripture', displayName: 'Scripture', allows: ['primary-text'] }))
  modes.register(definePanelMode({ id: 'helps', displayName: 'Helps', allows: ['helps'] }))
  return modes
}

function snapshot() {
  return {
    resourceTypes: getActiveResourceTypeRegistry(),
    panelEntries: getActivePanelEntryRegistry(),
    panelModes: getActivePanelModeRegistry(),
  }
}

export function bindCombinedHelpsCompositionsForTest(): () => void {
  const previous = snapshot()
  const types = createEmptyTypeRegistry()
  registerConsumedTypes(types)
  const entries = new PanelEntryRegistry({
    hasResourceType: (id) => types.has(id),
    getResourceType: (id) => types.get(id),
    getAllResourceTypes: () => types.getAll(),
    viewerRegistry: { registerViewer() {} },
  })
  entries.register(
    definePanelEntry({
      id: RESOURCE_TYPE_IDS.COMBINED_HELPS,
      displayName: 'Helps',
      icon: 'NotebookText',
      kind: 'composition',
      entryType: 'helps',
      consumes: [RESOURCE_TYPE_IDS.TRANSLATION_NOTES, RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS],
      injectWhen: 'any',
      groupId: 'scripture',
      scope: 'scripture',
      persistId: COMBINED_HELPS_RESOURCE_ID,
      viewer: DummyViewer,
    })
  )
  entries.register(
    definePanelEntry({
      id: RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS,
      displayName: 'OBS Helps',
      icon: 'NotebookText',
      kind: 'composition',
      entryType: 'helps',
      consumes: [RESOURCE_TYPE_IDS.OBS_NOTES, RESOURCE_TYPE_IDS.OBS_WORDS_LINKS],
      injectWhen: 'any',
      groupId: 'obs',
      scope: 'obs',
      persistId: OBS_COMBINED_HELPS_RESOURCE_ID,
      viewer: DummyViewer,
    })
  )
  entries.register(
    definePanelEntry({
      id: 'questions',
      displayName: 'Questions',
      kind: 'pane-member',
      entryType: 'helps',
      consumes: [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS],
      groupId: 'scripture',
    })
  )
  entries.register(
    definePanelEntry({
      id: 'primary-scripture',
      displayName: 'Scripture',
      kind: 'pane-member',
      entryType: 'primary-text',
      consumes: [RESOURCE_TYPE_IDS.SCRIPTURE],
      groupId: 'scripture',
    })
  )
  entries.register(
    definePanelEntry({
      id: 'primary-obs',
      displayName: 'OBS',
      kind: 'pane-member',
      entryType: 'primary-text',
      consumes: [RESOURCE_TYPE_IDS.OBS],
      groupId: 'obs',
    })
  )
  entries.register(
    definePanelEntry({
      id: 'obs-questions',
      displayName: 'OBS Questions',
      kind: 'pane-member',
      entryType: 'helps',
      consumes: [RESOURCE_TYPE_IDS.OBS_QUESTIONS],
      groupId: 'obs',
    })
  )
  setActiveRegistries({
    resourceTypes: types,
    panelEntries: entries,
    panelModes: bindModes(),
  })
  return () => setActiveRegistries(previous)
}

export function bindFakeCompositionForTest(): () => void {
  const previous = snapshot()
  const types = createEmptyTypeRegistry()
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
  entries.register(
    definePanelEntry({
      id: FAKE_COMPOSITION_ID,
      displayName: 'Fake Pair',
      kind: 'composition',
      entryType: 'helps',
      consumes: ['notes', 'words-links'],
      injectWhen: 'any',
      groupId: 'scripture',
      scope: 'scripture',
      persistId: FAKE_COMPOSITION_PERSIST_ID,
      viewer: DummyViewer,
    })
  )
  setActiveRegistries({
    resourceTypes: types,
    panelEntries: entries,
    panelModes: bindModes(),
  })
  return () => setActiveRegistries(previous)
}
