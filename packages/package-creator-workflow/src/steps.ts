/**
 * Package Creator Workflow Steps
 */

import type { StepId, WorkflowState, WorkflowStep } from './types'

export const PACKAGE_CREATOR_STEPS: WorkflowStep[] = [
  {
    id: 'language',
    title: 'Select Language',
    description: 'Choose the language for your package'
  },
  {
    id: 'subjects',
    title: 'Select Subjects',
    description: 'Choose the subjects (books) to include'
  },
  {
    id: 'resources',
    title: 'Select Resources',
    description: 'Choose the resources to include'
  },
  {
    id: 'metadata',
    title: 'Package Metadata',
    description: 'Enter package information'
  },
  {
    id: 'panels',
    title: 'Configure Panels',
    description: 'Set up panel layout',
    canSkip: true
  },
  {
    id: 'review',
    title: 'Review & Create',
    description: 'Review your selections and create the package'
  }
]

export function getStepById(stepId: StepId): WorkflowStep | undefined {
  return PACKAGE_CREATOR_STEPS.find(step => step.id === stepId)
}

export function getStepIndex(stepId: StepId): number {
  return PACKAGE_CREATOR_STEPS.findIndex(step => step.id === stepId)
}

export function getNextStep(currentStepId: StepId, _state?: WorkflowState): WorkflowStep | null {
  const currentIndex = getStepIndex(currentStepId)
  if (currentIndex === -1 || currentIndex >= PACKAGE_CREATOR_STEPS.length - 1) {
    return null
  }
  return PACKAGE_CREATOR_STEPS[currentIndex + 1]
}

export function getPreviousStep(currentStepId: StepId, _state?: WorkflowState): WorkflowStep | null {
  const currentIndex = getStepIndex(currentStepId)
  if (currentIndex <= 0) {
    return null
  }
  return PACKAGE_CREATOR_STEPS[currentIndex - 1]
}

export function canProceedFromStep(stepId: StepId, state: WorkflowState): boolean {
  switch (stepId) {
    case 'language':
      return state.selectedLanguages.size > 0
    case 'subjects':
      return state.selectedOrganizations.size > 0
    case 'resources':
      return state.selectedResources.size > 0
    case 'metadata':
      return !!state.packageMetadata?.name && !!state.packageMetadata?.version
    case 'panels':
      return true // Optional step
    case 'review':
      return true
    default:
      return false
  }
}

export { }

