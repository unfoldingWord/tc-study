/**
 * Pure policies for catalog → background-download gating.
 * Kept free of React so language-switch / deep-link regressions stay unit-testable.
 */

import { isOriginalLanguageDownloadTarget } from '../download/downloadBatchOrder'

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
  if (nextScope === '' || nextScope === previousScope) return false
  // `p1Lang|p2Lang` — inherit/fill of an empty pane is not a language switch.
  if (previousScope.includes('|') && nextScope.includes('|')) {
    const [prevA = '', prevB = ''] = previousScope.split('|')
    const [nextA = '', nextB = ''] = nextScope.split('|')
    const filledFirst = prevA === '' && nextA !== '' && prevB === nextB
    const filledSecond = prevB === '' && nextB !== '' && prevA === nextA
    if (filledFirst || filledSecond) return false
  }
  return true
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

/**
 * Catalog getAll / completeness walks share IDB with worker `setMany`.
 * Skip UI-thread walks while extract is in flight — enqueue waits until idle.
 */
export function shouldWalkUiIdbDuringExtract(isDownloading: boolean): boolean {
  return !isDownloading
}

export const CATALOG_KEYS_TIMEOUT = 'catalog-keys-timeout'
export const COMPLETE_CHECK_TIMEOUT = 'complete-check-timeout'
export const CATALOG_KEYS_TIMEOUT_MS = 2500
export const COMPLETE_CHECK_TIMEOUT_MS = 1500

export function isExpectedDownloadMonitorTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message === CATALOG_KEYS_TIMEOUT || message === COMPLETE_CHECK_TIMEOUT
}

/** Timeout must not reject after `work` wins — leftover `Promise.race` timers become unhandled. */
export function raceWithTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(message)), ms)
    work.then(
      (value) => {
        clearTimeout(id)
        resolve(value)
      },
      (err) => {
        clearTimeout(id)
        reject(err)
      }
    )
  })
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

/**
 * Queue only resources for the languages currently on the two Read panels
 * (`expectedResources` from catalog load). Persistent catalog leftovers from
 * earlier sessions / other languages must not inflate the worker total or
 * hang progress on a stale zip.
 *
 * Cataloged UGNT/UHB are always included: they are quote-build dependencies
 * and are not in `{textLang, helpsLang}` (hbo / el-x-koine).
 *
 * When expected is empty, fall back to catalog keys (manual / debug paths).
 */
export function keysToEnqueueForDownload(
  catalogKeys: readonly string[],
  expectedResources?: readonly string[] | null
): string[] {
  if (!expectedResources || expectedResources.length === 0) {
    return [...catalogKeys]
  }
  const catalog = new Set(catalogKeys)
  const expected = expectedResources.filter((key) => catalog.has(key))
  const extraOl = catalogKeys.filter(
    (key) =>
      isOriginalLanguageDownloadTarget({ resourceKey: key }) && !expected.includes(key)
  )
  return extraOl.length === 0 ? expected : [...expected, ...extraOl]
}
