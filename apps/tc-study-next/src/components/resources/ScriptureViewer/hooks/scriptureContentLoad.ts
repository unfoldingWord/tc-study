/**
 * Scripture content load key + transient metadata-miss handling.
 * Phase 1 hydrate can mount the viewer before catalog metadata exists;
 * a miss must not become a sticky error once metadata lands.
 */

export function isTransientMetadataMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Resource metadata not found/i.test(message)
}

export function scriptureMetadataRevision(
  loaded: Record<string, { contentMetadata?: unknown } | undefined>,
  resourceKey: string
): string {
  const base = resourceKey.replace(/#\d+$/, '')
  for (const [id, resource] of Object.entries(loaded)) {
    if (!resource?.contentMetadata) continue
    if (id === resourceKey || id === base || id.replace(/#\d+$/, '') === base) {
      return 'contentMetadata'
    }
  }
  return ''
}

export function scriptureContentLoadKey(
  resourceKey: string,
  bookCode: string,
  metadataRevision: string
): string {
  return `${resourceKey}|${bookCode}|${metadataRevision}`
}

export function applyScriptureContentLoadFailure(
  error: unknown,
  allowHardMiss: boolean
): { error: string | null; isLoading: boolean; retryWhenMetadataArrives: boolean } {
  if (isTransientMetadataMiss(error) && !allowHardMiss) {
    return { error: null, isLoading: true, retryWhenMetadataArrives: true }
  }
  return {
    error: error instanceof Error ? error.message : 'Unknown error',
    isLoading: false,
    retryWhenMetadataArrives: false,
  }
}
