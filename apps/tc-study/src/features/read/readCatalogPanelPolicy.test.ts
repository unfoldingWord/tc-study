import { describe, expect, test } from 'bun:test'
import {
  catalogTargetsForLoad,
  panelAssignmentForContentRole,
} from './readCatalogPanelPolicy'

describe('panelAssignmentForContentRole', () => {
  test('same-language both: primary → panel-1, companion → panel-2', () => {
    expect(panelAssignmentForContentRole('primary', 'both', true)).toEqual({
      kind: 'panel',
      panelId: 'panel-1',
    })
    expect(panelAssignmentForContentRole('companion', 'both', true)).toEqual({
      kind: 'panel',
      panelId: 'panel-2',
    })
    expect(panelAssignmentForContentRole('shared', 'both', true)).toEqual({
      kind: 'panel',
      panelId: 'panel-2',
    })
  })

  test('text-only skips companions so helps pane is not blanked/polluted', () => {
    expect(panelAssignmentForContentRole('primary', 'text', true)).toEqual({
      kind: 'panel',
      panelId: 'panel-1',
    })
    expect(panelAssignmentForContentRole('companion', 'text', true)).toEqual({ kind: 'skip' })
    expect(panelAssignmentForContentRole('shared', 'text', true)).toEqual({ kind: 'skip' })
  })

  test('helps-only skips primary so text pane keeps language X', () => {
    expect(panelAssignmentForContentRole('primary', 'helps', true)).toEqual({ kind: 'skip' })
    expect(panelAssignmentForContentRole('companion', 'helps', true)).toEqual({
      kind: 'panel',
      panelId: 'panel-2',
    })
  })

  test('no viewer → package only when the role belongs to this target', () => {
    expect(panelAssignmentForContentRole('companion', 'helps', false)).toEqual({
      kind: 'packageOnly',
    })
    expect(panelAssignmentForContentRole('primary', 'helps', false)).toEqual({ kind: 'skip' })
  })

  test('destPanelId sends scripture to panel-2 (two scripture panels are not clones)', () => {
    expect(panelAssignmentForContentRole('primary', 'text', true, 'panel-2')).toEqual({
      kind: 'panel',
      panelId: 'panel-2',
    })
    expect(panelAssignmentForContentRole('companion', 'helps', true, 'panel-1')).toEqual({
      kind: 'panel',
      panelId: 'panel-1',
    })
  })
})

describe('catalogTargetsForLoad', () => {
  test('same-language pair is a single both-target search', () => {
    expect(
      catalogTargetsForLoad({
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      })
    ).toEqual([{ languageCode: 'en', target: 'both' }])
  })

  test('split pair searches text then helps', () => {
    expect(
      catalogTargetsForLoad({
        textLanguageCode: 'bho',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      })
    ).toEqual([
      { languageCode: 'bho', target: 'text' },
      { languageCode: 'en', target: 'helps' },
    ])
  })

  test('text-only / helps-only are single-sided', () => {
    expect(
      catalogTargetsForLoad({
        textLanguageCode: 'bho',
        helpsLanguageCode: 'en',
        loadTarget: 'text',
      })
    ).toEqual([{ languageCode: 'bho', target: 'text' }])
    expect(
      catalogTargetsForLoad({
        textLanguageCode: 'bho',
        helpsLanguageCode: 'es',
        loadTarget: 'helps',
      })
    ).toEqual([{ languageCode: 'es', target: 'helps' }])
  })
})
