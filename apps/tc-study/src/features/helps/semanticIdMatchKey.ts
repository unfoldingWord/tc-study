/**
 * Linked-panels match key for quote / underline semantic IDs.
 * Case-insensitive and combining-mark-insensitive so pointed Hebrew (UHB)
 * matches unpointed TWL/alignment surfaces the same way Greek case-folds.
 *
 * Also strips Unicode format chars (esp. U+2060 word joiner). UHB `\w`
 * surfaces often insert WJ between morphs (`לְ⁠דָ֫וִ֥ד`) while ULT `\zaln`
 * `x-content` omits it (`לְדָוִד`) — without stripping, align settles empty.
 */
export function semanticIdMatchKey(semanticId: string): string {
  return semanticId
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
}
