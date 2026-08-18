import { describe, expect, test } from 'bun:test'
import { panelHasObsPrimaryContent, resolveHelpsCatalogScope } from './resolveHelpsCatalogScope'

describe('resolveHelpsCatalogScope', () => {
  test('nav/URL/book obs wins even without pane keys', () => {
    expect(resolveHelpsCatalogScope({ navigationScope: 'obs' })).toBe('obs')
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        pathname: '/read/en/obs/story/1',
      })
    ).toBe('obs')
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        pathname: '/read/en/bible/ref/tit%201:1',
        currentBook: 'obs',
      })
    ).toBe('obs')
  })

  test('OBS primary on this or sibling pane wins over a stale bible URL', () => {
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        pathname: '/read/en/bible/ref/tit%201:1',
        thisPaneHasObsPrimary: true,
      })
    ).toBe('obs')
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        pathname: '/read/en/bible/ref/tit%201:1',
        siblingPaneHasObsPrimary: true,
      })
    ).toBe('obs')
  })

  test('Bible scripture stays scripture when no OBS signal', () => {
    expect(
      resolveHelpsCatalogScope({
        navigationScope: 'scripture',
        pathname: '/read/en/bible/ref/tit%201:1',
        currentBook: 'tit',
      })
    ).toBe('scripture')
  })
})

describe('panelHasObsPrimaryContent', () => {
  test('detects OBS type on the pane, including #n instances', () => {
    const resources = new Map([
      ['u/en/obs', { type: 'obs' }],
      ['u/en/ult', { type: 'scripture' }],
    ])
    expect(panelHasObsPrimaryContent(['u/en/obs'], resources)).toBe(true)
    expect(panelHasObsPrimaryContent(['u/en/obs#2'], resources)).toBe(true)
    expect(panelHasObsPrimaryContent(['u/en/ult'], resources)).toBe(false)
    expect(panelHasObsPrimaryContent([], resources)).toBe(false)
  })
})
