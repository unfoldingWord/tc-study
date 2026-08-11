import { describe, expect, test } from 'bun:test'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { filterReadPanel2Keys } from './filterReadPanelKeys'

const registry = {
  getTypeForSubject: () => undefined,
  getScopeForType: () => null,
}

describe('filterReadPanel2Keys', () => {
  test('Helps+TQ stable across Phase-1 entry → verifiedIngredients for supported book', () => {
    // Unlock 1: panel keys omit TN/TWL when CombinedHelps is present (legacy keys still hidden)
    const panel2ResourceKeys = [
      COMBINED_HELPS_RESOURCE_ID,
      'uw/en/tn',
      'uw/en/twl',
      'uw/en/tq',
    ]

    const duringLoad = {
      [COMBINED_HELPS_RESOURCE_ID]: {
        id: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        appliesToScope: 'scripture',
      } as any,
      'uw/en/tn': { id: 'uw/en/tn', type: 'notes', appliesToScope: 'scripture' } as any,
      'uw/en/twl': { id: 'uw/en/twl', type: 'words-links', appliesToScope: 'scripture' } as any,
      'uw/en/tq': {
        id: 'uw/en/tq',
        type: 'questions',
        appliesToScope: 'scripture',
        contentStructure: 'entry',
        ingredients: [
          { identifier: 'gen', path: './tq_GEN.tsv' },
          { identifier: 'tit', path: './tq_TIT.tsv' },
        ],
      } as any,
    }

    const afterReady = {
      ...duringLoad,
      'uw/en/tq': {
        ...duringLoad['uw/en/tq'],
        contentStructure: 'book',
        verifiedIngredients: [
          { identifier: 'gen', path: './tq_GEN.tsv' },
          { identifier: 'tit', path: './tq_TIT.tsv' },
        ],
      } as any,
    }

    const loadingKeys = filterReadPanel2Keys({
      panel2ResourceKeys,
      loadedResources: duringLoad,
      resourceTypeRegistry: registry,
      navigationScope: 'scripture',
      currentBook: 'tit',
    })
    const readyKeys = filterReadPanel2Keys({
      panel2ResourceKeys,
      loadedResources: afterReady,
      resourceTypeRegistry: registry,
      navigationScope: 'scripture',
      currentBook: 'tit',
    })

    expect(loadingKeys).toEqual([COMBINED_HELPS_RESOURCE_ID, 'uw/en/tq'])
    expect(readyKeys).toEqual(loadingKeys)
    expect(readyKeys).not.toContain('uw/en/tn')
    expect(readyKeys).not.toContain('uw/en/twl')
  })

  test('TQ omitted from first paint when current book is absent from ingredients', () => {
    const keys = filterReadPanel2Keys({
      panel2ResourceKeys: [COMBINED_HELPS_RESOURCE_ID, 'uw/en/tq'],
      loadedResources: {
        [COMBINED_HELPS_RESOURCE_ID]: {
          id: COMBINED_HELPS_RESOURCE_ID,
          type: 'combined-helps',
          appliesToScope: 'scripture',
        } as any,
        'uw/en/tq': {
          id: 'uw/en/tq',
          type: 'questions',
          appliesToScope: 'scripture',
          contentStructure: 'entry',
          ingredients: [{ identifier: 'gen', path: './tq_GEN.tsv' }],
        } as any,
      },
      resourceTypeRegistry: registry,
      navigationScope: 'scripture',
      currentBook: 'tit',
    })
    expect(keys).toEqual([COMBINED_HELPS_RESOURCE_ID])
  })
})
