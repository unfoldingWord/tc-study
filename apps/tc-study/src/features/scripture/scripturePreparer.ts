/**
 * Scripture preparer — light (text-only layout) + full (interned token identity).
 * React-free; safe for workers.
 */

import {
  buildUsjLayoutBlocksForChapter,
  semanticIdFor,
  shouldInsertSpaceBeforeInline,
  type UsjLayoutBlock,
  type UsjLayoutInline,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { usjScriptureKey } from '@bt-synergy/scripture-loader'
import {
  USJ_PROCESSING_VERSION,
  USJProcessor,
} from '@bt-synergy/usj-processor'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { semanticIdMatchKey } from '../helps/semanticIdMatchKey'
import {
  writePreparedNav,
  writePreparedUnit,
} from '../prepare/prepareCache'
import {
  registerPreparer,
  type PrepareCacheAdapter,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

/**
 * Local prepare payload schema. Bump when light/full/nav *shape* changes
 * independently of the USJ SoT.
 */
export const SCRIPTURE_PREPARE_SCHEMA = 2

/**
 * Derived prepare cache version. Embeds USJ SoT version digits so nav/light/full
 * invalidate whenever scripture-usj: is rewritten for a processing-version bump
 * (stale derivatives must not mask a missing token source).
 *
 * Example: schema 2 + `2.1.0-usj` → 2_000_000 + 210 = 2_000_210
 */
export function scripturePrepareVersionFor(
  usjProcessingVersion: string = USJ_PROCESSING_VERSION
): number {
  const digits = Number.parseInt(usjProcessingVersion.replace(/\D/g, '') || '0', 10)
  return SCRIPTURE_PREPARE_SCHEMA * 1_000_000 + digits
}

export const SCRIPTURE_PREPARE_VERSION = scripturePrepareVersionFor()

/** Compact full-tier token: surface, occurrence, own matchKeys index, aligned indices. */
export interface InternedToken {
  c: string
  o: number
  k: number
  a?: number[]
}

export type LightInline =
  | { kind: 'verse'; chapterNumber: number; verseNumber: number }
  | { kind: 'text'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'note'; caller: string; text: string }
  | { kind: 'xref'; caller: string; text: string }

export interface LightBlock {
  marker: string
  role: string
  indentLevel: number
  chapterNumber: number
  verseNumbers: number[]
  inline: LightInline[]
}

export type FullInline =
  | { kind: 'verse'; chapterNumber: number; verseNumber: number }
  | { kind: 'text'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'note'; caller: string; text: string }
  | { kind: 'xref'; caller: string; text: string }
  | { kind: 'token'; token: InternedToken }

export interface FullBlock {
  marker: string
  role: string
  indentLevel: number
  chapterNumber: number
  verseNumbers: number[]
  inline: FullInline[]
}

export interface ScriptureNavRecord {
  version: number
  resourceKey?: string
  bookId: string
  bookName: string
  chapters: Array<{ number: number; verseCount: number }>
}

export interface ScriptureLightChapter {
  version: number
  unit: number
  blocks: LightBlock[]
}

export interface ScriptureFullChapter {
  version: number
  unit: number
  matchKeys: string[]
  blocks: FullBlock[]
}

/** Merge adjacent text runs after collapsing tokens. */
function coalesceText(inline: LightInline[]): LightInline[] {
  const out: LightInline[] = []
  for (const item of inline) {
    const prev = out[out.length - 1]
    if (item.kind === 'text' && prev?.kind === 'text') {
      prev.text += item.text
    } else {
      out.push(item)
    }
  }
  return out
}

/**
 * Collapse layout inline to light inline, inserting the same inter-token spaces
 * the full renderer paints via shouldInsertSpaceBeforeInline.
 */
function layoutInlineToLight(inline: UsjLayoutInline[]): LightInline[] {
  const mapped: LightInline[] = []
  for (let i = 0; i < inline.length; i++) {
    const item = inline[i]!
    if (item.kind === 'token') {
      const needsSpace = shouldInsertSpaceBeforeInline(inline[i - 1], item)
      mapped.push({
        kind: 'text',
        text: needsSpace ? ` ${item.token.content}` : item.token.content,
      })
      continue
    }
    if (item.kind === 'verse') {
      mapped.push({
        kind: 'verse',
        chapterNumber: item.chapterNumber,
        verseNumber: item.verseNumber,
      })
      continue
    }
    if (item.kind === 'text') {
      mapped.push({ kind: 'text', text: item.text })
      continue
    }
    if (item.kind === 'heading') {
      mapped.push({ kind: 'heading', text: item.text })
      continue
    }
    if (item.kind === 'note') {
      mapped.push({ kind: 'note', caller: item.caller, text: item.text })
      continue
    }
    if (item.kind === 'xref') {
      mapped.push({ kind: 'xref', caller: item.caller, text: item.text })
    }
  }
  return coalesceText(mapped)
}

export function buildLightChapter(
  viewModel: UsjScriptureViewModel,
  chapter: number
): ScriptureLightChapter {
  const layout = buildUsjLayoutBlocksForChapter(viewModel.usj, viewModel, chapter)
  const blocks: LightBlock[] = layout.map((b) => ({
    marker: b.marker,
    role: b.role,
    indentLevel: b.indentLevel,
    chapterNumber: b.chapterNumber,
    verseNumbers: [...b.verseNumbers],
    inline: layoutInlineToLight(b.inline),
  }))
  return { version: SCRIPTURE_PREPARE_VERSION, unit: chapter, blocks }
}

function internKey(
  table: string[],
  index: Map<string, number>,
  folded: string
): number {
  const existing = index.get(folded)
  if (existing !== undefined) return existing
  const i = table.length
  table.push(folded)
  index.set(folded, i)
  return i
}

function toInternedToken(
  token: UsjWordToken,
  table: string[],
  index: Map<string, number>
): InternedToken {
  const ownFolded = semanticIdMatchKey(token.semanticId)
  const k = internKey(table, index, ownFolded)
  const aligned = token.alignedOriginalWordIds ?? []
  let a: number[] | undefined
  if (aligned.length > 0) {
    a = aligned.map((id) => internKey(table, index, semanticIdMatchKey(id)))
  }
  return { c: token.content, o: token.occurrence, k, ...(a ? { a } : {}) }
}

export function buildFullChapter(
  viewModel: UsjScriptureViewModel,
  chapter: number
): ScriptureFullChapter {
  const layout = buildUsjLayoutBlocksForChapter(viewModel.usj, viewModel, chapter)
  const matchKeys: string[] = []
  const index = new Map<string, number>()

  const blocks: FullBlock[] = layout.map((b) => ({
    marker: b.marker,
    role: b.role,
    indentLevel: b.indentLevel,
    chapterNumber: b.chapterNumber,
    verseNumbers: [...b.verseNumbers],
    inline: b.inline.map((item): FullInline => {
      if (item.kind === 'token') {
        return { kind: 'token', token: toInternedToken(item.token, matchKeys, index) }
      }
      if (item.kind === 'verse') {
        return {
          kind: 'verse',
          chapterNumber: item.chapterNumber,
          verseNumber: item.verseNumber,
        }
      }
      if (item.kind === 'text') return { kind: 'text', text: item.text }
      if (item.kind === 'heading') return { kind: 'heading', text: item.text }
      if (item.kind === 'note') {
        return { kind: 'note', caller: item.caller, text: item.text }
      }
      return { kind: 'xref', caller: item.caller, text: item.text }
    }),
  }))

  return {
    version: SCRIPTURE_PREPARE_VERSION,
    unit: chapter,
    matchKeys,
    blocks,
  }
}

export function buildNavRecord(viewModel: UsjScriptureViewModel): ScriptureNavRecord {
  return {
    version: SCRIPTURE_PREPARE_VERSION,
    bookId: viewModel.bookCode,
    bookName: viewModel.bookName,
    chapters: viewModel.chapters.map((ch) => ({
      number: ch.number,
      verseCount: ch.verses.length,
    })),
  }
}

/** Map folded signal ids → integer indices present in this chapter. */
export function resolveMatchIndices(
  matchKeys: readonly string[],
  foldedIds: Iterable<string>
): Set<number> {
  const lookup = new Map<string, number>()
  for (let i = 0; i < matchKeys.length; i++) {
    lookup.set(matchKeys[i]!, i)
  }
  const out = new Set<number>()
  for (const id of foldedIds) {
    const idx = lookup.get(id)
    if (idx !== undefined) out.add(idx)
  }
  return out
}

export function matchKeyLookup(matchKeys: readonly string[]): Map<string, number> {
  const lookup = new Map<string, number>()
  for (let i = 0; i < matchKeys.length; i++) {
    lookup.set(matchKeys[i]!, i)
  }
  return lookup
}

/** Reconstruct raw semanticId at click / broadcast time. */
export function rawSemanticIdForToken(
  verseRef: string,
  token: InternedToken
): string {
  return semanticIdFor(verseRef, token.c, token.o)
}

export function plainTextFromLightBlocks(blocks: LightBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    for (const item of b.inline) {
      if (item.kind === 'verse') {
        if (parts.length > 0 && !/\s$/.test(parts[parts.length - 1]!)) parts.push(' ')
        parts.push(String(item.verseNumber))
        continue
      }
      if (item.kind === 'text' || item.kind === 'heading') parts.push(item.text)
    }
  }
  return parts.join('')
}

function shouldInsertSpaceBeforeFull(
  prev: FullInline | undefined,
  next: FullInline
): boolean {
  if (!prev || next.kind !== 'token') return false
  if (prev.kind === 'text') return !/\s$/.test(prev.text)
  return (
    prev.kind === 'verse' ||
    prev.kind === 'token' ||
    prev.kind === 'heading' ||
    prev.kind === 'note' ||
    prev.kind === 'xref'
  )
}

/** Full-block plain text using the same spacing rules as live layout paint. */
export function plainTextFromFullBlocks(blocks: FullBlock[]): string {
  let text = ''
  for (const b of blocks) {
    for (let i = 0; i < b.inline.length; i++) {
      const item = b.inline[i]!
      if (item.kind === 'verse') {
        if (text && !/\s$/.test(text)) text += ' '
        text += String(item.verseNumber)
        continue
      }
      if (item.kind === 'text' || item.kind === 'heading') {
        text += item.text
        continue
      }
      if (item.kind === 'note' || item.kind === 'xref') continue
      if (item.kind === 'token') {
        if (shouldInsertSpaceBeforeFull(b.inline[i - 1], item)) text += ' '
        text += item.token.c
      }
    }
  }
  return text
}

export function lightHasIdentityFields(blocks: LightBlock[]): boolean {
  for (const b of blocks) {
    for (const item of b.inline) {
      if ((item as { kind: string }).kind === 'token') return true
      if ('semanticId' in item || 'k' in item || 'matchKeys' in item) return true
    }
  }
  return false
}

/** Persist nav + all chapter light/full rows for a view model already in hand. */
export async function persistScripturePrepared(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  viewModel: UsjScriptureViewModel
): Promise<void> {
  const nav = buildNavRecord(viewModel)
  await writePreparedNav(
    cache,
    RESOURCE_TYPE_IDS.SCRIPTURE,
    resourceKey,
    bookId,
    SCRIPTURE_PREPARE_VERSION,
    nav
  )
  for (const ch of viewModel.chapters) {
    const light = buildLightChapter(viewModel, ch.number)
    const full = buildFullChapter(viewModel, ch.number)
    await writePreparedUnit(
      cache,
      RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey,
      bookId,
      ch.number,
      'light',
      SCRIPTURE_PREPARE_VERSION,
      light
    )
    await writePreparedUnit(
      cache,
      RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey,
      bookId,
      ch.number,
      'full',
      SCRIPTURE_PREPARE_VERSION,
      full
    )
  }
}

type ScriptureSource = {
  resourceKey: string
  bookId: string
  viewModel: UsjScriptureViewModel
}

const usjProcessor = new USJProcessor()

/** Log once per book so workers don't spam on every enqueue. */
const loggedReadSourceMiss = new Set<string>()

function logReadSourceMiss(resourceKey: string, bookId: string, reason: string): void {
  const key = `${resourceKey}|${bookId.toLowerCase()}|${reason}`
  if (loggedReadSourceMiss.has(key)) return
  loggedReadSourceMiss.add(key)
  console.warn(
    `[scripturePreparer.readSource] ${resourceKey}/${bookId}: ${reason}`
  )
}

/** Test-only: reset once-per-book miss log. */
export function resetReadSourceMissLogForTests(): void {
  loggedReadSourceMiss.clear()
}

export const scripturePreparer: ResourcePreparer<ScriptureSource, number> = {
  id: RESOURCE_TYPE_IDS.SCRIPTURE,
  version: SCRIPTURE_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const key = usjScriptureKey(resourceKey, bookId)
    const entry = await ctx.cacheAdapter.get(key)
    if (!entry) {
      logReadSourceMiss(resourceKey, bookId, 'no scripture-usj entry')
      return null
    }
    const content =
      entry && typeof entry === 'object' && 'content' in entry
        ? (entry as { content: unknown }).content
        : entry
    try {
      const result = usjProcessor.fromUsjCacheContentFull(
        content as Parameters<USJProcessor['fromUsjCacheContentFull']>[0],
        bookId
      )
      return { resourceKey, bookId, viewModel: result.viewModel }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logReadSourceMiss(
        resourceKey,
        bookId,
        message.includes('version')
          ? `version/parse mismatch: ${message}`
          : `parse failed: ${message}`
      )
      return null
    }
  },

  unitsFor(source) {
    return source.viewModel.chapters.map((c) => c.number)
  },

  prepareNav(source) {
    return buildNavRecord(source.viewModel)
  },

  prepareLight(source, unit) {
    return buildLightChapter(source.viewModel, unit)
  },

  prepareFull(source, unit) {
    return buildFullChapter(source.viewModel, unit)
  },
}

registerPreparer(scripturePreparer)

/** Re-export layout type for tests that compare against live layout. */
export type { UsjLayoutBlock }
