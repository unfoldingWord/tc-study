import { beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_HELPS_LANGUAGE_CODE,
  HELPS_LANGUAGE_STORAGE_KEY,
  readPersistedHelpsLanguage,
  resolveAndPersistHelpsLanguage,
  resolveHelpsLanguage,
} from './defaultHelpsLanguage'

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

describe('resolveHelpsLanguage', () => {
  test('default lives in one constant and is English', () => {
    expect(DEFAULT_HELPS_LANGUAGE_CODE).toBe('en')
    expect(resolveHelpsLanguage('fr')).toBe(DEFAULT_HELPS_LANGUAGE_CODE)
  })

  test('accepts text language as input but does not infer a regional gateway', () => {
    expect(resolveHelpsLanguage('es-419')).toBe('en')
    expect(resolveHelpsLanguage('tpi')).toBe('en')
    expect(resolveHelpsLanguage('')).toBe('en')
  })

  test('still returns en when the text language would lack helps (mode-aware fallback is later)', () => {
    expect(resolveHelpsLanguage('xyz-no-helps')).toBe('en')
  })
})

describe('resolveAndPersistHelpsLanguage', () => {
  beforeEach(() => {
    g.localStorage?.removeItem(HELPS_LANGUAGE_STORAGE_KEY)
  })

  test('first launch persists the default with no user action', () => {
    expect(readPersistedHelpsLanguage()).toBeNull()
    expect(resolveAndPersistHelpsLanguage('fr')).toBe('en')
    expect(readPersistedHelpsLanguage()).toBe('en')
  })

  test('text-language changes do not reset the persisted helps language', () => {
    expect(resolveAndPersistHelpsLanguage('fr')).toBe('en')
    g.localStorage?.setItem(HELPS_LANGUAGE_STORAGE_KEY, 'es')
    expect(resolveAndPersistHelpsLanguage('tpi')).toBe('es')
    expect(readPersistedHelpsLanguage()).toBe('es')
  })
})
