import { describe, expect, test } from 'bun:test'
import {
  OBS_STORY_COUNT,
  obsStoryCacheKey,
  resolveObsStoryIds,
} from './obsStoryIds'

describe('resolveObsStoryIds', () => {
  test('returns empty when ingredients missing', () => {
    expect(resolveObsStoryIds(null)).toEqual([])
    expect(resolveObsStoryIds(undefined)).toEqual([])
    expect(resolveObsStoryIds([])).toEqual([])
  })

  test('uses numeric ingredient identifiers (padded)', () => {
    expect(
      resolveObsStoryIds([{ identifier: '1' }, { identifier: '02' }, { identifier: '3' }])
    ).toEqual(['01', '02', '03'])
  })

  test('directory-only obs ingredient expands to 01..50', () => {
    const ids = resolveObsStoryIds([{ identifier: 'obs' }])
    expect(ids).toHaveLength(OBS_STORY_COUNT)
    expect(ids[0]).toBe('01')
    expect(ids[49]).toBe('50')
  })

  test('dedupes numeric ids', () => {
    expect(resolveObsStoryIds([{ identifier: '1' }, { identifier: '01' }])).toEqual([
      '01',
    ])
  })
})

describe('obsStoryCacheKey', () => {
  test('pads story id to match ObsLoader keys', () => {
    expect(obsStoryCacheKey('unfoldingWord/en/obs', '1')).toBe(
      'obs:unfoldingWord/en/obs:01'
    )
  })
})
