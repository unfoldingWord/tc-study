import { describe, expect, test } from 'bun:test'
import { definePanelEntry } from './panelEntry'
import { PanelEntryRegistry } from './PanelEntryRegistry'
import { defineResourceType } from './types'

class DummyLoader {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_config: unknown) {}
}

function DummyViewer() {
  return null
}

function notesType() {
  return defineResourceType({
    id: 'notes',
    displayName: 'Notes',
    subjects: ['TSV Translation Notes'],
    loader: DummyLoader,
  })
}

function wordsLinksType() {
  return defineResourceType({
    id: 'words-links',
    displayName: 'Words Links',
    subjects: ['TSV Translation Words Links'],
    loader: DummyLoader,
  })
}

function questionsType() {
  return defineResourceType({
    id: 'questions',
    displayName: 'Questions',
    subjects: ['TSV Translation Questions'],
    loader: DummyLoader,
  })
}

function combinedHelpsEntry() {
  return definePanelEntry({
    id: 'combined-helps',
    displayName: 'Helps',
    icon: 'NotebookText',
    kind: 'composition',
    entryType: 'helps',
    consumes: ['notes', 'words-links'],
    viewer: DummyViewer,
    groupId: 'scripture',
    scope: 'scripture',
    injectWhen: 'any',
    persistId: '__combined-helps__',
  })
}

function questionsEntry() {
  return definePanelEntry({
    id: 'questions',
    displayName: 'Questions',
    kind: 'pane-member',
    entryType: 'helps',
    consumes: ['questions'],
    groupId: 'scripture',
  })
}

function createEntryRegistry(options?: {
  onRegisterViewer?: (viewer: { resourceType: string; canHandle: (m: unknown) => boolean }) => void
}) {
  const types = new Map([
    ['notes', notesType()],
    ['words-links', wordsLinksType()],
    ['questions', questionsType()],
  ])
  return new PanelEntryRegistry({
    hasResourceType: (id) => types.has(id),
    getResourceType: (id) => types.get(id),
    getAllResourceTypes: () => Array.from(types.values()),
    viewerRegistry: {
      registerViewer(viewer: { resourceType: string; canHandle: (m: unknown) => boolean }) {
        options?.onRegisterViewer?.(viewer)
      },
    },
  })
}

describe('definePanelEntry', () => {
  test('returns a composition entry (no subjects/loader/exclusive)', () => {
    const def = combinedHelpsEntry()
    expect(def.id).toBe('combined-helps')
    expect(def.kind).toBe('composition')
    expect(def.entryType).toBe('helps')
    expect(def.consumes).toEqual(['notes', 'words-links'])
    expect(def.persistId).toBe('__combined-helps__')
    expect(def.injectWhen).toBe('any')
    expect(def.viewer).toBe(DummyViewer)
    expect('subjects' in def).toBe(false)
    expect('loader' in def).toBe(false)
    expect('exclusive' in def).toBe(false)
  })

  test('pane-member TQ does not require viewer or persistId', () => {
    const def = questionsEntry()
    expect(def.kind).toBe('pane-member')
    expect(def.entryType).toBe('helps')
    expect(def.viewer).toBeUndefined()
    expect(def.persistId).toBeUndefined()
  })

  test('rejects missing required fields', () => {
    expect(() =>
      definePanelEntry({
        id: '',
        displayName: 'Helps',
        kind: 'composition',
        entryType: 'helps',
        consumes: ['notes'],
        viewer: DummyViewer,
        persistId: '__x__',
        injectWhen: 'any',
      })
    ).toThrow(/must have an id/)
    expect(() =>
      definePanelEntry({
        id: 'x',
        displayName: 'X',
        kind: 'composition',
        entryType: 'helps',
        consumes: [],
        viewer: DummyViewer,
        persistId: '__x__',
        injectWhen: 'any',
      })
    ).toThrow(/must consume at least one/)
    expect(() =>
      definePanelEntry({
        id: 'x',
        displayName: 'X',
        kind: 'composition',
        entryType: 'helps',
        consumes: ['notes'],
        persistId: '__x__',
        injectWhen: 'any',
      })
    ).toThrow(/must have a viewer/)
  })

  test('rejects subjects and loader', () => {
    expect(() =>
      definePanelEntry({
        id: 'x',
        displayName: 'X',
        kind: 'composition',
        entryType: 'helps',
        consumes: ['notes'],
        viewer: DummyViewer,
        persistId: '__x__',
        injectWhen: 'any',
        subjects: ['Combined Helps'],
      } as never)
    ).toThrow(/must not have subjects/)
  })
})

describe('PanelEntryRegistry', () => {
  test('register is viewer-only (no CatalogManager / subjects)', () => {
    const viewers: Array<{ resourceType: string; canHandle: (m: unknown) => boolean }> = []
    const registry = createEntryRegistry({
      onRegisterViewer: (viewer) => viewers.push(viewer),
    })

    registry.register(combinedHelpsEntry())
    expect(registry.get('combined-helps')?.persistId).toBe('__combined-helps__')
    expect(registry.getAll().map((e) => e.id)).toEqual(['combined-helps'])
    expect(registry.getCompositions().map((e) => e.id)).toEqual(['combined-helps'])

    const compositionViewer = viewers.find((v) => v.resourceType === 'combined-helps')
    expect(compositionViewer).toBeDefined()
    expect(compositionViewer?.canHandle({ type: 'combined-helps' })).toBe(true)
    expect(compositionViewer?.canHandle({ type: '__combined-helps__' })).toBe(true)
    expect(compositionViewer?.canHandle({ resourceKey: '__combined-helps__:panel-1' })).toBe(true)
    expect(compositionViewer?.canHandle({ resourceKey: '__combined-helps-obs__' })).toBe(false)
    expect(compositionViewer?.canHandle({ type: 'notes' })).toBe(false)
  })

  test('throws when consumed resource types are missing', () => {
    const registry = new PanelEntryRegistry({
      hasResourceType: () => false,
    })
    expect(() => registry.register(combinedHelpsEntry())).toThrow(
      /consumes unknown resource type 'notes'/
    )
  })

  test('resolve distinguishes persist id and scoped persist id', () => {
    const registry = createEntryRegistry()
    registry.register(combinedHelpsEntry())
    registry.register(questionsEntry())

    expect(registry.resolve('combined-helps')?.id).toBe('combined-helps')
    expect(registry.resolve('__combined-helps__')?.id).toBe('combined-helps')
    expect(registry.resolve('__combined-helps__:panel-1')?.id).toBe('combined-helps')
    expect(registry.resolve('questions')?.kind).toBe('pane-member')
    expect(registry.resolve('missing')).toBeUndefined()
  })

  test('shared consume: second composition may bind the same notes type', () => {
    const registry = createEntryRegistry()
    registry.register(combinedHelpsEntry())
    expect(() =>
      registry.register(
        definePanelEntry({
          id: 'other-helps',
          displayName: 'Other',
          kind: 'composition',
          entryType: 'helps',
          consumes: ['notes'],
          viewer: DummyViewer,
          groupId: 'scripture',
          injectWhen: 'any',
          persistId: '__other-helps__',
        })
      )
    ).not.toThrow()
    expect(registry.entriesConsuming('notes').map((e) => e.id)).toEqual([
      'combined-helps',
      'other-helps',
    ])
  })

  test('subjectsForCompositionAvailability unions consumed plugin subjects by group', () => {
    const registry = createEntryRegistry()
    registry.register(combinedHelpsEntry())
    expect(registry.subjectsForCompositionAvailability('scripture')).toEqual([
      'TSV Translation Notes',
      'TSV Translation Words Links',
    ])
    expect(registry.subjectsForCompositionAvailability('obs')).toEqual([])
  })

  test('TN has no 1:1 pane-member; TQ does', () => {
    const registry = createEntryRegistry()
    registry.register(combinedHelpsEntry())
    registry.register(questionsEntry())
    expect(registry.paneMembersConsuming('notes')).toEqual([])
    expect(registry.paneMembersConsuming('questions').map((e) => e.id)).toEqual(['questions'])
  })
})
