import { describe, expect, test } from 'bun:test'
import {
  buildDownloadQueueDetails,
  downloadQueueRowFromKey,
  formatDownloadQueueRowLabel,
  windowDownloadQueueSlice,
} from './downloadQueueDetails'

describe('downloadQueueRowFromKey', () => {
  test('parses owner/lang/id and infers type', () => {
    const row = downloadQueueRowFromKey('unfoldingWord/en/tn', 'queued')
    expect(row).toEqual({
      resourceKey: 'unfoldingWord/en/tn',
      owner: 'unfoldingWord',
      languageCode: 'en',
      resourceId: 'tn',
      typeId: 'notes',
      status: 'queued',
    })
  })

  test('leaves typeId null for unknown ids', () => {
    expect(downloadQueueRowFromKey('org/xx/custom-res', 'queued').typeId).toBeNull()
  })
})

describe('buildDownloadQueueDetails', () => {
  const queue = [
    'unfoldingWord/el-x-koine/ugnt',
    'unfoldingWord/en/ult',
    'unfoldingWord/en/tn',
    'unfoldingWord/en/twl',
  ]

  test('marks current as downloading and remaining as queued', () => {
    const model = buildDownloadQueueDetails({
      queue,
      currentResource: 'unfoldingWord/en/ult',
      completedResourceKeys: ['unfoldingWord/el-x-koine/ugnt'],
      isDownloading: true,
    })
    expect(model.current?.resourceKey).toBe('unfoldingWord/en/ult')
    expect(model.current?.status).toBe('downloading')
    expect(model.completed.map((r) => r.resourceKey)).toEqual([
      'unfoldingWord/el-x-koine/ugnt',
    ])
    expect(model.queued.map((r) => r.resourceKey)).toEqual([
      'unfoldingWord/en/tn',
      'unfoldingWord/en/twl',
    ])
    expect(model.totalCount).toBe(4)
    expect(model.queuedCount).toBe(2)
    expect(model.completedCount).toBe(1)
  })

  test('marks current as checking during completeness validation', () => {
    const model = buildDownloadQueueDetails({
      queue,
      currentResource: 'unfoldingWord/en/ult',
      completedResourceKeys: ['unfoldingWord/el-x-koine/ugnt'],
      isDownloading: true,
      phase: 'checking',
    })
    expect(model.current?.status).toBe('checking')
  })

  test('marks current as failed when idle with error', () => {
    const model = buildDownloadQueueDetails({
      queue,
      currentResource: 'unfoldingWord/en/ult',
      completedResourceKeys: ['unfoldingWord/el-x-koine/ugnt'],
      isDownloading: false,
      error: 'Worker error',
    })
    expect(model.current?.status).toBe('failed')
    expect(model.queued).toHaveLength(2)
  })

  test('falls back to currentResource when queue empty', () => {
    const model = buildDownloadQueueDetails({
      queue: [],
      currentResource: 'unfoldingWord/en/ult',
      isDownloading: true,
    })
    expect(model.rows).toHaveLength(1)
    expect(model.current?.resourceId).toBe('ult')
  })
})

describe('formatDownloadQueueRowLabel', () => {
  test('prefers language + resource id', () => {
    expect(
      formatDownloadQueueRowLabel({ languageCode: 'el-x-koine', resourceId: 'ugnt' })
    ).toBe('el-x-koine ugnt')
  })
})

describe('windowDownloadQueueSlice', () => {
  test('windows a long list for virtual browse', () => {
    const slice = windowDownloadQueueSlice({
      itemCount: 1729,
      scrollTop: 400,
      viewportHeight: 320,
      rowHeight: 40,
      overscan: 2,
    })
    // scrollTop 400 / 40 = index 10; overscan 2 → start 8
    expect(slice.start).toBe(8)
    expect(slice.offsetY).toBe(8 * 40)
    expect(slice.totalHeight).toBe(1729 * 40)
    expect(slice.end).toBeGreaterThan(slice.start)
    expect(slice.end - slice.start).toBeLessThan(30)
  })

  test('handles empty list', () => {
    expect(
      windowDownloadQueueSlice({
        itemCount: 0,
        scrollTop: 0,
        viewportHeight: 200,
        rowHeight: 40,
      })
    ).toEqual({ start: 0, end: 0, offsetY: 0, totalHeight: 0 })
  })
})
