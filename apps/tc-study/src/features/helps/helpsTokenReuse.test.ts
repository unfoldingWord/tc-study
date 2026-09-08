import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePreparedHelpsReload } from './usePreparedHelpsChapter'
import {
  attachHelpsTokenCache,
  mergeHelpsTokenCache,
  preparedRowsCoverChapterSpan,
  resolveHelpsChapterChangeWork,
  shouldSkipHelpsAlignRebuild,
  shouldSkipHelpsQuoteRebuild,
} from './helpsTokenReuse'

describe('resolveHelpsChapterChangeWork', () => {
  test('chapter change with book notes+quotes already present does not load or clear', () => {
    expect(
      resolveHelpsChapterChangeWork({
        hasBookPayload: true,
        destNotesHaveTokens: true,
        hadPreviousSpan: true,
      })
    ).toEqual({
      clearPreparedRows: false,
      preparePending: false,
      skipPreparedFetch: true,
      skipQuoteRebuild: true,
      skipAlignRebuild: true,
      quoteLoading: false,
    })
  })

  test('first open of a book with no notes still loads', () => {
    expect(
      resolveHelpsChapterChangeWork({
        hasBookPayload: false,
        destNotesHaveTokens: false,
        hadPreviousSpan: false,
      })
    ).toEqual({
      clearPreparedRows: false,
      preparePending: true,
      skipPreparedFetch: false,
      skipQuoteRebuild: false,
      skipAlignRebuild: false,
      quoteLoading: true,
    })
  })
})

describe('resolvePreparedHelpsReload matches chapter-change contract', () => {
  test('does not clear or pending-spin when book payload already exists', () => {
    const reload = resolvePreparedHelpsReload({
      hasBookPayload: true,
      spanChanged: true,
      hadPreviousSpan: true,
    })
    const work = resolveHelpsChapterChangeWork({
      hasBookPayload: true,
      destNotesHaveTokens: true,
      hadPreviousSpan: true,
    })
    expect(reload.clearRows).toBe(work.clearPreparedRows)
    expect(reload.pending).toBe(work.preparePending)
    expect(reload.skipFetch).toBe(work.skipPreparedFetch)
    expect(reload.clearRows).toBe(false)
    expect(reload.pending).toBe(false)
  })
})

describe('shouldSkipHelpsQuoteRebuild / shouldSkipHelpsAlignRebuild', () => {
  test('skips quote rebuild when dest links already have tokens after chapter change', () => {
    const lastById = new Map([
      ['n-ch5', { quoteTokens: [{ text: 'men' }] }],
    ])
    expect(
      shouldSkipHelpsQuoteRebuild({
        links: [{ id: 'n-ch5', origWords: 'ἄνθρωποι', quoteTokens: [{ text: 'men' }] }],
        lastById,
      })
    ).toBe(true)
  })

  test('skips quote rebuild from book-wide lastById even when incoming tokens were stripped', () => {
    expect(
      shouldSkipHelpsQuoteRebuild({
        links: [{ id: 'n-ch5', origWords: 'ἄνθρωποι' }],
        lastById: new Map([['n-ch5', { quoteTokens: [{ text: 'men' }] }]]),
      })
    ).toBe(true)
  })

  test('does not skip quote rebuild when dest notes have no tokens', () => {
    expect(
      shouldSkipHelpsQuoteRebuild({
        links: [{ id: 'n-ch5', origWords: 'ἄνθρωποι' }],
        lastById: new Map(),
      })
    ).toBe(false)
  })

  test('skips align rebuild when dest chips are already cached', () => {
    expect(
      shouldSkipHelpsAlignRebuild({
        links: [{ id: 'n-ch5', origWords: 'ἄνθρωποι' }],
        lastById: new Map([
          [
            'n-ch5',
            {
              alignedTokens: [{ position: 0, content: 'men' }],
              semanticIds: ['tit 2:11:men:1'],
            },
          ],
        ]),
      })
    ).toBe(true)
  })

  test('attachHelpsTokenCache keeps dest rows painted across chapter change', () => {
    const cache = mergeHelpsTokenCache(new Map(), [
      {
        id: 'n-ch5',
        quoteTokens: [{ text: 'men' }],
        alignedTokens: [{ position: 0, content: 'men' }],
        semanticIds: ['tit 2:11:men:1'],
        quoteStatus: 'aligned',
      },
    ])
    const attached = attachHelpsTokenCache([{ id: 'n-ch5', quote: 'ἄνθρωποι' }], cache)
    expect(attached[0]).toMatchObject({
      id: 'n-ch5',
      quoteTokens: [{ text: 'men' }],
      alignedTokens: [{ position: 0, content: 'men' }],
      quoteStatus: 'aligned',
    })
  })

  test('prepared rows from another chapter do not cover the destination span', () => {
    expect(
      preparedRowsCoverChapterSpan([{ reference: '1:1' }, { reference: '1:2' }], 5, 5)
    ).toBe(false)
    expect(
      preparedRowsCoverChapterSpan([{ reference: '5:1' }, { reference: '1:2' }], 5, 5)
    ).toBe(true)
  })
})

describe('hooks honor cache-first chapter change', () => {
  test('usePreparedHelpsChapter skip path does not miss-status or clear on skip', () => {
    const src = readFileSync(join(import.meta.dir, 'usePreparedHelpsChapter.ts'), 'utf8')
    expect(src).toContain('if (reload.skipFetch)')
    expect(src).toMatch(/if \(reload\.skipFetch\) \{\s*return/)
  })

  test('useQuoteTokens skips rebuild when dest tokens already exist', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('shouldSkipHelpsQuoteRebuild')
    expect(src).toContain('reuseHelpsQuoteRows')
    expect(src).toContain('lastQuotesByIdRef')
  })

  test('CombinedHelps pipeline reuses book-wide tokens and ignores stale prepared rows', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsPipeline.ts'),
      'utf8'
    )
    expect(src).toContain('attachHelpsTokenCache')
    expect(src).toContain('preparedRowsCoverChapterSpan')
    expect(src).toContain('helpsTokenCacheRef')
  })

  test('useAlignedTokens skips rebuild and does not set loading when dest align exists', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('shouldSkipHelpsAlignRebuild')
    expect(src).toContain('reuseHelpsAlignRows')
    expect(src).toContain('lastAlignedByIdRef')
    expect(src).toMatch(/shouldSkipHelpsAlignRebuild[\s\S]*setLoadingAligned\(true\)/)
  })
})
