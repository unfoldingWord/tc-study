/**
 * Main Package Creator Component
 * Orchestrates the package creation workflow
 */

import { useState } from 'react'
import { usePackageStore } from '@/lib/store'
import { LanguageSelector } from './LanguageSelector'
import { OrganizationSelector } from './OrganizationSelector'
import { ResourceSelector } from './ResourceSelector'
import { OriginalLanguageSelector } from './OriginalLanguageSelector'
import { PackageInfoForm } from './PackageInfoForm'
import { ManifestPreview } from './ManifestPreview'
import { PackageResourceManager } from './PackageResourceManager'
import { Download, Package, Settings, Book, Plus, List } from 'lucide-react'

type Step = 'languages' | 'organizations' | 'resources' | 'original-languages' | 'info' | 'preview' | 'manage'

export function PackageCreator() {
  const [currentStep, setCurrentStep] = useState<Step>('languages')
  const [isAddingMore, setIsAddingMore] = useState(false)
  
  // Subscribe to store state for reactivity
  const selectedLanguages = usePackageStore((state) => state.selectedLanguages)
  const selectedOrganizations = usePackageStore((state) => state.selectedOrganizations)
  const selectedResources = usePackageStore((state) => state.selectedResources)
  const manifest = usePackageStore((state) => state.manifest)

  // Check if user has selected any Aligned Bible resources
  const hasAlignedBibleResources = Array.from(selectedResources.values()).some(
    r => r.subject === 'Aligned Bible'
  )

  const allSteps: { id: Step; label: string; icon: any; conditional?: boolean }[] = [
    { id: 'languages', label: 'Select Languages', icon: Package },
    { id: 'organizations', label: 'Select Organizations', icon: Settings },
    { id: 'resources', label: 'Select Resources', icon: Package },
    { id: 'original-languages', label: 'Original Languages', icon: Book, conditional: true },
    { id: 'info', label: 'Package Info', icon: Settings },
    { id: 'manage', label: 'Manage Resources', icon: List },
    { id: 'preview', label: 'Preview & Download', icon: Download },
  ]

  // Filter steps based on conditions
  const steps = allSteps.filter(step => {
    if (step.id === 'original-languages') {
      return hasAlignedBibleResources
    }
    return true
  })

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep)

  const canProceed = () => {
    if (currentStep === 'languages') return selectedLanguages.size > 0
    if (currentStep === 'organizations') return selectedOrganizations.size > 0
    if (currentStep === 'resources') return selectedResources.size > 0
    if (currentStep === 'original-languages') return true // Optional step
    if (currentStep === 'info') return manifest.name && manifest.name !== 'Untitled Package'
    if (currentStep === 'manage') return selectedResources.size > 0
    return true
  }

  const handleAddMoreResources = () => {
    setIsAddingMore(true)
    setCurrentStep('languages')
  }

  const handleBackToManage = () => {
    setIsAddingMore(false)
    setCurrentStep('manage')
  }

  const handleNext = () => {
    let nextIndex = currentStepIndex + 1
    
    // Skip original-languages step if no Aligned Bible resources and moving forward
    if (nextIndex < steps.length) {
      const nextStep = steps[nextIndex]
      
      // If moving from resources to next, check if we should skip original-languages
      if (currentStep === 'resources' && !hasAlignedBibleResources) {
        // Find the actual next step after original-languages
        const targetStep = allSteps.find((s, i) => {
          const currentIdx = allSteps.findIndex(as => as.id === currentStep)
          return i > currentIdx && s.id !== 'original-languages'
        })
        if (targetStep) {
          setCurrentStep(targetStep.id)
          return
        }
      }
      
      setCurrentStep(nextStep.id)
    }
  }

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Progress Steps */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = index < currentStepIndex
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-500 text-white'
                      : isCompleted
                      ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
                
                {index < steps.length - 1 && (
                  <div className="w-8 h-0.5 bg-gray-200 mx-2" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6 min-h-[500px]">
        {currentStep === 'languages' && (
          <div>
            {isAddingMore && selectedResources.size > 0 && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-green-900 mb-1">
                      Adding More Resources
                    </div>
                    <div className="text-sm text-green-700">
                      You have {selectedResources.size} resource(s) in your package. 
                      Select additional languages to add more resources.
                    </div>
                  </div>
                  <button
                    onClick={handleBackToManage}
                    className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-sm"
                  >
                    Back to Manage
                  </button>
                </div>
              </div>
            )}
            <LanguageSelector />
          </div>
        )}
        {currentStep === 'organizations' && <OrganizationSelector />}
        {currentStep === 'resources' && <ResourceSelector />}
        {currentStep === 'original-languages' && <OriginalLanguageSelector />}
        {currentStep === 'info' && <PackageInfoForm />}
        {currentStep === 'manage' && (
          <div>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Manage Package Resources</h2>
                  <p className="text-gray-600 mt-1">
                    Review, remove, or add more resources to your package.
                  </p>
                </div>
                <button
                  onClick={handleAddMoreResources}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add More Resources
                </button>
              </div>
            </div>
            <PackageResourceManager />
          </div>
        )}
        {currentStep === 'preview' && (
          <ManifestPreview 
            onAddMoreResources={handleAddMoreResources}
            onBackToManage={handleBackToManage}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStepIndex === 0}
          className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {selectedResources.size} resource{selectedResources.size !== 1 ? 's' : ''} selected
          </span>
          
          {currentStepIndex < steps.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
