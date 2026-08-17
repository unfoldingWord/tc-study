import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import { ensureCombinedHelpsInWorkspace } from './ensureCombinedHelps'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

describe('ensureCombinedHelpsInWorkspace', () => {
  test('injects scripture CombinedHelps when TN+TWL added (Studio add path)', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/ult', res({ key: 'u/en/ult', type: 'scripture' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/en/ult'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.removed).toEqual([])
    expect(out.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
    expect(out.resources.has('u/en/tn')).toBe(true)
    expect(out.resources.has('u/en/twl')).toBe(true)
    expect(out.panels[1]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
    expect(out.panels[1]!.resourceKeys).not.toContain('u/en/tn')
    expect(out.panels[1]!.resourceKeys).not.toContain('u/en/twl')
    expect(out.panels[1]!.activeIndex).toBe(0)
  })

  test('injects on restore when CombinedHelps missing from saved workspace', () => {
    const resources = {
      'u/en/tn': res({ key: 'u/en/tn', type: 'notes' }),
      'u/en/twl': res({ key: 'u/en/twl', type: 'words-links' }),
    }
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 1 }]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels })
    expect(out.injected).toEqual([COMBINED_HELPS_RESOURCE_ID])
    expect(out.panels[0]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('injects OBS CombinedHelps for OBS twins', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/obs-tn', res({ key: 'u/en/obs-tn', type: 'obs-notes' })],
      ['u/en/obs-twl', res({ key: 'u/en/obs-twl', type: 'obs-words-links' })],
    ])
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/obs-tn', 'u/en/obs-twl'], activeIndex: 0 }]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(OBS_COMBINED_HELPS_RESOURCE_ID)
    expect(out.resources.has(OBS_COMBINED_HELPS_RESOURCE_ID)).toBe(true)
    expect(out.panels[0]!.resourceKeys).toEqual([OBS_COMBINED_HELPS_RESOURCE_ID])
    expect(out.panels[0]!.resourceKeys).not.toContain('u/en/obs-tn')
    expect(out.panels[0]!.resourceKeys).not.toContain('u/en/obs-twl')
  })

  test('injects CombinedHelps when only one helps side present', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
    ])
    const panels = [{ id: 'panel-2', resourceKeys: ['u/en/tn'], activeIndex: 0 }]
    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
    expect(out.resources.get(COMBINED_HELPS_RESOURCE_ID)?.helpsTnResourceKey).toBe('u/en/tn')
    expect(out.panels[0]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
  })

  test('Read bootstrap policy fixture: TN+TWL in language load → CombinedHelps present', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/ult', res({ key: 'u/en/ult', type: 'scripture' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ['u/en/tq', res({ key: 'u/en/tq', type: 'questions' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/en/ult'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl', 'u/en/tq'], activeIndex: 0 },
    ]
    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.panels[1]!.resourceKeys).toEqual([
      COMBINED_HELPS_RESOURCE_ID,
      'u/en/tq',
    ])
    expect(out.panels[1]!.resourceKeys).not.toContain('u/en/tn')
    expect(out.panels[1]!.resourceKeys).not.toContain('u/en/twl')
  })

  test('preserves panel-2 active tab (TQ) on idempotent ensure — no activeIndex clobber', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ['u/en/tq', res({ key: 'u/en/tq', type: 'questions' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({ key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' }),
      ],
    ])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID, 'u/en/tn', 'u/en/twl', 'u/en/tq'],
        activeIndex: 3, // TQ selected
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toEqual([])
    expect(out.removed).toEqual([])
    expect(out.panels[0]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID, 'u/en/tq'])
    expect(out.panels[0]!.resourceKeys[out.panels[0]!.activeIndex]).toBe('u/en/tq')
  })

  test('on first inject, activates CombinedHelps when previous active was hidden TN', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ['u/en/tq', res({ key: 'u/en/tq', type: 'questions' })],
    ])
    const panels = [
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl', 'u/en/tq'], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.panels[0]!.resourceKeys[out.panels[0]!.activeIndex]).toBe(
      COMBINED_HELPS_RESOURCE_ID
    )
  })

  test('on first inject with TQ active, preserves TQ (does not force CombinedHelps)', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ['u/en/tq', res({ key: 'u/en/tq', type: 'questions' })],
    ])
    const panels = [
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl', 'u/en/tq'], activeIndex: 2 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.injected).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.panels[0]!.resourceKeys[out.panels[0]!.activeIndex]).toBe('u/en/tq')
  })

  test('keeps CombinedHelps when TN drops and TWL remains', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({ key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' }),
      ],
    ])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID],
        activeIndex: 0,
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.removed).toEqual([])
    expect(out.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
    expect(out.resources.get(COMBINED_HELPS_RESOURCE_ID)?.helpsTwlResourceKey).toBe('u/en/twl')
    expect(out.panels[0]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
  })

  test('keeps CombinedHelps when TWL drops and TN remains', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({ key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' }),
      ],
    ])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID],
        activeIndex: 0,
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels })
    expect(out.removed).toEqual([])
    expect(out.panels[0]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
    expect(out.resources.get(COMBINED_HELPS_RESOURCE_ID)?.helpsTnResourceKey).toBe('u/en/tn')
  })

  test('reconcile removes CombinedHelps when both helps sides drop', () => {
    const resources = new Map<string, ResourceInfo>([
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({ key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' }),
      ],
    ])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID],
        activeIndex: 0,
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.removed).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(false)
    expect(out.panels[0]!.resourceKeys).toEqual([])
  })

  test('keeps OBS CombinedHelps when only one OBS twin remains', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/obs-tn', res({ key: 'u/en/obs-tn', type: 'obs-notes' })],
      [
        OBS_COMBINED_HELPS_RESOURCE_ID,
        res({ key: OBS_COMBINED_HELPS_RESOURCE_ID, type: 'obs-combined-helps' }),
      ],
    ])
    const panels = [
      {
        id: 'panel-2',
        resourceKeys: [OBS_COMBINED_HELPS_RESOURCE_ID],
        activeIndex: 0,
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.removed).toEqual([])
    expect(out.resources.has(OBS_COMBINED_HELPS_RESOURCE_ID)).toBe(true)
    expect(out.panels[0]!.resourceKeys).toEqual([OBS_COMBINED_HELPS_RESOURCE_ID])
  })

  test('Read path uses the same ensure helper as Studio (via applyCombinedHelpsEnsure)', () => {
    const apply = readFileSync(join(import.meta.dir, 'applyCombinedHelpsEnsure.ts'), 'utf8')
    const catalogLoad = readFileSync(
      join(import.meta.dir, '../read/loadReadLanguageCatalog.ts'),
      'utf8'
    )
    expect(apply).toContain('ensureCombinedHelpsInWorkspace')
    expect(catalogLoad).toContain('applyCombinedHelpsEnsure')
  })

  test('language switch: explicit es prefers Spanish TN/TWL when English leftovers remain', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
      ['u/es/glt', res({ key: 'u/es/glt', type: 'scripture', language: 'es', languageCode: 'es' })],
      ['u/es/tn', res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' })],
      ['u/es/twl', res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({
          key: COMBINED_HELPS_RESOURCE_ID,
          type: 'combined-helps',
          language: 'en',
          languageCode: 'en',
          helpsTnResourceKey: 'u/en/tn',
          helpsTwlResourceKey: 'u/en/twl',
        }),
      ],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/es/glt'], activeIndex: 0 },
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID, 'u/es/tn', 'u/es/twl'],
        activeIndex: 0,
      },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'es' })
    const ch = out.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/es/tn')
    expect(ch.helpsTwlResourceKey).toBe('u/es/twl')
    expect(ch.language).toBe('es')
    expect(ch.languageCode).toBe('es')
    expect(out.panels[1]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
  })

  test('guesses gateway language from panel-1 scripture (ignores UGNT + English leftovers)', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
      ['u/es/glt', res({ key: 'u/es/glt', type: 'scripture', language: 'es', languageCode: 'es' })],
      ['u/es/tn', res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' })],
      ['u/es/twl', res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' })],
      [
        'unfoldingWord/el-x-koine/ugnt',
        res({
          key: 'unfoldingWord/el-x-koine/ugnt',
          type: 'scripture',
          language: 'el-x-koine',
          languageCode: 'el-x-koine',
        }),
      ],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({
          key: COMBINED_HELPS_RESOURCE_ID,
          type: 'combined-helps',
          language: 'en',
          languageCode: 'en',
          helpsTnResourceKey: 'u/en/tn',
          helpsTwlResourceKey: 'u/en/twl',
        }),
      ],
    ])
    const panels = [
      {
        id: 'panel-1',
        resourceKeys: ['u/es/glt', 'unfoldingWord/el-x-koine/ugnt'],
        activeIndex: 0,
      },
      {
        id: 'panel-2',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID, 'u/es/tn', 'u/es/twl'],
        activeIndex: 0,
      },
    ]

    // Simulates assignResourceToPanel after UGNT hydrate (no languageCode)
    const out = ensureCombinedHelpsInWorkspace({ resources, panels })
    const ch = out.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/es/tn')
    expect(ch.helpsTwlResourceKey).toBe('u/es/twl')
    expect(ch.languageCode).toBe('es')
    expect(out.panels[1]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
  })

  test('ignores original-language languageCode hint (el-x-koine) and keeps gateway pair', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/es/glt', res({ key: 'u/es/glt', type: 'scripture', language: 'es', languageCode: 'es' })],
      ['u/es/tn', res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' })],
      ['u/es/twl', res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({
          key: COMBINED_HELPS_RESOURCE_ID,
          type: 'combined-helps',
          language: 'es',
          languageCode: 'es',
          helpsTnResourceKey: 'u/es/tn',
          helpsTwlResourceKey: 'u/es/twl',
        }),
      ],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/es/glt'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: [COMBINED_HELPS_RESOURCE_ID], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({
      resources,
      panels,
      languageCode: 'el-x-koine',
    })
    expect(out.removed).toEqual([])
    const ch = out.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/es/tn')
    expect(ch.languageCode).toBe('es')
  })

  test('panel-1 minority text without helps keeps existing CombinedHelps language', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
      ['u/bho/obs', res({ key: 'u/bho/obs', type: 'obs', language: 'bho', languageCode: 'bho' })],
      [
        COMBINED_HELPS_RESOURCE_ID,
        res({
          key: COMBINED_HELPS_RESOURCE_ID,
          type: 'combined-helps',
          language: 'en',
          languageCode: 'en',
          helpsTnResourceKey: 'u/en/tn',
          helpsTwlResourceKey: 'u/en/twl',
        }),
      ],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/bho/obs'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: [COMBINED_HELPS_RESOURCE_ID], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels })
    expect(out.removed).toEqual([])
    const ch = out.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/en/tn')
    expect(ch.helpsTwlResourceKey).toBe('u/en/twl')
    expect(ch.languageCode).toBe('en')
    expect(out.panels[1]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('panelId panel-1 injects a scoped CombinedHelps without stealing panel-2', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/es/tn', res({ key: 'u/es/tn', type: 'notes', language: 'es', languageCode: 'es' })],
      ['u/es/twl', res({ key: 'u/es/twl', type: 'words-links', language: 'es', languageCode: 'es' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/es/tn', 'u/es/twl'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: [COMBINED_HELPS_RESOURCE_ID], activeIndex: 0 },
    ]
    resources.set(
      COMBINED_HELPS_RESOURCE_ID,
      res({
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        language: 'en',
        languageCode: 'en',
      })
    )

    const out = ensureCombinedHelpsInWorkspace({
      resources,
      panels,
      languageCode: 'es',
      panelId: 'panel-1',
    })
    const scoped = `${COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(out.panels[0]!.resourceKeys).toContain(scoped)
    expect(out.panels[1]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.resources.get(scoped)?.languageCode).toBe('es')
  })

  test('does not inject CombinedHelps onto a scripture panel-2 (same-lang dual scripture)', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/ult', res({ key: 'u/en/ult', type: 'scripture' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/en/ult'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/ult#2', COMBINED_HELPS_RESOURCE_ID], activeIndex: 0 },
    ]
    resources.set(
      COMBINED_HELPS_RESOURCE_ID,
      res({
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        language: 'en',
        languageCode: 'en',
      })
    )

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.panels[0]!.resourceKeys).toEqual(['u/en/ult'])
    expect(out.panels[1]!.resourceKeys).toEqual(['u/en/ult#2'])
    expect(out.panels[1]!.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('forceHelpsPanel injects CombinedHelps onto a scripture-keyed pane', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/ult', res({ key: 'u/en/ult', type: 'scripture' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/en/ult'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: [COMBINED_HELPS_RESOURCE_ID], activeIndex: 0 },
    ]
    resources.set(
      COMBINED_HELPS_RESOURCE_ID,
      res({
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        language: 'en',
        languageCode: 'en',
      })
    )

    const out = ensureCombinedHelpsInWorkspace({
      resources,
      panels,
      languageCode: 'en',
      panelId: 'panel-1',
      forceHelpsPanel: true,
    })
    const scoped = `${COMBINED_HELPS_RESOURCE_ID}:panel-1`
    expect(out.panels[0]!.resourceKeys).toContain('u/en/ult')
    expect(out.panels[0]!.resourceKeys).toContain(scoped)
    expect(out.panels[1]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('does not keep unscoped and :panel-N CombinedHelps on the same panel', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
    ])
    const scoped = `${COMBINED_HELPS_RESOURCE_ID}:panel-1`
    resources.set(
      COMBINED_HELPS_RESOURCE_ID,
      res({
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        language: 'en',
        languageCode: 'en',
      })
    )
    const panels = [
      {
        id: 'panel-1',
        resourceKeys: [COMBINED_HELPS_RESOURCE_ID, 'u/en/tn', 'u/en/twl'],
        activeIndex: 0,
      },
      { id: 'panel-2', resourceKeys: [], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({
      resources,
      panels,
      languageCode: 'en',
      panelId: 'panel-1',
    })
    const helpsKeys = out.panels[0]!.resourceKeys.filter((k) =>
      k === COMBINED_HELPS_RESOURCE_ID || k.startsWith(`${COMBINED_HELPS_RESOURCE_ID}:`)
    )
    expect(helpsKeys).toEqual([scoped])
    expect(out.panels[0]!.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)
  })
})
