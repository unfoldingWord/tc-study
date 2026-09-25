import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDownloadPriority } from '../../config/loaderConfig'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  compareDownloadBatchOrder,
  isOriginalLanguageDownloadTarget,
  sortDownloadBatch,
} from './downloadBatchOrder'

describe('downloadBatchOrder', () => {
  test('identifies UGNT/UHB and el-x-koine/hbo keys', () => {
    expect(
      isOriginalLanguageDownloadTarget({ resourceKey: 'unfoldingWord/el-x-koine/ugnt' })
    ).toBe(true)
    expect(isOriginalLanguageDownloadTarget({ resourceKey: 'unfoldingWord/hbo/uhb' })).toBe(
      true
    )
    expect(
      isOriginalLanguageDownloadTarget({ resourceKey: 'owner/en/ult', language: 'el-x-koine' })
    ).toBe(true)
    expect(isOriginalLanguageDownloadTarget({ resourceKey: 'unfoldingWord/en/tn' })).toBe(
      false
    )
    expect(isOriginalLanguageDownloadTarget({ resourceKey: 'unfoldingWord/en/ult' })).toBe(
      false
    )
    expect(
      isOriginalLanguageDownloadTarget({ resourceKey: 'unfoldingWord/hbo/uhb#1' })
    ).toBe(true)
  })

  test('does not import Read/React store modules (worker-safe)', () => {
    const src = readFileSync(join(import.meta.dir, 'downloadBatchOrder.ts'), 'utf8')
    expect(src).not.toContain('originalLanguageForBook')
    expect(src).not.toContain('projectPanelResourcesToAppStore')
    expect(src).not.toContain('AppContext')
  })

  test('OL scripture sorts before TN in a mixed batch', () => {
    const tnPriority = getDownloadPriority(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)
    const scripturePriority = getDownloadPriority(RESOURCE_TYPE_IDS.SCRIPTURE)
    expect(tnPriority).toBeLessThan(scripturePriority)

    const ordered = sortDownloadBatch([
      { resourceKey: 'unfoldingWord/en/tn', priority: tnPriority, language: 'en' },
      { resourceKey: 'unfoldingWord/en/ult', priority: scripturePriority, language: 'en' },
      {
        resourceKey: 'unfoldingWord/el-x-koine/ugnt',
        priority: scripturePriority,
        language: 'el-x-koine',
      },
      { resourceKey: 'unfoldingWord/hbo/uhb', priority: scripturePriority, language: 'hbo' },
    ])

    expect(ordered.map((r) => r.resourceKey)).toEqual([
      'unfoldingWord/el-x-koine/ugnt',
      'unfoldingWord/hbo/uhb',
      'unfoldingWord/en/tn',
      'unfoldingWord/en/ult',
    ])
    expect(
      compareDownloadBatchOrder(
        { resourceKey: 'unfoldingWord/hbo/uhb', priority: scripturePriority },
        { resourceKey: 'unfoldingWord/en/tn', priority: tnPriority }
      )
    ).toBeLessThan(0)
  })

  test('download worker uses the batch-order helper and emits resource-complete', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../workers/backgroundDownload.worker.ts'),
      'utf8'
    )
    expect(src).toContain('compareDownloadBatchOrder')
    expect(src).toContain("type: 'resource-complete'")
    expect(src).toContain('fallbackIngredientCount')
    expect(src).toContain('resolveRunIngredientTotal')
    expect(src).not.toContain('needsCalculation')
    expect(src).not.toContain('registerPreparers')
    expect(src).not.toMatch(
      /withResourceDownloadTimeout\(\s*loader\.downloadResource/
    )
  })
})
