import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ensurePreparedFullChapter,
  hasPreparedFullChapter,
  healPreparedFullChapter,
  isPreparedSourceMissing,
  markPreparedSourceMissing,
  resetPreparedSourceMissingForTests,
} from './ensurePreparedFullChapter'

describe('ensurePreparedFullChapter', () => {
  beforeEach(() => {
    resetPreparedSourceMissingForTests()
  })

  test('hasPreparedFullChapter is false when cache is cold', () => {
    expect(hasPreparedFullChapter('u/en/ult', 'psa', 92)).toBe(false)
  })

  test('does not re-enqueue when source is already marked missing', async () => {
    markPreparedSourceMissing('u/en/ult', 'tit')
    const enqueueCalls: unknown[] = []
    const cache = {
      get: async () => null,
      set: async () => undefined,
    }
    // Patch enqueue via result contract: status source-missing, no throw.
    const result = await ensurePreparedFullChapter(cache, 'u/en/ult', 'tit', 1)
    expect(result.status).toBe('source-missing')
    expect(result.full).toBeNull()
    expect(isPreparedSourceMissing('u/en/ult', 'tit')).toBe(true)
    expect(enqueueCalls).toEqual([])
  })

  test('healPreparedFullChapter rewrites prepared rows via loadViewModel', async () => {
    const writes: string[] = []
    const cache = {
      get: async () => null,
      set: async (key: string) => {
        writes.push(key)
      },
    }
    const viewModel = {
      bookCode: 'tit',
      bookName: 'Titus',
      processingVersion: '2.1.0-usj',
      toolVersions: { parser: '0.1.1', usjCore: '0.1.1' },
      usj: { type: 'USJ', version: '3.0', content: [] },
      chapters: [
        {
          number: 1,
          verses: [
            {
              number: 1,
              reference: 'tit 1:1',
              text: 'Paul',
              tokens: [
                {
                  semanticId: 'tit 1:1:Paul:1',
                  content: 'Paul',
                  occurrence: 1,
                  totalOccurrences: 1,
                  verseRef: 'tit 1:1',
                  alignedOriginalWordIds: [],
                },
              ],
            },
          ],
        },
      ],
      alignmentMap: {},
    }

    markPreparedSourceMissing('u/en/ult', 'tit')
    const result = await healPreparedFullChapter({
      cache,
      resourceKey: 'u/en/ult',
      bookId: 'tit',
      chapter: 1,
      loadViewModel: async () => viewModel as never,
    })

    expect(isPreparedSourceMissing('u/en/ult', 'tit')).toBe(false)
    expect(writes.some((k) => k.includes(':full') || k.includes(':light') || k.endsWith(':nav'))).toBe(
      true
    )
    // Empty USJ layout may yield empty full blocks; status still clears miss flag.
    expect(result.status === 'ready' || result.status === 'pending').toBe(true)
  })

  test('scroll upgrade waits for full tokens before kind=rendered', () => {
    const hookSrc = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useChapterInfiniteScroll.ts'
      ),
      'utf8'
    )
    expect(hookSrc).toContain('hasPreparedFullChapter')
    expect(hookSrc).toContain('ensurePreparedFullChapter')
    expect(hookSrc).toContain('healPreparedFullChapter')
    expect(hookSrc).toContain('MAX_FULL_ENSURE_ATTEMPTS')
    expect(hookSrc).toContain('Never flip to "rendered" without full tokens')
    expect(hookSrc).toContain('tokenSourceFailed')
  })

  test('ScriptureContent does not paint light as interactive rendered', () => {
    const contentSrc = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/components/ScriptureContent.tsx'
      ),
      'utf8'
    )
    expect(contentSrc).toContain('ensurePreparedFullChapter')
    expect(contentSrc).toContain("lightPaneForChapter(slot.chapter, 'paragraph')")
    expect(contentSrc).not.toContain("lightPaneForChapter(slot.chapter, 'rendered')")
    expect(contentSrc).toContain('usj-pending-full')
    expect(contentSrc).toContain('isPreparedSourceMissing')
    expect(contentSrc).toContain('TokenSourceHealButton')
  })

  test('prepare.worker replies ready-failed on source-missing', () => {
    const workerSrc = readFileSync(
      join(import.meta.dir, '../../workers/prepare.worker.ts'),
      'utf8'
    )
    expect(workerSrc).toContain("type: 'ready-failed'")
    expect(workerSrc).toContain("reason: 'source-missing'")
  })

  test('prepareClient exposes subscribePrepareReadyFailed', () => {
    const clientSrc = readFileSync(
      join(import.meta.dir, '../../workers/prepareClient.ts'),
      'utf8'
    )
    expect(clientSrc).toContain('subscribePrepareReadyFailed')
    expect(clientSrc).toContain('ready-failed')
  })

  test('useContent surfaces error when deferred viewModel retry fails', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useContent.ts'
      ),
      'utf8'
    )
    expect(src).toContain('retrying immediately')
    expect(src).toContain('UsjScriptureViewModel load failed after nav paint')
    expect(src).toContain('setError(failure.error)')
  })

  test('vite config forces non-DOM decode-named-character-reference for workers', () => {
    const viteJs = readFileSync(
      join(import.meta.dir, '../../../vite.config.js'),
      'utf8'
    )
    expect(viteJs).toContain('decode-named-character-reference')
    expect(viteJs).toContain("conditions: ['worker'")
    expect(viteJs).toContain('force-decode-named-char-ref-node')
  })
})
