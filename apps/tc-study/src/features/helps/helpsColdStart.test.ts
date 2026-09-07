import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHelpsListEmptyReason } from './helpsEmptyCopy'
import { isHelpsContentPending, shouldKeepStaleHelpsRows, staleQuotesAreUnderlineReady } from './helpsListLoading'
import { shouldInjectComposition } from './compositionInjection'
import { coldStartCatalogLoads } from '../read/runReadPanelCatalog'
import { isPanelCatalogSpinner } from '../read/panelCatalogLoading'

describe('CombinedHelps cold-start (empty cache)', () => {
  test('default scripture+helps bootstrap triggers a helps catalog load', () => {
    const loads = coldStartCatalogLoads({
      'panel-1': { mode: 'scripture', languageCode: 'en' },
      'panel-2': { mode: 'helps', languageCode: 'en' },
    })
    expect(loads).toHaveLength(1)
    expect(loads[0]!.loadTarget).toBe('both')
    expect(loads[0]!.helpsLanguageCode).toBe('en')
  })

  test('inject CombinedHelps when either TN or TWL exists', () => {
    expect(shouldInjectComposition({ notes: 'u/en/tn' }, ['notes', 'words-links'], 'any')).toBe(true)
    expect(shouldInjectComposition({ 'words-links': 'u/en/twl' }, ['notes', 'words-links'], 'any')).toBe(
      true
    )
    expect(shouldInjectComposition({}, ['notes', 'words-links'], 'any')).toBe(false)
  })

  test('empty CombinedHelps list is not shown while catalog or content is loading', () => {
    expect(
      isHelpsContentPending({
        tnKey: '',
        twlKey: '',
        tnLoading: false,
        twlLoading: false,
        catalogLoading: true,
      })
    ).toBe(true)
    expect(
      isHelpsContentPending({
        tnKey: 'u/en/tn',
        twlKey: 'u/en/twl',
        tnLoading: true,
        twlLoading: false,
        catalogLoading: false,
      })
    ).toBe(true)
    expect(
      resolveHelpsListEmptyReason({
        noSources: true,
        loading: true,
        depsOk: false,
        mergedEmpty: true,
        hasLoadError: false,
        hasActiveFilter: false,
      })
    ).toBeNull()
  })

  test('CombinedHelps membership does not hide the well spinner while content is pending', () => {
    expect(
      isPanelCatalogSpinner({ catalogLoading: true, hasMembership: true })
    ).toBe(false)
    expect(
      isHelpsContentPending({
        tnKey: 'u/en/tn',
        twlKey: '',
        tnLoading: true,
        twlLoading: false,
        catalogLoading: false,
      })
    ).toBe(true)
  })

  test('keeps last helps rows when quote/OL drops for one frame', () => {
    expect(
      shouldKeepStaleHelpsRows({
        staleCount: 4,
        incomingCount: 0,
        originalContentMissing: false,
      })
    ).toBe(true)
    expect(
      shouldKeepStaleHelpsRows({
        staleCount: 4,
        incomingCount: 4,
        originalContentMissing: true,
      })
    ).toBe(true)
    expect(
      shouldKeepStaleHelpsRows({
        staleCount: 0,
        incomingCount: 0,
        originalContentMissing: true,
      })
    ).toBe(false)
  })

  test('stale quote rows with tokens are underline-ready', () => {
    expect(staleQuotesAreUnderlineReady([{ quoteTokens: [{ id: 1 }] }])).toBe(true)
    expect(staleQuotesAreUnderlineReady([{ quoteTokens: [] }, { quoteTokens: null }])).toBe(false)
    expect(staleQuotesAreUnderlineReady([])).toBe(false)
    expect(staleQuotesAreUnderlineReady(null)).toBe(false)
  })

  test('token-filter empty well waits when prepare is still pending', () => {
    expect(
      isHelpsContentPending({
        tnKey: 'u/en/tn',
        twlKey: 'u/en/twl',
        tnLoading: false,
        twlLoading: false,
        preparePending: true,
        hasVisibleRows: false,
      })
    ).toBe(true)
    expect(
      isHelpsContentPending({
        tnKey: 'u/en/tn',
        twlKey: 'u/en/twl',
        tnLoading: false,
        twlLoading: false,
        preparePending: true,
        hasVisibleRows: true,
      })
    ).toBe(false)
  })

  test('Read bootstrap and CombinedHelps viewer wire the pending flag', () => {
    const bootstrap = readFileSync(join(import.meta.dir, '../read/useReadLanguageBootstrap.ts'), 'utf8')
    const viewer = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    const list = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/CombinedHelpsList.tsx'),
      'utf8'
    )
    expect(bootstrap).toContain('coldStartCatalogLoads')
    expect(bootstrap).toContain('Promise.all')
    expect(viewer).toContain('isHelpsContentPending')
    expect(viewer).toContain('filterResetKey')
    expect(viewer).toContain('preparePending')
    expect(list).toContain('loading ?')
    expect(list).not.toContain('Loading dependencies')
  })
})
