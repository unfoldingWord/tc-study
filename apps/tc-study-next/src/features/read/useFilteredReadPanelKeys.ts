/**
 * Scope/book-filtered panel resource keys with stable array references.
 * Fail-open while ingredients load so tabs don't flicker.
 */

import { useMemo, useRef } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { filterReadPanel2Keys } from './filterReadPanelKeys'
import {
  getResourceAppliesToScope,
  resourceSupportsBook,
} from './resourcePanelHelpers'

type ResourceTypeRegistryLike = {
  getTypeForSubject: (s: string) => string | undefined
  getScopeForType: (id: string) => string | null
}

function stabilizeKeys(next: string[], prevRef: { current: string[] }): string[] {
  const prev = prevRef.current
  if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev
  prevRef.current = next
  return next
}

export function useFilteredReadPanelKeys(args: {
  panel1ResourceKeys: string[]
  panel2ResourceKeys: string[]
  loadedResources: Record<string, ResourceInfo | undefined>
  resourceTypeRegistry: ResourceTypeRegistryLike
  navigationScope: string
  currentBook: string
}) {
  const {
    panel1ResourceKeys,
    panel2ResourceKeys,
    loadedResources,
    resourceTypeRegistry,
    navigationScope,
    currentBook,
  } = args

  const prev1KeysRef = useRef<string[]>([])
  const filteredPanel1Keys = useMemo(() => {
    const next = panel1ResourceKeys.filter((key) => {
      const scope = getResourceAppliesToScope(key, loadedResources, resourceTypeRegistry)
      if (scope !== navigationScope && scope !== null) return false
      return resourceSupportsBook(key, loadedResources, currentBook)
    })
    return stabilizeKeys(next, prev1KeysRef)
  }, [panel1ResourceKeys, navigationScope, loadedResources, resourceTypeRegistry, currentBook])

  const prev2KeysRef = useRef<string[]>([])
  const filteredPanel2Keys = useMemo(() => {
    const next = filterReadPanel2Keys({
      panel2ResourceKeys,
      loadedResources,
      resourceTypeRegistry,
      navigationScope,
      currentBook,
    })
    return stabilizeKeys(next, prev2KeysRef)
  }, [panel2ResourceKeys, navigationScope, loadedResources, resourceTypeRegistry, currentBook])

  const filteredPanel1Resources = useMemo(
    () => filteredPanel1Keys.map((key) => loadedResources[key]).filter(Boolean) as ResourceInfo[],
    [filteredPanel1Keys, loadedResources]
  )
  const filteredPanel2Resources = useMemo(
    () => filteredPanel2Keys.map((key) => loadedResources[key]).filter(Boolean) as ResourceInfo[],
    [filteredPanel2Keys, loadedResources]
  )

  return {
    filteredPanel1Keys,
    filteredPanel2Keys,
    filteredPanel1Resources,
    filteredPanel2Resources,
  }
}
