/**
 * Roving-focus keys for a tablist: the arrows move one tab and wrap (swapped in rtl), Home and End
 * go to the ends. With no current tab (-1), forward enters at the first tab and back at the last.
 * Any other key returns null so the caller lets it through.
 */
export function nextSwitcherIndex(
  current: number,
  key: string,
  count: number,
  dir: 'ltr' | 'rtl'
): number | null {
  if (count <= 0) return null
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  switch (key) {
    case forward:
      return current < 0 ? 0 : (current + 1) % count
    case back:
      return current < 0 ? count - 1 : (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
