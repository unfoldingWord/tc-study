import type { InternedToken } from '../../../../features/scripture/scripturePreparer'
import type { OriginalLanguageToken } from '../types'
import type { ScriptureRenderToken } from './wordIdentity'
import { semanticIdKey } from './wordIdentity'

export interface TokenVisualState {
  isHighlighted: boolean
  isSelected: boolean
  isUnderlined: boolean
}

type PaintTokenKeys = {
  semanticId: string
  alignedOriginalWordIds: readonly string[]
}

type PaintTargetKeys = {
  semanticId: string
  alignedSemanticIds: ReadonlySet<string>
}

/** Fold click/signal IDs once. Paint then uses === / Set.has only. */
export function foldHighlightTarget(
  target: OriginalLanguageToken | null
): OriginalLanguageToken | null {
  if (!target) return null
  if (target.foldedSemanticId && target.foldedAlignedIdSet) return target
  return {
    ...target,
    foldedSemanticId: semanticIdKey(target.semanticId),
    foldedAlignedIdSet: new Set((target.alignedSemanticIds ?? []).map(semanticIdKey)),
  }
}

function paintTokenKeys(token: ScriptureRenderToken): PaintTokenKeys {
  if (token.foldedSemanticId !== undefined) {
    return {
      semanticId: token.foldedSemanticId,
      alignedOriginalWordIds: token.foldedAlignedIds ?? [],
    }
  }
  return {
    semanticId: semanticIdKey(token.semanticId),
    alignedOriginalWordIds: token.alignedOriginalWordIds.map(semanticIdKey),
  }
}

function paintTargetKeys(target: OriginalLanguageToken | null): PaintTargetKeys | null {
  if (!target) return null
  if (target.foldedSemanticId !== undefined && target.foldedAlignedIdSet) {
    return {
      semanticId: target.foldedSemanticId,
      alignedSemanticIds: target.foldedAlignedIdSet,
    }
  }
  return {
    semanticId: semanticIdKey(target.semanticId),
    alignedSemanticIds: new Set((target.alignedSemanticIds ?? []).map(semanticIdKey)),
  }
}

/**
 * True when `token` is part of the active click-highlight selection
 * (same semanticId or cross-pane alignment overlap). Used for toggle-off.
 */
export function tokenMatchesHighlightTarget(
  token: ScriptureRenderToken,
  highlightTarget: OriginalLanguageToken | null
): boolean {
  const target = paintTargetKeys(highlightTarget)
  if (!target) return false
  const tokenKeys = paintTokenKeys(token)
  if (tokenKeys.semanticId === target.semanticId) return true
  if (tokenKeys.alignedOriginalWordIds.includes(target.semanticId)) return true
  if (target.alignedSemanticIds.has(tokenKeys.semanticId)) return true
  if (
    tokenKeys.alignedOriginalWordIds.length > 0 &&
    target.alignedSemanticIds.size > 0 &&
    tokenKeys.alignedOriginalWordIds.some((id) => target.alignedSemanticIds.has(id))
  ) {
    return true
  }
  return false
}

export function resolveTokenVisualState(
  token: ScriptureRenderToken,
  opts: {
    highlightTarget: OriginalLanguageToken | null
    underlinedSemanticIds?: Set<string>
    isOriginalLanguage: boolean
  }
): TokenVisualState {
  const tokenKeys = paintTokenKeys(token)
  const target = paintTargetKeys(opts.highlightTarget)
  let isHighlighted = false
  let isSelected = false
  if (target) {
    if (opts.isOriginalLanguage) {
      if (tokenKeys.semanticId === target.semanticId) {
        isHighlighted = true
        isSelected = true
      } else if (target.alignedSemanticIds.size > 0) {
        isHighlighted = target.alignedSemanticIds.has(tokenKeys.semanticId)
      }
    } else if (tokenKeys.semanticId === target.semanticId) {
      isHighlighted = true
      isSelected = true
    } else if (tokenKeys.alignedOriginalWordIds.length > 0) {
      if (tokenKeys.alignedOriginalWordIds.includes(target.semanticId)) {
        isHighlighted = true
        isSelected = true
      } else if (target.alignedSemanticIds.size > 0) {
        isHighlighted = tokenKeys.alignedOriginalWordIds.some((id) =>
          target.alignedSemanticIds.has(id)
        )
      }
    } else if (target.alignedSemanticIds.has(tokenKeys.semanticId)) {
      isHighlighted = true
    }
  }
  let isUnderlined = false
  const underlines = opts.underlinedSemanticIds
  if (underlines && underlines.size > 0) {
    isUnderlined =
      underlines.has(tokenKeys.semanticId) ||
      tokenKeys.alignedOriginalWordIds.some((id) => underlines.has(id))
  }
  return { isHighlighted, isSelected, isUnderlined }
}

/**
 * Integer paint path for InternedToken + chapter matchKeys indices.
 * Prefer this when a full prepared chapter is available.
 */
export function resolveTokenVisualStateInterned(
  token: InternedToken,
  opts: {
    underlineIndices: Set<number>
    highlightOwnIndex: number | null
    highlightAlignedIndices: Set<number>
    isOriginalLanguage: boolean
  }
): TokenVisualState {
  let isHighlighted = false
  let isSelected = false
  const own = token.k
  const aligned = token.a ?? []
  const hlOwn = opts.highlightOwnIndex
  const hlAligned = opts.highlightAlignedIndices

  if (hlOwn != null) {
    if (opts.isOriginalLanguage) {
      if (own === hlOwn) {
        isHighlighted = true
        isSelected = true
      } else if (hlAligned.size > 0) {
        isHighlighted = hlAligned.has(own)
      }
    } else if (own === hlOwn) {
      isHighlighted = true
      isSelected = true
    } else if (aligned.length > 0) {
      if (aligned.includes(hlOwn)) {
        isHighlighted = true
        isSelected = true
      } else if (hlAligned.size > 0) {
        isHighlighted = aligned.some((i) => hlAligned.has(i))
      }
    } else if (hlAligned.has(own)) {
      isHighlighted = true
    }
  }

  const underlines = opts.underlineIndices
  const isUnderlined =
    underlines.size > 0 &&
    (underlines.has(own) || aligned.some((i) => underlines.has(i)))

  return { isHighlighted, isSelected, isUnderlined }
}

/** Map a folded highlight target through chapter matchKeys into integer indices. */
export function highlightIndicesFromTarget(
  matchKeys: readonly string[],
  highlightTarget: OriginalLanguageToken | null
): { ownIndex: number | null; alignedIndices: Set<number> } {
  if (!highlightTarget) return { ownIndex: null, alignedIndices: new Set() }
  const folded = foldHighlightTarget(highlightTarget)!
  const lookup = new Map<string, number>()
  for (let i = 0; i < matchKeys.length; i++) lookup.set(matchKeys[i]!, i)
  const ownKey = folded.foldedSemanticId ?? semanticIdKey(folded.semanticId)
  const ownIndex = lookup.has(ownKey) ? lookup.get(ownKey)! : null
  const alignedIndices = new Set<number>()
  const aligned =
    folded.foldedAlignedIdSet ??
    new Set((folded.alignedSemanticIds ?? []).map(semanticIdKey))
  for (const id of aligned) {
    const idx = lookup.get(id)
    if (idx !== undefined) alignedIndices.add(idx)
  }
  return { ownIndex, alignedIndices }
}
