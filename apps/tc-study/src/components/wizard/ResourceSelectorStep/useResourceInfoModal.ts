import { useCallback, useState } from 'react'
import type { ResourceInfo } from '../../../contexts/types'
import { enrichResourceInfoDocs } from '../../resources/common/enrichResourceInfoDocs'
import { releaseVersionOf } from '../../resources/common/resourceInfoModalProps'

interface InfoResourcePayload {
  key: string
  title: string
  owner?: string
  languageCode?: string
  subject?: string
  description?: string
  version?: string
  readme?: string
  license?: string
}

export function useResourceInfoModal() {
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [selectedInfoResource, setSelectedInfoResource] = useState<InfoResourcePayload | null>(null)
  const [fetchingInfo, setFetchingInfo] = useState(false)

  const handleShowInfo = useCallback(async (e: React.MouseEvent, resource: ResourceInfo) => {
    e.stopPropagation()
    setFetchingInfo(true)

    try {
      const enrichedData = await enrichResourceInfoDocs(resource)

      setSelectedInfoResource({
        key: resource.key,
        title: resource.title,
        owner: resource.owner,
        languageCode: resource.language,
        subject: resource.category || resource.subject,
        description: resource.description,
        version: releaseVersionOf(resource),
        readme: enrichedData.readme || resource.readme,
        license: enrichedData.license,
      })
      setShowInfoModal(true)
    } catch (error) {
      console.error('Failed to fetch resource info:', error)
    } finally {
      setFetchingInfo(false)
    }
  }, [])

  const closeInfoModal = useCallback(() => {
    setShowInfoModal(false)
    setSelectedInfoResource(null)
  }, [])

  return {
    showInfoModal,
    selectedInfoResource,
    fetchingInfo,
    handleShowInfo,
    closeInfoModal,
  }
}
