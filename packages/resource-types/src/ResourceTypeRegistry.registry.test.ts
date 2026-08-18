import { describe, expect, test } from 'bun:test'
import { ResourceTypeRegistry } from './ResourceTypeRegistry'
import { defineResourceType } from './types'

class DummyLoader {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_config: unknown) {}
}

function DummyViewer() {
  return null
}

function createRegistry() {
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

describe('ResourceTypeRegistry — Door43 types only', () => {
  test('register stays catalog + loader; viewer is not a paint signal', () => {
    const registry = createRegistry()
    registry.register(
      defineResourceType({
        id: 'notes',
        displayName: 'Notes',
        subjects: ['TSV Translation Notes'],
        loader: DummyLoader,
        viewer: DummyViewer,
      })
    )
    expect(registry.get('notes')?.id).toBe('notes')
    expect(registry.getAll().map((t) => t.id)).toEqual(['notes'])
    expect(registry.getSupportedSubjects()).toEqual(['TSV Translation Notes'])
    expect((registry as unknown as { registerComposition?: unknown }).registerComposition).toBeUndefined()
    expect((registry as unknown as { getAllCompositions?: unknown }).getAllCompositions).toBeUndefined()
  })

  test('modal-only types (no viewer) still register', () => {
    const registry = createRegistry()
    registry.register(
      defineResourceType({
        id: 'words',
        displayName: 'Words',
        subjects: ['Translation Words'],
        loader: DummyLoader,
      })
    )
    expect(registry.get('words')?.viewer).toBeUndefined()
    expect(registry.has('words')).toBe(true)
  })

  test('still requires subjects and loader', () => {
    expect(() =>
      defineResourceType({
        id: 'notes',
        displayName: 'Notes',
        subjects: [],
        loader: DummyLoader,
      } as never)
    ).toThrow(/at least one subject/)
  })
})
