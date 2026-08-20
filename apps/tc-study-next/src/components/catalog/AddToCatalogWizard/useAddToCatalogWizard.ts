import { useEffect, useState } from 'react'
import { useCatalogManager, useResourceTypeRegistry } from '../../../contexts/CatalogContext'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { addCatalogResourcesOnly, downloadCatalogResources } from './catalogWizardActions'
import type { AddToCatalogWizardProps, WizardSelectableResource, WizardStep } from './types'
import { WIZARD_STEPS } from './types'

export function useAddToCatalogWizard({
  onClose,
  onComplete,
  targetPanel = null,
}: Pick<AddToCatalogWizardProps, 'onClose' | 'onComplete' | 'targetPanel'>) {
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()

  const selectedLanguages = useWizardStore((state) => state.selectedLanguages)
  const selectedOrganizations = useWizardStore((state) => state.selectedOrganizations)
  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)
  const availableResources = useWizardStore((state) => state.availableResources)
  const currentPackage = useWorkspaceStore((state) => state.currentPackage)

  const startWizard = useWizardStore((state) => state.startWizard)
  const closeWizard = useWizardStore((state) => state.closeWizard)
  const storeSetWizardStep = useWizardStore((state) => state.setWizardStep)

  const [wizardStep, setWizardStep] = useState<WizardStep>('languages')
  const [isProcessing, setIsProcessing] = useState(false)
  const [reviewResources, setReviewResources] = useState<Map<string, WizardSelectableResource>>(new Map())
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set())

  useEffect(() => {
    startWizard('edit-workspace')
    storeSetWizardStep('languages')
  }, [startWizard, storeSetWizardStep])

  const currentStepIndex = WIZARD_STEPS.indexOf(wizardStep)

  const hasAlignedBibleResources = Array.from(selectedResourceKeys).some((key) => {
    const resource = availableResources.get(key)
    return resource?.subject?.toLowerCase().includes('aligned')
  })

  const shouldShowOriginalLanguages = hasAlignedBibleResources

  const prepareReviewStep = async () => {
    const filteredResources = new Map<string, WizardSelectableResource>()
    const toDownload = new Set<string>()

    for (const resourceKey of selectedResourceKeys) {
      const resource = availableResources.get(resourceKey) as WizardSelectableResource | undefined
      if (!resource) continue

      if (resource.isInWorkspace) {
        continue
      }

      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      const isAlreadyDownloaded = metadata?.availability?.offline === true

      if (!isAlreadyDownloaded) {
        filteredResources.set(resourceKey, resource)
        toDownload.add(resourceKey)
      }
    }

    setReviewResources(filteredResources)
    setSelectedForDownload(toDownload)
  }

  const canProceed = () => {
    switch (wizardStep) {
      case 'languages':
        return selectedLanguages.size > 0
      case 'organizations':
        return selectedOrganizations.size > 0
      case 'resources':
        return selectedResourceKeys.size > 0
      case 'original-languages':
        return true
      case 'review':
        return selectedForDownload.size > 0
      default:
        return false
    }
  }

  const handleNext = async () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= WIZARD_STEPS.length) return

    const nextStep: WizardStep = WIZARD_STEPS[nextIndex]

    if (nextStep === 'original-languages' && !shouldShowOriginalLanguages) {
      await prepareReviewStep()
      setWizardStep('review')
      return
    }

    if (nextStep === 'review') {
      await prepareReviewStep()
    }

    setWizardStep(nextStep)
    if (nextStep !== 'review') {
      storeSetWizardStep(nextStep)
    }
  }

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1

    if (wizardStep === 'review') {
      const prevStep = shouldShowOriginalLanguages ? 'original-languages' : 'resources'
      setWizardStep(prevStep)
      storeSetWizardStep(prevStep)
      return
    }

    if (WIZARD_STEPS[prevIndex] === 'original-languages' && !shouldShowOriginalLanguages) {
      const targetStep: WizardStep = WIZARD_STEPS[prevIndex - 1]
      setWizardStep(targetStep)
      if (targetStep !== 'review') {
        storeSetWizardStep(targetStep)
      }
      return
    }

    if (prevIndex >= 0) {
      const prevStep: WizardStep = WIZARD_STEPS[prevIndex]
      setWizardStep(prevStep)
      if (prevStep !== 'review') {
        storeSetWizardStep(prevStep)
      }
    }
  }

  const finishWizard = () => {
    closeWizard()
    onComplete?.()
    onClose()
  }

  const handleCancel = () => {
    if (isProcessing) {
      if (!confirm('Processing in progress. Are you sure you want to cancel?')) {
        return
      }
    }
    closeWizard()
    onClose()
  }

  const handleAddOnly = async () => {
    setIsProcessing(true)

    try {
      await addCatalogResourcesOnly({
        selectedForDownload,
        reviewResources,
        catalogManager,
        resourceTypeRegistry,
        currentPackageResources: currentPackage?.resources,
        availableResources,
        targetPanel,
      })

      setIsProcessing(false)
      finishWizard()
    } catch (error) {
      console.error('❌ Failed to add resources:', error)
      setIsProcessing(false)
      alert('Some resources failed to add. Check console for details.')
      finishWizard()
    }
  }

  const handleDownload = async () => {
    setIsProcessing(true)

    try {
      await downloadCatalogResources({
        selectedForDownload,
        reviewResources,
        catalogManager,
        resourceTypeRegistry,
        targetPanel,
      })

      setIsProcessing(false)
      finishWizard()
    } catch (error) {
      console.error('❌ Failed to add resources:', error)
      setIsProcessing(false)
      alert('Some resources failed to be added. Check console for details.')
      finishWizard()
    }
  }

  return {
    wizardStep,
    currentStepIndex,
    shouldShowOriginalLanguages,
    selectedResourceKeysSize: selectedResourceKeys.size,
    reviewResources,
    selectedForDownload,
    setSelectedForDownload,
    isProcessing,
    canProceed: canProceed(),
    isLastStep: wizardStep === 'review',
    handleCancel,
    handleBack,
    handleNext,
    handleAddOnly,
    handleDownload,
  }
}
