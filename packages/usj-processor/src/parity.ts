/**
 * Parity report helpers for USJ vs legacy usfm-processor outputs.
 */

import type { ProcessedScripture, WordToken } from '@bt-synergy/usfm-processor'

export interface TokenKey {
  semanticId: string
  content: string
  occurrence: number
  verseRef: string
}

export interface ParityBucket {
  name: string
  leftOnly: string[]
  rightOnly: string[]
  intersect: number
  leftSize: number
  rightSize: number
  pct: number
}

export interface AlignmentParity {
  /** Tokens that have non-empty alignedOriginalWordIds in legacy */
  legacyAlignedCount: number
  matchingCount: number
  pct: number
  mismatches: Array<{ semanticId: string; legacy: string[]; usj: string[] }>
}

export interface ParityReport {
  label: string
  chapterFilter: number | 'all'
  wordSurfaceOccurrence: ParityBucket
  semanticIds: ParityBucket
  alignedOriginalWordIds: AlignmentParity
}

function wordTokens(
  scripture: ProcessedScripture,
  chapterFilter: number | 'all'
): Array<WordToken & { verseRef: string }> {
  const out: Array<WordToken & { verseRef: string }> = []
  for (const ch of scripture.chapters) {
    if (chapterFilter !== 'all' && ch.number !== chapterFilter) continue
    for (const v of ch.verses) {
      for (const t of v.wordTokens || []) {
        if (t.type !== 'word') continue
        out.push({ ...t, verseRef: v.reference })
      }
    }
  }
  return out
}

export function semanticIdFor(verseRef: string, content: string, occurrence: number): string {
  return `${verseRef}:${content}:${occurrence}`
}

export function collectSemanticIdSet(
  scripture: ProcessedScripture,
  chapterFilter: number | 'all' = 'all'
): Set<string> {
  const set = new Set<string>()
  for (const t of wordTokens(scripture, chapterFilter)) {
    set.add(semanticIdFor(t.verseRef, t.content, t.occurrence).toLowerCase())
  }
  return set
}

export function collectSurfaceOccurrenceSet(
  scripture: ProcessedScripture,
  chapterFilter: number | 'all' = 'all'
): Set<string> {
  const set = new Set<string>()
  for (const t of wordTokens(scripture, chapterFilter)) {
    set.add(`${t.verseRef}|${t.content}|${t.occurrence}`.toLowerCase())
  }
  return set
}

function setParity(name: string, left: Set<string>, right: Set<string>): ParityBucket {
  const leftOnly: string[] = []
  const rightOnly: string[] = []
  let intersect = 0
  for (const k of left) {
    if (right.has(k)) intersect++
    else leftOnly.push(k)
  }
  for (const k of right) {
    if (!left.has(k)) rightOnly.push(k)
  }
  const denom = Math.max(left.size, right.size, 1)
  return {
    name,
    leftOnly: leftOnly.sort(),
    rightOnly: rightOnly.sort(),
    intersect,
    leftSize: left.size,
    rightSize: right.size,
    pct: (100 * intersect) / denom,
  }
}

export function compareAlignedOriginalWordIds(
  legacy: ProcessedScripture,
  usj: ProcessedScripture,
  chapterFilter: number | 'all' = 'all'
): AlignmentParity {
  const legacyMap = new Map<string, string[]>()
  const usjMap = new Map<string, string[]>()

  for (const t of wordTokens(legacy, chapterFilter)) {
    const id = semanticIdFor(t.verseRef, t.content, t.occurrence).toLowerCase()
    legacyMap.set(
      id,
      (t.alignedOriginalWordIds || []).map((x) => x.toLowerCase()).sort()
    )
  }
  for (const t of wordTokens(usj, chapterFilter)) {
    const id = semanticIdFor(t.verseRef, t.content, t.occurrence).toLowerCase()
    usjMap.set(
      id,
      (t.alignedOriginalWordIds || []).map((x) => x.toLowerCase()).sort()
    )
  }

  let legacyAlignedCount = 0
  let matchingCount = 0
  const mismatches: AlignmentParity['mismatches'] = []

  for (const [id, legacyIds] of legacyMap) {
    if (legacyIds.length === 0) continue
    legacyAlignedCount++
    const usjIds = usjMap.get(id) || []
    const same =
      legacyIds.length === usjIds.length && legacyIds.every((v, i) => v === usjIds[i])
    if (same) matchingCount++
    else mismatches.push({ semanticId: id, legacy: legacyIds, usj: usjIds })
  }

  return {
    legacyAlignedCount,
    matchingCount,
    pct: legacyAlignedCount === 0 ? 100 : (100 * matchingCount) / legacyAlignedCount,
    mismatches,
  }
}

export function buildParityReport(
  label: string,
  legacy: ProcessedScripture,
  usj: ProcessedScripture,
  chapterFilter: number | 'all' = 'all'
): ParityReport {
  return {
    label,
    chapterFilter,
    wordSurfaceOccurrence: setParity(
      'surface+occurrence',
      collectSurfaceOccurrenceSet(legacy, chapterFilter),
      collectSurfaceOccurrenceSet(usj, chapterFilter)
    ),
    semanticIds: setParity(
      'semanticIds',
      collectSemanticIdSet(legacy, chapterFilter),
      collectSemanticIdSet(usj, chapterFilter)
    ),
    alignedOriginalWordIds: compareAlignedOriginalWordIds(legacy, usj, chapterFilter),
  }
}

export function formatParityReport(report: ParityReport): string {
  const lines = [
    `=== ${report.label} (chapter=${report.chapterFilter}) ===`,
    `surface+occurrence: ${report.wordSurfaceOccurrence.pct.toFixed(2)}% ` +
      `(${report.wordSurfaceOccurrence.intersect}/max(${report.wordSurfaceOccurrence.leftSize},${report.wordSurfaceOccurrence.rightSize})) ` +
      `leftOnly=${report.wordSurfaceOccurrence.leftOnly.length} rightOnly=${report.wordSurfaceOccurrence.rightOnly.length}`,
    `semanticIds: ${report.semanticIds.pct.toFixed(2)}% ` +
      `leftOnly=${report.semanticIds.leftOnly.length} rightOnly=${report.semanticIds.rightOnly.length}`,
    `alignedOriginalWordIds (legacy-aligned tokens): ${report.alignedOriginalWordIds.pct.toFixed(2)}% ` +
      `(${report.alignedOriginalWordIds.matchingCount}/${report.alignedOriginalWordIds.legacyAlignedCount}) ` +
      `mismatches=${report.alignedOriginalWordIds.mismatches.length}`,
  ]

  const samples = [
    ...report.wordSurfaceOccurrence.leftOnly.slice(0, 5).map((s) => `  surface leftOnly: ${s}`),
    ...report.wordSurfaceOccurrence.rightOnly.slice(0, 5).map((s) => `  surface rightOnly: ${s}`),
    ...report.semanticIds.leftOnly.slice(0, 5).map((s) => `  semantic leftOnly: ${s}`),
    ...report.semanticIds.rightOnly.slice(0, 5).map((s) => `  semantic rightOnly: ${s}`),
    ...report.alignedOriginalWordIds.mismatches
      .slice(0, 5)
      .map(
        (m) =>
          `  align mismatch ${m.semanticId}: legacy=[${m.legacy.join(',')}] usj=[${m.usj.join(',')}]`
      ),
  ]
  return [...lines, ...samples].join('\n')
}
