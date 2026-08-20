import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getHelpsContentHydrateTick,
  requestHelpsContentHydrate,
  resetHelpsContentHydrateTick,
  shouldReuseHelpsContentCache,
  subscribeHelpsContentHydrate,
} from './helpsContentHydrate'

afterEach(() => {
  resetHelpsContentHydrateTick()
})

describe('shouldReuseHelpsContentCache', () => {
  test('miss and error hits are not settled', () => {
    expect(shouldReuseHelpsContentCache(undefined)).toBe(false)
    expect(shouldReuseHelpsContentCache({ error: 'Notes not available for RUT' })).toBe(false)
  })

  test('successful load is reusable even when the book has no notes', () => {
    expect(shouldReuseHelpsContentCache({ error: null })).toBe(true)
    expect(shouldReuseHelpsContentCache({})).toBe(true)
  })
})

describe('requestHelpsContentHydrate', () => {
  test('switch-back bumps the tick so mounted viewers refetch', () => {
    expect(getHelpsContentHydrateTick()).toBe(0)
    const seen: number[] = []
    const unsubscribe = subscribeHelpsContentHydrate(() => {
      seen.push(getHelpsContentHydrateTick())
    })
    expect(requestHelpsContentHydrate()).toBe(1)
    expect(requestHelpsContentHydrate()).toBe(2)
    expect(seen).toEqual([1, 2])
    unsubscribe()
  })
})

describe('helps-mode switch-back wires shared content hydrate', () => {
  const handler = readFileSync(
    join(import.meta.dir, '../read/useReadPanelLanguageHandlers.ts'),
    'utf8'
  )
  const membership = readFileSync(join(import.meta.dir, '../read/applyReadModeMembership.ts'), 'utf8')
  const notes = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/TranslationNotesViewer/hooks/useTranslationNotesContent.ts'
    ),
    'utf8'
  )
  const twl = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/WordsLinksViewer/hooks/useWordsLinksContent.ts'
    ),
    'utf8'
  )
  const tq = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/TranslationQuestionsViewer/index.tsx'
    ),
    'utf8'
  )
  const mode = handler.slice(handler.indexOf('const handlePanelModeSwitch'))

  test('switch-back to helps requests content hydrate even when catalog types exist', () => {
    expect(mode).toContain('applyReadModeMembership')
    expect(mode).toContain('packageHasHelpsCatalogTypes')
    expect(mode).toContain('requestHelpsContentHydrate')
    const hydrateIdx = mode.indexOf('requestHelpsContentHydrate')
    const settledIdx = mode.indexOf('markCatalogSettled([panelId])')
    expect(hydrateIdx).toBeGreaterThan(-1)
    expect(settledIdx).toBeGreaterThan(hydrateIdx)
  })

  test('membership apply still projects so TQ is not left as a placeholder', () => {
    expect(membership).toContain('projectCurrentWorkspacePanels')
  })

  test('TN / TWL / TQ loaders subscribe to the shared hydrate tick', () => {
    expect(notes).toContain('getHelpsContentHydrateTick')
    expect(notes).toContain('shouldReuseHelpsContentCache')
    expect(twl).toContain('getHelpsContentHydrateTick')
    expect(tq).toContain('getHelpsContentHydrateTick')
  })
})
