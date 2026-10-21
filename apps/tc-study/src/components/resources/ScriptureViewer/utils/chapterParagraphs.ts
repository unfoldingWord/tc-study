/**
 * Cheap text-only chapter extract: USJ paragraph / poetry markers → string[].
 * Keeps verse numbers inline; strips `\w` attributes and `\f` / `\x` bodies.
 *
 * Adjacent `\w` nodes with no intervening whitespace get a separating space
 * (same rule as shouldInsertSpaceBeforeInline for aligned USFM).
 */

import {
  FOOTNOTE_MARKERS,
  PARAGRAPH_MARKERS,
  SKIP_MARKERS,
  XREF_MARKERS,
  extractText,
} from '@bt-synergy/usj-processor'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function markerOf(node: Record<string, unknown>): string {
  return typeof node.marker === 'string' ? node.marker : ''
}

function isWordChar(node: Record<string, unknown>): boolean {
  return (
    (typeof node.type === 'string' ? node.type : '') === 'char' && markerOf(node) === 'w'
  )
}

function verseNumberOf(node: Record<string, unknown>): number | null {
  const raw = node.number
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseInt(raw, 10)
        : NaN
  return Number.isFinite(num) && num > 0 ? num : null
}

function appendWord(out: string, word: string): string {
  if (!word) return out
  if (out && !/\s$/.test(out) && !/^[.,;:!?…]/.test(word)) return `${out} ${word}`
  return out + word
}

function paragraphTextFromNode(node: unknown): string {
  if (typeof node === 'string') return node
  if (!isRecord(node)) return ''
  const type = typeof node.type === 'string' ? node.type : ''
  const marker = markerOf(node)
  if (type === 'verse' || marker === 'v') {
    const n = verseNumberOf(node)
    return n != null ? `${n} ` : ''
  }
  if (type === 'note' || FOOTNOTE_MARKERS.has(marker) || XREF_MARKERS.has(marker)) return ''
  if (isWordChar(node)) return extractText(node.content)
  if (Array.isArray(node.content)) {
    return paragraphTextFromContent(node.content)
  }
  if (typeof node.content === 'string') return node.content
  return ''
}

function paragraphTextFromContent(content: unknown[]): string {
  let out = ''
  for (const child of content) {
    if (typeof child === 'string') {
      out += child
      continue
    }
    if (!isRecord(child)) continue
    if (isWordChar(child)) {
      out = appendWord(out, extractText(child.content))
      continue
    }
    const piece = paragraphTextFromNode(child)
    if (!piece) continue
    if (out && !/\s$/.test(out) && !/^\s/.test(piece) && !/^[.,;:!?…]/.test(piece)) {
      out += ' '
    }
    out += piece
  }
  return out
}

function normalizeParagraph(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** One USJ walk → paragraph strings keyed by chapter. */
export function extractBookParagraphs(usj: { content?: unknown[] }): Map<number, string[]> {
  const byChapter = new Map<number, string[]>()
  let chapter = 0

  const push = (text: string) => {
    const normalized = normalizeParagraph(text)
    if (!normalized || chapter < 1) return
    let list = byChapter.get(chapter)
    if (!list) {
      list = []
      byChapter.set(chapter, list)
    }
    list.push(normalized)
  }

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!isRecord(node)) continue
      const type = typeof node.type === 'string' ? node.type : ''
      const marker = markerOf(node)

      if (type === 'chapter' || marker === 'c') {
        const raw = node.number
        const num = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
        if (Number.isFinite(num) && num > 0) chapter = num
        continue
      }

      if (SKIP_MARKERS.has(marker)) continue

      if (PARAGRAPH_MARKERS.has(marker)) {
        const text = Array.isArray(node.content)
          ? paragraphTextFromContent(node.content)
          : paragraphTextFromNode(node)
        push(text)
        continue
      }

      if (Array.isArray(node.content)) walk(node.content)
    }
  }

  walk(usj.content ?? [])
  return byChapter
}

export function extractChapterParagraphs(
  usj: { content?: unknown[] },
  chapter: number
): string[] {
  return extractBookParagraphs(usj).get(chapter) ?? []
}
