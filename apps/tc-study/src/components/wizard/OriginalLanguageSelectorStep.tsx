/**
 * Original Language Selector Step
 *
 * Allows users to select Greek and Hebrew resources for Aligned Bible texts.
 * This step is only shown when users have selected Aligned Bible resources.
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { LocationType } from '@bt-synergy/resource-catalog'
import { Book, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { useCatalog } from '../../contexts/CatalogContext'
import { door43LanguageResourceToMetadata } from '../../features/wizard/door43LanguageResourceToMetadata'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { releaseVersionOf } from '../resources/common/resourceInfoModalProps'
import { ResourceInfoModal } from '../studio/ResourceInfoModal'
import {
  OriginalLanguageResourceCard,
  type OriginalLanguageResource,
} from './OriginalLanguageResourceCard'

export function OriginalLanguageSelectorStep() {
  const { catalogManager, viewerRegistry } = useCatalog()

  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)
  const toggleResource = useWizardStore((state) => state.toggleResource)
  const availableResources = useWizardStore((state) => state.availableResources)
  const hasResourceInPackage = useWorkspaceStore((state) => state.hasResourceInPackage)

  const [greekResources, setGreekResources] = useState<OriginalLanguageResource[]>([])
  const [hebrewResources, setHebrewResources] = useState<OriginalLanguageResource[]>([])
  const [loading, setLoading] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [selectedInfoResource, setSelectedInfoResource] = useState<{
    title: string
    key: string
    owner?: string
    languageCode?: string
    subject?: string
    description?: string
    version?: string
    readme?: string
    license?: string
  } | null>(null)
  const [_fetchingInfo, setFetchingInfo] = useState(false)
  const autoSelectionDoneRef = useRef(false)

  useEffect(() => {
    loadOriginalLanguageResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enrichDoor43Resource = async (
    resource: {
      owner: string
      language: string
      id: string
      title?: string
      name?: string
      subject?: string
      ingredients?: unknown
      metadata_version?: string
      version?: string
    },
    subjectFallback: string
  ): Promise<OriginalLanguageResource> => {
    const resourceKey = `${resource.owner}/${resource.language}/${resource.id}`
    const metadata = door43LanguageResourceToMetadata(resource, subjectFallback)
    const viewer = viewerRegistry.getViewer(metadata)
    const isCached = await catalogManager.isResourceCached(resourceKey)
    const isInWorkspace = hasResourceInPackage(resourceKey)
    const viewerDef = viewerRegistry.getAllViewers().find((v) => v.component === viewer)
    return {
      ...metadata,
      isCached,
      isInWorkspace,
      isSupported: !!viewer,
      viewerName: viewerDef?.displayName,
    }
  }

  const loadOriginalLanguageResources = async () => {
    setLoading(true)
    try {
      const _alignedBibleResources = Array.from(selectedResourceKeys)
        .map((key) => availableResources.get(key))
        .filter((r) => r && (r.category === 'Aligned Bible' || r.type === 'scripture'))

      const recommendedGreek = new Set<string>(['ugnt'])
      const recommendedHebrew = new Set<string>(['uhb'])
      const door43Client = getDoor43ApiClient({ debug: true })

      const greekDoor43 = await door43Client.getResourcesByOrgAndLanguage(
        'unfoldingWord',
        'el-x-koine',
        { subjects: ['Greek New Testament'], stage: 'prod' }
      )
      const greekConverted = await Promise.all(
        greekDoor43
          .filter((resource) => resource.language === 'el-x-koine')
          .map((resource) => enrichDoor43Resource(resource, 'Greek New Testament'))
      )
      setGreekResources(greekConverted)

      const hebrewDoor43 = await door43Client.getResourcesByOrgAndLanguage(
        'unfoldingWord',
        'hbo',
        { subjects: ['Hebrew Old Testament'], stage: 'prod' }
      )
      const hebrewConverted = await Promise.all(
        hebrewDoor43
          .filter((resource) => resource.language === 'hbo')
          .map((resource) => enrichDoor43Resource(resource, 'Hebrew Old Testament'))
      )
      setHebrewResources(hebrewConverted)

      if (!autoSelectionDoneRef.current) {
        const allOriginalLangResources = [...greekConverted, ...hebrewConverted]
        allOriginalLangResources.forEach((resource) => {
          const isRecommended =
            recommendedGreek.has(resource.resourceId) ||
            recommendedHebrew.has(resource.resourceId)
          const alreadySelected = selectedResourceKeys.has(resource.resourceKey)
          if (
            (isRecommended || resource.isCached || resource.isInWorkspace) &&
            !alreadySelected &&
            resource.isSupported
          ) {
            toggleResource(resource.resourceKey, {
              ...resource,
              id: resource.resourceId,
              key: resource.resourceKey,
              category: resource.subject ?? 'scripture',
              location:
                typeof resource.locations?.[0]?.type === 'string'
                  ? resource.locations![0].type
                  : String(resource.locations?.[0]?.type ?? LocationType.NETWORK),
            } as ResourceInfo)
          }
        })
        autoSelectionDoneRef.current = true
      }
    } catch (error) {
      console.error('❌ Failed to load original language resources:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShowInfo = async (e: React.MouseEvent, resource: OriginalLanguageResource) => {
    e.stopPropagation()
    setFetchingInfo(true)
    try {
      const door43Client = getDoor43ApiClient({ debug: true })
      const loose = resource as OriginalLanguageResource & { metadata_url?: string }
      let metadataUrl = loose.metadata_url
      if (!metadataUrl && resource.owner && resource.language && resource.resourceId) {
        const repoName = `${resource.language}_${resource.resourceId}`
        metadataUrl = `https://git.door43.org/${resource.owner}/${repoName}/raw/branch/master/manifest.yaml`
      }
      let enrichedData: { readme?: string; license?: string; licenseFile?: string } = {}
      if (metadataUrl) {
        enrichedData = await door43Client.enrichResourceMetadata({
          owner: resource.owner,
          language: resource.language,
          id: resource.resourceId,
          title: resource.title,
          subject: resource.subject,
          metadata_url: metadataUrl,
        } as Parameters<typeof door43Client.enrichResourceMetadata>[0])
      }
      setSelectedInfoResource({
        key: resource.resourceKey,
        title: resource.title || resource.resourceId || resource.resourceKey,
        owner: resource.owner,
        languageCode: resource.language,
        subject: resource.subject,
        description: resource.description,
        version: releaseVersionOf(resource),
        readme: enrichedData.readme,
        license:
          typeof enrichedData.license === 'string' ? enrichedData.license : undefined,
      })
      setShowInfoModal(true)
    } catch (error) {
      console.error('Failed to fetch resource info:', error)
    } finally {
      setFetchingInfo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-4">
        {greekResources.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Book className="w-4 h-4 text-accent" />
              <span className="px-2 py-0.5 bg-muted text-fg-secondary rounded-full text-xs font-semibold">
                {greekResources.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {greekResources.map((resource) => (
                <OriginalLanguageResourceCard
                  key={resource.resourceKey}
                  resource={resource}
                  isSelected={selectedResourceKeys.has(resource.resourceKey)}
                  onToggle={toggleResource}
                  onShowInfo={handleShowInfo}
                />
              ))}
            </div>
          </div>
        )}

        {hebrewResources.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Book className="w-4 h-4 text-accent" />
              <span className="px-2 py-0.5 bg-muted text-fg-secondary rounded-full text-xs font-semibold">
                {hebrewResources.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {hebrewResources.map((resource) => (
                <OriginalLanguageResourceCard
                  key={resource.resourceKey}
                  resource={resource}
                  isSelected={selectedResourceKeys.has(resource.resourceKey)}
                  onToggle={toggleResource}
                  onShowInfo={handleShowInfo}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedInfoResource && (
        <ResourceInfoModal
          isOpen={showInfoModal}
          onClose={() => {
            setShowInfoModal(false)
            setSelectedInfoResource(null)
          }}
          resource={selectedInfoResource}
        />
      )}
    </div>
  )
}
