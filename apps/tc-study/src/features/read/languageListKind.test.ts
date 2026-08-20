import { describe, expect, test } from 'bun:test'
import { languageListDoor43Filter, resolveLanguageListKind } from './languageListKind'

describe('resolveLanguageListKind', () => {
  test('text picker is always the global content union (nav scope ignored)', () => {
    expect(resolveLanguageListKind({ listMode: 'text' })).toBe('global')
    expect(resolveLanguageListKind({})).toBe('global')
    expect(
      resolveLanguageListKind({ listMode: 'text', navigationScope: 'scripture' })
    ).toBe('global')
    expect(resolveLanguageListKind({ listMode: 'text', navigationScope: 'obs' })).toBe(
      'global'
    )
  })

  test('helps picker is all-helps regardless of bible vs OBS nav', () => {
    expect(resolveLanguageListKind({ listMode: 'helps' })).toBe('all-helps')
    expect(
      resolveLanguageListKind({ listMode: 'helps', navigationScope: 'scripture' })
    ).toBe('all-helps')
    expect(resolveLanguageListKind({ listMode: 'helps', navigationScope: 'obs' })).toBe(
      'all-helps'
    )
  })
})

describe('languageListDoor43Filter', () => {
  test('all-helps and obs-helps omit topic; other lists stay tc-ready', () => {
    expect(languageListDoor43Filter('all-helps')).toEqual({ stage: 'prod' })
    expect(languageListDoor43Filter('obs-helps')).toEqual({ stage: 'prod' })
    expect(languageListDoor43Filter('helps')).toEqual({
      stage: 'prod',
      topic: 'tc-ready',
    })
    expect(languageListDoor43Filter('scripture')).toEqual({
      stage: 'prod',
      topic: 'tc-ready',
    })
    expect(languageListDoor43Filter('global')).toEqual({
      stage: 'prod',
      topic: 'tc-ready',
    })
  })
})
