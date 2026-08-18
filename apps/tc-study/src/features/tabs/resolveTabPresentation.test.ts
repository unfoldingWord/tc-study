import { afterAll, describe, expect, test } from 'bun:test'
import { Book, Layers, LifeBuoy, MessageCircleQuestion, NotebookText } from 'lucide-react'
import { questionsPanelEntry } from '../../resourceTypes/panelEntries'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import {
  bindCombinedHelpsCompositionsForTest,
  bindFakeCompositionForTest,
  FAKE_COMPOSITION_PERSIST_ID,
} from '../helps/testCompositionRegistry'
import { getActiveResourceTypeRegistry } from '../../resourceTypes/activeRegistry'
import { resolveLucideIconName } from './lucideIconRegistry'
import {
  resolveTabIcon,
  resolveTabPresentation,
  resolveTabPresentationFromRegistry,
} from './resolveTabPresentation'
import type { TabIcon } from './tabIcon'

describe('resolveTabIcon', () => {
  test('resolves allowlisted string names', () => {
    expect(resolveTabIcon('LifeBuoy')).toBe(LifeBuoy)
    expect(resolveTabIcon('MessageCircleQuestion')).toBe(MessageCircleQuestion)
  })

  test('passes through LucideIcon components', () => {
    expect(resolveTabIcon(LifeBuoy)).toBe(LifeBuoy)
    expect(resolveTabIcon(Book)).toBe(Book)
  })

  test('returns null for unknown names and empty input', () => {
    expect(resolveTabIcon('NotARealIcon')).toBeNull()
    expect(resolveTabIcon(undefined)).toBeNull()
    expect(resolveTabIcon(null)).toBeNull()
  })
})

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

describe('resolveTabPresentation', () => {
  const types: Record<string, { icon?: string; contentRole?: 'primary' | 'companion' | 'shared' }> =
    {
      [RESOURCE_TYPE_IDS.SCRIPTURE]: { icon: 'Book', contentRole: 'primary' },
      [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS]: {
        icon: 'MessageCircleQuestion',
        contentRole: 'companion',
      },
      [RESOURCE_TYPE_IDS.COMBINED_HELPS]: { icon: 'NotebookText', contentRole: 'companion' },
      [RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS]: { icon: 'NotebookText', contentRole: 'companion' },
    }

  const getType = (id: string) => types[id] as never

  test('companion with plugin string icon is icon-only', () => {
    const p = resolveTabPresentation(
      {
        key: 'unfoldingWord/en/tq',
        type: 'questions',
        title: 'Translation Questions',
      },
      { getType }
    )
    expect(p.Icon).toBe(MessageCircleQuestion)
    expect(p.showShortLabel).toBe(false)
    expect(p.shortLabel).toBe('TQ')
    expect(p.title).toBe('Translation Questions')
  })

  test('primary shows icon + short abbrev from key segment', () => {
    const p = resolveTabPresentation(
      { key: 'unfoldingWord/en/glt', type: 'scripture', title: 'Gateway Language Text' },
      { getType }
    )
    expect(p.Icon).toBe(Book)
    expect(p.showShortLabel).toBe(true)
    expect(p.shortLabel).toBe('GLT')
  })

  test('primary prefers DCS abbreviation over key segment (glt → TPL)', () => {
    const p = resolveTabPresentation(
      {
        key: 'es-419_gl/es-419/glt',
        type: 'scripture',
        title: 'Texto Puente Literal',
        abbreviation: 'tpl',
      },
      { getType }
    )
    expect(p.Icon).toBe(Book)
    expect(p.showShortLabel).toBe(true)
    expect(p.shortLabel).toBe('TPL')
  })

  test('CombinedHelps special key is icon-only NotebookText with Helps tooltip', () => {
    const p = resolveTabPresentation(
      {
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        title: 'Helps',
      },
      { getType }
    )
    expect(p.Icon).toBe(NotebookText)
    expect(p.showShortLabel).toBe(false)
    expect(p.shortLabel).toBe('Helps')
    expect(p.title).toBe('Helps')
  })

  test('OBS CombinedHelps is icon-only with OBS Helps accessible title', () => {
    const p = resolveTabPresentation(
      {
        key: OBS_COMBINED_HELPS_RESOURCE_ID,
        type: 'obs-combined-helps',
        title: 'OBS Helps',
      },
      { getType }
    )
    expect(p.Icon).toBe(NotebookText)
    expect(p.showShortLabel).toBe(false)
    expect(p.shortLabel).toBe('OBS Helps')
    expect(p.title).toBe('OBS Helps')
  })

  test('override string wins over plugin icon', () => {
    const overrides: Record<string, TabIcon> = {
      [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS]: 'LifeBuoy',
    }
    const p = resolveTabPresentation(
      { key: 'u/en/tq', type: 'questions', title: 'TQ' },
      { getType, overrides }
    )
    expect(p.Icon).toBe(LifeBuoy)
  })

  test('override component wins over plugin icon', () => {
    const overrides: Record<string, TabIcon> = {
      [RESOURCE_TYPE_IDS.COMBINED_HELPS]: Book,
    }
    const p = resolveTabPresentation(
      { key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps', title: 'Helps' },
      { getType, overrides }
    )
    expect(p.Icon).toBe(Book)
  })

  test('questions pane-member copies MessageCircleQuestion from the resource type', () => {
    expect(questionsPanelEntry.icon).toBe('MessageCircleQuestion')
  })

  test('FromRegistry inherits questions icon for unfoldingWord/en/tq when pane-member has no icon', () => {
    const p = resolveTabPresentationFromRegistry(
      {
        key: 'unfoldingWord/en/tq',
        type: 'questions',
        title: 'Translation Questions',
      },
      getActiveResourceTypeRegistry()
    )
    expect(p.Icon).toBe(MessageCircleQuestion)
    expect(p.showShortLabel).toBe(false)
    expect(p.shortLabel).toBe('TQ')
  })

  test('FromRegistry reads CombinedHelps icon + companion role from panel entry', () => {
    const p = resolveTabPresentationFromRegistry(
      {
        key: COMBINED_HELPS_RESOURCE_ID,
        type: 'combined-helps',
        title: 'Helps',
      },
      getActiveResourceTypeRegistry()
    )
    expect(p.Icon).toBe(NotebookText)
    expect(p.showShortLabel).toBe(false)
  })

  test('fake composition persist id resolves via resolvePanelEntry without RESOURCE_TYPE_IDS', () => {
    const restore = bindFakeCompositionForTest()
    try {
      const p = resolveTabPresentationFromRegistry(
        { key: `${FAKE_COMPOSITION_PERSIST_ID}:panel-1` },
        getActiveResourceTypeRegistry()
      )
      expect(p.shortLabel).toBe('Fake Pair')
      expect(p.title).toBe('Fake Pair')
    } finally {
      restore()
    }
  })

  test('falls back to short label when no icon', () => {
    const p = resolveTabPresentation(
      { key: 'u/en/xyz', type: 'unknown-type', title: 'Mystery Resource' },
      { getType }
    )
    expect(p.Icon).toBeNull()
    expect(p.showShortLabel).toBe(true)
    expect(p.shortLabel).toBe('XYZ')
    expect(p.title).toBe('Mystery Resource')
  })
})

describe('lucideIconRegistry', () => {
  test('includes plugin icons used by tc-study', () => {
    expect(resolveLucideIconName('NotebookText')).toBe(NotebookText)
    expect(resolveLucideIconName('Layers')).toBe(Layers)
    expect(resolveLucideIconName('LifeBuoy')).toBe(LifeBuoy)
    expect(resolveLucideIconName('Book')).toBe(Book)
    expect(resolveLucideIconName('Missing')).toBeNull()
  })
})
