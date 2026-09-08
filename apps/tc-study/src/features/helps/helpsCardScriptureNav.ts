/**
 * CombinedHelps / TN quote click → scripture BCV.
 * Token-click already carries verseRef; off-chapter cards must also navigate
 * through the navigation store (signals alone lose the jump to chapter-scroll).
 */

import { buildQuoteClickPayload } from './buildQuoteClickPayload'
import { parseLinkChapterVerse } from './quoteTokens/parseLinkChapterVerse'

export interface HelpsScriptureRef {
  book: string
  chapter: number
  verse: number
}

export type HelpsQuoteClickItem = Parameters<typeof buildQuoteClickPayload>[0]

/** Parse token-click verseRef (`tit 1:7`). */
export function parseTokenVerseRef(verseRef: string): HelpsScriptureRef | null {
  const match = verseRef.trim().match(/^(\S+)\s+(\d+):(\d+)/)
  if (!match) return null
  const book = match[1]!.toLowerCase()
  const chapter = parseInt(match[2]!, 10)
  const verse = parseInt(match[3]!, 10)
  if (!book || !Number.isFinite(chapter) || chapter < 1 || !Number.isFinite(verse) || verse < 1) {
    return null
  }
  return { book, chapter, verse }
}

/** TN/TWL `1:7` plus the current book. */
export function helpsRowScriptureRef(
  bookCode: string | undefined,
  reference: string | undefined
): HelpsScriptureRef | null {
  const book = bookCode?.toLowerCase()
  if (!book || !reference) return null
  const { chapter, verse } = parseLinkChapterVerse(reference)
  return { book, chapter, verse }
}

/** Navigate when the card/token is in another book or chapter. Same-chapter is already on screen. */
export function shouldNavigateScriptureToRef(
  current: { book?: string; chapter: number },
  target: Pick<HelpsScriptureRef, 'book' | 'chapter'>
): boolean {
  const currentBook = current.book?.toLowerCase()
  if (target.book && currentBook && target.book !== currentBook) return true
  return target.chapter !== current.chapter
}

/**
 * Plan a CombinedHelps card/quote click.
 * Uses the live scripture chapter (not the scroll-pinned helps chapter) so an
 * off-chapter TN still emits BCV + token-click for that note’s reference.
 */
export function planHelpsCardScriptureAction(args: {
  bookCode?: string
  reference?: string
  current: { book?: string; chapter: number }
  item?: HelpsQuoteClickItem | null
}): {
  navigate: HelpsScriptureRef | null
  token: ReturnType<typeof buildQuoteClickPayload>
} {
  const book = args.bookCode || args.current.book
  const target = helpsRowScriptureRef(book, args.reference)
  const navigate =
    target && shouldNavigateScriptureToRef(args.current, target) ? target : null
  const token = target
    ? buildQuoteClickPayload(args.item ?? {}, target.book, target.chapter, target.verse)
    : null
  if (!token) return { navigate, token }
  const extraAligned = (args.item?.alignedTokens ?? [])
    .filter((t) => (!t.type || t.type === 'word') && t.semanticId)
    .map((t) => t.semanticId!)
  if (!extraAligned.length) return { navigate, token }
  // ULT chips are English IDs; quote semanticIds are often OL. Paint needs both,
  // and English as semanticId so prepared-full matchKeys resolve ownIndex.
  return {
    navigate,
    token: {
      ...token,
      semanticId: extraAligned[0] ?? token.semanticId,
      alignedSemanticIds: [...new Set([...token.alignedSemanticIds, ...extraAligned])],
    },
  }
}

export interface PersistedHelpsHighlight {
  book: string
  chapter: number
  verse: number
  semanticId: string
  alignedSemanticIds: string[]
  content: string
  verseRef: string
  strong?: string
  lemma?: string
  morph?: string
}

export type HelpsHighlightPersistInput = {
  semanticId: string
  alignedSemanticIds?: string[]
  content: string
  verseRef: string
  strong?: string
  lemma?: string
  morph?: string
}

/** Module store — survives ScriptureViewer remount and missed token-click events. */
let pendingHelpsHighlight: PersistedHelpsHighlight | null = null
let pendingHelpsHighlightApplied = false
let helpsHighlightEpoch = 0
const helpsHighlightListeners = new Set<() => void>()

function notifyHelpsHighlightPersist(): void {
  helpsHighlightEpoch += 1
  for (const listener of helpsHighlightListeners) listener()
}

/** Incremented on every persist write so scripture can replay a replacement click. */
export function getHelpsHighlightEpoch(): number {
  return helpsHighlightEpoch
}

/** Scripture reapplies when CombinedHelps writes persist after chapter-change replay. */
export function subscribeHelpsHighlightPersist(listener: () => void): () => void {
  helpsHighlightListeners.add(listener)
  return () => {
    helpsHighlightListeners.delete(listener)
  }
}

function persistKeyFromVerseRef(verseRef: string): Pick<
  PersistedHelpsHighlight,
  'book' | 'chapter' | 'verse'
> | null {
  const parsed = parseTokenVerseRef(verseRef)
  if (!parsed) return null
  return { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse }
}

function pendingMatchesChapter(
  pending: PersistedHelpsHighlight,
  book: string | undefined,
  chapter: number
): boolean {
  if (pending.chapter !== chapter) return false
  const liveBook = book?.toLowerCase()
  if (pending.book && liveBook && pending.book !== liveBook) return false
  return true
}

/** Survive ScriptureViewer remount / chapter reload (token-click is an event). */
export function persistHelpsHighlight(token: HelpsHighlightPersistInput | null): void {
  if (!token) {
    pendingHelpsHighlight = null
    pendingHelpsHighlightApplied = false
    notifyHelpsHighlightPersist()
    return
  }
  const key = persistKeyFromVerseRef(token.verseRef)
  pendingHelpsHighlight = {
    book: key?.book ?? '',
    chapter: key?.chapter ?? 0,
    verse: key?.verse ?? 0,
    semanticId: token.semanticId,
    alignedSemanticIds: [...(token.alignedSemanticIds ?? [])],
    content: token.content,
    verseRef: token.verseRef,
    strong: token.strong,
    lemma: token.lemma,
    morph: token.morph,
  }
  pendingHelpsHighlightApplied = false
  notifyHelpsHighlightPersist()
}

export function getPersistedHelpsHighlight(): PersistedHelpsHighlight | null {
  return pendingHelpsHighlight
}

export function isHelpsHighlightApplied(): boolean {
  return pendingHelpsHighlightApplied
}

/** Pending row for this book+chapter. Independent of tokensReady flicker. */
export function pendingHelpsHighlightFor(
  book: string | undefined,
  chapter: number
): PersistedHelpsHighlight | null {
  if (!pendingHelpsHighlight) return null
  if (!pendingMatchesChapter(pendingHelpsHighlight, book, chapter)) return null
  return pendingHelpsHighlight
}

export function markHelpsHighlightApplied(book: string | undefined, chapter: number): boolean {
  if (!pendingHelpsHighlight || pendingHelpsHighlightApplied) return false
  if (!pendingMatchesChapter(pendingHelpsHighlight, book, chapter)) return false
  pendingHelpsHighlightApplied = true
  return true
}

/**
 * Spurious token-click null (panel remount / CombinedHelps reload / event
 * cleanup) must not wipe persist. User toggle-off already calls
 * persistHelpsHighlight(null) before broadcasting null.
 */
export function shouldClearHelpsHighlightOnTokenNull(): boolean {
  return pendingHelpsHighlight == null
}

/**
 * Scripture paint is independent of CombinedHelps quote rebuild.
 * tokensReady is enough; quoteBuildReady / links reload must not gate apply.
 */
export function shouldApplyHelpsHighlightOnTokensReady(args: {
  tokensReady: boolean
  quoteBuildReady?: boolean
}): boolean {
  return args.tokensReady
}

/** Keep the clicked card when BCV changes because that card jumped scripture. */
export function shouldKeepSelectedHelpsCardOnPassageChange(args: {
  supportRefActive: boolean
  persist?: PersistedHelpsHighlight | null
  nextBook?: string
  nextChapter: number
}): boolean {
  if (args.supportRefActive) return true
  const persist = args.persist ?? pendingHelpsHighlight
  if (!persist) return false
  return pendingMatchesChapter(persist, args.nextBook, args.nextChapter)
}

/** Highlight to apply once the visible chapter matches the persisted note. */
export function highlightForVisibleChapter(
  visibleChapter: number,
  visibleBook?: string
): PersistedHelpsHighlight | null {
  return pendingHelpsHighlightFor(visibleBook ?? pendingHelpsHighlight?.book, visibleChapter)
}

/**
 * Keep a CombinedHelps highlight until it is applied on the destination chapter.
 * tokensReady on a *different* chapter must not drop the pending row.
 */
export function shouldRetainHelpsHighlight(args: {
  highlightVerseRef?: string | null
  visibleChapter: number
  tokensReady: boolean
}): boolean {
  if (!args.highlightVerseRef) return false
  if (!pendingHelpsHighlightApplied) return true
  const parsed = parseTokenVerseRef(args.highlightVerseRef)
  if (!parsed) return true
  return parsed.chapter === args.visibleChapter
}

/** True when prepared matchKeys belong to the visible chapter (not a stale prior chapter). */
export function matchKeysBelongToChapter(
  matchKeys: readonly string[] | null | undefined,
  chapter: number
): boolean {
  if (!matchKeys?.length) return false
  const needle = ` ${chapter}:`
  return matchKeys.some((key) => key.includes(needle))
}

/** USJ verses currently on screen belong to the visible chapter (not leftover prior chapter). */
export function usjDisplayTokensReady(
  verses: readonly { chapterNumber?: number }[] | null | undefined,
  chapter: number
): boolean {
  if (!verses?.length) return false
  return verses.some((v) => v.chapterNumber === chapter)
}

/** Destination chapter is tokenized (prepared-full or USJ verses). */
export function scriptureChapterTokensReady(args: {
  visibleChapter: number
  matchKeys?: readonly string[] | null
  hasUsjTokens: boolean
}): boolean {
  if (matchKeysBelongToChapter(args.matchKeys, args.visibleChapter)) return true
  return args.hasUsjTokens
}

/**
 * Persist IDs across remount / slow prepare. Unapplied rows stay visible to
 * callers on any chapter so alignedSemanticIds are not dropped before tokens.
 */
export function resolveVisibleHelpsHighlight(args: {
  visibleBook?: string
  visibleChapter: number
  tokensReady: boolean
}): PersistedHelpsHighlight | null {
  const persisted = getPersistedHelpsHighlight()
  if (!persisted) return null
  if (
    !shouldRetainHelpsHighlight({
      highlightVerseRef: persisted.verseRef,
      visibleChapter: args.visibleChapter,
      tokensReady: args.tokensReady,
    })
  ) {
    return null
  }
  return persisted
}

/**
 * Paint target for the visible book+chapter. tokensReady does not drop persist;
 * callers retry until the destination chapter is tokenized.
 */
export function replayHelpsHighlight(args: {
  visibleBook?: string
  visibleChapter: number
  tokensReady: boolean
}): PersistedHelpsHighlight | null {
  return pendingHelpsHighlightFor(args.visibleBook, args.visibleChapter)
}

/** Persist must still resolve after false ready cycles / remount, then apply. */
export function replayHelpsHighlightAcrossReadyCycles(
  visible: { book: string; chapter: number },
  readyCycles: readonly boolean[]
): PersistedHelpsHighlight | null {
  let last: PersistedHelpsHighlight | null = null
  for (const tokensReady of readyCycles) {
    if (!getPersistedHelpsHighlight()) return null
    last = replayHelpsHighlight({
      visibleBook: visible.book,
      visibleChapter: visible.chapter,
      tokensReady,
    })
    if (!last) return null
  }
  return last
}

/**
 * Verse-number click may clear a landed highlight, but must not wipe a
 * CombinedHelps jump that is still waiting for the destination chapter.
 * Landing on the *target* chapter (2:1 → full chapter) also must not clear.
 */
export function shouldClearHelpsHighlightOnVerseFilter(args: {
  highlightVerseRef?: string | null
  visibleChapter: number
  tokensReady: boolean
}): boolean {
  if (!args.highlightVerseRef) return true
  const parsed = parseTokenVerseRef(args.highlightVerseRef)
  if (!parsed) return true
  if (parsed.chapter !== args.visibleChapter) return false
  if (!pendingHelpsHighlightApplied) return false
  return args.tokensReady
}
