import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string) => readFileSync(join(import.meta.dir, rel), 'utf8')

describe('SoT architecture wiring', () => {
  test('warm jobs stay local-only — no DCS fetch', () => {
    const jobs = src('../warm/warmJobs.ts')
    expect(jobs).toContain('getLocalSoT')
    expect(jobs).not.toContain('allowDcs: true')
    expect(jobs).not.toContain('fetchDcs')
    expect(jobs).not.toContain('fetchDcsViaLoader')
  })

  test('lane 1 scripture/helps resolve through getSoT', () => {
    const content = src('../../components/resources/ScriptureViewer/hooks/useContent.ts')
    const notes = src(
      '../../components/resources/TranslationNotesViewer/hooks/useTranslationNotesContent.ts'
    )
    const ol = src('../helps/olLoadCache.ts')
    expect(content).toContain('resolveLane1ScriptureViewModel')
    expect(notes).toContain('resolveLane1SoT')
    expect(ol).toContain('getSoT')
    expect(ol).toContain('allowDcs')
  })

  test('main-thread viewers do not import batchAlignLinks / prepareFull', () => {
    const content = src('../../components/resources/ScriptureViewer/hooks/useContent.ts')
    const helps = src('../../components/resources/CombinedHelpsViewer/index.tsx')
    const supportRefQuotes = src('../helps/useSupportRefQuotes.ts')
    const twlArticleQuotes = src('../helps/useTwlArticleQuotes.ts')
    const pipeline = src('../../components/resources/CombinedHelpsViewer/useCombinedHelpsPipeline.ts')
    expect(content).not.toContain('batchAlignLinks')
    expect(content).not.toContain('prepareFull')
    expect(helps).not.toContain('batchAlignLinks')
    expect(helps).not.toContain('prepareFull')
    expect(helps).not.toContain("from '../../../features/prepare/runPrepare'")
    expect(supportRefQuotes).not.toContain('batchAlignLinks')
    expect(supportRefQuotes).not.toMatch(/loader\.loadViewModel/)
    expect(twlArticleQuotes).not.toContain('batchAlignLinks')
    expect(twlArticleQuotes).not.toMatch(/loader\.loadViewModel/)
    expect(twlArticleQuotes).toContain("helpsType: 'words-links'")
    expect(pipeline).not.toContain('flattenBookNotes')
    expect(pipeline).not.toContain('batchAlignLinks')
    expect(pipeline).toContain('supportRefFirstPaintNotes')
    expect(pipeline).toContain('useSupportRefBookStream')
    expect(pipeline).toContain('twlArticleFirstPaintLinks')
    expect(pipeline).toContain('useTwlArticleBookStream')
    expect(pipeline).toContain('useTwlArticleQuotes')
    // Cross-chapter filter click: firstPaint + streamed must dedupe by id.
    expect(pipeline).toContain('mergeFocusChapterBookMatches(firstPaint, streamedSupportRefNotes)')
    expect(pipeline).toContain('mergeFocusChapterBookMatches(firstPaint, cacheHits)')
    expect(pipeline).not.toContain('[...firstPaint, ...streamedSupportRefNotes]')
    expect(pipeline).not.toContain('[...firstPaint, ...cacheHits]')
    // Cross-chapter filter click: stream must include the start focus chapter
    // (firstPaint follows the current chapter) or its cards drop off the list.
    const stream = src('../helps/useBookFilterStream.ts')
    expect(stream).toContain('planBookFilterStreamChapters(')
    expect(stream).not.toContain('planSupportRefStreamChapters(')
    // Restart on content growth (not a boolean "ready") or a partial chapter
    // map at filter time leaves the list stuck on the current chapter.
    expect(stream).toContain('bookFilterStreamSpanKey(')
    expect(stream).toContain('[enabled, filterKey, spanKey]')
    expect(stream).not.toContain('bookFilterContentReady')
    for (const hook of ['../helps/useSupportRefBookStream.ts', '../helps/useTwlArticleBookStream.ts']) {
      expect(src(hook)).toContain('useBookFilterStream')
    }
  })
})
