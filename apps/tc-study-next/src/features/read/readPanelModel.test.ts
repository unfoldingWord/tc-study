import { describe, expect, test } from 'bun:test'
import {
  applyPanelLanguage,
  applyPanelMode,
  applySeedBothLanguages,
  catalogTargetsForPanelModels,
  DEFAULT_READ_PANEL_MODELS,
  firstHelpsLanguageCode,
  modeForContentRole,
  navigationLanguageCode,
  shouldSeedBothPanelLanguages,
  type ReadPanelModels,
} from './readPanelModel'

const seededEs: ReadPanelModels = {
  'panel-1': { mode: 'scripture', languageCode: 'es' },
  'panel-2': { mode: 'helps', languageCode: 'es' },
}

describe('readPanelModel independence', () => {
  test('default modes are p1 scripture / p2 helps so existing bootstrap stays green', () => {
    expect(DEFAULT_READ_PANEL_MODELS['panel-1'].mode).toBe('scripture')
    expect(DEFAULT_READ_PANEL_MODELS['panel-2'].mode).toBe('helps')
    expect(modeForContentRole('primary')).toBe('scripture')
    expect(modeForContentRole('companion')).toBe('helps')
    expect(modeForContentRole('shared')).toBe('helps')
  })

  test('cold start with no languages should seed both; after seed, skip', () => {
    expect(shouldSeedBothPanelLanguages(DEFAULT_READ_PANEL_MODELS)).toBe(true)
    expect(shouldSeedBothPanelLanguages(seededEs)).toBe(false)
    expect(shouldSeedBothPanelLanguages(applyPanelLanguage(DEFAULT_READ_PANEL_MODELS, 'panel-2', 'en'))).toBe(
      false
    )
  })

  test('seed copies the same initial language onto both panels without changing modes', () => {
    const next = applySeedBothLanguages(DEFAULT_READ_PANEL_MODELS, 'es')
    expect(next['panel-1']).toEqual({ mode: 'scripture', languageCode: 'es' })
    expect(next['panel-2']).toEqual({ mode: 'helps', languageCode: 'es' })
  })

  test('two scripture panels keep independent languages (not clones)', () => {
    const bothScripture = applyPanelMode(seededEs, 'panel-2', 'scripture')
    const split = applyPanelLanguage(bothScripture, 'panel-2', 'en')
    expect(split['panel-1'].languageCode).toBe('es')
    expect(split['panel-2'].languageCode).toBe('en')
    expect(split['panel-1'].mode).toBe('scripture')
    expect(split['panel-2'].mode).toBe('scripture')
    expect(catalogTargetsForPanelModels(split)).toEqual([
      { languageCode: 'es', target: 'text', destPanelId: 'panel-1' },
      { languageCode: 'en', target: 'text', destPanelId: 'panel-2' },
    ])
  })

  test('two helps panels keep independent languages', () => {
    const bothHelps = applyPanelMode(seededEs, 'panel-1', 'helps')
    const split = applyPanelLanguage(bothHelps, 'panel-1', 'fr')
    expect(split['panel-1']).toEqual({ mode: 'helps', languageCode: 'fr' })
    expect(split['panel-2']).toEqual({ mode: 'helps', languageCode: 'es' })
    expect(catalogTargetsForPanelModels(split)).toEqual([
      { languageCode: 'fr', target: 'helps', destPanelId: 'panel-1' },
      { languageCode: 'es', target: 'helps', destPanelId: 'panel-2' },
    ])
  })

  test('changing panel A language does not reset panel B language or mode', () => {
    const next = applyPanelLanguage(seededEs, 'panel-1', 'bho')
    expect(next['panel-2']).toEqual(seededEs['panel-2'])
    expect(applyPanelMode(next, 'panel-1', 'helps')['panel-2']).toEqual(seededEs['panel-2'])
  })

  test('same language on both scripture panels still lists two dest panels', () => {
    const both = applyPanelMode(seededEs, 'panel-2', 'scripture')
    expect(catalogTargetsForPanelModels(both)).toEqual([
      { languageCode: 'es', target: 'text', destPanelId: 'panel-1' },
      { languageCode: 'es', target: 'text', destPanelId: 'panel-2' },
    ])
  })

  test('navigation language follows panel-1 scripture and does not stand in for panel-2', () => {
    const split = applyPanelLanguage(applyPanelMode(seededEs, 'panel-2', 'scripture'), 'panel-2', 'en')
    expect(navigationLanguageCode(split)).toBe('es')
    expect(firstHelpsLanguageCode(split)).toBeNull()
    expect(firstHelpsLanguageCode(seededEs)).toBe('es')
  })
})
