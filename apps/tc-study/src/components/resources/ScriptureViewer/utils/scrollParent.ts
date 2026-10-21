function scrollsVertically(el: HTMLElement): boolean {
  const overflowY = getComputedStyle(el).overflowY
  return overflowY === 'auto' || overflowY === 'scroll'
}

/** Nearest ancestor (not the element itself) that scrolls vertically. */
export function findOverflowParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null
  while (parent) {
    if (scrollsVertically(parent)) return parent
    parent = parent.parentElement
  }
  return null
}

/** Prefer the element itself when it is the scrollport (panel-owned overflow). */
export function resolveScriptureScrollParent(contentRoot: HTMLElement | null): HTMLElement | null {
  if (!contentRoot) return null
  if (scrollsVertically(contentRoot)) return contentRoot
  return findOverflowParent(contentRoot)
}
