/**
 * Stable identity for TW/TA entry-content fetches in the entry modal.
 *
 * Must NOT include resource metadata objects. EntryResourceModal often builds a
 * fallback metadata object inline each render; including that object in effect
 * deps previously retriggered loaders after onContentLoaded and caused
 * load↔render flicker.
 */
export function entryContentLoadKey(resourceKey: string, entryId: string): string {
  return `${resourceKey}#${entryId}`
}
