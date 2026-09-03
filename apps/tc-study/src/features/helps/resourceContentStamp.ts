/**
 * Durable-ish content identity from catalog metadata.
 *
 * Prefer `release.tag_name` + `release.published_at`, then top-level `version`,
 * then `'nostamp'`. Content replaced under the same tag and published_at will
 * not invalidate — bump the consumer's envelope version as the escape hatch.
 *
 * Key separators `:` and `|` are stripped so stamps can sit inside cache keys.
 */

export interface ResourceStampSource {
  version?: string
  release?: {
    tag_name?: string
    published_at?: string
  }
}

function sanitizeStampPart(value: string): string {
  return value.replace(/[:|@]/g, '_')
}

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
