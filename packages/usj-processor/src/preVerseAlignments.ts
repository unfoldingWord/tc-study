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

/** Parse book code from chapter sid (`PSA 5`) or verse sid (`PSA 5:1`). */
function bookCodeFromSid(sid: string): string | null {
  const m = sid.trim().match(/^(\S+)\s+\d+/)
  return m?.[1] ?? null
}

/** Prefer USJ sid casing (usually uppercase book) when two refs differ only by case. */
function preferredVerseRefKey(a: string, b: string): string {
  const bookA = a.split(/\s+/)[0] ?? a
  const bookB = b.split(/\s+/)[0] ?? b
  const aHasUpper = bookA !== bookA.toLowerCase()
  const bHasUpper = bookB !== bookB.toLowerCase()
  if (aHasUpper && !bHasUpper) return a
  if (bHasUpper && !aHasUpper) return b
  return a
}

function groupTargetSignature(group: {
  targets?: Array<{ word?: string }>
}): string {
  return (group.targets ?? []).map((t) => String(t.word ?? '').toLowerCase()).join('\0')
}

/**
 * Collect alignment groups from chapter intro / `\d` content before `\v 1`.
 * Keys use `${book} ${chapter}:1` (Door43 / TWL convention for superscriptions).
 *
 * Chapter slices often omit the book node — prefer book code from chapter/verse
 * `sid` so keys match `stripAlignments` (`PSA 5:1`, not `psa 5:1`).
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
        if (typeof item.sid === 'string') {
          const fromSid = bookCodeFromSid(item.sid)
          if (fromSid) ctx.bookCode = fromSid
        }
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

/**
 * Collapse refs that differ only by book-code case onto one key (USJ sid style).
 * Prevents `psa 5:1` (harvest) vs `PSA 5:1` (stripAlignments) from splitting
 * pre-verse and body groups across two maps.
 */
function collapseCaseVariantKeys(map: AlignmentMap): AlignmentMap {
  const out: AlignmentMap = {}
  for (const [ref, groups] of Object.entries(map)) {
    if (!groups?.length) continue
    const existingKey = Object.keys(out).find((k) => k.toLowerCase() === ref.toLowerCase())
    if (!existingKey) {
      out[ref] = [...groups]
      continue
    }
    const canonical = preferredVerseRefKey(existingKey, ref)
    const primary = out[existingKey]!
    const secondary = groups
    // Keep document order: if secondary's first target differs, treat as pre-verse prefix.
    const firstPrimary = primary[0]?.targets?.[0]?.word
    const firstSecondary = secondary[0]?.targets?.[0]?.word
    const seen = new Set(primary.map(groupTargetSignature))
    const uniqueSecondary = secondary.filter((g) => {
      const sig = groupTargetSignature(g)
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })
    const merged =
      firstSecondary && firstSecondary !== firstPrimary
        ? [...uniqueSecondary, ...primary]
        : [...primary, ...uniqueSecondary]
    delete out[existingKey]
    out[canonical] = merged
  }
  return out
}

/** Prepend pre-verse groups so surface-order alignment attach stays in document order. */
export function mergePreVerseAlignments(
  alignmentMap: AlignmentMap,
  preVerse: AlignmentMap
): AlignmentMap {
  // Normalize any pre-existing case-split keys before prepending harvest.
  const out: AlignmentMap = collapseCaseVariantKeys(alignmentMap)
  for (const [ref, groups] of Object.entries(preVerse)) {
    if (!groups?.length) continue
    const existingKey =
      Object.keys(out).find((k) => k.toLowerCase() === ref.toLowerCase()) ?? ref
    const existing = out[existingKey] ?? []
    const canonical = preferredVerseRefKey(existingKey, ref)
    // Idempotent: skip when cache already stored a merged map.
    const firstPre = groups[0]?.targets?.[0]?.word
    const firstExisting = existing[0]?.targets?.[0]?.word
    if (firstPre && firstPre === firstExisting) {
      if (existingKey !== canonical) {
        delete out[existingKey]
        out[canonical] = existing
      }
      continue
    }
    if (existingKey !== canonical) delete out[existingKey]
    if (ref !== canonical) delete out[ref]
    out[canonical] = [...groups, ...existing]
  }
  return out
}
