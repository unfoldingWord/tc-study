/**
 * Versioned cache envelope shared by prepare and helps caches.
 *
 * Tolerates legacy nested `{ content: { version } }` shapes so older rows
 * still invalidate correctly when the expected version bumps.
 */

export interface VersionedEnvelope<T = unknown> {
  content: T
  timestamp: number
  version: number
}

export function wrapVersioned<T>(content: T, version: number): VersionedEnvelope<T> {
  return { content, timestamp: Date.now(), version }
}

export function unwrapVersioned<T>(entry: unknown, expectedVersion: number): T | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as VersionedEnvelope<T> & { content?: T; version?: number }
  const version = e.version ?? (e.content as { version?: number } | undefined)?.version
  const content = (e.content ?? e) as T
  if (typeof version === 'number' && version !== expectedVersion) return null
  if (content && typeof content === 'object' && 'version' in (content as object)) {
    const inner = content as { version?: number }
    if (typeof inner.version === 'number' && inner.version !== expectedVersion) return null
  }
  return content
}
