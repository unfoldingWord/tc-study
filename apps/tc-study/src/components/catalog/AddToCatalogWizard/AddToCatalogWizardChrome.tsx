import {
  BookOpen,
  Building2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  Package,
  Plus,
  X,
} from 'lucide-react'
import type { WizardStep } from './types'
import { WIZARD_STEPS } from './types'

interface AddToCatalogWizardHeaderProps {
  wizardStep: WizardStep
  currentStepIndex: number
  shouldShowOriginalLanguages: boolean
  selectedResourceKeysSize: number
  selectedForDownloadSize: number
  isProcessing: boolean
  onCancel: () => void
}

interface AddToCatalogWizardFooterProps {
  currentStepIndex: number
  isProcessing: boolean
  canProceed: boolean
  isLastStep: boolean
  onCancel: () => void
  onBack: () => void
  onNext: () => void
  onAddOnly: () => void
  onDownload: () => void
}

function getStepIcon(step: WizardStep) {
  switch (step) {
    case 'languages':
      return Languages
    case 'organizations':
      return Building2
    case 'resources':
      return Package
    case 'original-languages':
      return BookOpen
    case 'review':
      return CheckCircle
    default:
      return Package
  }
}

export function AddToCatalogWizardHeader({
  wizardStep,
  currentStepIndex,
  shouldShowOriginalLanguages,
  selectedResourceKeysSize,
  selectedForDownloadSize,
  isProcessing,
  onCancel,
}: AddToCatalogWizardHeaderProps) {
  return (
    <>
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-600" />
          {selectedResourceKeysSize > 0 && (
            <span className="text-sm font-medium text-gray-900">{selectedResourceKeysSize}</span>
          )}
        </div>
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {WIZARD_STEPS.map((step, index) => {
              if (step === 'original-languages' && !shouldShowOriginalLanguages) {
                return null
              }
              const isActive = wizardStep === step
              const isComplete = index < currentStepIndex
              const StepIcon = getStepIcon(step)

              return (
                <div key={step} className="flex items-center">
                  <div
                    className={`
                      p-1.5 rounded-full transition-colors
                      ${isActive ? 'bg-blue-600 text-white' : ''}
                      ${isComplete ? 'bg-green-600 text-white' : ''}
                      ${!isActive && !isComplete ? 'bg-gray-200 text-gray-600' : ''}
                    `}
                    title={step.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  >
                    <StepIcon className="w-3.5 h-3.5" />
                  </div>
                  {index < WIZARD_STEPS.length - 1 &&
                    (step !== 'original-languages' || shouldShowOriginalLanguages) && (
                      <ChevronRight className="w-3 h-3 mx-0.5 text-gray-400" />
                    )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full">
            <Package className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-xs font-medium text-gray-900">
              {wizardStep === 'review' ? selectedForDownloadSize : selectedResourceKeysSize}
            </span>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="px-4 py-2 border-b bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600 animate-pulse" />
            <span className="text-sm font-medium text-blue-900">Processing resources...</span>
          </div>
        </div>
      )}
    </>
  )
}

export function AddToCatalogWizardFooter({
  currentStepIndex,
  isProcessing,
  canProceed,
  isLastStep,
  onCancel,
  onBack,
  onNext,
  onAddOnly,
  onDownload,
}: AddToCatalogWizardFooterProps) {
  return (
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            disabled={currentStepIndex === 0 || isProcessing}
            className="p-1.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Back"
            aria-label="Go back"
            data-testid="wizard-back-btn"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="p-1.5 text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors"
              title="Cancel"
              aria-label="Cancel wizard"
              data-testid="wizard-cancel-btn"
            >
              <X className="w-4 h-4" />
            </button>

            {!isLastStep ? (
              <button
                onClick={onNext}
                disabled={!canProceed || isProcessing}
                className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next"
                aria-label="Next step"
                data-testid="wizard-next-btn"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onAddOnly}
                  disabled={!canProceed || isProcessing}
                  className="p-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Add to catalog (metadata only)"
                  aria-label="Add to catalog"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={onDownload}
                  disabled={!canProceed || isProcessing}
                  className="p-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Add to catalog and download content (continues in background)"
                  aria-label="Download resources"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}
