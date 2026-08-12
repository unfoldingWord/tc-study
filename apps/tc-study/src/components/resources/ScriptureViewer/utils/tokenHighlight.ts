import type { OriginalLanguageToken } from '../types'
import type { ScriptureRenderToken } from './wordIdentity'
import { semanticIdKey } from './wordIdentity'

export interface TokenVisualState {
  isHighlighted: boolean
  isSelected: boolean
  isUnderlined: boolean
}

export function resolveTokenVisualState(
  token: ScriptureRenderToken,
  opts: {
    highlightTarget: OriginalLanguageToken | null
    underlinedSemanticIds?: Set<string>
    isOriginalLanguage: boolean
  }
): TokenVisualState {
  const tokenKey = semanticIdKey(token.semanticId)
  const alignedKeys = token.alignedOriginalWordIds.map(semanticIdKey)
  let isHighlighted = false
  let isSelected = false
  const target = opts.highlightTarget
  if (target) {
    const targetKey = semanticIdKey(target.semanticId)
    const alignedTargetKeys = target.alignedSemanticIds?.map(semanticIdKey) ?? []
    if (opts.isOriginalLanguage) {
      if (tokenKey === targetKey) {
        isHighlighted = true
        isSelected = true
      } else if (alignedTargetKeys.length > 0) {
        isHighlighted = alignedTargetKeys.includes(tokenKey)
      }
    } else if (tokenKey === targetKey) {
      isHighlighted = true
      isSelected = true
    } else if (alignedKeys.length > 0) {
      if (alignedKeys.includes(targetKey)) {
        isHighlighted = true
        isSelected = true
      } else if (alignedTargetKeys.length > 0) {
        isHighlighted = alignedTargetKeys.some((id) => alignedKeys.includes(id))
      }
    }
  }
  let isUnderlined = false
  const underlines = opts.underlinedSemanticIds
  if (underlines && underlines.size > 0) {
    isUnderlined = opts.isOriginalLanguage
      ? underlines.has(tokenKey)
      : alignedKeys.some((id) => underlines.has(id))
  }
  return { isHighlighted, isSelected, isUnderlined }
}
