/**
 * Prepared-content cache key convention (all resource types).
 *
 * prepared:{typeId}:{resourceKey}:{book}:nav
 * prepared:{typeId}:{resourceKey}:{book}:{unit}:{tier}
 *
 * Deliberately NOT in BOOK_ORGANIZED_PREFIXES — one row per key, no chunk split.
 */

export const PREPARED_PREFIX = 'prepared:'

export type PrepareTier = 'light' | 'full'

export function preparedNavKey(
  typeId: string,
  resourceKey: string,
  bookId: string
): string {
  return `${PREPARED_PREFIX}${typeId}:${resourceKey}:${bookId.toLowerCase()}:nav`
}

export function preparedUnitKey(
  typeId: string,
  resourceKey: string,
  bookId: string,
  unit: string | number,
  tier: PrepareTier
): string {
  return `${PREPARED_PREFIX}${typeId}:${resourceKey}:${bookId.toLowerCase()}:${unit}:${tier}`
}

export function preparedBookPrefix(
  typeId: string,
  resourceKey: string,
  bookId: string
): string {
  return `${PREPARED_PREFIX}${typeId}:${resourceKey}:${bookId.toLowerCase()}:`
}

export function isPreparedKey(key: string): boolean {
  return key.startsWith(PREPARED_PREFIX)
}
