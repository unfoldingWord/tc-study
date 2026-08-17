import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const highlightSrc = readFileSync(join(import.meta.dir, 'hooks/useObsHighlight.ts'), 'utf8')
const viewerSrc = readFileSync(join(import.meta.dir, 'ObsViewer.tsx'), 'utf8')
const rangeSrc = readFileSync(join(import.meta.dir, 'components/ObsRangeView.tsx'), 'utf8')
const singleSrc = readFileSync(join(import.meta.dir, 'components/ObsSingleFrameView.tsx'), 'utf8')

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
})
