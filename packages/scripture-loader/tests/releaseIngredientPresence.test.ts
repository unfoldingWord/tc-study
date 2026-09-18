import { describe, expect, test } from 'bun:test'
import {
  ingredientPresentInPathSet,
  normalizeIngredientPath,
  omitAbsentIngredients,
  partitionIngredientsByReleasePaths,
  pathSetFromZipFileNames,
} from '../src/releaseIngredientPresence'

describe('releaseIngredientPresence (scripture-loader re-export)', () => {
  test('normalizeIngredientPath strips ./', () => {
    expect(normalizeIngredientPath('./04-NUM.usfm')).toBe('04-NUM.usfm')
    expect(normalizeIngredientPath('04-NUM.usfm')).toBe('04-NUM.usfm')
    expect(normalizeIngredientPath(null)).toBeNull()
  })

  test('partitionIngredientsByReleasePaths separates phantoms', () => {
    const paths = new Set(['01-GEN.usfm', 'en_ust/19-PSA.usfm'])
    const { present, absent } = partitionIngredientsByReleasePaths(
      [
        { identifier: 'gen', path: './01-GEN.usfm' },
        { identifier: 'num', path: './04-NUM.usfm' },
        { identifier: 'psa', path: './19-PSA.usfm' },
      ],
      paths
    )
    expect(present.map((i) => i.identifier)).toEqual(['gen', 'psa'])
    expect(absent.map((i) => i.identifier)).toEqual(['num'])
  })

  test('ingredient without path stays present (fail-open)', () => {
    expect(ingredientPresentInPathSet({ identifier: 'gen' }, new Set())).toBe(true)
  })

  test('pathSetFromZipFileNames indexes basename and full path', () => {
    const set = pathSetFromZipFileNames(['en_ust/01-GEN.usfm', 'en_ust/'])
    expect(set.has('en_ust/01-GEN.usfm')).toBe(true)
    expect(set.has('01-GEN.usfm')).toBe(true)
    expect(set.has('en_ust/')).toBe(false)
  })

  test('omitAbsentIngredients drops by id', () => {
    const next = omitAbsentIngredients(
      [
        { identifier: 'gen', path: './01-GEN.usfm' },
        { identifier: 'num', path: './04-NUM.usfm' },
      ],
      new Set(['num'])
    )
    expect(next.map((i) => i.identifier)).toEqual(['gen'])
  })
})
