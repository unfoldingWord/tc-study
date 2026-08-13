import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import type { ResourceInfo } from '../../../contexts/types'

export function useResourceSelectorToggle() {
  const availableResources = useWizardStore((state) => state.availableResources)
  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)
  const toggleResource = useWizardStore((state) => state.toggleResource)
  const hasResourceInPackage = useWorkspaceStore((state) => state.hasResourceInPackage)

  const handleToggle = (key: string) => {
    const resource = availableResources.get(key)
    const isCurrentlySelected = selectedResourceKeys.has(key)

    if (isCurrentlySelected) {
      const dependentResources: string[] = []

      for (const [selectedKey, selectedResource] of availableResources.entries()) {
        if (!selectedResourceKeys.has(selectedKey)) continue

        const autoAddKeys = selectedResource.autoAddedDependencies || []
        if (autoAddKeys.includes(key)) {
          dependentResources.push(selectedKey)
        }
      }

      if (dependentResources.length > 0) {
        for (const depKey of dependentResources) {
          const depResource = availableResources.get(depKey)
          toggleResource(depKey, depResource)
        }
      }
    }

    toggleResource(key, resource)

    if (!isCurrentlySelected) {
      const autoAddKeys = resource?.autoAddedDependencies || []
      for (const depKey of autoAddKeys) {
        const depResource = availableResources.get(depKey)
        if (depResource && !selectedResourceKeys.has(depKey)) {
          toggleResource(depKey, depResource)
        }
      }
    }
  }

  const isLocked = (resource: ResourceInfo) => {
    const fullResource = availableResources.get(resource.key)
    return fullResource?.isInWorkspace || false
  }

  const isDisabled = (resource: ResourceInfo) => {
    const fullResource = availableResources.get(resource.key)
    return Boolean(fullResource?.hasDependencies && !fullResource?.dependenciesAvailable)
  }

  return { handleToggle, isLocked, isDisabled, hasResourceInPackage }
}
