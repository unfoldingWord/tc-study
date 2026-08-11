/**
 * Hydrate ResourceInfo.ingredients / verifiedIngredients for book-structured resources.
 * Used by Read bootstrap so the shell hook stays thin.
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { verifyResourceContents } from '../../lib/services/ResourceContentVerifier'

type CatalogManagerLike = {
  getResourceMetadata: (key: string) => Promise<{
    contentMetadata?: { ingredients?: ResourceInfo['ingredients'] }
    release?: { tag_name?: string }
  } | null>
}

/**
 * Pre-fetch catalog ingredients for book-structured resources missing them,
 * then verify which ingredients exist at the published ref (git/trees check).
 */
export function useReadIngredientHydration(
  loadedResources: Record<string, ResourceInfo | undefined>,
  catalogManager: CatalogManagerLike
): void {
  // Keys we already attempted to verify when ingredients were unavailable.
  // Prevents the verification effect from re-running forever without writing
  // a hiding `verifiedIngredients = []` sentinel (fresh-session fail-open).
  const verificationAttemptedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Include only book-structured scripture resources that have NEVER been through the
    // verification pipeline. `verifiedIngredients === undefined` (not just falsy) means
    // not yet verified. Resources we already attempted with no ingredients available are
    // tracked in verificationAttemptedKeysRef so we don't loop, but we do NOT write
    // `verifiedIngredients = []` in that case — an empty sentinel would hide every book
    // tab via resourceSupportsBook (fresh-session bug).
    //
    // Exclude OBS resources explicitly: "Open Bible Stories" contains the word "bible" and
    // would otherwise match the subject substring check, causing unnecessary write cycles.
    const attempted = verificationAttemptedKeysRef.current

    // If a previously-skipped resource later gains ingredients (Phase 2), allow retry.
    for (const r of Object.values(loadedResources)) {
      if (!r) continue
      const k = r.key ?? r.id
      if (!attempted.has(k)) continue
      if (r.verifiedIngredients !== undefined) {
        attempted.delete(k)
        continue
      }
      const ings = r.ingredients ?? (r as { contentMetadata?: { ingredients?: unknown } }).contentMetadata?.ingredients
      if (Array.isArray(ings) && ings.length > 0) {
        attempted.delete(k)
      }
    }

    const toProcess = Object.values(loadedResources).filter((r): r is ResourceInfo => {
      if (!r) return false
      const subjectLower = String(r.subject ?? '').toLowerCase()
      const typeLower = String(r.type ?? '').toLowerCase()
      // Bible-scope book-companion types (notes=TN, words-links=TWL, questions=TQ)
      // have per-book files and need verification, but their contentStructure is 'entry'.
      // Only skip OBS variants of these types.
      const isBibleBookCompanion =
        (typeLower === 'notes' || typeLower === 'words-links' || typeLower === 'questions') &&
        !subjectLower.includes('obs') &&
        !subjectLower.includes('open bible stories')
      const isBookStructured =
        isBibleBookCompanion ||
        r.contentStructure === 'book' ||
        String(r.category).toLowerCase() === 'scripture' ||
        typeLower === 'scripture' ||
        (subjectLower.includes('bible') && !subjectLower.includes('open bible stories'))
      if (!isBookStructured) return false
      if (r.verifiedIngredients !== undefined) return false
      const k = r.key ?? r.id
      if (attempted.has(k)) return false
      return true
    })
    if (!toProcess.length) return

    const door43Client = getDoor43ApiClient()
    let cancelled = false

    void Promise.all(
      toProcess.map(async (r) => {
        const k = r.key ?? r.id
        let ings = r.ingredients
        let knownRef: string | undefined
        try {
          const md = await catalogManager.getResourceMetadata(k)
          if (!ings || !ings.length) {
            ings = (md?.contentMetadata?.ingredients ?? []) as ResourceInfo['ingredients']
          }
          knownRef = md?.release?.tag_name ?? undefined
        } catch {
          // Keep whatever ingredients we already had from Phase 1 / resource
        }
        if (!ings || !ings.length) {
          return { k, skipped: true as const }
        }
        let verifiedIngredients: ResourceInfo['ingredients'] = ings
        let verifiedRef: string | undefined
        try {
          const resourceForVerify = { ...r, ingredients: ings } as ResourceInfo
          const result = await verifyResourceContents(resourceForVerify, door43Client, knownRef)
          if (result.treeFetched) {
            // Path-mismatch / truncated tree can yield []. Writing that sentinel would
            // hide every book tab via resourceSupportsBook — keep catalog ingredients.
            if ((result.verifiedIngredients?.length ?? 0) === 0 && ings.length > 0) {
              return { k, skipped: true as const }
            }
            verifiedIngredients = result.verifiedIngredients
            verifiedRef = result.verifiedRef
          }
        } catch {
          // fail-open — verifiedIngredients stays as full ingredient list
        }
        return { k, ings, verifiedIngredients, verifiedRef, skipped: false as const }
      })
    ).then((results) => {
      if (cancelled) return
      useAppStore.setState((state) => {
        for (const result of results) {
          const { k } = result
          const r = state.loadedResources[k]
          if (!r) continue
          if (result.skipped) {
            verificationAttemptedKeysRef.current.add(k)
            continue
          }
          const { ings, verifiedIngredients, verifiedRef } = result
          if (ings && ings.length) r.ingredients = ings as typeof r.ingredients
          r.verifiedIngredients = (verifiedIngredients ?? ings) as typeof r.verifiedIngredients
          if (verifiedRef) r.verifiedRef = verifiedRef
          verificationAttemptedKeysRef.current.delete(k)
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [loadedResources, catalogManager])
}
