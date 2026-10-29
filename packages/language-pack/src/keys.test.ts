import { describe, expect, test } from 'bun:test'
import { belongsTo, bookOfRow, indexStrongKey, indexVersesKey, scansFor } from './keys'

const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'

describe('index keys', () => {
  test('the verses row and the Strong rows of a book of an original, book in lower case', () => {
    expect(indexVersesKey(UGNT, 'TIT')).toBe('index:verses:unfoldingWord/el-x-koine/ugnt:tit')
    expect(indexStrongKey(UGNT, 'G5485', 'TIT')).toBe('index:strong:unfoldingWord/el-x-koine/ugnt:G5485:tit')
    expect(indexVersesKey(UHB, 'rut')).toBe('index:verses:unfoldingWord/hbo/uhb:rut')
  })

  test('an original’s scans find its index rows, in the index layer', () => {
    const scans = scansFor(UHB)
    expect(scans).toContainEqual({ prefix: 'index:verses:unfoldingWord/hbo/uhb:', layer: 'index' })
    expect(scans).toContainEqual({ prefix: 'index:strong:unfoldingWord/hbo/uhb:', layer: 'index' })
  })

  test('the book of an index row is its last segment, in lower case', () => {
    expect(bookOfRow('index:strong:unfoldingWord/hbo/uhb:H0853:rut', 'index', UHB)).toBe('rut')
    expect(bookOfRow('index:verses:unfoldingWord/hbo/uhb:RUT', 'index', UHB)).toBe('rut')
    expect(bookOfRow('index', 'index', UHB)).toBeNull()
  })

  test('an index row of another resource whose key starts alike does not belong', () => {
    const key = 'index:strong:x/hbo/uhb2:H0853:rut'
    expect(scansFor(UHB).some((scan) => key.startsWith(scan.prefix) && belongsTo(key, UHB, scan))).toBe(false)
    const longer = 'index:strong:unfoldingWord/hbo/uhb2:H0853:rut'
    expect(scansFor(UHB).some((scan) => longer.startsWith(scan.prefix) && belongsTo(longer, UHB, scan))).toBe(false)
  })
})
