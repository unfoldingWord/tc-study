import { beforeEach, describe, expect, test } from 'bun:test'
import { HELPS_LANGUAGE_STORAGE_KEY } from './defaultHelpsLanguage'
import {
  READ_PANELS_STORAGE_KEY,
  readPersistedReadPanels,
  writePersistedReadPanels,
} from './readPanelPersistence'

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

describe('readPanelPersistence', () => {
  beforeEach(() => {
    g.localStorage?.removeItem(READ_PANELS_STORAGE_KEY)
    g.localStorage?.removeItem(HELPS_LANGUAGE_STORAGE_KEY)
  })

  test('reload restores independent panel languages (does not clobber helps)', () => {
    writePersistedReadPanels({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'es' },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      },
      layout: 'two',
      collapsedPanelId: null,
      splitPercent: 50,
      layoutUserChosen: true,
      seededBoth: true,
    })
    const next = readPersistedReadPanels()
    expect(next.panels['panel-1'].languageCode).toBe('es')
    expect(next.panels['panel-2'].languageCode).toBe('en')
    expect(next.panels['panel-1'].mode).toBe('scripture')
    expect(next.panels['panel-2'].mode).toBe('helps')
  })

  test('two scripture languages survive reload independently', () => {
    writePersistedReadPanels({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'es' },
        'panel-2': { mode: 'scripture', languageCode: 'en' },
      },
      layout: 'two',
      collapsedPanelId: null,
      splitPercent: 50,
      layoutUserChosen: false,
      seededBoth: true,
    })
    const next = readPersistedReadPanels()
    expect(next.panels['panel-1'].languageCode).toBe('es')
    expect(next.panels['panel-2'].languageCode).toBe('en')
    expect(next.panels['panel-2'].mode).toBe('scripture')
  })

  test('session restore inherits empty panel-2 from panel-1', () => {
    writePersistedReadPanels({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'tr' },
        'panel-2': { mode: 'helps', languageCode: null },
      },
      layout: 'two',
      collapsedPanelId: null,
      splitPercent: 50,
      layoutUserChosen: false,
      seededBoth: true,
    })
    const next = readPersistedReadPanels()
    expect(next.panels['panel-1'].languageCode).toBe('tr')
    expect(next.panels['panel-2'].languageCode).toBe('tr')
  })

  test('legacy helps key fills panel-2 only when the new store is empty', () => {
    g.localStorage?.setItem(HELPS_LANGUAGE_STORAGE_KEY, 'fr')
    const next = readPersistedReadPanels()
    expect(next.panels['panel-1'].languageCode).toBeNull()
    expect(next.panels['panel-2'].languageCode).toBe('fr')
    expect(next.seededBoth).toBe(false)
  })
})
