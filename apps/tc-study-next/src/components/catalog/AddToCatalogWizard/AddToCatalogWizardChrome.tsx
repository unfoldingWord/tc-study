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
      <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" />
          {selectedResourceKeysSize > 0 && (
            <span className="text-sm font-medium text-fg">{selectedResourceKeysSize}</span>
          )}
        </div>
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-border bg-surface">
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
                      ${isActive ? 'bg-accent text-white' : ''}
                      ${isComplete ? 'bg-accent text-white' : ''}
                      ${!isActive && !isComplete ? 'bg-muted text-fg-secondary' : ''}
                    `}
                    title={step.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  >
                    <StepIcon className="w-3.5 h-3.5" />
                  </div>
                  {index < WIZARD_STEPS.length - 1 &&
                    (step !== 'original-languages' || shouldShowOriginalLanguages) && (
                      <ChevronRight className="w-3 h-3 mx-0.5 text-fg-muted" />
                    )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-full">
            <Package className="w-3.5 h-3.5 text-fg-secondary" />
            <span className="text-xs font-medium text-fg">
              {wizardStep === 'review' ? selectedForDownloadSize : selectedResourceKeysSize}
            </span>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="px-4 py-2 border-b bg-accent-soft border-accent">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-accent animate-pulse" />
            <span className="text-sm font-medium text-accent-fg">Processing resources...</span>
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
      <div className="px-4 py-2 border-t border-border bg-muted">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            disabled={currentStepIndex === 0 || isProcessing}
            className="p-1.5 border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="p-1.5 text-fg-secondary hover:bg-muted rounded disabled:opacity-50 transition-colors"
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
                className="p-1.5 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="p-2 bg-muted text-white rounded hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Add to catalog (metadata only)"
                  aria-label="Add to catalog"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={onDownload}
                  disabled={!canProceed || isProcessing}
                  className="p-2 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
