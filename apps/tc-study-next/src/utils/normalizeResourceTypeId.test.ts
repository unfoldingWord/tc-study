import { describe, expect, test } from 'bun:test'
import {
  isCombinedHelpsResourceType,
  isNotesResourceType,
  isWordsLinksResourceType,
  normalizeResourceTypeId,
} from './normalizeResourceTypeId'

describe('normalizeResourceTypeId', () => {
  test.each([
    ['tn', 'notes'],
    ['notes', 'notes'],
    ['NOTES', 'notes'],
    ['translation-notes', 'notes'],
    ['twl', 'words-links'],
    ['words_links', 'words-links'],
    ['words-links', 'words-links'],
    ['translation-words-links', 'words-links'],
    ['ta', 'academy'],
    ['academy', 'academy'],
    ['translation-academy', 'academy'],
    ['translation-words', 'words'],
    ['translation-questions', 'questions'],
    ['obs', 'obs'],
    ['stories', 'obs'],
    ['bible', 'scripture'],
    ['combined-helps', 'combined-helps'],
    ['obs-combined-helps', 'obs-combined-helps'],
  ] as const)('%s → %s', (raw, expected) => {
    expect(normalizeResourceTypeId(raw)).toBe(expected)
  })

  test('unknown returns null', () => {
    expect(normalizeResourceTypeId('not-a-type')).toBeNull()
    expect(normalizeResourceTypeId('')).toBeNull()
    expect(normalizeResourceTypeId(null)).toBeNull()
  })

  test('isNotesResourceType / isWordsLinksResourceType respect scope', () => {
    expect(isNotesResourceType('tn', 'scripture')).toBe(true)
    expect(isNotesResourceType('obs-notes', 'obs')).toBe(true)
    expect(isNotesResourceType('obs-notes', 'scripture')).toBe(false)
    expect(isWordsLinksResourceType('twl', 'scripture')).toBe(true)
    expect(isWordsLinksResourceType('words_links', 'scripture')).toBe(true)
    expect(isWordsLinksResourceType('obs-words-links', 'obs')).toBe(true)
  })

  test('isCombinedHelpsResourceType', () => {
    expect(isCombinedHelpsResourceType('combined-helps')).toBe(true)
    expect(isCombinedHelpsResourceType('obs-combined-helps')).toBe(true)
    expect(isCombinedHelpsResourceType('notes')).toBe(false)
  })
})
