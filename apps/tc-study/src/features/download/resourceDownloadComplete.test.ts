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

  test('with catalog metadata requires a matching stamped receipt', async () => {
    const stamp = 'v1#2024-01-01T00_00_00Z'
    const store = new Map<string, unknown>([
      [
        'resource:unfoldingWord/hbo/uhb',
        {
          metadata: {
            downloadComplete: true,
            releaseStamp: stamp,
            ingestSchema: 'usj:2.1.0-usj',
          },
        },
      ],
    ])
    const cache = { get: async (k: string) => store.get(k) ?? null }
    const meta = {
      type: 'scripture',
      release: { tag_name: 'v1', published_at: '2024-01-01T00:00:00Z' },
    }
    expect(await isResourceMarkedComplete(cache, 'unfoldingWord/hbo/uhb', meta)).toBe(true)

    const stale = {
      type: 'scripture',
      release: { tag_name: 'v99', published_at: '2025-01-01T00:00:00Z' },
    }
    expect(await isResourceMarkedComplete(cache, 'unfoldingWord/hbo/uhb', stale)).toBe(false)
  })

  test('nostamp catalog metadata does not treat boolean flag as complete', async () => {
    const store = new Map<string, unknown>([
      [
        'resource:unfoldingWord/hbo/uhb',
        { metadata: { downloadComplete: true } },
      ],
    ])
    expect(
      await isResourceMarkedComplete(
        { get: async (k) => store.get(k) ?? null },
        'unfoldingWord/hbo/uhb',
        { type: 'scripture' }
      )
    ).toBe(false)
  })
})
