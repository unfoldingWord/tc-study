import { describe, expect, test } from 'bun:test'
import { buildEntryModalResourceInfo } from './buildEntryModalResourceInfo'

describe('buildEntryModalResourceInfo', () => {
  test('prefers the loaded resource reference when present', () => {
    const resource = { id: 'u/en/ta', title: 'TA', type: 'academy' }
    const metadata = { title: 'Other', type: 'academy' }
    expect(buildEntryModalResourceInfo('u/en/ta', resource, metadata)).toBe(resource)
  })

  test('builds a stable-shaped fallback from catalog metadata', () => {
    const metadata = { title: 'Translation Academy', type: 'academy' }
    expect(buildEntryModalResourceInfo('u/en/ta', null, metadata)).toEqual({
      id: 'u/en/ta',
      key: 'u/en/ta',
      title: 'Translation Academy',
      type: 'academy',
      metadata,
    })
  })

  test('returns null when neither resource nor metadata is available', () => {
    expect(buildEntryModalResourceInfo('u/en/ta', null, null)).toBeNull()
    expect(buildEntryModalResourceInfo(undefined, null, { title: 'x' })).toBeNull()
  })
})
