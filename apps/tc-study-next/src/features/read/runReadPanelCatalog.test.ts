import { describe, expect, test } from 'bun:test'
import {
  catalogLoadForDefaultPair,
  catalogLoadForSinglePanel,
  coldStartCatalogLoads,
} from './runReadPanelCatalog'
import type { ReadPanelModels } from './readPanelModel'

describe('runReadPanelCatalog', () => {
  test('default pair dual-loads without a shared dest (p1 text / p2 helps)', () => {
    const panels: ReadPanelModels = {
      'panel-1': { mode: 'scripture', languageCode: 'es' },
      'panel-2': { mode: 'helps', languageCode: 'en' },
    }
    expect(catalogLoadForDefaultPair(panels)).toEqual({
      textLanguageCode: 'es',
      helpsLanguageCode: 'en',
      loadTarget: 'both',
    })
  })

  test('two scripture panels each get their own dest and language', () => {
    const panels: ReadPanelModels = {
      'panel-1': { mode: 'scripture', languageCode: 'es' },
      'panel-2': { mode: 'scripture', languageCode: 'en' },
    }
    expect(catalogLoadForDefaultPair(panels)).toBeNull()
    expect(catalogLoadForSinglePanel(panels, 'panel-1')).toEqual({
      textLanguageCode: 'es',
      helpsLanguageCode: 'en',
      loadTarget: 'text',
      destPanelId: 'panel-1',
    })
    expect(catalogLoadForSinglePanel(panels, 'panel-2')).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'es',
      loadTarget: 'text',
      destPanelId: 'panel-2',
    })
  })

  test('cold-start scripture+helps pair triggers a both-target load (helps does not wait)', () => {
    const panels: ReadPanelModels = {
      'panel-1': { mode: 'scripture', languageCode: 'en' },
      'panel-2': { mode: 'helps', languageCode: 'en' },
    }
    expect(coldStartCatalogLoads(panels)).toEqual([
      {
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      },
    ])
  })

  test('same-language dual scripture still yields two independent text dests', () => {
    const panels: ReadPanelModels = {
      'panel-1': { mode: 'scripture', languageCode: 'en' },
      'panel-2': { mode: 'scripture', languageCode: 'en' },
    }
    expect(catalogLoadForDefaultPair(panels)).toBeNull()
    expect(catalogLoadForSinglePanel(panels, 'panel-1')).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      loadTarget: 'text',
      destPanelId: 'panel-1',
    })
    expect(catalogLoadForSinglePanel(panels, 'panel-2')).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      loadTarget: 'text',
      destPanelId: 'panel-2',
    })
  })
})
