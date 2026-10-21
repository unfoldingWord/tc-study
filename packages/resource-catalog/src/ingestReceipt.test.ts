import { describe, expect, test } from 'bun:test'
import {
  buildIngestReceiptFromCatalog,
  buildIngestReceiptMetadata,
  expectedIngestReleaseStamp,
  helpsIngestSchema,
  isLegacyUnstampedComplete,
  isMatchingIngestReceipt,
  resourceContentStamp,
  scriptureIngestSchema,
} from './ingestReceipt'

describe('resourceContentStamp', () => {
  test('prefers tag + published_at', () => {
    expect(
      resourceContentStamp({
        release: { tag_name: 'v45', published_at: '2024-01-01T00:00:00Z' },
      })
    ).toBe('v45#2024-01-01T00_00_00Z')
  })

  test('falls back to version then nostamp', () => {
    expect(resourceContentStamp({ version: 'v45' })).toBe('v45')
    expect(resourceContentStamp(null)).toBe('nostamp')
    expect(resourceContentStamp({})).toBe('nostamp')
  })
})

describe('ingest receipt match', () => {
  const stamp = 'v45#2024-01-01'
  const schema = helpsIngestSchema()

  test('matching stamped receipt is complete', () => {
    const entry = {
      metadata: buildIngestReceiptMetadata({
        releaseStamp: stamp,
        ingestSchema: schema,
        ingredientCount: 66,
        downloadMethod: 'zip',
      }),
    }
    expect(isMatchingIngestReceipt(entry, stamp, schema)).toBe(true)
  })

  test('nostamp / null expected never matches', () => {
    const entry = {
      metadata: buildIngestReceiptMetadata({
        releaseStamp: stamp,
        ingestSchema: schema,
      }),
    }
    expect(isMatchingIngestReceipt(entry, 'nostamp', schema)).toBe(false)
    expect(isMatchingIngestReceipt(entry, null, schema)).toBe(false)
  })

  test('stamp or schema mismatch is not a match', () => {
    const entry = {
      metadata: buildIngestReceiptMetadata({
        releaseStamp: stamp,
        ingestSchema: schema,
      }),
    }
    expect(isMatchingIngestReceipt(entry, 'v99', schema)).toBe(false)
    expect(isMatchingIngestReceipt(entry, stamp, scriptureIngestSchema('2.1.0-usj'))).toBe(
      false
    )
  })

  test('legacy unstamped complete is not a match', () => {
    const entry = { metadata: { downloadComplete: true } }
    expect(isMatchingIngestReceipt(entry, stamp, schema)).toBe(false)
    expect(isLegacyUnstampedComplete(entry)).toBe(true)
  })

  test('buildIngestReceiptFromCatalog refuses nostamp', () => {
    expect(
      buildIngestReceiptFromCatalog({}, { ingestSchema: schema, downloadMethod: 'zip' })
    ).toBeNull()
    expect(expectedIngestReleaseStamp({})).toBeNull()
  })

  test('scripture schema embeds USJ version', () => {
    expect(scriptureIngestSchema('2.1.0-usj')).toBe('usj:2.1.0-usj')
  })
})
