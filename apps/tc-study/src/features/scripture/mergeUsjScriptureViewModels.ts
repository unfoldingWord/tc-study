/**
 * Merge chapter-scoped (or multi-chapter) USJ view models so infinite-scroll
 * stacks can paint every mounted chapter — not only the focused SoT slice.
 */

import type { UsjChapterView, UsjScriptureViewModel } from '@bt-synergy/scripture-loader'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function chapterNumberFromNode(node: unknown): number | null {
  if (!isRecord(node) || node.type !== 'chapter') return null
  const raw = node.number
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** Split USJ document content into per-chapter slices (chapter marker → next). */
export function splitUsjContentByChapter(
  content: readonly unknown[]
): { preamble: unknown[]; byChapter: Map<number, unknown[]> } {
  const byChapter = new Map<number, unknown[]>()
  const preamble: unknown[] = []
  let current: number | null = null
  let bucket: unknown[] = preamble

  for (const node of content) {
    const chapter = chapterNumberFromNode(node)
    if (chapter != null) {
      current = chapter
      bucket = []
      byChapter.set(chapter, bucket)
      bucket.push(node)
      continue
    }
    bucket.push(node)
  }

  return { preamble, byChapter }
}

export function chaptersMissingFromViewModel(
  viewModel: UsjScriptureViewModel,
  needed: readonly number[]
): number[] {
  const have = new Set(
    viewModel.chapters.map((chapter) => chapter.number).filter((n) => n >= 1)
  )
  const missing = new Set<number>()
  for (const chapter of needed) {
    if (!Number.isFinite(chapter) || chapter < 1) continue
    if (!have.has(chapter)) missing.add(chapter)
  }
  return [...missing].sort((a, b) => a - b)
}

/**
 * Merge extras into base. USJ content is rebuilt in chapter order so
 * `buildUsjLayoutBlocksForChapter` can reach later chapters without aborting
 * early on an out-of-order `\c` marker.
 */
export function mergeUsjScriptureViewModels(
  base: UsjScriptureViewModel,
  extras: readonly UsjScriptureViewModel[]
): UsjScriptureViewModel {
  if (extras.length === 0) return base

  const chapterViews = new Map<number, UsjChapterView>()
  for (const chapter of base.chapters) {
    if (chapter.number >= 1) chapterViews.set(chapter.number, chapter)
  }

  const { preamble, byChapter } = splitUsjContentByChapter(base.usj?.content ?? [])
  const alignmentMap = { ...(base.alignmentMap ?? {}) }

  for (const extra of extras) {
    Object.assign(alignmentMap, extra.alignmentMap ?? {})
    for (const chapter of extra.chapters) {
      if (chapter.number < 1 || chapterViews.has(chapter.number)) continue
      chapterViews.set(chapter.number, chapter)
    }
    const split = splitUsjContentByChapter(extra.usj?.content ?? [])
    for (const [chapter, nodes] of split.byChapter) {
      if (!byChapter.has(chapter)) byChapter.set(chapter, nodes)
    }
    // Single-chapter extras sometimes omit an explicit chapter marker when the
    // slice is already scoped — fall back to the view-model chapter list.
    if (split.byChapter.size === 0 && extra.chapters.length === 1) {
      const only = extra.chapters[0]!
      if (only.number >= 1 && !byChapter.has(only.number) && (extra.usj?.content?.length ?? 0) > 0) {
        byChapter.set(only.number, [...(extra.usj?.content ?? [])])
      }
    }
  }

  const chapters = [...chapterViews.values()].sort((a, b) => a.number - b.number)
  const content: unknown[] = [...preamble]
  for (const chapter of chapters) {
    const nodes = byChapter.get(chapter.number)
    if (nodes?.length) content.push(...nodes)
  }

  return {
    ...base,
    chapters,
    alignmentMap,
    usj: {
      ...(base.usj ?? { type: 'USJ', version: '3.1' }),
      type: base.usj?.type ?? 'USJ',
      version: base.usj?.version ?? '3.1',
      content,
    },
  }
}
