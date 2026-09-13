import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HELPS_EMPTY_COPY } from '../../../features/helps/helpsEmptyCopy'
import { HelpsFilterBanners } from '../shared/HelpsFilterBanners'
import { CombinedHelpsList } from './CombinedHelpsList'
import type { CombinedHelpsListProps } from './CombinedHelpsList'

const resource = {
  id: 'combined-helps',
  key: 'combined-helps',
  title: 'Helps',
  type: 'combined-helps',
  language: 'en',
} as CombinedHelpsListProps['resource']

const tokenFilter = {
  semanticId: 'psa 1:4:chasses:1',
  content: 'chasses',
  alignedSemanticIds: ['psa 1:4:כמץ:1'],
  timestamp: 1,
}

function listProps(
  overrides: Partial<CombinedHelpsListProps> = {}
): CombinedHelpsListProps {
  return {
    resource,
    effectiveResource: resource,
    bookCode: 'psa',
    bookTitleSource: { ingredients: [{ identifier: 'psa', title: 'Psalms' }] },
    languageDirection: 'ltr',
    kindFilter: 'all',
    setKindFilter: () => undefined,
    filterScopeBar: createElement('span', { 'data-testid': 'helps-filter-scope-bar' }, 'chasses'),
    helpsLanguageCode: 'en',
    helpsLanguageName: 'English',
    passageLabel: 'Psalms 1',
    noSources: false,
    chapterHasHelps: true,
    onClearActiveFilter: () => undefined,
    loading: false,
    tnError: null,
    twlError: null,
    tnKey: 'unfoldingWord/en/tn',
    twlKey: 'unfoldingWord/en/twl',
    resourceKey: 'combined-helps',
    mergedGroups: [],
    selectedHelpsCard: null,
    targetSourceId: 'unfoldingWord/en/ult',
    helpsScope: 'scripture',
    tokenFilter,
    verseFilter: null,
    obsQuoteFilter: null,
    loadingTitles: new Set(),
    twLoadingTitles: new Set(),
    getEntryTitle: () => null,
    getTATitle: () => '',
    getTWTitle: () => '',
    getTWPreview: () => null,
    isTWPreviewPending: () => false,
    onSupportReferenceClick: () => undefined,
    onNoteQuoteClick: () => undefined,
    onNoteSelect: () => undefined,
    onTitleClick: () => undefined,
    onLinkQuoteClick: () => undefined,
    ...overrides,
  }
}

describe('CombinedHelpsList token filter empty', () => {
  test('chapter with notes + token miss is filter-empty, not no-helps-for-chapter', () => {
    const html = renderToStaticMarkup(createElement(CombinedHelpsList, listProps()))
    expect(html).toContain('helps-filter-empty')
    expect(html).toContain('Clear filter')
    expect(html).toContain('chasses')
    expect(html).not.toContain(HELPS_EMPTY_COPY.noPassage('English', 'Psalms 1'))
    expect(html).not.toMatch(/doesn(?:'|&#x27;)t have helps for Psalms 1/)
  })

  test('book-wide support-ref list windows groups instead of mounting every card', () => {
    const mergedGroups = Array.from({ length: 40 }, (_, i) => ({
      ref: `${i + 1}:1`,
      items: [
        {
          kind: 'tn' as const,
          ref: `${i + 1}:1`,
          sortChapter: i + 1,
          sortVerse: 1,
          sortPosition: 0,
          note: {
            id: `n${i + 1}`,
            reference: `${i + 1}:1`,
            tags: '',
            quote: 'q',
            occurrence: '1',
            note: 'body',
            supportReference: 'rc://*/ta/man/translate/figs-metaphor',
          },
        },
      ],
    }))
    const html = renderToStaticMarkup(
      createElement(
        CombinedHelpsList,
        listProps({
          tokenFilter: null,
          supportRefFilter: {
            supportReference: 'rc://*/ta/man/translate/figs-metaphor',
            title: 'Metaphor',
            timestamp: 1,
          },
          mergedGroups,
          filterScopeBar: createElement('span', { 'data-testid': 'helps-filter-scope-bar' }, 'Metaphor'),
        })
      )
    )
    expect(html).toContain('helps-list-window-sentinel')
    expect(html).toContain('helps-list-scrollport')
    expect(html).toContain('1:1')
    expect(html).toContain('12:1')
    expect(html).not.toContain('40:1')
    const filterIdx = html.indexOf('Metaphor')
    const scrollIdx = html.indexOf('helps-list-scrollport')
    expect(filterIdx).toBeGreaterThan(-1)
    expect(filterIdx).toBeLessThan(scrollIdx)
    expect(html).toContain('sticky')
    expect(html).toContain('helps-sticky-current-ref')
    const stickyIdx = html.indexOf('helps-sticky-current-ref')
    expect(stickyIdx).toBeGreaterThan(-1)
    expect(stickyIdx).toBeLessThan(scrollIdx)
    expect(html).not.toMatch(/tracking-wide uppercase/)
    const inListHeaderCount = html.split('helps-verse-group-header').length - 1
    expect(inListHeaderCount).toBe(12)
    const firstInList = html.indexOf('helps-verse-group-header')
    expect(firstInList).toBeGreaterThan(scrollIdx)
    expect(html).toContain('Psalms')
    expect(html).not.toContain('sticky top-0 z-10')
  })

  test('compact sticky chrome is current ref + filter chip, not Helps title or match count', () => {
    const html = renderToStaticMarkup(
      createElement(
        CombinedHelpsList,
        listProps({
          tokenFilter: null,
          supportRefFilter: {
            supportReference: 'rc://*/ta/man/translate/figs-metaphor',
            title: 'Metaphor',
            timestamp: 1,
          },
          mergedGroups: [
            {
              ref: '3:7',
              items: [
                {
                  kind: 'tn' as const,
                  ref: '3:7',
                  sortChapter: 3,
                  sortVerse: 7,
                  sortPosition: 0,
                  note: {
                    id: 'n37',
                    reference: '3:7',
                    tags: '',
                    quote: 'q',
                    occurrence: '1',
                    note: 'body',
                    supportReference: 'rc://*/ta/man/translate/figs-metaphor',
                  },
                },
              ],
            },
          ],
          filterScopeBar: createElement(HelpsFilterBanners, {
            obsQuoteFilter: null,
            tokenFilter: null,
            verseFilter: null,
            supportRefFilter: {
              supportReference: 'rc://*/ta/man/translate/figs-metaphor',
              title: 'Metaphor',
              timestamp: 1,
            },
            displayCount: 1175,
            hasMatches: true,
            hideCount: true,
            onClearObsQuoteFilter: () => undefined,
            onClearTokenFilter: () => undefined,
            onClearVerseFilter: () => undefined,
            onClearSupportRefFilter: () => undefined,
          }),
        })
      )
    )
    const stickyIdx = html.indexOf('helps-sticky-current-ref')
    const scrollIdx = html.indexOf('helps-list-scrollport')
    expect(stickyIdx).toBeGreaterThan(-1)
    expect(stickyIdx).toBeLessThan(scrollIdx)
    expect(html).toContain('3:7')
    expect(html).toContain('Metaphor')
    expect(html).toContain('helps-filter-clear')
    expect(html).not.toMatch(/>1175</)
    expect(html).not.toMatch(/tracking-wide uppercase/)
    expect(html).toContain('Sources')
    expect(html).toContain('helps-verse-group-header')
    expect(html.indexOf('helps-verse-group-header')).toBeGreaterThan(scrollIdx)
    expect(html).not.toContain('sticky top-0 z-10')
  })

  test('in-list verse headers scroll with mounted groups and are not sticky', () => {
    const html = renderToStaticMarkup(
      createElement(
        CombinedHelpsList,
        listProps({
          tokenFilter: null,
          supportRefFilter: {
            supportReference: 'rc://*/ta/man/translate/figs-metaphor',
            title: 'Metaphor',
            timestamp: 1,
          },
          mergedGroups: [
            {
              ref: '1:4',
              items: [
                {
                  kind: 'tn' as const,
                  ref: '1:4',
                  sortChapter: 1,
                  sortVerse: 4,
                  sortPosition: 0,
                  note: {
                    id: 'n14',
                    reference: '1:4',
                    tags: '',
                    quote: 'q',
                    occurrence: '1',
                    note: 'body',
                    supportReference: 'rc://*/ta/man/translate/figs-metaphor',
                  },
                },
              ],
            },
            {
              ref: '1:6',
              items: [
                {
                  kind: 'tn' as const,
                  ref: '1:6',
                  sortChapter: 1,
                  sortVerse: 6,
                  sortPosition: 0,
                  note: {
                    id: 'n16',
                    reference: '1:6',
                    tags: '',
                    quote: 'q',
                    occurrence: '1',
                    note: 'body',
                    supportReference: 'rc://*/ta/man/translate/figs-metaphor',
                  },
                },
              ],
            },
          ],
          filterScopeBar: createElement('span', { 'data-testid': 'helps-filter-scope-bar' }, 'Metaphor'),
        })
      )
    )
    const scrollIdx = html.indexOf('helps-list-scrollport')
    const stickyIdx = html.indexOf('helps-sticky-current-ref')
    expect(stickyIdx).toBeGreaterThan(-1)
    expect(stickyIdx).toBeLessThan(scrollIdx)
    expect(html.split('helps-verse-group-header').length - 1).toBe(2)
    expect(html.indexOf('helps-verse-group-header')).toBeGreaterThan(scrollIdx)
    expect(html).toContain('1:4')
    expect(html).toContain('1:6')
    expect(html).toContain('Psalms')
    expect(html).toContain('Metaphor')
    expect(html).not.toContain('sticky top-0 z-10')
    expect(html).toContain('bg-muted/50')
  })

  test('compact sticky chrome hides the filter slot when none is active', () => {
    const html = renderToStaticMarkup(
      createElement(
        CombinedHelpsList,
        listProps({
          tokenFilter: null,
          filterScopeBar: undefined,
          mergedGroups: [
            {
              ref: '3:7',
              items: [
                {
                  kind: 'tn' as const,
                  ref: '3:7',
                  sortChapter: 3,
                  sortVerse: 7,
                  sortPosition: 0,
                  note: {
                    id: 'n37',
                    reference: '3:7',
                    tags: '',
                    quote: 'q',
                    occurrence: '1',
                    note: 'body',
                    supportReference: '',
                  },
                },
              ],
            },
          ],
        })
      )
    )
    expect(html).toContain('helps-sticky-current-ref')
    expect(html).toContain('3:7')
    expect(html).toContain('Filter kinds')
    expect(html).not.toContain('helps-filter-scope-bar')
  })

  test('token chip on a chapter with no rows still uses no-passage copy', () => {
    const html = renderToStaticMarkup(
      createElement(CombinedHelpsList, listProps({ chapterHasHelps: false }))
    )
    expect(html).toMatch(/English doesn(?:'|&#x27;)t have helps for Psalms 1 yet/)
    expect(html).not.toContain('helps-filter-empty')
  })
})
