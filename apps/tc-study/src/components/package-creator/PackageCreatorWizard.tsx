/**
 * Package Creator Wizard - Multi-step flow for package creation
 * Minimalist adaptation from package-creator-web
 */

import {
    BookOpen,
    Building2,
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    Info,
    Languages,
    List,
    Package,
    Plus
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePackageCreatorStore } from '../../lib/stores'
import {
    LanguageSelector,
    ManageResources,
    OrganizationSelector,
    OriginalLanguageSelector,
    PackageInfoForm,
    PackagePreview,
    ResourceSelector,
} from './steps'

type Step = 
  | 'languages' 
  | 'organizations' 
  | 'resources' 
  | 'original-languages' 
  | 'info' 
  | 'manage' 
  | 'preview'

interface StepConfig {
  id: Step
  label: string
  icon: any
  conditional?: boolean
}

interface PackageCreatorWizardProps {
  onAddResources?: () => void
  onClose?: () => void
}

export function PackageCreatorWizard(props: PackageCreatorWizardProps = {}) {
  const { onAddResources, onClose: _onClose } = props
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<Step>('languages')
  
  // Subscribe to store
  const selectedLanguages = usePackageCreatorStore((state) => state.selectedLanguages)
  const selectedOrganizations = usePackageCreatorStore((state) => state.selectedOrganizations)
  const selectedResources = usePackageCreatorStore((state) => state.selectedResources)
  const manifest = usePackageCreatorStore((state) => state.manifest)
  const reset = usePackageCreatorStore((state) => state.reset)
  
  // Initialize store on mount
  useEffect(() => {
    reset()
  }, [reset])

  // Check if any selected resources are Aligned Bibles
  const hasAlignedBible = selectedResources ? Array.from(selectedResources.values()).some(
    (r) => r.subject === 'Aligned Bible'
  ) : false

  const allSteps: StepConfig[] = [
    { id: 'languages', label: 'Language', icon: Languages },
    { id: 'organizations', label: 'Organization', icon: Building2 },
    { id: 'resources', label: 'Resources', icon: Package },
    { id: 'original-languages', label: 'Original', icon: BookOpen, conditional: true },
    { id: 'info', label: 'Package Info', icon: Info },
    { id: 'manage', label: 'Manage', icon: List },
    { id: 'preview', label: 'Preview', icon: Download },
  ]

  // Filter out conditional steps
  const steps = allSteps.filter(step => {
    if (step.conditional && step.id === 'original-languages') {
      return hasAlignedBible
    }
    return true
  })

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep)

  const canProceed = () => {
    if (currentStep === 'languages') return (selectedLanguages?.size || 0) > 0
    if (currentStep === 'organizations') return (selectedOrganizations?.size || 0) > 0
    if (currentStep === 'resources') return (selectedResources?.size || 0) > 0
    if (currentStep === 'info') {
      // Require package name
      return manifest?.metadata?.title && manifest.metadata.title !== 'Untitled Package'
    }
    return true
  }

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1].id)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1].id)
    }
  }

  return (
    <div className="mx-auto max-w-5xl h-full flex flex-col">
      <div className="flex-1 flex flex-col">
        {/* Progress Steps */}
        <div className="border-b border-gray-200 px-8 py-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = currentStep === step.id
                const isCompleted = index < currentStepIndex
                const isLast = index === steps.length - 1

                return (
                  <div key={step.id} className="flex items-center">
                    <button
                      onClick={() => setCurrentStep(step.id)}
                      disabled={index > currentStepIndex}
                      className={`group flex flex-col items-center gap-2 transition-opacity ${
                        index > currentStepIndex ? 'cursor-not-allowed opacity-40' : ''
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          isActive
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : isCompleted
                            ? 'border-gray-900 bg-white text-gray-900'
                            : 'border-gray-300 bg-white text-gray-400'
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isActive
                            ? 'text-gray-900'
                            : isCompleted
                            ? 'text-gray-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>

                    {!isLast && (
                      <div
                        className={`mx-3 h-px w-12 ${
                          isCompleted ? 'bg-gray-900' : 'bg-gray-300'
                        }`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* Add Resources Button */}
            {onAddResources && (
              <button
                onClick={onAddResources}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Add resources to library"
                aria-label="Add resources to library"
                data-testid="creator-add-resources-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 p-8">
          {currentStep === 'languages' && <LanguageSelector />}
          {currentStep === 'organizations' && <OrganizationSelector />}
          {currentStep === 'resources' && <ResourceSelector />}

          {currentStep === 'original-languages' && <OriginalLanguageSelector />}

          {currentStep === 'info' && <PackageInfoForm />}
          {currentStep === 'manage' && <ManageResources />}
          {currentStep === 'preview' && <PackagePreview />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-gray-200 px-8 py-6 flex-shrink-0">
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="p-2 rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Back"
            aria-label="Go back"
            data-testid="creator-back-btn"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {selectedResources?.size || 0} resource{(selectedResources?.size || 0) !== 1 ? 's' : ''} selected
            </span>

            {currentStepIndex < steps.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="p-2 rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                title="Continue"
                aria-label="Continue to next step"
                data-testid="creator-next-btn"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/library')}
                disabled={(selectedResources?.size || 0) === 0}
                className="p-2 rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                title="Create collection"
                aria-label="Create collection"
                data-testid="creator-create-btn"
              >
                <Check className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
