import { describe, expect, test } from 'bun:test'
import { languageListDoor43Filter, resolveLanguageListKind } from './languageListKind'

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

describe('languageListDoor43Filter', () => {
  test('obs-helps omit topic; other lists stay tc-ready', () => {
    expect(languageListDoor43Filter('obs-helps')).toEqual({ stage: 'prod' })
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
