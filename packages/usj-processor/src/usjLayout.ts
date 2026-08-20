/**
 * USJ document → layout blocks for formatted scripture rendering.
 *
 * Walks para / poetry / heading markers (readonly-style), while attaching
 * UsjWordToken instances from the view model so semanticId / alignment UX
 * stays identical to verse-block mode.
 */

import { extractText, isRecord, parseVerseSid } from './usjWalk'
import type { CachedUsjDocument } from './usjCacheTypes'
import type { UsjScriptureViewModel, UsjWordToken } from './usjViewModel'

export const PARAGRAPH_MARKERS = new Set([
  'p',
  'q',
  'q1',
  'q2',
  'q3',
  'q4',
  'qa',
  'qr',
  'qc',
  'qm',
  'qm1',
  'qm2',
  'qm3',
  'qd',
  'b',
  'm',
  'mi',
  'pi',
  'pi1',
  'pi2',
  'li',
  'li1',
  'li2',
  'li3',
  'nb',
  'pc',
  'pr',
  'cls',
  'pmo',
  'pm',
  'pmc',
  'pmr',
  'po',
])

export const HEADING_MARKERS = new Set([
  's',
  's1',
  's2',
  's3',
  's4',
  'r',
  'ms',
  'ms1',
  'mr',
  'd',
  'sp',
  'sr',
])

export const INTRO_HEADING_MARKERS = new Set([
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'mt4',
  'mte',
  'mte1',
  'imt',
  'imt1',
  'imt2',
  'is',
  'is1',
  'is2',
  'iot',
  'io',
  'io1',
  'io2',
  'ip',
  'ipi',
  'im',
  'imi',
  'ipq',
  'imq',
  'ipr',
  'iex',
])

export const FOOTNOTE_MARKERS = new Set(['f', 'fe', 'x'])
export const SKIP_MARKERS = new Set([
  'id',
  'h',
  'toc1',
  'toc2',
  'toc3',
  'ide',
  'sts',
  'rem',
  'usfm',
])

export type UsjLayoutBlockRole = 'para' | 'heading' | 'break' | 'intro'

export type UsjLayoutInline =
  | { kind: 'verse'; chapterNumber: number; verseNumber: number }
  | { kind: 'token'; token: UsjWordToken }
  | { kind: 'text'; text: string }
  | { kind: 'heading'; text: string }

export interface UsjLayoutBlock {
  /** USFM marker, e.g. `p`, `q1`, `s1`, `b` */
  marker: string
  role: UsjLayoutBlockRole
  indentLevel: number
  chapterNumber: number
  inline: UsjLayoutInline[]
  /** Distinct verse numbers that open inside this block */
  verseNumbers: number[]
}

/** Poetry / indent level from USFM marker (Paratext-style steps). */
export function indentLevelForMarker(marker: string): number {
  switch (marker) {
    case 'q':
    case 'q1':
    case 'qm':
    case 'qm1':
    case 'li':
    case 'li1':
      return 1
    case 'q2':
    case 'qm2':
    case 'pi':
    case 'pi1':
    case 'li2':
      return 2
    case 'q3':
    case 'qm3':
    case 'pi2':
    case 'li3':
      return 3
    case 'q4':
      return 4
    default:
      return 0
  }
}

export function roleForMarker(marker: string): UsjLayoutBlockRole {
  if (marker === 'b') return 'break'
  if (HEADING_MARKERS.has(marker)) return 'heading'
  if (INTRO_HEADING_MARKERS.has(marker)) return 'intro'
  return 'para'
}

type WalkCtx = {
  chapter: number
  verse: number
  queues: Map<string, UsjWordToken[]>
}

type FlatSeg =
  | { kind: 'para-break'; marker: string; chapter: number }
  | { kind: 'verse'; chapter: number; verse: number }
  | { kind: 'token'; token: UsjWordToken; chapter: number }
  | { kind: 'text'; text: string; chapter: number }
  | { kind: 'heading'; text: string; chapter: number }

function queueKey(chapter: number, verse: number): string {
  return `${chapter}:${verse}`
}

/** Build per-verse token queues in document order from the view model. */
export function buildTokenQueuesFromViewModel(
  viewModel: UsjScriptureViewModel
): Map<string, UsjWordToken[]> {
  const map = new Map<string, UsjWordToken[]>()
  for (const ch of viewModel.chapters) {
    for (const v of ch.verses) {
      map.set(queueKey(ch.number, v.number), [...v.tokens])
    }
  }
  return map
}

function takeNextToken(ctx: WalkCtx): UsjWordToken | undefined {
  if (ctx.verse <= 0) return undefined
  const key = queueKey(ctx.chapter, ctx.verse)
  const q = ctx.queues.get(key)
  if (!q || q.length === 0) return undefined
  return q.shift()
}

function collectFlatSegments(nodes: unknown[], ctx: WalkCtx, out: FlatSeg[]): void {
  for (const raw of nodes) {
    if (typeof raw === 'string') {
      if (raw.length > 0) out.push({ kind: 'text', text: raw, chapter: ctx.chapter })
      continue
    }
    if (!isRecord(raw)) continue

    const marker = String(raw.marker ?? '')
    const type = typeof raw.type === 'string' ? raw.type : ''

    if (type === 'chapter') {
      const n =
        typeof raw.number === 'number'
          ? raw.number
          : typeof raw.number === 'string'
            ? parseInt(raw.number, 10)
            : NaN
      if (Number.isFinite(n)) {
        ctx.chapter = n
        ctx.verse = 0
      }
      continue
    }

    if (type === 'verse') {
      let verseNum =
        typeof raw.number === 'number'
          ? raw.number
          : typeof raw.number === 'string'
            ? parseInt(raw.number, 10)
            : NaN
      if (!Number.isFinite(verseNum) && typeof raw.sid === 'string') {
        const parsed = parseVerseSid(raw.sid)
        if (parsed) {
          ctx.chapter = parsed.chapter
          verseNum = parsed.verse
        }
      }
      if (Number.isFinite(verseNum)) {
        ctx.verse = verseNum
        out.push({ kind: 'verse', chapter: ctx.chapter, verse: verseNum })
      }
      if (Array.isArray(raw.content)) collectFlatSegments(raw.content, ctx, out)
      continue
    }

    if (SKIP_MARKERS.has(marker)) continue

    if (type === 'char' && marker === 'w') {
      const surface = extractText(raw.content)
      const token = takeNextToken(ctx)
      if (token) {
        out.push({ kind: 'token', token, chapter: ctx.chapter })
      } else if (surface) {
        out.push({ kind: 'text', text: surface, chapter: ctx.chapter })
      }
      continue
    }

    if (FOOTNOTE_MARKERS.has(marker)) {
      // Collapse footnotes — keep layout clean; full footnote UI is out of scope.
      continue
    }

    if (INTRO_HEADING_MARKERS.has(marker) || HEADING_MARKERS.has(marker)) {
      out.push({ kind: 'para-break', marker: marker || 's', chapter: ctx.chapter })
      const child: FlatSeg[] = []
      if (Array.isArray(raw.content)) collectFlatSegments(raw.content, ctx, child)
      for (const s of child) {
        if (s.kind === 'text') {
          out.push({ kind: 'heading', text: s.text, chapter: s.chapter })
        } else if (s.kind === 'token') {
          out.push({ kind: 'heading', text: s.token.content, chapter: s.chapter })
        } else if (s.kind !== 'para-break') {
          out.push(s)
        }
      }
      continue
    }

    if (PARAGRAPH_MARKERS.has(marker) || type === 'para') {
      out.push({
        kind: 'para-break',
        marker: marker || 'p',
        chapter: ctx.chapter || 1,
      })
      if (Array.isArray(raw.content)) collectFlatSegments(raw.content, ctx, out)
      continue
    }

    // ms / ts / unknown wrappers: recurse
    if (Array.isArray(raw.content)) collectFlatSegments(raw.content, ctx, out)
  }
}

function groupSegments(segments: FlatSeg[]): UsjLayoutBlock[] {
  const blocks: UsjLayoutBlock[] = []
  let current: UsjLayoutBlock | null = null

  const flush = () => {
    if (!current) return
    // Keep blank poetry breaks (`\b`) even with no inline content
    if (current.inline.length > 0 || current.role === 'break' || current.marker === 'b') {
      blocks.push(current)
    }
    current = null
  }

  const ensureBlock = (marker: string, chapter: number) => {
    flush()
    current = {
      marker,
      role: roleForMarker(marker),
      indentLevel: indentLevelForMarker(marker),
      chapterNumber: chapter,
      inline: [],
      verseNumbers: [],
    }
  }

  for (const seg of segments) {
    if (seg.kind === 'para-break') {
      ensureBlock(seg.marker, seg.chapter || 1)
      continue
    }

    if (!current) {
      ensureBlock('p', seg.chapter || 1)
    }

    // Keep chapter on the block if we learn it later (front matter → ch1)
    if (seg.chapter > 0 && current!.chapterNumber === 0) {
      current!.chapterNumber = seg.chapter
    }

    if (seg.kind === 'verse') {
      current!.inline.push({
        kind: 'verse',
        chapterNumber: seg.chapter,
        verseNumber: seg.verse,
      })
      if (!current!.verseNumbers.includes(seg.verse)) {
        current!.verseNumbers.push(seg.verse)
      }
      continue
    }

    if (seg.kind === 'token') {
      current!.inline.push({ kind: 'token', token: seg.token })
      const parsed = parseVerseSid(seg.token.verseRef)
      if (parsed && !current!.verseNumbers.includes(parsed.verse)) {
        current!.verseNumbers.push(parsed.verse)
      }
      continue
    }

    if (seg.kind === 'heading') {
      current!.inline.push({ kind: 'heading', text: seg.text })
      continue
    }

    if (seg.kind === 'text') {
      // Skip pure whitespace-only gaps between structural breaks; keep punctuation.
      if (seg.text.trim().length === 0 && current!.inline.length === 0) continue
      current!.inline.push({ kind: 'text', text: seg.text })
    }
  }

  flush()
  return blocks
}

/**
 * Build formatted layout blocks from a USJ document + view-model tokens.
 */
export function buildUsjLayoutBlocks(
  usj: CachedUsjDocument,
  viewModel: UsjScriptureViewModel
): UsjLayoutBlock[] {
  const ctx: WalkCtx = {
    chapter: 0,
    verse: 0,
    queues: buildTokenQueuesFromViewModel(viewModel),
  }
  const segments: FlatSeg[] = []
  collectFlatSegments(usj.content ?? [], ctx, segments)
  return groupSegments(segments)
}

export interface FilterUsjLayoutOptions {
  /** Inclusive chapter numbers to keep */
  chapters?: number[]
  /**
   * When set, keep a block if it has no verses (heading/break in that chapter)
   * or if any of its verse numbers fall inside the predicate.
   * Kept paragraph/poetry blocks are then clipped so out-of-range verses
   * in the same USJ paragraph do not render.
   */
  includeVerse?: (chapter: number, verse: number) => boolean
}

function verseFromToken(token: UsjWordToken): { chapter: number; verse: number } | null {
  return parseVerseSid(token.verseRef)
}

function peekNextVerse(
  items: UsjLayoutInline[],
  start: number
): { chapter: number; verse: number } | null {
  for (let i = start; i < items.length; i++) {
    const item = items[i]!
    if (item.kind === 'verse') {
      return { chapter: item.chapterNumber, verse: item.verseNumber }
    }
    if (item.kind === 'token') {
      const parsed = verseFromToken(item.token)
      if (parsed) return parsed
    }
  }
  return null
}

/** True when a token needs a separating space after the previous inline item. */
export function shouldInsertSpaceBeforeInline(
  prev: UsjLayoutInline | undefined,
  next: UsjLayoutInline
): boolean {
  if (!prev || next.kind !== 'token') return false
  if (prev.kind === 'text') return !/\s$/.test(prev.text)
  return prev.kind === 'verse' || prev.kind === 'token' || prev.kind === 'heading'
}

/** Concatenate layout inline to a display string (tokens + punctuation text). */
export function plainTextFromLayoutInline(inline: UsjLayoutInline[]): string {
  let text = ''
  for (let i = 0; i < inline.length; i++) {
    const item = inline[i]!
    if (item.kind === 'verse') {
      if (text && !/\s$/.test(text)) text += ' '
      text += String(item.verseNumber)
      continue
    }
    if (item.kind === 'text' || item.kind === 'heading') {
      text += item.text
      continue
    }
    if (shouldInsertSpaceBeforeInline(inline[i - 1], item)) text += ' '
    text += item.token.content
  }
  return text
}

/**
 * Keep only inline that belongs to verses accepted by `includeVerse`.
 * Word tokens stay punctuation-free; USJ text nodes (commas, periods, quotes) stay as `text`.
 */
export function clipLayoutInlineToVerses(
  inline: UsjLayoutInline[],
  chapterNumber: number,
  includeVerse: (chapter: number, verse: number) => boolean
): { inline: UsjLayoutInline[]; verseNumbers: number[] } {
  const out: UsjLayoutInline[] = []
  const verseNumbers: number[] = []
  let currentChapter = chapterNumber
  let currentVerse: number | null = null

  const rememberVerse = (chapter: number, verse: number) => {
    currentChapter = chapter
    currentVerse = verse
  }

  const inRange = (chapter: number, verse: number) => includeVerse(chapter, verse)

  for (let i = 0; i < inline.length; i++) {
    const item = inline[i]!

    if (item.kind === 'verse') {
      rememberVerse(item.chapterNumber, item.verseNumber)
      if (!inRange(item.chapterNumber, item.verseNumber)) continue
      out.push(item)
      if (!verseNumbers.includes(item.verseNumber)) verseNumbers.push(item.verseNumber)
      continue
    }

    if (item.kind === 'token') {
      const parsed = verseFromToken(item.token)
      if (parsed) rememberVerse(parsed.chapter, parsed.verse)
      if (currentVerse === null || !inRange(currentChapter, currentVerse)) continue
      out.push(item)
      if (!verseNumbers.includes(currentVerse)) verseNumbers.push(currentVerse)
      continue
    }

    if (item.kind === 'heading') {
      out.push(item)
      continue
    }

    if (item.kind === 'text') {
      let chapter = currentChapter
      let verse: number | null = currentVerse
      if (verse === null) {
        const peeked = peekNextVerse(inline, i + 1)
        if (!peeked) continue
        chapter = peeked.chapter
        verse = peeked.verse
      }
      if (verse === null || !inRange(chapter, verse)) continue
      out.push(item)
    }
  }

  return { inline: out, verseNumbers }
}

function clipLayoutBlockToVerses(
  block: UsjLayoutBlock,
  includeVerse: (chapter: number, verse: number) => boolean
): UsjLayoutBlock | null {
  if (block.verseNumbers.length === 0) return block
  if (block.verseNumbers.every((v) => includeVerse(block.chapterNumber, v))) {
    return block
  }

  const clipped = clipLayoutInlineToVerses(block.inline, block.chapterNumber, includeVerse)
  if (clipped.inline.length === 0 && block.role !== 'break' && block.marker !== 'b') {
    return null
  }
  return {
    ...block,
    inline: clipped.inline,
    verseNumbers: clipped.verseNumbers,
  }
}

/**
 * Flatten tokens + punctuation text for one verse across layout blocks.
 * Verse markers are omitted (verse-block chrome draws its own number).
 */
export function collectVerseDisplayInline(
  blocks: UsjLayoutBlock[],
  chapter: number,
  verse: number
): UsjLayoutInline[] {
  const out: UsjLayoutInline[] = []

  for (const block of blocks) {
    const clipped = clipLayoutInlineToVerses(
      block.inline,
      block.chapterNumber || chapter,
      (ch, v) => ch === chapter && v === verse
    )
    const chunk = clipped.inline.filter((item) => item.kind !== 'verse')
    if (chunk.length === 0) continue
    if (out.length > 0 && shouldInsertSpaceBeforeInline(out[out.length - 1], chunk[0]!)) {
      out.push({ kind: 'text', text: ' ' })
    }
    out.push(...chunk)
  }

  while (out.length > 0) {
    const first = out[0]!
    if (first.kind !== 'text' || first.text.trim() !== '') break
    out.shift()
  }
  while (out.length > 0) {
    const last = out[out.length - 1]!
    if (last.kind !== 'text' || last.text.trim() !== '') break
    out.pop()
  }

  return out
}

/** Filter layout blocks to the active BCV window. */
export function filterUsjLayoutBlocks(
  blocks: UsjLayoutBlock[],
  options: FilterUsjLayoutOptions
): UsjLayoutBlock[] {
  const chapterSet =
    options.chapters && options.chapters.length > 0
      ? new Set(options.chapters)
      : null

  const inChapter = (block: UsjLayoutBlock) =>
    !chapterSet || chapterSet.has(block.chapterNumber)

  if (!options.includeVerse) {
    return blocks.filter(inChapter)
  }

  const includeVerse = options.includeVerse
  const contentKeep = new Set<number>()
  blocks.forEach((block, idx) => {
    if (!inChapter(block)) return
    if (block.verseNumbers.some((v) => includeVerse(block.chapterNumber, v))) {
      contentKeep.add(idx)
    }
  })

  // Keep heading / blank-line chrome that immediately precedes kept content
  // in the same chapter (section titles above a verse range).
  const keep = new Set(contentKeep)
  for (const idx of contentKeep) {
    for (let i = idx - 1; i >= 0; i--) {
      const prev = blocks[i]!
      if (!inChapter(prev)) break
      if (prev.verseNumbers.length > 0) break
      if (prev.role === 'heading' || prev.role === 'intro' || prev.role === 'break') {
        keep.add(i)
        continue
      }
      break
    }
  }

  const filtered: UsjLayoutBlock[] = []
  blocks.forEach((block, idx) => {
    if (!keep.has(idx)) return
    const clipped = clipLayoutBlockToVerses(block, includeVerse)
    if (clipped) filtered.push(clipped)
  })
  return filtered
}
