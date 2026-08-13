/**
 * Build the resource info object passed into entry viewers from the modal.
 * Kept pure so callers can memoize on (resource, resourceMetadata, resourceId)
 * and avoid feeding a new object identity into child effects every render.
 */
export function buildEntryModalResourceInfo<TResource extends object>(
  resourceId: string | undefined,
  resource: TResource | null | undefined,
  resourceMetadata: { title?: string; type?: string } | null | undefined
): TResource | {
  id: string
  key: string
  title: string
  type: string
  metadata: { title?: string; type?: string }
} | null {
  if (resource) return resource
  if (!resourceMetadata || !resourceId) return null
  return {
    id: resourceId,
    key: resourceId,
    title: resourceMetadata.title || resourceId,
    type: resourceMetadata.type || 'words',
    metadata: resourceMetadata,
  }
}
