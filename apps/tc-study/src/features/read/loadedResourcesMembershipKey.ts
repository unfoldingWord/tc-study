/**
 * Stable fingerprint of AppStore loadedResources for narrow subscriptions.
 * Omits catalogedAt so CombinedHelps synthesize / projection timestamps
 * do not remount Read or CombinedHelps.
 */

export function loadedResourcesMembershipKey(
  loaded: Record<
    string,
    {
      type?: string
      contentMetadata?: { ingredients?: ReadonlyArray<{ identifier?: string }> } | unknown
      helpsTnResourceKey?: string
      helpsTwlResourceKey?: string
      consumedKeys?: Record<string, string>
      appliesToScope?: string
    } | undefined
  >
): string {
  return Object.keys(loaded)
    .sort()
    .map((k) => {
      const r = loaded[k]
      if (!r) return k
      const consumed = r.consumedKeys
        ? Object.entries(r.consumedKeys)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([a, b]) => `${a}=${b}`)
            .join(',')
        : ''
      const meta = r.contentMetadata as { ingredients?: ReadonlyArray<{ identifier?: string }> } | undefined
      const books = Array.isArray(meta?.ingredients)
        ? meta.ingredients.map((i) => i.identifier ?? '').join(',')
        : ''
      return [
        k,
        r.type ?? '',
        books,
        r.helpsTnResourceKey ?? '',
        r.helpsTwlResourceKey ?? '',
        consumed,
        r.appliesToScope ?? '',
      ].join(':')
    })
    .join('|')
}
