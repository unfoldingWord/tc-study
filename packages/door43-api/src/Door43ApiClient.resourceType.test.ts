/**
 * Real Door43ApiClient emitter tests — exercises getResourceMetadata → inferResourceType
 * (shared inferDoor43ResourceTypeId from @bt-synergy/resource-catalog).
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import {
  createDoor43ApiClient,
  Door43ApiClient,
  type Door43Resource,
} from './Door43ApiClient'

function stubResource(id: string, subject = ''): Door43Resource {
  return {
    id,
    name: id,
    owner: 'unfoldingWord',
    language: 'en',
    subject,
    version: 'v1',
  }
}

describe('Door43ApiClient resource type IDs', () => {
  let client: Door43ApiClient

  beforeEach(() => {
    client = createDoor43ApiClient({
      baseUrl: 'https://git.door43.org',
      timeout: 5000,
    })
  })

  async function typeFor(id: string, subject = ''): Promise<string> {
    client.findResource = (async () => stubResource(id, subject)) as typeof client.findResource
    const meta = await client.getResourceMetadata('unfoldingWord', 'en', id)
    if (!meta) throw new Error(`expected metadata for ${id}`)
    return meta.type
  }

  test('emits canonical RESOURCE_TYPE_IDS (not legacy words_links / stories)', async () => {
    expect(await typeFor('twl')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS)
    expect(await typeFor('twl')).toBe('words-links')
    expect(await typeFor('twl')).not.toBe('words_links')

    expect(await typeFor('obs')).toBe(RESOURCE_TYPE_IDS.OBS)
    expect(await typeFor('obs')).toBe('obs')
    expect(await typeFor('obs')).not.toBe('stories')
  })

  test('maps OBS companion repo ids', async () => {
    expect(await typeFor('obs-twl')).toBe(RESOURCE_TYPE_IDS.OBS_WORDS_LINKS)
    expect(await typeFor('obs-tn')).toBe(RESOURCE_TYPE_IDS.OBS_NOTES)
    expect(await typeFor('obs-tq')).toBe(RESOURCE_TYPE_IDS.OBS_QUESTIONS)
  })

  test('maps common Bible help and scripture ids', async () => {
    expect(await typeFor('tn')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_NOTES)
    expect(await typeFor('tq')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS)
    expect(await typeFor('tw')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_WORDS)
    expect(await typeFor('ta')).toBe(RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY)
    expect(await typeFor('ult')).toBe(RESOURCE_TYPE_IDS.SCRIPTURE)
  })
})
