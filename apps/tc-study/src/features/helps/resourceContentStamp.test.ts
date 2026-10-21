import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from './resourceContentStamp'

describe('resourceContentStamp', () => {
  test('uses tag_name and published_at when both present', () => {
    expect(
      resourceContentStamp({
        version: 'v44',
        release: { tag_name: 'v45', published_at: '2024-01-15T12:00:00Z' },
      })
    ).toBe('v45#2024-01-15T12_00_00Z')
  })

  test('falls back to top-level version when release missing', () => {
    expect(resourceContentStamp({ version: 'v45' })).toBe('v45')
  })

  test('falls back to published_at alone when tag missing', () => {
    expect(
      resourceContentStamp({
        release: { published_at: '2024-01-15T12:00:00Z' },
      })
    ).toBe('2024-01-15T12_00_00Z')
  })

  test('returns nostamp for null/undefined/empty metadata', () => {
    expect(resourceContentStamp(null)).toBe('nostamp')
    expect(resourceContentStamp(undefined)).toBe('nostamp')
    expect(resourceContentStamp({})).toBe('nostamp')
    expect(resourceContentStamp({ version: '  ' })).toBe('nostamp')
  })

  test('sanitizes key separators from stamp parts', () => {
    expect(
      resourceContentStamp({
        release: { tag_name: 'owner:v45', published_at: 'a|b@c' },
      })
    ).toBe('owner_v45#a_b_c')
  })
})
