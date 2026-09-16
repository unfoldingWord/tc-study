import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePreparedHelpsReload } from './usePreparedHelpsChapter'
import {
  attachHelpsTokenCache,
  helpsAlignRowsStillPending,
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

  test('helpsAlignRowsStillPending detects frozen pending fingerprint rows', () => {
    expect(
      helpsAlignRowsStillPending([
        { origWords: 'הִשְׁחִיתוּ', quoteStatus: 'pending' },
        { origWords: 'כְּעֵץ', quoteStatus: 'ol-fallback', alignedTokens: [] },
      ])
    ).toBe(true)
    expect(
      helpsAlignRowsStillPending([
        {
          origWords: 'הִשְׁחִיתוּ',
          quoteStatus: 'aligned',
          alignedTokens: [{ position: 0 }],
        },
      ])
    ).toBe(false)
    // Premature ol-fallback without chips must keep retrying (not freeze fingerprint).
    expect(
      helpsAlignRowsStillPending([{ origWords: 'הִשְׁחִיתוּ', quoteStatus: 'ol-fallback' }])
    ).toBe(true)
  })

  test('skips quote and align rebuild for a large chapter when IDB/memory cache hits', () => {
    const links = Array.from({ length: 176 }, (_, i) => ({
      id: `psa-119-${i + 1}`,
      origWords: 'אמר',
      quoteTokens: [{ text: 'said' }],
      alignedTokens: [{ position: i, content: 'said' }],
      semanticIds: [`psa 119:${i + 1}:said:1`],
    }))
    const lastById = new Map(links.map((l) => [l.id, l]))
    const incoming = links.map(({ quoteTokens: _q, alignedTokens: _a, semanticIds: _s, ...rest }) => rest)
    expect(shouldSkipHelpsQuoteRebuild({ links: incoming, lastById })).toBe(true)
    expect(shouldSkipHelpsAlignRebuild({ links: incoming, lastById })).toBe(true)
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

  test('mergeHelpsTokenCache clears sticky quoteWarmPending when align settles', () => {
    const cache = mergeHelpsTokenCache(new Map(), [
      {
        id: 'n1',
        quoteTokens: [{ text: 'x' }],
        quoteStatus: 'ol-fallback',
        quoteWarmPending: true,
      },
    ])
    expect(cache.get('n1')?.quoteWarmPending).toBe(true)
    mergeHelpsTokenCache(cache, [
      {
        id: 'n1',
        quoteTokens: [{ text: 'x' }],
        alignedTokens: [{ position: 0, content: 'y' }],
        quoteStatus: 'aligned',
      },
    ])
    expect(cache.get('n1')?.quoteWarmPending).toBeUndefined()
    expect(cache.get('n1')?.quoteStatus).toBe('aligned')
  })

  test('mergeHelpsTokenCache clears warm pending on settled OL without sticky ?? prev', () => {
    const cache = mergeHelpsTokenCache(new Map(), [
      {
        id: 'n1',
        quoteTokens: [{ text: 'x' }],
        quoteStatus: 'ol-fallback',
        quoteWarmPending: true,
      },
    ])
    mergeHelpsTokenCache(cache, [
      {
        id: 'n1',
        quoteTokens: [{ text: 'x' }],
        quoteStatus: 'ol-fallback',
        quoteWarmPending: undefined,
      },
    ])
    expect(cache.get('n1')?.quoteWarmPending).toBeUndefined()
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
    expect(src).toContain('runCacheFirstThenBuild')
    expect(src).toContain('hydrateFromCache(true)')
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
    expect(src).toContain('helpsAlignRowsStillPending')
    expect(src).toContain('lastAlignedByIdRef')
    expect(src).toMatch(/shouldSkipHelpsAlignRebuild[\s\S]*setLoadingAligned\(true\)/)
  })
})
