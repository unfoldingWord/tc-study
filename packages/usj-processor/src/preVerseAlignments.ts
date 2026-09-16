/**
 * Harvest zaln groups that appear after `\c` but before the first `\v`.
 *
 * `@usfm-tools/usj-core` `stripAlignments` drops these because `verseRef` is
 * empty until a verse sid is seen. Psalm `\d` superscriptions (and similar)
 * still carry ULT alignments that TWL treats as verse 1.
 */

import type { AlignmentMap } from './usfmTools'
import { extractText, isRecord, parseVerseSid } from './usjWalk'

type OriginalWord = {
  strong: string
  lemma: string
  morph?: string
  content: string
  occurrence: number
  occurrences: number
}

type AlignedWord = {
  word: string
  occurrence: number
  occurrences: number
}

function milestoneToOriginal(node: Record<string, unknown>): OriginalWord {
  return {
    strong: String(node['x-strong'] ?? ''),
    lemma: String(node['x-lemma'] ?? ''),
    morph: node['x-morph'] !== undefined ? String(node['x-morph']) : undefined,
    content: String(node['x-content'] ?? ''),
    occurrence: parseInt(String(node['x-occurrence'] ?? '1'), 10) || 1,
    occurrences: parseInt(String(node['x-occurrences'] ?? '1'), 10) || 1,
  }
}

function charToAlignedWord(node: Record<string, unknown>, text: string): AlignedWord {
  return {
    word: text,
    occurrence: parseInt(String(node['x-occurrence'] ?? '1'), 10) || 1,
    occurrences: parseInt(String(node['x-occurrences'] ?? '1'), 10) || 1,
  }
}

type HarvestCtx = {
  bookCode: string
  chapter: number
  /** True until the first verse marker in the current chapter. */
  inPreVerse: boolean
  verseRef: string
}

function provisionalVerseRef(bookCode: string, chapter: number): string {
  if (!bookCode || chapter <= 0) return ''
  return `${bookCode} ${chapter}:1`
}

/**
 * Collect alignment groups from chapter intro / `\d` content before `\v 1`.
 * Keys use `${book} ${chapter}:1` (Door43 / TWL convention for superscriptions).
 */
export function harvestPreVerseAlignments(
  usj: { content?: unknown[] },
  bookCodeHint: string
): AlignmentMap {
  const alignments: AlignmentMap = {}
  const ctx: HarvestCtx = {
    bookCode: bookCodeHint.trim(),
    chapter: 0,
    inPreVerse: true,
    verseRef: '',
  }

  const flushGroup = (sources: OriginalWord[], targets: AlignedWord[]) => {
    if (!ctx.inPreVerse || !ctx.verseRef) {
      sources.length = 0
      targets.length = 0
      return
    }
    if (sources.length === 0 || targets.length === 0) {
      sources.length = 0
      targets.length = 0
      return
    }
    if (!alignments[ctx.verseRef]) alignments[ctx.verseRef] = []
    alignments[ctx.verseRef]!.push({
      sources: [...sources],
      targets: [...targets],
    })
    sources.length = 0
    targets.length = 0
  }

  const walkArray = (nodes: unknown[]) => {
    let openZaln = 0
    const sources: OriginalWord[] = []
    const targets: AlignedWord[] = []

    for (const item of nodes) {
      if (typeof item === 'string' || !isRecord(item)) continue

      if (item.type === 'book' && typeof item.code === 'string' && item.code.trim()) {
        ctx.bookCode = item.code.trim()
      }

      if (item.type === 'chapter') {
        const n =
          typeof item.number === 'number'
            ? item.number
            : parseInt(String(item.number ?? ''), 10)
        if (Number.isFinite(n)) {
          ctx.chapter = n
          ctx.inPreVerse = true
          ctx.verseRef = provisionalVerseRef(ctx.bookCode, ctx.chapter)
        }
      }

      if (item.type === 'verse' && typeof item.sid === 'string') {
        ctx.inPreVerse = false
        ctx.verseRef = item.sid
        const parsed = parseVerseSid(item.sid)
        if (parsed) {
          ctx.bookCode = parsed.bookCode
          ctx.chapter = parsed.chapter
        }
        // Body alignments are owned by stripAlignments — stop harvesting.
        openZaln = 0
        sources.length = 0
        targets.length = 0
      }

      if (item.type === 'ms' && item.marker === 'zaln-s') {
        if (ctx.inPreVerse) {
          openZaln++
          sources.push(milestoneToOriginal(item))
        }
        continue
      }

      if (item.type === 'ms' && item.marker === 'zaln-e') {
        if (ctx.inPreVerse) {
          openZaln = Math.max(0, openZaln - 1)
          if (openZaln === 0) flushGroup(sources, targets)
        }
        continue
      }

      if (item.type === 'char' && item.marker === 'w') {
        if (ctx.inPreVerse && openZaln > 0) {
          targets.push(charToAlignedWord(item, extractText(item.content)))
        }
        continue
      }

      if (Array.isArray(item.content)) walkArray(item.content)
    }

    // Unclosed group — drop (same as stripAlignments).
    sources.length = 0
    targets.length = 0
  }

  walkArray(usj.content ?? [])
  return alignments
}

/** Prepend pre-verse groups so surface-order alignment attach stays in document order. */
export function mergePreVerseAlignments(
  alignmentMap: AlignmentMap,
  preVerse: AlignmentMap
): AlignmentMap {
  const out: AlignmentMap = { ...alignmentMap }
  for (const [ref, groups] of Object.entries(preVerse)) {
    if (!groups?.length) continue
    const existing = out[ref] ?? []
    // Idempotent: skip when cache already stored a merged map.
    const firstPre = groups[0]?.targets?.[0]?.word
    const firstExisting = existing[0]?.targets?.[0]?.word
    if (firstPre && firstPre === firstExisting) {
      out[ref] = existing
      continue
    }
    out[ref] = [...groups, ...existing]
  }
  return out
}
