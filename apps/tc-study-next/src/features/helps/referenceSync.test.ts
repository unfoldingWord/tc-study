/**
 * A4 / issue #24: text pane and helps pane stay synced on scripture
 * reference (BCV) or OBS story/frame when languages differ.
 *
 * Sync keys on reference, not language. Frozen fixtures: minority-language
 * text + English helps still show tN for the same verse/frame.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { resolveCombinedHelpsResourceKeys } from '../../components/resources/CombinedHelpsViewer/useCombinedHelpsResources'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import { ensureCombinedHelpsInWorkspace } from './ensureCombinedHelps'
import {
  filterDisplayNotes,
  filterNotesByReferenceRange,
  resolveRangeEndVerse,
} from './helpsDisplayFilters'

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

/** Frozen English tN rows (helps language). Text pane language is not a field. */
const EN_TN_TITUS = [
  { id: 'en-tit-1-1', reference: '1:1', quote: 'Paul, a servant' },
  { id: 'en-tit-1-2', reference: '1:2', quote: 'in hope of eternal life' },
  { id: 'en-tit-2-1', reference: '2:1', quote: 'But you' },
]

/** Frozen English OBS tN rows. Story:frame maps to chapter:verse. */
const EN_TN_OBS = [
  { id: 'en-obs-1-1', reference: '1:1', quote: 'God created' },
  { id: 'en-obs-1-2', reference: '1:2', quote: 'the earth' },
  { id: 'en-obs-2-1', reference: '2:1', quote: 'Adam and Eve' },
]

describe('reference sync (text lang ≠ helps lang)', () => {
  test('English tN for a verse still match when text language is minority (bho)', () => {
    // CombinedHelps pipeline: filterNotesByReferenceRange(tnNotes, currentRef range)
    const shown = filterNotesByReferenceRange(EN_TN_TITUS, {
      startChapter: 1,
      startVerse: 1,
      endChapter: 1,
      endVerse: 1,
    })
    expect(shown.map((n) => n.id)).toEqual(['en-tit-1-1'])
  })

  test('verseFilter display notes key on chapter:verse, not language', () => {
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(
      EN_TN_TITUS.map((n) => ({ ...n, occurrence: '1' })),
      {
        helpsScope: 'scripture',
        obsQuoteFilter: null,
        verseFilter: { chapter: 1, verse: 2, timestamp: 1 },
        tokenFilter: null,
        bookCodeLower: 'tit',
      }
    )
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['en-tit-1-2'])
  })

  test('English OBS tN for a frame still match when OBS text is minority language', () => {
    const shown = filterNotesByReferenceRange(EN_TN_OBS, {
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 2,
    })
    expect(shown.map((n) => n.id)).toEqual(['en-obs-1-2'])
  })

  test('OBS story mode still shows all frames of the current story (reference, not language)', () => {
    const endVerse = resolveRangeEndVerse({ book: 'obs', verse: 1, endVerse: 1 }, 'chapter')
    const shown = filterNotesByReferenceRange(EN_TN_OBS, {
      startChapter: 1,
      startVerse: 1,
      endChapter: 1,
      endVerse,
    })
    expect(shown.map((n) => n.id)).toEqual(['en-obs-1-1', 'en-obs-1-2'])
  })

  test('Read ensure with helps language en binds English TN while panel-1 is minority scripture', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/bho/glt', res({ key: 'u/bho/glt', type: 'scripture', language: 'bho', languageCode: 'bho' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/bho/glt'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    const ch = out.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/en/tn')
    expect(ch.helpsTwlResourceKey).toBe('u/en/twl')
    expect(ch.languageCode).toBe('en')
    expect(out.panels[1]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('Read ensure with helps language en binds English OBS TN while panel-1 is minority OBS', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/bho/obs', res({ key: 'u/bho/obs', type: 'obs', language: 'bho', languageCode: 'bho' })],
      ['u/en/obs-tn', res({ key: 'u/en/obs-tn', type: 'obs-notes', language: 'en', languageCode: 'en' })],
      [
        'u/en/obs-twl',
        res({ key: 'u/en/obs-twl', type: 'obs-words-links', language: 'en', languageCode: 'en' }),
      ],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/bho/obs'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/obs-tn', 'u/en/obs-twl'], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    const ch = out.resources.get(OBS_COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('u/en/obs-tn')
    expect(ch.helpsTwlResourceKey).toBe('u/en/obs-twl')
    expect(ch.languageCode).toBe('en')
    expect(out.panels[1]!.resourceKeys).toContain(OBS_COMBINED_HELPS_RESOURCE_ID)
  })

  test('landmine: passing text language (bho) as ensure languageCode cannot bind English TN', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/bho/glt', res({ key: 'u/bho/glt', type: 'scripture', language: 'bho', languageCode: 'bho' })],
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' })],
    ])
    const panels = [
      { id: 'panel-1', resourceKeys: ['u/bho/glt'], activeIndex: 0 },
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0 },
    ]

    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'bho' })
    expect(out.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(false)
  })

  test('CombinedHelps key resolver keeps English TN when minority scripture is also loaded', () => {
    const loadedResources = {
      'u/bho/glt': res({ key: 'u/bho/glt', type: 'scripture', language: 'bho', languageCode: 'bho' }),
      'u/en/tn': res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }),
      'u/en/twl': res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }),
    }

    const result = resolveCombinedHelpsResourceKeys({
      loadedResources,
      wantLang: 'en',
      injectedTnKey: 'u/en/tn',
      injectedTwlKey: 'u/en/twl',
      helpsScope: 'scripture',
    })

    expect(result).toEqual({ tnKey: 'u/en/tn', twlKey: 'u/en/twl' })
  })
})

describe('reference sync source guards', () => {
  test('CombinedHelps / TN / TWL pipelines filter by currentRef, not language', () => {
    const pipeline = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsPipeline.ts'),
      'utf8'
    )
    const tnPipeline = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/TranslationNotesViewer/hooks/useTranslationNotesPipeline.ts'
      ),
      'utf8'
    )
    const twlPipeline = readFileSync(
      join(import.meta.dir, '../../components/resources/WordsLinksViewer/hooks/useWordsLinksPipeline.ts'),
      'utf8'
    )

    expect(pipeline).toContain('filterNotesByReferenceRange')
    expect(pipeline).toContain('filterLinksByReferenceRange')
    expect(tnPipeline).toContain('filterNotesByReferenceRange')
    expect(twlPipeline).toContain('filterLinksByReferenceRange')
    for (const src of [pipeline, tnPipeline, twlPipeline]) {
      expect(src).toContain('currentRef')
      expect(src).not.toMatch(/filter(?:Notes|Links)ByReferenceRange\([^)]*language/)
    }
  })

  test('verse-filter and OBS frame signals key on chapter/verse or story/frame, not language', () => {
    const signals = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsSignals.ts'),
      'utf8'
    )
    const obs = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/CombinedHelpsViewer/useCombinedHelpsObsQuotesBroadcast.ts'
      ),
      'utf8'
    )
    expect(signals).toContain('signal.filter.chapter')
    expect(signals).toContain('signal.filter.verse')
    expect(signals).not.toMatch(/signal\.filter\.language/)
    expect(obs).toContain('h.storyNumber !== currentRef.chapter')
    expect(obs).toContain('h.frameNumber !== currentRef.verse')
    expect(obs).not.toMatch(/h\.language/)
  })

  test('Studio omit-path still calls ensure without languageCode', () => {
    const persistence = readFileSync(
      join(import.meta.dir, '../workspace/workspacePersistence.ts'),
      'utf8'
    )
    const collections = readFileSync(
      join(import.meta.dir, '../workspace/workspaceCollectionHelpers.ts'),
      'utf8'
    )
    expect(persistence).toMatch(
      /ensureCombinedHelpsInWorkspace\(\{\s*resources: resourcesMap,\s*panels: data\.panels/
    )
    expect(collections).toMatch(/ensureCombinedHelpsInWorkspace\(\{\s*resources,\s*panels\s*\}\)/)
    expect(persistence).not.toMatch(/ensureCombinedHelpsInWorkspace\(\{[^}]*languageCode/)
    expect(collections).not.toMatch(/ensureCombinedHelpsInWorkspace\(\{[^}]*languageCode/)
  })

  test('workspace membership does not steer CombinedHelps from scripture/OBS text language', () => {
    const slice = readFileSync(
      join(import.meta.dir, '../workspace/workspaceResourceSlice.ts'),
      'utf8'
    )
    expect(slice).toContain("if (type === 'scripture' || type === 'obs') return undefined")
  })
})
