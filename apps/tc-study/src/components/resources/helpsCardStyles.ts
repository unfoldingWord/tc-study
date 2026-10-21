/**
 * Shared chrome for TN / TWL / Combined Helps / TQ lists and cards.
 */

/** CombinedHelps shell: compact sticky chrome above the scrollport. */
export const HELPS_LIST_SHELL = 'flex flex-col flex-1 h-full min-h-0 bg-surface'

/** Always-visible CombinedHelps chrome: current ref + optional filter + icon actions. */
export const HELPS_COMPACT_STICKY_BAR =
  'flex-shrink-0 sticky top-0 z-20 bg-surface px-content py-1 border-b border-border-subtle/80'

/** Scrollable helps content (under compact sticky chrome). */
export const HELPS_LIST_PANEL = 'flex-1 min-h-0 overflow-y-auto bg-surface'

/** Verse / ref group header — lighter than full muted so chips sit softly on surface. */
export const HELPS_VERSE_HEADER =
  'flex items-center gap-chrome-tight px-chrome py-chrome-tight bg-muted/50 rounded-md'

/** In-list sticky section header — solid fill so cards do not show through. */
export const HELPS_VERSE_HEADER_STICKY =
  'flex items-center gap-chrome-tight px-chrome py-chrome-tight bg-muted rounded-md sticky top-0 z-10'

export const HELPS_VERSE_HEADER_ICON = 'w-3.5 h-3.5 text-fg-secondary'

/** Count badge on verse headers. */
export const HELPS_VERSE_COUNT =
  'ml-auto px-1.5 py-0.5 bg-surface text-fg-secondary rounded-full text-micro font-medium'

/** Idle / selected chrome for TN + TWL help cards. */
export const HELPS_CARD_IDLE =
  'bg-surface hover:border-border border-border-subtle'

/** Selected: light yellow highlight wash + even border (no left bar / ring / blue or purple wash). */
export const HELPS_CARD_SELECTED = 'bg-highlight/15 border-border'

/** Card whose TW article / TA support-ref is the active book-wide filter. */
export const HELPS_CARD_FILTER_SOURCE = 'bg-accent-soft border-accent'

/**
 * Filter source that is also the clicked card: accent chrome + highlight ring.
 * Ring must be inset — list rows use content-visibility:auto, which clips outer shadows.
 */
export const HELPS_CARD_FILTER_SOURCE_SELECTED = `${HELPS_CARD_FILTER_SOURCE} ring-2 ring-inset ring-highlight-strong`

export function helpsCardStateClass(isSelected: boolean, isFilterSource: boolean): string {
  if (isFilterSource) return isSelected ? HELPS_CARD_FILTER_SOURCE_SELECTED : HELPS_CARD_FILTER_SOURCE
  return isSelected ? HELPS_CARD_SELECTED : HELPS_CARD_IDLE
}

/** Filter-word mark inside quote chips — same dotted underline as scripture tokens. */
export const HELPS_QUOTE_FILTER_MARK =
  'underline decoration-dotted decoration-underline decoration-1 underline-offset-2'

/** Article / title footer on TN + TWL cards — middle density between the two. */
export const HELPS_CARD_FOOTER = 'mt-2 pt-2 border-t border-border-subtle'

/** Shared article-link row (layout only). Colors are per kind below. */
export const HELPS_CARD_FOOTER_BUTTON =
  'flex items-center gap-1.5 w-full text-left text-sm font-medium transition-colors'

/** Translation Words — accent blue (CVD-safe vs TA amber). */
export const HELPS_CARD_FOOTER_BUTTON_TW = `${HELPS_CARD_FOOTER_BUTTON} text-accent-fg hover:text-accent`

/** Translation Academy — warning amber (not helps purple; blue/purple fails tritanopia). */
export const HELPS_CARD_FOOTER_BUTTON_TA = `${HELPS_CARD_FOOTER_BUTTON} text-warning-fg hover:text-warning`

/** Icon-only action beside TA title (e.g. book-wide support-ref filter). */
export const HELPS_CARD_FOOTER_ICON_BUTTON =
  'p-1 rounded-md text-warning-fg hover:text-warning hover:bg-warning/10 transition-colors shrink-0'

/** Icon-only action beside TW title (e.g. book-wide TWL article filter). */
export const HELPS_CARD_FOOTER_ICON_BUTTON_TW =
  'p-1 rounded-md text-accent-fg hover:text-accent hover:bg-accent/10 transition-colors shrink-0'

/** Footer filter icon while its filter is applied (aria-pressed). */
export const HELPS_CARD_FOOTER_ICON_BUTTON_ACTIVE = 'p-1 rounded-md bg-warning/15 text-warning transition-colors shrink-0'
export const HELPS_CARD_FOOTER_ICON_BUTTON_TW_ACTIVE = 'p-1 rounded-md bg-accent/15 text-accent transition-colors shrink-0'

export const HELPS_CARD_FOOTER_ICON = 'w-3.5 h-3.5 flex-shrink-0'
