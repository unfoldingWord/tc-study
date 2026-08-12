import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useCallback, useState } from 'react'
import type { ResourceInfo } from '../../../contexts/types'
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
      const door43Client = getDoor43ApiClient({ debug: true })

      let metadataUrl = (resource as ResourceInfo & { metadata_url?: string }).metadata_url
      if (!metadataUrl && resource.owner && resource.language && resource.id) {
        const repoName = `${resource.language}_${resource.id}`
        metadataUrl = `https://git.door43.org/${resource.owner}/${repoName}/raw/branch/master/manifest.yaml`
      }

      let enrichedData: { readme?: string; license?: string } = {}
      if (metadataUrl) {
        const tempResource = {
          id: resource.resourceId || resource.id || resource.key,
          name: resource.resourceId || resource.id || resource.key,
          owner: resource.owner || 'unknown',
          language: resource.language || 'en',
          subject: resource.subject || resource.category,
          metadata_url: metadataUrl,
        }
        const result = await door43Client.enrichResourceMetadata(
          tempResource as Parameters<typeof door43Client.enrichResourceMetadata>[0]
        )
        enrichedData = result || {}
      }

      setSelectedInfoResource({
        key: resource.key,
        title: resource.title,
        owner: resource.owner,
        languageCode: resource.language,
        subject: resource.category || resource.subject,
        description: resource.description,
        version: releaseVersionOf(resource),
        readme: enrichedData.readme,
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
