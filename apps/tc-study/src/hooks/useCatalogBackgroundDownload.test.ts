import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useCatalogBackgroundDownload', () => {
  test('does not walk catalog/completeness IDB while extract is in flight', () => {
    const src = readFileSync(join(import.meta.dir, 'useCatalogBackgroundDownload.ts'), 'utf8')
    expect(src).toContain('shouldWalkUiIdbDuringExtract')
    expect(src).toContain('failFast: true')
    expect(src).toContain('totalIngredientsForResourceKeys')
    expect(src).toContain('listedCountByKey')
  })
})
