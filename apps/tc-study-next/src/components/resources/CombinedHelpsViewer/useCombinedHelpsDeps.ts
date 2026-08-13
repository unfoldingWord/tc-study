/**
 * Catalog metadata + TN/TWL dependency readiness for CombinedHelps.
 */

import { useEffect, useState } from 'react'
import { checkDependenciesReady } from '../../../utils/resourceDependencies'

export interface UseCombinedHelpsDepsParams {
  resourceKey: string
  tnKey: string
  twlKey: string
  helpsScope: 'scripture' | 'obs'
  catalogManager: {
    getResourceMetadata: (key: string) => Promise<{ languageDirection?: 'ltr' | 'rtl' } | null | undefined>
    getAllResourceKeys: () => Promise<string[]>
  }
  resourceTypeRegistry: unknown
}

export function useCombinedHelpsDeps({
  resourceKey,
  tnKey,
  twlKey,
  helpsScope,
  catalogManager,
  resourceTypeRegistry,
}: UseCombinedHelpsDepsParams) {
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)
  const [tnDepsReady, setTnDepsReady] = useState(false)
  const [twlDepsReady, setTwlDepsReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)

  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  useEffect(() => {
    const checkCatalog = async () => {
      const keys = await catalogManager.getAllResourceKeys()
      setCatalogTrigger(keys.length)
    }
    checkCatalog()
    const interval = setInterval(checkCatalog, 5000)
    return () => clearInterval(interval)
  }, [catalogManager])

  useEffect(() => {
    if (!tnKey) {
      setTnDepsReady(true)
      return
    }
    const parts = tnKey.split('/')
    const language = parts.length >= 2 ? parts[1] : ''
    const owner = parts[0] || ''
    const tnTypeId = helpsScope === 'obs' ? 'obs-notes' : 'notes'
    checkDependenciesReady(
      tnTypeId,
      language,
      owner,
      resourceTypeRegistry as never,
      catalogManager as never,
      false
    )
      .then(setTnDepsReady)
      .catch(() => setTnDepsReady(false))
  }, [tnKey, helpsScope, catalogManager, resourceTypeRegistry, catalogTrigger])

  useEffect(() => {
    if (!twlKey) {
      setTwlDepsReady(true)
      return
    }
    const parts = twlKey.split('/')
    const owner = parts[0]
    const language = parts.length === 3 ? parts[1] : parts[1].split('_')[0]
    const twlTypeId = helpsScope === 'obs' ? 'obs-words-links' : 'words-links'
    checkDependenciesReady(
      twlTypeId,
      language,
      owner,
      resourceTypeRegistry as never,
      catalogManager as never,
      false
    )
      .then(setTwlDepsReady)
      .catch(() => setTwlDepsReady(false))
  }, [twlKey, helpsScope, catalogManager, resourceTypeRegistry, catalogTrigger])

  return {
    catalogMetadata,
    tnDepsReady,
    twlDepsReady,
    depsOk: (!tnKey || tnDepsReady) && (!twlKey || twlDepsReady),
  }
}
