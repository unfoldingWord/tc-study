import { describe, expect, test } from 'bun:test'
import {
  collectResourceKeysFromPointers,
  collectResourceKeysFromWorkspace,
  parseResourceKeyParts,
} from './hydrateCollectionResources'

describe('hydrateCollectionResources helpers', () => {
  test('parseResourceKeyParts accepts owner/language/resourceId', () => {
    expect(parseResourceKeyParts('uw/en/ult')).toEqual({
      owner: 'uw',
      language: 'en',
      resourceId: 'ult',
    })
  })

  test('parseResourceKeyParts rejects invalid shapes', () => {
    expect(parseResourceKeyParts('uw/en')).toBeNull()
    expect(parseResourceKeyParts('')).toBeNull()
    expect(parseResourceKeyParts('a/b/c/d')).toBeNull()
    expect(parseResourceKeyParts('//ult')).toBeNull()
  })

  test('collectResourceKeysFromPointers builds keys', () => {
    const keys = collectResourceKeysFromPointers([
      { owner: 'uw', language: 'en', resourceId: 'tn' },
      { owner: 'door43', language: 'es', resourceId: 'tw' },
    ])
    expect([...keys].sort()).toEqual(['door43/es/tw', 'uw/en/tn'])
  })

  test('collectResourceKeysFromPointers handles empty', () => {
    expect(collectResourceKeysFromPointers(undefined).size).toBe(0)
    expect(collectResourceKeysFromPointers([]).size).toBe(0)
  })

  test('collectResourceKeysFromWorkspace prefers resources Map', () => {
    const keys = collectResourceKeysFromWorkspace({
      resources: new Map([['uw/en/ult', {}], ['uw/en/tn', {}]]),
      panels: [{ resourceKeys: ['ignored/x/y'] }],
    })
    expect([...keys].sort()).toEqual(['uw/en/tn', 'uw/en/ult'])
  })

  test('collectResourceKeysFromWorkspace falls back to panels', () => {
    const keys = collectResourceKeysFromWorkspace({
      resources: new Map(),
      panels: [{ resourceKeys: ['a/b/c', 'd/e/f'] }, { resourceKeys: ['a/b/c'] }],
    })
    expect([...keys].sort()).toEqual(['a/b/c', 'd/e/f'])
  })
})
