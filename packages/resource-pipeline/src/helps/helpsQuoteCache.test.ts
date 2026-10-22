import { describe, expect, test } from 'bun:test'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { parseQuoteWarmKey } from '../warm/warmGc'
import { helpsBookStamp, helpsQuoteKey, olBookStamp } from './helpsQuoteCache'

const RUT_SHA = '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7'

function row(overrides: Record<string, unknown> = {}) {
  return {
    release: { tag_name: 'v66', published_at: '2026-01-01T00:00:00Z' },
    contentMetadata: { bookBlobs: { rut: RUT_SHA }, bookBlobsRef: 'v66' },
    ...overrides,
  }
}

describe('quote stamps per book', () => {
  test('olBookStamp is the book stamp plus the USJ processing version', () => {
    expect(olBookStamp(row(), 'rut')).toBe(`g3d230a0aca+${USJ_PROCESSING_VERSION}`)
    expect(olBookStamp(row(), 'RUT', 'x:y|z@w')).toBe('g3d230a0aca+x_y_z_w')
  })

  test('helpsBookStamp is the book stamp alone', () => {
    expect(helpsBookStamp(row(), 'rut')).toBe('g3d230a0aca')
  })

  test('a book with no blob keeps the release stamp, as before', () => {
    const base = resourceContentStamp(row())
    expect(helpsBookStamp(row(), 'gen')).toBe(base)
    expect(olBookStamp(row(), 'gen')).toBe(`${base}+${USJ_PROCESSING_VERSION}`)
  })

  test('two books of one release stamp differently when only one has a blob', () => {
    expect(helpsBookStamp(row(), 'rut')).not.toBe(helpsBookStamp(row(), 'gen'))
  })

  test('a helps-quote key built from them parses back with the same book and stamps', () => {
    const helpsStamp = helpsBookStamp(row(), 'RUT')
    const olStamp = olBookStamp(row(), 'RUT')
    const key = helpsQuoteKey({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp,
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp,
      book: 'RUT',
      chapter: 4,
    })
    expect(parseQuoteWarmKey(key)).toEqual({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp,
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp,
      book: 'rut',
      chapter: '4',
    })
  })
})
