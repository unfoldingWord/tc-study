import { describe, expect, test } from 'bun:test'
import { subjectsForLanguageList } from '@bt-synergy/resource-types'
import * as plugins from '../../resourceTypes'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from '../../resourceTypes/pluginRegistry'
import {
  languageListDoor43Filter,
  pickerListCacheKey,
  resolveLanguageListKind,
  resolvePickerLanguageList,
  resolvePickerNavigationScope,
} from './languageListKind'

const registered = RESOURCE_TYPE_PLUGIN_EXPORTS.map((name) => plugins[name])

function subjectsForKind(kind: Parameters<typeof subjectsForLanguageList>[1]) {
  return subjectsForLanguageList(registered, kind)
}

describe('resolveLanguageListKind', () => {
  test('bootstrap (no scope) is the global content union', () => {
    expect(resolveLanguageListKind({ listMode: 'text' })).toBe('global')
    expect(resolveLanguageListKind({})).toBe('global')
  })

  test('content picker follows scripture vs OBS nav', () => {
    expect(
      resolveLanguageListKind({ listMode: 'text', navigationScope: 'scripture' })
    ).toBe('scripture')
    expect(resolveLanguageListKind({ listMode: 'text', navigationScope: 'obs' })).toBe(
      'obs'
    )
  })

  test('helps picker follows bible vs OBS nav', () => {
    expect(
      resolveLanguageListKind({ listMode: 'helps', navigationScope: 'scripture' })
    ).toBe('helps')
    expect(resolveLanguageListKind({ listMode: 'helps', navigationScope: 'obs' })).toBe(
      'obs-helps'
    )
    expect(resolveLanguageListKind({ listMode: 'helps' })).toBe('helps')
  })
})

describe('resolvePickerNavigationScope', () => {
  test('Read URL bible/obs wins over a stale store or omitted prop', () => {
    expect(
      resolvePickerNavigationScope({
        pathname: '/read/en/obs/story/1',
        storeScope: 'scripture',
        explicitScope: null,
      })
    ).toBe('obs')
    expect(
      resolvePickerNavigationScope({
        pathname: '/read/es/bible/ref/tit%201:1',
        storeScope: 'obs',
      })
    ).toBe('scripture')
  })

  test('explicit header scope is used when the URL has no bible/obs segment', () => {
    expect(
      resolvePickerNavigationScope({
        pathname: '/read/en',
        explicitScope: 'obs',
        storeScope: 'scripture',
      })
    ).toBe('obs')
  })

  test('bare /read stays null so bootstrap can fetch the global union', () => {
    expect(
      resolvePickerNavigationScope({
        pathname: '/read',
        storeScope: 'scripture',
      })
    ).toBeNull()
    expect(
      resolvePickerNavigationScope({
        pathname: '/read/',
        storeScope: 'obs',
      })
    ).toBeNull()
  })
})

describe('resolvePickerLanguageList (header contract)', () => {
  test('obs + helps requests obs-helps subjects, not bible TSV TN', () => {
    const { kind, subjects } = resolvePickerLanguageList({
      listMode: 'helps',
      navigationScope: 'obs',
      subjectsForKind,
    })
    expect(kind).toBe('obs-helps')
    expect(subjects).toContain('TSV OBS Translation Notes')
    expect(subjects).toContain('Translation Words')
    expect(subjects).toContain('Translation Academy')
    expect(subjects).not.toContain('TSV Translation Notes')
    expect(subjects).not.toContain('Open Bible Stories')
  })

  test('text + scripture does not include Open Bible Stories', () => {
    const { kind, subjects } = resolvePickerLanguageList({
      listMode: 'text',
      navigationScope: 'scripture',
      subjectsForKind,
    })
    expect(kind).toBe('scripture')
    expect(subjects).toContain('Bible')
    expect(subjects).toContain('Aligned Bible')
    expect(subjects).not.toContain('Open Bible Stories')
  })

  test('null scope on an OBS Read URL does not fall back to global', () => {
    const { kind, subjects } = resolvePickerLanguageList({
      listMode: 'text',
      navigationScope: null,
      pathname: '/read/en/obs/story/1',
      storeScope: 'scripture',
      subjectsForKind,
    })
    expect(kind).toBe('obs')
    expect(subjects).toEqual(['Open Bible Stories'])
  })

  test('scripture and obs-helps cache keys do not collide', () => {
    const scripture = resolvePickerLanguageList({
      listMode: 'text',
      navigationScope: 'scripture',
      subjectsForKind,
    })
    const obsHelps = resolvePickerLanguageList({
      listMode: 'helps',
      navigationScope: 'obs',
      subjectsForKind,
    })
    expect(scripture.cacheKey).not.toBe(obsHelps.cacheKey)
    expect(scripture.cacheKey).toBe(pickerListCacheKey('scripture', scripture.subjects))
  })
})

describe('languageListDoor43Filter', () => {
  test('obs-helps omit topic; other lists stay tc-ready', () => {
    expect(languageListDoor43Filter('obs-helps')).toEqual({ stage: 'prod' })
    expect(languageListDoor43Filter('all-helps')).toEqual({ stage: 'prod' })
    expect(languageListDoor43Filter('helps')).toEqual({
      stage: 'prod',
      topic: 'tc-ready',
    })
    expect(languageListDoor43Filter('scripture')).toEqual({
      stage: 'prod',
      topic: 'tc-ready',
    })
  })
})
