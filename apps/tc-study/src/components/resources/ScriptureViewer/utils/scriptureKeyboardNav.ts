/**
 * Keyboard access to scripture words without a tab stop per word.
 *
 * Chapter infinite scroll paints thousands of word spans, so they carry no
 * role, tabIndex or key handler. Instead the scrollport is the pane's one tab
 * stop and runs a roving tabindex over words and verse numbers: Tab from the
 * scrollport lands on a visible word, arrows move, Enter/Space activate through
 * the same click handler the mouse uses. Only the focused item gets tabindex=0.
 */

/** Words (data-token-semantic-id) and verse numbers (data-verse-number), in DOM order. */
export const ROVING_ITEM_SELECTOR = '[data-token-semantic-id], [data-verse-number]'

/** The slice of HTMLElement the roving logic touches (fakes in unit tests). */
export interface RovingItem {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  hasAttribute(name: string): boolean
  focus(): void
  click(): void
  getBoundingClientRect(): { top: number; bottom: number }
  readonly textContent: string | null
}

export type RovingKeyResult = { kind: 'move'; index: number } | { kind: 'activate' } | null

const isVerse = (item: RovingItem) => item.hasAttribute('data-verse-number')

/**
 * What a key does on item `index`. Left/Right follow reading order (swapped
 * in RTL), Up/Down jump to the previous/next verse number, Home/End to the
 * ends. `null` = not ours (let the browser handle it).
 */
export function resolveRovingKey(
  key: string,
  index: number,
  verseFlags: readonly boolean[],
  rtl: boolean
): RovingKeyResult {
  const last = verseFlags.length - 1
  const move = (to: number): RovingKeyResult =>
    to >= 0 && to <= last && to !== index ? { kind: 'move', index: to } : null
  switch (key) {
    case 'ArrowRight':
      return move(rtl ? index - 1 : index + 1)
    case 'ArrowLeft':
      return move(rtl ? index + 1 : index - 1)
    case 'ArrowDown':
      return move(verseFlags.indexOf(true, index + 1))
    case 'ArrowUp':
      return index > 0 ? move(verseFlags.lastIndexOf(true, index - 1)) : null
    case 'Home':
      return move(0)
    case 'End':
      return move(last)
    case 'Enter':
    case ' ':
      return { kind: 'activate' }
    default:
      return null
  }
}

/** Hand the single tabindex=0 from `from` to `to` and focus it. */
export function moveRovingFocus(from: RovingItem | null, to: RovingItem): void {
  if (from && from !== to) {
    // Verse numbers render tabIndex=-1; words render none.
    if (isVerse(from)) from.setAttribute('tabindex', '-1')
    else from.removeAttribute('tabindex')
  }
  to.setAttribute('tabindex', '0')
  to.focus()
}

const isVisible = (item: RovingItem, top: number, bottom: number) => {
  const r = item.getBoundingClientRect()
  return r.bottom > top && r.top < bottom
}

/** First item whose box reaches below `top` (items are in vertical DOM order). */
function firstBelow(items: readonly RovingItem[], top: number): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].getBoundingClientRect().bottom > top) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Where Tab from the scrollport lands: the last focused item if still in view,
 * else the selected word if in view, else the first item in view, else the first.
 */
export function pickEntryItem(
  items: readonly RovingItem[],
  viewTop: number,
  viewBottom: number
): RovingItem | null {
  if (items.length === 0) return null
  const current = items.find((el) => el.getAttribute('tabindex') === '0')
  if (current && isVisible(current, viewTop, viewBottom)) return current
  const selected = items.find(
    (el) => el.getAttribute('aria-current') === 'true' && isVisible(el, viewTop, viewBottom)
  )
  if (selected) return selected
  const first = items[firstBelow(items, viewTop)]
  return first && isVisible(first, viewTop, viewBottom) ? first : items[0]
}

/**
 * Live-region text after activating a word, read once React has painted its
 * aria-current. Verse numbers announce nothing: their label already says it.
 */
export function selectionAnnouncement(item: RovingItem): string | null {
  if (isVerse(item)) return null
  const word = (item.textContent ?? '').trim()
  return item.getAttribute('aria-current') === 'true' ? `${word} selected` : `${word} deselected`
}

const HANDLED_KEYS = new Set([
  'Tab',
  'Enter',
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

export interface ScriptureKeyEvent {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  target: unknown
  preventDefault(): void
}

export interface ScriptureKeyContainer {
  querySelectorAll(selector: string): ArrayLike<RovingItem>
  getBoundingClientRect(): { top: number; bottom: number }
}

/**
 * Scrollport keydown. On the scrollport itself: Tab enters the words,
 * Enter/Space activate the pane. On a word / verse number: roving moves, and
 * Enter/Space click it (same path as the mouse) then `onActivated(item)`.
 */
export function handleScriptureKeyDown(
  e: ScriptureKeyEvent,
  container: ScriptureKeyContainer,
  opts: { rtl: boolean; onActivatePane: () => void; onActivated: (item: RovingItem) => void }
): void {
  if (!HANDLED_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
  const items = Array.from(container.querySelectorAll(ROVING_ITEM_SELECTOR))

  if (e.target === container) {
    if (e.key === 'Tab' && !e.shiftKey) {
      const box = container.getBoundingClientRect()
      const entry = pickEntryItem(items, box.top, box.bottom)
      if (!entry) return
      e.preventDefault()
      moveRovingFocus(items.find((el) => el.getAttribute('tabindex') === '0') ?? null, entry)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      opts.onActivatePane()
    }
    return
  }

  const index = items.indexOf(e.target as RovingItem)
  if (index < 0) return
  const result = resolveRovingKey(e.key, index, items.map(isVerse), opts.rtl)
  if (!result) return
  e.preventDefault()
  const item = items[index]
  if (result.kind === 'move') {
    moveRovingFocus(item, items[result.index])
    return
  }
  item.click()
  opts.onActivated(item)
}
