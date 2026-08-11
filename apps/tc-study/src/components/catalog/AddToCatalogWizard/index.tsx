/**
 * Add to Catalog Wizard
 *
 * Simplified wizard for adding resources directly to the catalog
 * without workspace/panel concerns.
 */

import { LanguageSelectorStep } from '../../wizard/LanguageSelectorStep'
import { OrganizationSelectorStep } from '../../wizard/OrganizationSelectorStep'
import { OriginalLanguageSelectorStep } from '../../wizard/OriginalLanguageSelectorStep'
import { ResourceSelectorStep } from '../../wizard/ResourceSelectorStep'
import { AddToCatalogReviewStep } from './AddToCatalogReviewStep'
import { AddToCatalogWizardFooter, AddToCatalogWizardHeader } from './AddToCatalogWizardChrome'
import { useAddToCatalogWizard } from './useAddToCatalogWizard'
import type { AddToCatalogWizardProps } from './types'

export function AddToCatalogWizard({
  onClose,
  onComplete,
  isEmbedded = false,
  targetPanel = null,
}: AddToCatalogWizardProps) {
  const wizard = useAddToCatalogWizard({ onClose, onComplete, targetPanel })

  const content = (
    <>
      <AddToCatalogWizardHeader
        wizardStep={wizard.wizardStep}
        currentStepIndex={wizard.currentStepIndex}
        shouldShowOriginalLanguages={wizard.shouldShowOriginalLanguages}
        selectedResourceKeysSize={wizard.selectedResourceKeysSize}
        selectedForDownloadSize={wizard.selectedForDownload.size}
        isProcessing={wizard.isProcessing}
        onCancel={wizard.handleCancel}
      />

      <div className="flex-1 overflow-auto p-4">
        {wizard.wizardStep === 'languages' && <LanguageSelectorStep />}
        {wizard.wizardStep === 'organizations' && <OrganizationSelectorStep />}
        {wizard.wizardStep === 'resources' && <ResourceSelectorStep />}
        {wizard.wizardStep === 'original-languages' && wizard.shouldShowOriginalLanguages && (
          <OriginalLanguageSelectorStep />
        )}
        {wizard.wizardStep === 'review' && (
          <AddToCatalogReviewStep
            reviewResources={wizard.reviewResources}
            selectedForDownload={wizard.selectedForDownload}
            onSelectionChange={wizard.setSelectedForDownload}
          />
        )}
      </div>

      <AddToCatalogWizardFooter
        currentStepIndex={wizard.currentStepIndex}
        isProcessing={wizard.isProcessing}
        canProceed={wizard.canProceed}
        isLastStep={wizard.isLastStep}
        onCancel={wizard.handleCancel}
        onBack={wizard.handleBack}
        onNext={wizard.handleNext}
        onAddOnly={wizard.handleAddOnly}
        onDownload={wizard.handleDownload}
      />
    </>
  )

  if (isEmbedded) {
    return content
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  )
}

export type { AddToCatalogWizardProps } from './types'
