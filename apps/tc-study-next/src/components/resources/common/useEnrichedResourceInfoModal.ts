import { useEffect, useState } from 'react'
import type { ResourceInfo } from '../../../contexts/types'
import { enrichResourceInfoDocs } from './enrichResourceInfoDocs'
import { toResourceInfoModalProps } from './resourceInfoModalProps'

export type ResourceInfoModalResource = ReturnType<typeof toResourceInfoModalProps>

type EnrichmentState = {
  key: string
  docs: { readme?: string; license?: string }
  done: boolean
}

/**
 * Open ResourceInfo immediately from ResourceInfo, then async-fill README
 * via Door43 when the package/catalog copy lacks it.
 */
export function useEnrichedResourceInfoModal(source: ResourceInfo | null): {
  modalResource: ResourceInfoModalResource | null
  loadingBody: boolean
} {
  const base = source ? toResourceInfoModalProps(source) : null
  const sourceKey = base?.key ?? null
  const hasReadme = Boolean(base?.readme?.trim())

  const [enrichment, setEnrichment] = useState<EnrichmentState | null>(null)

  useEffect(() => {
    if (!source || !sourceKey) {
      setEnrichment(null)
      return
    }

    if (hasReadme) {
      setEnrichment({ key: sourceKey, docs: {}, done: true })
      return
    }

    let cancelled = false
    setEnrichment({ key: sourceKey, docs: {}, done: false })

    void (async () => {
      const docs = await enrichResourceInfoDocs(source)
      if (cancelled) return
      setEnrichment({ key: sourceKey, docs, done: true })
    })()

    return () => {
      cancelled = true
    }
  }, [source, sourceKey, hasReadme])

  if (!base || !sourceKey) {
    return { modalResource: null, loadingBody: false }
  }

  const matched = enrichment?.key === sourceKey ? enrichment : null
  const docs = matched?.docs
  const loadingBody = !hasReadme && !matched?.done

  return {
    modalResource: {
      ...base,
      readme: base.readme?.trim() ? base.readme : docs?.readme,
      license: base.license?.trim() ? base.license : docs?.license || base.license,
    },
    loadingBody,
  }
}
