import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { parseAlignWarmKey } from '../warm/warmGc'
import { helpsAlignKey, targetBookStamp } from './helpsAlignCache'
import { helpsBookStamp, olBookStamp } from './helpsQuoteCache'

const RUT_SHA = '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7'

function row(overrides: Record<string, unknown> = {}) {
  return {
    release: { tag_name: 'v66', published_at: '2026-01-01T00:00:00Z' },
    contentMetadata: { bookBlobs: { rut: RUT_SHA }, bookBlobsRef: 'v66' },
    ...overrides,
  }
}

describe('alignment stamps per book', () => {
  test('targetBookStamp is the book stamp plus the prepare version', () => {
    expect(targetBookStamp(row(), 'RUT')).toBe(`g3d230a0aca+${SCRIPTURE_PREPARE_VERSION}`)
    expect(targetBookStamp(row(), 'rut', 99)).toBe('g3d230a0aca+99')
  })

  test('a book with no blob keeps the release stamp, as before', () => {
    expect(targetBookStamp(row(), 'gen')).toBe(`${resourceContentStamp(row())}+${SCRIPTURE_PREPARE_VERSION}`)
  })

  test('a helps-align key built from book stamps parses back with the same book and stamps', () => {
    const meta = row()
    const helpsStamp = helpsBookStamp(meta, 'RUT')
    const olStamp = olBookStamp(meta, 'RUT')
    const targetStamp = targetBookStamp(meta, 'RUT')
    const key = helpsAlignKey({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp,
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp,
      targetKey: 'unfoldingWord/en/ult',
      targetStamp,
      book: 'RUT',
      chapter: 4,
    })
    expect(parseAlignWarmKey(key)).toEqual({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp,
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp,
      targetKey: 'unfoldingWord/en/ult',
      targetStamp,
      book: 'rut',
      chapter: '4',
    })
  })
})
