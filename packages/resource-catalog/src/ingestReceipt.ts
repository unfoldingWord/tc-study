/**
 * Stamped ingest receipt for resource:{key} metadata.
 *
 * Means “this Door43 release was fully ingested into SoT” — not that a zip
 * blob is on disk. Matching stamp + schema skips zip fetch and ingredient walks.
 */

export interface ResourceStampSource {
  version?: string
  release?: {
    tag_name?: string
    published_at?: string
  }
  type?: string
}

function sanitizeStampPart(value: string): string {
  return value.replace(/[:|@]/g, '_')
}

/**
 * Durable-ish content identity from catalog metadata.
 * Prefer `release.tag_name` + `published_at`, then `version`, then `'nostamp'`.
 */
export function resourceContentStamp(
  metadata: ResourceStampSource | null | undefined
): string {
  if (!metadata) return 'nostamp'

  const tag = metadata.release?.tag_name?.trim() || metadata.version?.trim() || ''
  const published = metadata.release?.published_at?.trim() || ''

  if (tag && published) {
    return `${sanitizeStampPart(tag)}#${sanitizeStampPart(published)}`
  }
  if (tag) return sanitizeStampPart(tag)
  if (published) return sanitizeStampPart(published)
  return 'nostamp'
}

/** Helps / article SoT schema bump when processor output shape changes. */
export const HELPS_INGEST_SCHEMA = '1'

export const INGEST_RECEIPT_KEYS = {
  RELEASE_STAMP: 'releaseStamp',
  INGEST_SCHEMA: 'ingestSchema',
  INGREDIENT_COUNT: 'ingredientCount',
  DOWNLOAD_COMPLETE: 'downloadComplete',
  DOWNLOAD_COMPLETED_AT: 'downloadCompletedAt',
  DOWNLOAD_METHOD: 'downloadMethod',
} as const

export type IngestDownloadMethod = 'zip' | 'individual' | 'tar' | string

export function scriptureIngestSchema(usjProcessingVersion: string): string {
  return `usj:${usjProcessingVersion}`
}

export function helpsIngestSchema(): string {
  return `helps:${HELPS_INGEST_SCHEMA}`
}

/** Schema for a catalog resource type. Scripture needs the USJ processor version. */
export function ingestSchemaForResourceType(
  resourceType: string | undefined,
  usjProcessingVersion?: string
): string {
  if (resourceType === 'scripture') {
    return scriptureIngestSchema(usjProcessingVersion ?? 'unknown')
  }
  return helpsIngestSchema()
}

/**
 * Expected receipt stamp from catalog metadata.
 * Returns null for `nostamp` — never treat unsettled catalog as a match.
 */
export function expectedIngestReleaseStamp(
  metadata: ResourceStampSource | null | undefined
): string | null {
  const stamp = resourceContentStamp(metadata)
  return stamp === 'nostamp' ? null : stamp
}

export function readIngestReceiptMeta(
  entry: unknown
): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') return null
  const meta = (entry as { metadata?: Record<string, unknown> }).metadata
  return meta && typeof meta === 'object' ? meta : null
}

/**
 * True when resource:{key} is a matching stamped receipt for this release.
 * Unstamped legacy `downloadComplete` is NOT a match (caller walks once).
 */
export function isMatchingIngestReceipt(
  entry: unknown,
  expectedReleaseStamp: string | null | undefined,
  expectedSchema: string | null | undefined
): boolean {
  if (!expectedReleaseStamp || expectedReleaseStamp === 'nostamp') return false
  if (!expectedSchema) return false

  const meta = readIngestReceiptMeta(entry)
  if (!meta) return false
  if (meta[INGEST_RECEIPT_KEYS.DOWNLOAD_COMPLETE] !== true) return false

  const releaseStamp = meta[INGEST_RECEIPT_KEYS.RELEASE_STAMP]
  const ingestSchema = meta[INGEST_RECEIPT_KEYS.INGEST_SCHEMA]
  if (typeof releaseStamp !== 'string' || releaseStamp !== expectedReleaseStamp) {
    return false
  }
  if (typeof ingestSchema !== 'string' || ingestSchema !== expectedSchema) {
    return false
  }
  return true
}

/** Legacy boolean flag without releaseStamp — needs one ingredient walk. */
export function isLegacyUnstampedComplete(entry: unknown): boolean {
  const meta = readIngestReceiptMeta(entry)
  if (!meta) return false
  if (meta[INGEST_RECEIPT_KEYS.DOWNLOAD_COMPLETE] !== true) return false
  const releaseStamp = meta[INGEST_RECEIPT_KEYS.RELEASE_STAMP]
  return typeof releaseStamp !== 'string' || releaseStamp.length === 0
}

export interface BuildIngestReceiptMetadataInput {
  releaseStamp: string
  ingestSchema: string
  ingredientCount?: number
  downloadMethod?: IngestDownloadMethod
  size?: number
  entryCount?: number
  expectedEntryCount?: number
  extra?: Record<string, unknown>
}

/** Metadata fields to merge onto resource:{key} after a successful full extract. */
export function buildIngestReceiptMetadata(
  input: BuildIngestReceiptMetadataInput
): Record<string, unknown> {
  const {
    releaseStamp,
    ingestSchema,
    ingredientCount,
    downloadMethod,
    size,
    entryCount,
    expectedEntryCount,
    extra,
  } = input

  return {
    [INGEST_RECEIPT_KEYS.DOWNLOAD_COMPLETE]: true,
    [INGEST_RECEIPT_KEYS.DOWNLOAD_COMPLETED_AT]: new Date().toISOString(),
    [INGEST_RECEIPT_KEYS.RELEASE_STAMP]: releaseStamp,
    [INGEST_RECEIPT_KEYS.INGEST_SCHEMA]: ingestSchema,
    ...(typeof ingredientCount === 'number'
      ? { [INGEST_RECEIPT_KEYS.INGREDIENT_COUNT]: ingredientCount }
      : {}),
    ...(downloadMethod
      ? { [INGEST_RECEIPT_KEYS.DOWNLOAD_METHOD]: downloadMethod }
      : {}),
    ...(typeof size === 'number' ? { resourceSize: size } : {}),
    ...(typeof entryCount === 'number' ? { entryCount } : {}),
    ...(typeof expectedEntryCount === 'number' ? { expectedEntryCount } : {}),
    ...extra,
  }
}

/**
 * Build receipt metadata from catalog metadata when stamp is settled.
 * Returns null when catalog stamp is `nostamp` (do not write a fake receipt).
 */
export function buildIngestReceiptFromCatalog(
  metadata: ResourceStampSource | null | undefined,
  options: {
    ingestSchema: string
    ingredientCount?: number
    downloadMethod?: IngestDownloadMethod
    size?: number
    entryCount?: number
    expectedEntryCount?: number
  }
): Record<string, unknown> | null {
  const releaseStamp = expectedIngestReleaseStamp(metadata)
  if (!releaseStamp) return null
  return buildIngestReceiptMetadata({
    releaseStamp,
    ingestSchema: options.ingestSchema,
    ingredientCount: options.ingredientCount,
    downloadMethod: options.downloadMethod,
    size: options.size,
    entryCount: options.entryCount,
    expectedEntryCount: options.expectedEntryCount,
  })
}
