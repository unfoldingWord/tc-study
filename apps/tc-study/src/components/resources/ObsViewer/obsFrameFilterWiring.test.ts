import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const highlightSrc = readFileSync(join(import.meta.dir, 'hooks/useObsHighlight.ts'), 'utf8')
const viewerSrc = readFileSync(join(import.meta.dir, 'ObsViewer.tsx'), 'utf8')
const rangeSrc = readFileSync(join(import.meta.dir, 'components/ObsRangeView.tsx'), 'utf8')
const singleSrc = readFileSync(join(import.meta.dir, 'components/ObsSingleFrameView.tsx'), 'utf8')
const handlersSrc = readFileSync(
  join(import.meta.dir, '../CombinedHelpsViewer/useCombinedHelpsHandlers.ts'),
  'utf8'
)
const quotesSrc = readFileSync(join(import.meta.dir, 'hooks/useObsFrameQuotes.ts'), 'utf8')
const combinedSrc = readFileSync(
  join(import.meta.dir, '../CombinedHelpsViewer/index.tsx'),
  'utf8'
)

describe('OBS frame click → helps verse-filter', () => {
  test('useObsHighlight sends verse-filter via obsFrameVerseFilter', () => {
    expect(highlightSrc).toContain("'verse-filter'")
    expect(highlightSrc).toContain('obsFrameVerseFilter')
    expect(highlightSrc).toContain('selectFrame')
    expect(highlightSrc).toContain('sendVerseFilter')
  })

  test('story and single-frame views wire onFrameClick', () => {
    expect(rangeSrc).toContain('onFrameClick')
    expect(rangeSrc).toContain('onClick={() => onFrameClick(sNum, frame.frameNumber)}')
    expect(singleSrc).toContain('onFrameClick')
    expect(singleSrc).toContain('onClick={() => onFrameClick(storyNum, frameNum)}')
    expect(viewerSrc).toContain('onFrameClick={selectFrame}')
  })

  test('range view marks the verse-filter frame active', () => {
    expect(highlightSrc).toContain('activeFrameFilter')
    expect(highlightSrc).toContain('setActiveFrameFilter')
    expect(viewerSrc).toContain('activeFrameFilter={activeFrameFilter}')
    expect(rangeSrc).toContain('isObsFrameFilterActive')
    expect(rangeSrc).toContain('obsFrameChromeClass')
    expect(rangeSrc).toContain('data-obs-frame-active')
    expect(rangeSrc).toContain('data-obs-frame=')
  })

  test('helps card click sends verse-filter and OBS scrolls the matching frame', () => {
    expect(handlersSrc).toContain('sendObsCardFrameFilter')
    expect(handlersSrc).toContain('helpsCardVerseFilter')
    expect(handlersSrc).toContain('sendVerseFilter')
    expect(highlightSrc).toContain('obsFrameFilterFromHelpsPayload')
    expect(highlightSrc).toContain('scrollObsFrameIntoView')
    expect(highlightSrc).toContain('pendingFrameScrollRef')
    expect(viewerSrc).toContain('ref={paneRef}')
    expect(singleSrc).toContain('data-obs-frame=')
  })

  test('OBS CombinedHelps TN quote click broadcasts obs-frame-highlight and OBS applies quotes from any panel-2 CombinedHelps key', () => {
    expect(handlersSrc).toContain('obsFrameHighlightFromHelpsRow')
    expect(handlersSrc).toContain("helpsScope === 'obs'")
    expect(handlersSrc).toContain('broadcastObsHighlight')
    expect(quotesSrc).toContain('panelKeysAreObsQuoteCapable')
    expect(quotesSrc).not.toContain('panel.resourceKeys[panel.activeIndex')
    expect(combinedSrc).toContain('resolveHelpsViewerScope')
    expect(combinedSrc).not.toContain("effectiveResource.appliesToScope === 'obs' ? 'obs' : 'scripture'")
  })
})
