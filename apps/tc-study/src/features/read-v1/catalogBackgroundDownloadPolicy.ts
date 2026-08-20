/**
 * Pure policies for catalog → background-download gating.
 * Kept free of React so language-switch / deep-link regressions stay unit-testable.
 */

/** Stable signature for an expected-resource set (order-independent). */
export function expectedResourcesSignature(keys: string[] | undefined | null): string {
  if (!keys || keys.length === 0) return ''
  return [...keys].sort().join('|')
}

/**
 * When the download scope (gateway language code) changes — UI language switch or
 * `/read/:lang` deep link — tracking must reset so prior-language keys stuck in
 * `downloading`/`processed` cannot block the new language.
 *
 * Do not key this off expected-resource list narrowing after Phase 2; that would
 * clear in-flight marks and risk a second startDownload while the worker is busy.
 */
export function shouldResetDownloadTracking(
  previousScope: string,
  nextScope: string
): boolean {
  return nextScope !== '' && nextScope !== previousScope
}

export function findMissingExpectedResources(
  expectedResources: string[],
  catalogKeys: string[]
): string[] {
  const catalog = new Set(catalogKeys)
  return expectedResources.filter((key) => !catalog.has(key))
}

/**
 * After Phase 2 metadata settles, drop expected keys that never entered the catalog
 * (failed fetch / missing release) so the monitor cannot wait forever.
 */
export function narrowExpectedToCataloged(
  expectedResources: string[],
  catalogKeys: string[]
): string[] {
  const catalog = new Set(catalogKeys)
  return expectedResources.filter((key) => catalog.has(key))
}

export function filterUncheckedResourceKeys(
  allResourceKeys: string[],
  processed: ReadonlySet<string>,
  downloading: ReadonlySet<string>
): string[] {
  return allResourceKeys.filter(
    (key) => !processed.has(key) && !downloading.has(key)
  )
}
