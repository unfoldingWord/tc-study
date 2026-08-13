/**
 * Resource Selector Step - Refactored with DRY principles
 *
 * Second step in the resource addition wizard.
 * Searches catalog and Door43 for resources in selected languages.
 * Filters by supported resource types (ViewerRegistry).
 */

import { Book, Languages, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { SelectableGrid } from '../../shared/SelectableGrid'
import { ResourceInfoModal } from '../../studio/ResourceInfoModal'
import { ResourceSelectorGridItem } from './ResourceSelectorGridItem'
import { useResourceInfoModal } from './useResourceInfoModal'
import { useResourceSelectorLoad, useResourceSelectorToggle } from './useResourceSelectorLoad'

export function ResourceSelectorStep() {
  const selectedLanguages = useWizardStore((state) => state.selectedLanguages)
  const availableLanguages = useWizardStore((state) => state.availableLanguages)
  const availableOrganizations = useWizardStore((state) => state.availableOrganizations)
  const availableResources = useWizardStore((state) => state.availableResources)
  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)

  const { isLoading } = useResourceSelectorLoad()
  const { handleToggle, isLocked, isDisabled } = useResourceSelectorToggle()
  const { showInfoModal, selectedInfoResource, fetchingInfo, handleShowInfo, closeInfoModal } =
    useResourceInfoModal()

  const orgNameMap = useMemo(
    () => new Map(availableOrganizations.map((org) => [org.username, org.name])),
    [availableOrganizations]
  )
  const langNameMap = useMemo(
    () => new Map(availableLanguages.map((lang) => [lang.code, lang.name])),
    [availableLanguages]
  )

  const resourcesArray = Array.from(availableResources.entries()).map(([, resource]) => resource)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (selectedLanguages.size === 0) {
    return (
      <div className="text-center py-20">
        <Languages className="w-16 h-16 mx-auto text-fg-muted" />
      </div>
    )
  }

  return (
    <div>
      {resourcesArray.length === 0 ? (
        <div className="text-center py-12">
          <Book className="w-12 h-12 mx-auto text-fg-muted" />
        </div>
      ) : (
        <SelectableGrid
          items={resourcesArray}
          selected={selectedResourceKeys}
          isLocked={isLocked}
          isDisabled={isDisabled}
          onToggle={handleToggle}
          getKey={(resource) => resource.key}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          renderItem={(resource, _isSelected, isResourceDisabled) => {
            const fullResource = availableResources.get(resource.key)
            const orgName = orgNameMap.get(resource.owner || '') || resource.owner || 'Unknown'
            const langName = langNameMap.get(resource.language || '') || resource.language || 'Unknown'

            return (
              <ResourceSelectorGridItem
                resource={resource}
                isResourceDisabled={isResourceDisabled}
                orgName={orgName}
                langName={langName}
                fullResource={fullResource}
                fetchingInfo={fetchingInfo}
                onShowInfo={handleShowInfo}
              />
            )
          }}
        />
      )}

      {selectedInfoResource && (
        <ResourceInfoModal
          isOpen={showInfoModal}
          onClose={closeInfoModal}
          resource={selectedInfoResource}
        />
      )}
    </div>
  )
}
