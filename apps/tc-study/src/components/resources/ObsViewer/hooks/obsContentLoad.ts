/**
 * OBS story load key + transient metadata-miss handling.
 * Phase 1 hydrate can mount ObsViewer before catalog metadata exists;
 * a miss must not become a sticky "Resource not found" once metadata lands.
 */

export function isTransientObsMetadataMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /Resource not found/i.test(message) ||
    /OBS metadata not found/i.test(message) ||
    /Resource metadata not found/i.test(message)
  )
}

export function obsMetadataRevision(
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

export function obsContentLoadKey(
  resourceKey: string,
  storyNum: number,
  endStory: number,
  book: string,
  metadataRevision: string
): string {
  return `${resourceKey}|${book}|${storyNum}|${endStory}|${metadataRevision}`
}

export function applyObsContentLoadFailure(
  error: unknown,
  allowHardMiss: boolean
): { error: string | null; isLoading: boolean; retryWhenMetadataArrives: boolean } {
  if (isTransientObsMetadataMiss(error) && !allowHardMiss) {
    return { error: null, isLoading: true, retryWhenMetadataArrives: true }
  }
  return {
    error: error instanceof Error ? error.message : 'Unknown error',
    isLoading: false,
    retryWhenMetadataArrives: false,
  }
}
