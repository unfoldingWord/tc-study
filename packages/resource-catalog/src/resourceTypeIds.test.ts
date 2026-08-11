import { describe, expect, test } from 'bun:test'
import { Door43ServerAdapter } from './server-adapters/Door43ServerAdapter'
import {
  RESOURCE_TYPE_IDS,
  inferDoor43ResourceTypeId,
  isValidResourceTypeId,
} from './resourceTypeIds'

describe('RESOURCE_TYPE_IDS', () => {
  test('canonical short IDs are hyphenated where multi-word', () => {
    expect(RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS).toBe('words-links')
    expect(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY).toBe('academy')
    expect(RESOURCE_TYPE_IDS.TRANSLATION_NOTES).toBe('notes')
    expect(isValidResourceTypeId('words_links')).toBe(false)
  })
})

describe('inferDoor43ResourceTypeId', () => {
  test('emits canonical IDs for known Door43 repo ids', () => {
    expect(inferDoor43ResourceTypeId('twl')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS)
    expect(inferDoor43ResourceTypeId('obs')).toBe(RESOURCE_TYPE_IDS.OBS)
    expect(inferDoor43ResourceTypeId('obs-twl')).toBe(RESOURCE_TYPE_IDS.OBS_WORDS_LINKS)
    expect(inferDoor43ResourceTypeId('obs-tn')).toBe(RESOURCE_TYPE_IDS.OBS_NOTES)
    expect(inferDoor43ResourceTypeId('obs-tq')).toBe(RESOURCE_TYPE_IDS.OBS_QUESTIONS)
    expect(inferDoor43ResourceTypeId('tn')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)
    expect(inferDoor43ResourceTypeId('ta')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY)
    expect(inferDoor43ResourceTypeId('ult')).toBe(RESOURCE_TYPE_IDS.SCRIPTURE)
  })

  test('never emits legacy words_links or stories', () => {
    expect(inferDoor43ResourceTypeId('twl')).toBe('words-links')
    expect(inferDoor43ResourceTypeId('twl')).not.toBe('words_links')
    expect(inferDoor43ResourceTypeId('obs')).toBe('obs')
    expect(inferDoor43ResourceTypeId('obs')).not.toBe('stories')
  })

  test('is case-insensitive and returns unknown for unrecognized ids', () => {
    expect(inferDoor43ResourceTypeId('TWL')).toBe('words-links')
    expect(inferDoor43ResourceTypeId('OBS-TN')).toBe('obs-notes')
    expect(inferDoor43ResourceTypeId('nope')).toBe('unknown')
  })
})

describe('Door43ServerAdapter type inference', () => {
  const adapter = new Door43ServerAdapter()

  test('emits short hyphenated IDs, never underscores or long forms', async () => {
    const twl = await adapter.transformMetadata({
      id: 'twl',
      name: 'TWL',
      owner: 'unfoldingWord',
      language: 'en',
      subject: 'TSV Translation Words Links',
      version: '1',
    })
    expect(twl.type).toBe('words-links')
    expect(String(twl.type)).not.toContain('_')
    expect(String(twl.type)).not.toBe('translation-words-links')

    const obs = await adapter.transformMetadata({
      id: 'obs',
      name: 'OBS',
      owner: 'unfoldingWord',
      language: 'en',
      subject: 'Open Bible Stories',
      version: '1',
    })
    expect(obs.type).toBe('obs')
    expect(String(obs.type)).not.toBe('stories')

    const obsTwl = await adapter.transformMetadata({
      id: 'obs-twl',
      name: 'OBS-TWL',
      owner: 'unfoldingWord',
      language: 'en',
      subject: 'OBS Translation Words Links',
      version: '1',
    })
    expect(obsTwl.type).toBe('obs-words-links')

    const ta = await adapter.transformMetadata({
      id: 'ta',
      name: 'TA',
      owner: 'unfoldingWord',
      language: 'en',
      subject: 'Translation Academy',
      version: '1',
    })
    expect(ta.type).toBe('academy')
  })
})
