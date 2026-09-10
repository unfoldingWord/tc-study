import { describe, expect, test } from 'bun:test'
import { CACHE_METADATA_KEYS } from '../../lib/services/ResourceCompletenessChecker'
import {
  isDownloadCompleteMetadata,
  isResourceMarkedComplete,
} from './resourceDownloadComplete'

describe('resourceDownloadComplete', () => {
  test('reads the completeness metadata flag', async () => {
    expect(isDownloadCompleteMetadata(null)).toBe(false)
    expect(
      isDownloadCompleteMetadata({
        metadata: { [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]: true },
      })
    ).toBe(true)

    const store = new Map<string, unknown>([
      [
        'resource:unfoldingWord/hbo/uhb',
        { metadata: { [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]: true } },
      ],
    ])
    expect(
      await isResourceMarkedComplete(
        { get: async (k) => store.get(k) ?? null },
        'unfoldingWord/hbo/uhb'
      )
    ).toBe(true)
    expect(
      await isResourceMarkedComplete(
        { get: async (k) => store.get(k) ?? null },
        'unfoldingWord/el-x-koine/ugnt'
      )
    ).toBe(false)
  })
})