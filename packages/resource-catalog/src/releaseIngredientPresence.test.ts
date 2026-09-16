import { describe, expect, test } from 'bun:test'
import {
  fetchReleasePathSet,
  ingredientPresentInPathSet,
  mergeAbsentFromReleaseIds,
  normalizeIngredientPath,
  omitAbsentIngredients,
  partitionIngredientsByReleasePaths,
  pathSetFromZipFileNames,
  persistAbsentFromRelease,
  presentIngredientCount,
  readAbsentFromRelease,
} from './releaseIngredientPresence'

describe('releaseIngredientPresence', () => {
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

  test('read/merge/presentIngredientCount helpers', () => {
    expect(readAbsentFromRelease({ absentFromRelease: ['NUM', 'psa'] })).toEqual(['NUM', 'psa'])
    expect(mergeAbsentFromReleaseIds(['psa'], ['PSA', 'num'])).toEqual(['psa', 'num'])
    expect(presentIngredientCount(10, ['a', 'b'])).toBe(8)
  })

  test('persistAbsentFromRelease merges cache + prunes catalog', async () => {
    const store = new Map<string, unknown>()
    const catalog = new Map<string, unknown>([
      [
        'unfoldingWord/en/twl',
        {
          contentMetadata: {
            ingredients: [
              { identifier: 'psa', path: './psa.tsv' },
              { identifier: 'num', path: './num.tsv' },
            ],
          },
        },
      ],
    ])
    const merged = await persistAbsentFromRelease({
      cacheAdapter: {
        get: async (key) => store.get(key) ?? null,
        set: async (key, value) => {
          store.set(key, value)
        },
      },
      catalogAdapter: {
        set: async (key, value) => {
          catalog.set(key, value)
        },
      },
      resourceKey: 'unfoldingWord/en/twl',
      metadata: catalog.get('unfoldingWord/en/twl') as never,
      absentIds: ['num'],
      logLabel: 'TWL',
    })
    expect(merged).toEqual(['num'])
    const receipt = store.get('resource:unfoldingWord/en/twl') as {
      metadata: { absentFromRelease: string[] }
    }
    expect(receipt.metadata.absentFromRelease).toEqual(['num'])
    const pruned = catalog.get('unfoldingWord/en/twl') as {
      contentMetadata: { ingredients: Array<{ identifier: string }> }
    }
    expect(pruned.contentMetadata.ingredients.map((i) => i.identifier)).toEqual(['psa'])
  })

  test('fetchReleasePathSet normalizes array results', async () => {
    const set = await fetchReleasePathSet(
      {
        fetchRepoTreePaths: async () => ['a.tsv', 'b.tsv'],
      },
      'o',
      'r',
      'v1'
    )
    expect(set?.has('a.tsv')).toBe(true)
    expect(await fetchReleasePathSet({}, 'o', 'r', 'v1')).toBeNull()
  })
})
