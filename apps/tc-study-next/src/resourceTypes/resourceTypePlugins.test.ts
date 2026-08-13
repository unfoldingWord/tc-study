import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { combinedHelpsResourceType, obsCombinedHelpsResourceType } from './combinedHelps'
import { scriptureResourceType } from './scripture'
import { translationAcademyResourceType } from './translationAcademy'
import { translationNotesResourceType } from './translationNotes'
import { translationWordsLinksResourceType } from './translationWordsLinks'
import { translationWordsResourceType } from './translationWords'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'
import { EntryViewerRegistry } from '../lib/viewers/EntryViewerRegistry'
import { registerDefaultEntryViewers } from '../lib/viewers/registerEntryViewers'

describe('resourceTypePlugins', () => {
  test('words and academy are modal-only (no panel viewer)', () => {
    expect(translationWordsResourceType.id).toBe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS)
    expect(translationAcademyResourceType.id).toBe(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY)
    expect(translationWordsResourceType.viewer).toBeUndefined()
    expect(translationAcademyResourceType.viewer).toBeUndefined()
  })

  test('primary panel types still define viewers', () => {
    expect(scriptureResourceType.viewer).toBeDefined()
    expect(translationNotesResourceType.viewer).toBeDefined()
    expect(translationWordsLinksResourceType.viewer).toBeDefined()
  })

  test('combined-helps plugins register CombinedHelpsViewer', () => {
    expect(combinedHelpsResourceType.id).toBe('combined-helps')
    expect(obsCombinedHelpsResourceType.id).toBe('obs-combined-helps')
    expect(combinedHelpsResourceType.viewer).toBeDefined()
    expect(obsCombinedHelpsResourceType.viewer).toBeDefined()
    expect(combinedHelpsResourceType.icon).toBe('LifeBuoy')
    expect(obsCombinedHelpsResourceType.icon).toBe('LifeBuoy')
  })

  test('entry viewers register for words and academy', () => {
    const registry = new EntryViewerRegistry()
    registerDefaultEntryViewers(registry)
    expect(registry.hasViewer('translation-words-entry')).toBe(true)
    expect(registry.hasViewer('translation-academy-entry')).toBe(true)
  })

  test('ResourceTypeInitializer does not strip viewers at register time', () => {
    const src = readFileSync(
      join(import.meta.dir, '../components/ResourceTypeInitializer.tsx'),
      'utf8'
    )
    expect(src).not.toContain('viewer: undefined')
    expect(src).not.toContain('TESTING:')
    expect(src).not.toContain('twModalOnly')
  })
})
