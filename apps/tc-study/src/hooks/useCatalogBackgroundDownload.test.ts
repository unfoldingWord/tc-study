import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useCatalogBackgroundDownload', () => {
  test('does not walk catalog/completeness IDB while extract is in flight', () => {
    const src = readFileSync(join(import.meta.dir, 'useCatalogBackgroundDownload.ts'), 'utf8')
    expect(src).toContain('shouldWalkUiIdbDuringExtract')
    expect(src).toContain('failFast: true')
    expect(src).toContain('raceWithTimeout')
    expect(src).toContain('isExpectedDownloadMonitorTimeout')
    expect(src).toContain('discoveredIngredientCount')
    expect(src).toContain('totalIngredientsForResourceKeys')
    expect(src).toContain('listedCountByKey')
  })

  test('catalog getAll timeout does not enqueue all expected keys as incomplete', () => {
    const src = readFileSync(join(import.meta.dir, 'useCatalogBackgroundDownload.ts'), 'utf8')
    expect(src).toContain('catalog-keys-timeout')
    expect(src).toContain('Do not treat every expected key as incomplete')
    // Must return early — not push unchecked into incompleteResources
    const timeoutBlock = src.slice(
      src.indexOf('Catalog IDB timed out'),
      src.indexOf('for (const resourceKey of uncheckedResources)')
    )
    expect(timeoutBlock).toContain('started: false')
    expect(timeoutBlock).toContain('return')
    expect(timeoutBlock).not.toContain('incompleteResources.push')
  })
})
