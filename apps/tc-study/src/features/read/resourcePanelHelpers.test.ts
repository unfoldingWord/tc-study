import { describe, expect, test } from 'bun:test'
import {
  getResourceAppliesToScope,
  primaryLangSegment,
  resourceSupportsBook,
} from './resourcePanelHelpers'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../helps/combinedHelpsIds'

describe('resourcePanelHelpers', () => {
  test('primaryLangSegment strips region tags', () => {
    expect(primaryLangSegment('en-US')).toBe('en')
    expect(primaryLangSegment('pt_BR')).toBe('pt')
  })

  test('getResourceAppliesToScope encodes CombinedHelps ids', () => {
    const registry = {
      getTypeForSubject: () => undefined,
      getScopeForType: () => null,
    }
    expect(getResourceAppliesToScope(COMBINED_HELPS_RESOURCE_ID, {}, registry)).toBe('scripture')
    expect(getResourceAppliesToScope(OBS_COMBINED_HELPS_RESOURCE_ID, {}, registry)).toBe('obs')
    expect(getResourceAppliesToScope(`${COMBINED_HELPS_RESOURCE_ID}:panel-1`, {}, registry)).toBe(
      'scripture'
    )
    expect(getResourceAppliesToScope(`${OBS_COMBINED_HELPS_RESOURCE_ID}:panel-1`, {}, registry)).toBe(
      'obs'
    )
  })

  test('resourceSupportsBook always shows CombinedHelps and OBS book code', () => {
    expect(resourceSupportsBook(COMBINED_HELPS_RESOURCE_ID, {}, 'gen')).toBe(true)
    expect(resourceSupportsBook('owner/en/ult', {}, 'obs')).toBe(true)
  })

  test('resourceSupportsBook hides when verifiedIngredients omit the book', () => {
    const loaded = {
      'u/en/tn': {
        id: 'u/en/tn',
        verifiedIngredients: [{ identifier: 'exo' }],
      } as any,
    }
    expect(resourceSupportsBook('u/en/tn', loaded, 'gen')).toBe(false)
    expect(resourceSupportsBook('u/en/tn', loaded, 'exo')).toBe(true)
  })

  test('resourceSupportsBook: Phase-1 TQ (entry + ingredients) uses ingredients immediately', () => {
    // Regression: contentStructure 'entry' used to fail-open and ignore ingredients,
    // so TQ flashed during load then vanished after verifiedIngredients arrived.
    const loaded = {
      'u/en/tq': {
        id: 'u/en/tq',
        type: 'questions',
        contentStructure: 'entry',
        ingredients: [
          { identifier: 'gen', path: './tq_GEN.tsv' },
          { identifier: 'tit', path: './tq_TIT.tsv' },
        ],
      } as any,
    }
    expect(resourceSupportsBook('u/en/tq', loaded, 'tit')).toBe(true)
    expect(resourceSupportsBook('u/en/tq', loaded, 'rev')).toBe(false)
  })

  test('resourceSupportsBook: empty verifiedIngredients fail-open (no hide-all)', () => {
    const loaded = {
      'u/en/tq': {
        id: 'u/en/tq',
        type: 'questions',
        verifiedIngredients: [],
        ingredients: [{ identifier: 'tit', path: './tq_TIT.tsv' }],
      } as any,
    }
    expect(resourceSupportsBook('u/en/tq', loaded, 'tit')).toBe(true)
  })

  test('resourceSupportsBook matches book via path when identifier missing', () => {
    const loaded = {
      'u/en/tq': {
        id: 'u/en/tq',
        verifiedIngredients: [{ path: './tq_TIT.tsv' }],
      } as any,
    }
    expect(resourceSupportsBook('u/en/tq', loaded, 'tit')).toBe(true)
    expect(resourceSupportsBook('u/en/tq', loaded, 'gen')).toBe(false)
  })
})
