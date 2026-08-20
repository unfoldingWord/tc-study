import { describe, expect, test } from 'bun:test'
import {
  helpsCardVerseFilter,
  obsFrameHighlightFromHelpsRow,
  resolveHelpsViewerScope,
} from './combinedHelpsUtils'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../../../features/helps/combinedHelpsIds'

describe('helpsCardVerseFilter', () => {
  test('OBS card reference 1:1 maps to verse-filter chapter/verse', () => {
    expect(helpsCardVerseFilter('1:1')).toEqual({ chapter: 1, verse: 1 })
    expect(helpsCardVerseFilter('1:7')).toEqual({ chapter: 1, verse: 7 })
  })
})

describe('resolveHelpsViewerScope', () => {
  test('OBS CombinedHelps persist id / type is obs even without appliesToScope', () => {
    expect(
      resolveHelpsViewerScope({ resourceId: OBS_COMBINED_HELPS_RESOURCE_ID, type: 'obs-combined-helps' })
    ).toBe('obs')
    expect(
      resolveHelpsViewerScope({
        resourceId: `${OBS_COMBINED_HELPS_RESOURCE_ID}:panel-1`,
        type: 'combined-helps',
      })
    ).toBe('obs')
    expect(resolveHelpsViewerScope({ type: 'obs-combined-helps' })).toBe('obs')
    expect(resolveHelpsViewerScope({ resourceId: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' })).toBe(
      'scripture'
    )
    expect(resolveHelpsViewerScope({ appliesToScope: 'obs' })).toBe('obs')
  })
})

describe('obsFrameHighlightFromHelpsRow', () => {
  test('OBS TN quote becomes an obs-frame-highlight for that story:frame', () => {
    expect(
      obsFrameHighlightFromHelpsRow({
        id: 'row-6-3',
        reference: '6:3',
        quote: 'Rebekah agreed to leave her family',
        occurrence: '1',
        kind: 'tn',
      })
    ).toEqual({
      storyNumber: 6,
      frameNumber: 3,
      quote: 'Rebekah agreed to leave her family',
      occurrence: 1,
      rowId: 'row-6-3',
      kind: 'tn',
    })
  })
})
