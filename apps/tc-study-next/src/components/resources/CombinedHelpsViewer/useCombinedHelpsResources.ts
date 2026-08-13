import { useMemo } from 'react'
import type { ResourceInfo } from '../../../contexts/types'
import { COMBINED_HELPS_IDS } from '../../../features/helps/combinedHelpsIds'
import {
  isNotesType,
  isWordsLinksType,
  langFromResourceKey,
  primaryLangCode,
} from './combinedHelpsUtils'

export interface UseCombinedHelpsResourcesParams {
  loadedResources: Record<string, ResourceInfo | undefined>
  wantLang: string
  injectedTnKey?: string
  injectedTwlKey?: string
  helpsScope: 'scripture' | 'obs'
}

function injectedKeyMatchesLang(key: string | undefined, wantLang: string): string | null {
  if (!key) return null
  if (!wantLang) return key
  return langFromResourceKey(key) === wantLang ? key : null
}

/**
 * Resolve TN/TWL resource keys from injected keys or loaded resources
 * matching language + helps scope.
 *
 * Injected keys that belong to another language are ignored so stale English
 * CombinedHelps pointers cannot win after a Read language switch.
 */
export function resolveCombinedHelpsResourceKeys({
  loadedResources,
  wantLang,
  injectedTnKey,
  injectedTwlKey,
  helpsScope,
}: UseCombinedHelpsResourcesParams): { tnKey: string; twlKey: string } {
  let tn: string | null = injectedKeyMatchesLang(injectedTnKey, wantLang)
  let twl: string | null = injectedKeyMatchesLang(injectedTwlKey, wantLang)
  const list = Object.values(loadedResources).filter(Boolean) as ResourceInfo[]

  const matchesLang = (r: ResourceInfo) => {
    if (!wantLang) return true
    const key = r.key || r.id || ''
    return (
      primaryLangCode(r.language) === wantLang ||
      primaryLangCode(r.languageCode) === wantLang ||
      langFromResourceKey(key) === wantLang
    )
  }

  for (const r of list) {
    const t = r.type as string | undefined
    const key = r.key || r.id || ''
    if (COMBINED_HELPS_IDS.has(key)) continue
    if (!matchesLang(r)) continue
    if (isNotesType(t, helpsScope) && !tn) tn = key
    if (isWordsLinksType(t, helpsScope) && !twl) twl = key
  }

  // Fallback when metadata language is wrong: use `owner/lang/...` from the key only.
  // Never pick TN/TWL from another language still present in loadedResources.
  for (const r of list) {
    const t = r.type as string | undefined
    const key = r.key || r.id || ''
    if (COMBINED_HELPS_IDS.has(key)) continue
    if (wantLang && langFromResourceKey(key) !== wantLang) continue
    if (!tn && isNotesType(t, helpsScope)) tn = key
    if (!twl && isWordsLinksType(t, helpsScope)) twl = key
  }

  return { tnKey: tn || '', twlKey: twl || '' }
}

export function useCombinedHelpsResources(
  params: UseCombinedHelpsResourcesParams
): { tnKey: string; twlKey: string } {
  return useMemo(
    () => resolveCombinedHelpsResourceKeys(params),
    [
      params.loadedResources,
      params.wantLang,
      params.injectedTnKey,
      params.injectedTwlKey,
      params.helpsScope,
    ]
  )
}
