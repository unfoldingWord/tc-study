import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HelpsLanguageActionsProvider } from '../../../features/helps/HelpsLanguageActionsContext'
import {
  HELPS_EMPTY_COPY,
  resolveHelpsEmptyView,
  resolveHelpsPaneNoSourcesView,
} from '../../../features/helps/helpsEmptyCopy'
import { door43ToListNameFields } from '../../../features/read/languageListDisplayName'
import { CombinedHelpsEmptyState } from './CombinedHelpsEmptyState'

const ES_LISTED = door43ToListNameFields({
  code: 'es',
  name: 'español',
  anglicized_name: 'Spanish',
})

describe('CombinedHelpsEmptyState', () => {
  test('Spanish + Galatians 1 names language from catalog metadata; English action is icon + aria-label', () => {
    let selected: string | null = null
    let pickerOpened = false
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es',
      languageName: ES_LISTED,
      passageLabel: 'Galatians 1',
    })
    const html = renderToStaticMarkup(
      createElement(
        HelpsLanguageActionsProvider,
        {
          value: {
            openHelpsPicker: () => {
              pickerOpened = true
            },
            selectHelpsLanguage: (code: string) => {
              selected = code
            },
          },
        },
        createElement(CombinedHelpsEmptyState, { view })
      )
    )
    expect(html).toContain('Spanish (Español)')
    expect(html).not.toContain('español')
    expect(html).toContain('Galatians')
    expect(html).toContain('<svg')
    expect(html).toContain(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
    expect(html).toContain(`title="${HELPS_EMPTY_COPY.switchToDefaultHelps('English')}"`)
    expect(html).toContain(`aria-label="${HELPS_EMPTY_COPY.switchToDefaultHelps('English')}"`)
    expect(html).toContain('>English<')
    expect(selected).toBeNull()
    expect(pickerOpened).toBe(false)
  })

  test('already on English: no Use-English button; Languages icon + sentence open the picker', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'en',
      languageName: 'English',
      passageLabel: 'Exodus 1',
    })
    const html = renderToStaticMarkup(
      createElement(
        HelpsLanguageActionsProvider,
        {
          value: {
            openHelpsPicker: () => {},
            selectHelpsLanguage: () => {},
          },
        },
        createElement(CombinedHelpsEmptyState, { view })
      )
    )
    expect(html).toContain('English')
    expect(html).toContain('Exodus')
    expect(html).toContain('<svg')
    expect(html).not.toContain(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
    expect(html).toContain(HELPS_EMPTY_COPY.chooseHelpsLanguage)
    expect(html).toContain(`aria-label="${HELPS_EMPTY_COPY.chooseHelpsLanguage}"`)
  })

  test('es-419 Judges 1 empty copy uses Latin American Spanish, not Spanish', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es-419',
      languageName: {
        code: 'es-419',
        name: 'Español Latin America',
        anglicizedName: 'Latin American Spanish',
      },
      passageLabel: 'Judges 1',
    })
    const html = renderToStaticMarkup(
      createElement(
        HelpsLanguageActionsProvider,
        {
          value: {
            openHelpsPicker: () => {},
            selectHelpsLanguage: () => {},
            selectedLanguageCode: 'es-419',
          },
        },
        createElement(CombinedHelpsEmptyState, { view })
      )
    )
    expect(html).toContain('Latin American Spanish (Español Latin America)')
    expect(html).toContain('Judges')
    expect(html).not.toContain(HELPS_EMPTY_COPY.noPassage('Spanish', 'Judges 1'))
  })

  test('OBS language with empty helps catalog shows no-sources empty, not a blank or spinner', () => {
    const view = resolveHelpsPaneNoSourcesView({
      mode: 'helps',
      languageCode: 'tr',
      isLoading: false,
      hasResource: false,
      languageName: { code: 'tr', name: 'Türkçe', anglicizedName: 'Turkish' },
    })
    expect(view).not.toBeNull()
    const html = renderToStaticMarkup(
      createElement(
        HelpsLanguageActionsProvider,
        {
          value: {
            openHelpsPicker: () => {},
            selectHelpsLanguage: () => {},
            selectedLanguageCode: 'tr',
          },
        },
        createElement(CombinedHelpsEmptyState, { view: view! })
      )
    )
    expect(html).toMatch(/Turkish \(Türkçe\) doesn(?:'|&#x27;)t have translation helps yet/)
    expect(html).toContain('<svg')
    expect(html).toContain(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
    expect(html).not.toContain('animate-spin')
    expect(html).not.toContain('Select a language')
    expect(html).not.toContain('resource not found')
    expect(html.trim().length).toBeGreaterThan(0)
  })
})
