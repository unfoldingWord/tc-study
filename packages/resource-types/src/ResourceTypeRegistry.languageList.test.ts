import { describe, expect, test } from 'bun:test'
import { ResourceTypeRegistry } from './ResourceTypeRegistry'
import { defineResourceType } from './types'

class DummyLoader {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_config: unknown) {}
}

function registryWithContentPlugins() {
  const registry = new ResourceTypeRegistry({
    catalogManager: {
      registerResourceType() {},
      cacheAdapter: {},
      catalogAdapter: {},
      door43Client: {},
    },
    viewerRegistry: { registerViewer() {} },
  })
  registry.register(
    defineResourceType({
      id: 'scripture',
      displayName: 'Scripture',
      contentRole: 'primary',
      scope: 'scripture',
      subjects: ['Bible', 'Aligned Bible', 'Greek New Testament'],
      languageListSubjects: ['Bible', 'Aligned Bible'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: 'obs',
      displayName: 'OBS',
      contentRole: 'primary',
      scope: 'obs',
      subjects: ['Open Bible Stories'],
      loader: DummyLoader,
    })
  )
  registry.register(
    defineResourceType({
      id: 'notes',
      displayName: 'Notes',
      contentRole: 'companion',
      companionFor: ['scripture'],
      subjects: ['TSV Translation Notes'],
      loader: DummyLoader,
    })
  )
  return registry
}

describe('ResourceTypeRegistry.subjectsForLanguageList', () => {
  test('delegates to registered plugins', () => {
    const registry = registryWithContentPlugins()
    expect(registry.subjectsForLanguageList('scripture')).toEqual([
      'Bible',
      'Aligned Bible',
    ])
    expect(registry.subjectsForLanguageList('global')).toEqual([
      'Bible',
      'Aligned Bible',
      'Open Bible Stories',
    ])
    expect(registry.subjectsForLanguageList('helps')).toEqual(['TSV Translation Notes'])
    expect(registry.subjectsForLanguageList('all-helps')).toEqual(['TSV Translation Notes'])
  })
})
