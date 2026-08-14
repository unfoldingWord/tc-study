/**
 * Shared chrome for TN / TWL / Combined Helps / TQ lists and cards.
 */

/** Scrollable helps content (under ResourceViewerHeader). */
export const HELPS_LIST_PANEL = 'flex-1 overflow-y-auto bg-surface'

/** Verse / ref group header — lighter than full muted so chips sit softly on surface. */
export const HELPS_VERSE_HEADER =
  'flex items-center gap-chrome-tight px-chrome py-chrome-tight bg-muted/50 rounded-md'

export const HELPS_VERSE_HEADER_ICON = 'w-3.5 h-3.5 text-fg-secondary'

/** Count badge on verse headers. */
export const HELPS_VERSE_COUNT =
  'ml-auto px-1.5 py-0.5 bg-surface text-fg-secondary rounded-full text-micro font-medium'

/** Idle / selected chrome for TN + TWL help cards. */
export const HELPS_CARD_IDLE =
  'bg-surface hover:border-border border-border-subtle'

/** Selected: light yellow highlight wash + even border (no left bar / ring / blue or purple wash). */
export const HELPS_CARD_SELECTED = 'bg-highlight/15 border-border'

/** Filter-word mark inside quote chips — same dotted underline as scripture tokens. */
export const HELPS_QUOTE_FILTER_MARK =
  'underline decoration-dotted decoration-underline decoration-1 underline-offset-2'

/** Article / title footer on TN + TWL cards — middle density between the two. */
export const HELPS_CARD_FOOTER = 'mt-2 pt-2 border-t border-border-subtle'

/** Shared article-link row (layout only). Colors are per kind below. */
export const HELPS_CARD_FOOTER_BUTTON =
  'flex items-center gap-1.5 w-full text-left text-sm font-medium transition-colors'

/** Translation Words — accent (blue), same as TW entry viewer. */
export const HELPS_CARD_FOOTER_BUTTON_TW = `${HELPS_CARD_FOOTER_BUTTON} text-accent-fg hover:text-accent`

/** Translation Academy — helps (purple), same as TA entry viewer. */
export const HELPS_CARD_FOOTER_BUTTON_TA = `${HELPS_CARD_FOOTER_BUTTON} text-helps-fg hover:text-helps`

export const HELPS_CARD_FOOTER_ICON = 'w-3.5 h-3.5 flex-shrink-0'
