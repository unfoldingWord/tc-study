/**
 * Linked-panels match key for quote / underline semantic IDs.
 * Case-insensitive and combining-mark-insensitive so pointed Hebrew (UHB)
 * matches unpointed TWL/alignment surfaces the same way Greek case-folds.
 */
export function semanticIdMatchKey(semanticId: string): string {
  return semanticId.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
