/**
 * Type definitions for Package Creator Workflow
 */

export type StepId = 
  | 'language'
  | 'subjects'
  | 'resources'
  | 'metadata'
  | 'panels'
  | 'review'

export interface WorkflowStep {
  id: StepId
  title: string
  description?: string
  canSkip?: boolean
}

export interface ResourceItem {
  owner: string
  language: string
  id: string
  [key: string]: any
}

export interface WorkflowState {
  selectedLanguages: Set<string>
  selectedOrganizations: Set<string>
  selectedResources: Map<string, ResourceItem>
  availableLanguages: string[]
  availableOrganizations: string[]
  availableResources: ResourceItem[]
  packageMetadata?: {
    name: string
    version: string
    description?: string
  }
  panelLayout?: any
  [key: string]: any
}

export interface WorkflowMachineState {
  currentStep: StepId
  previousStep?: StepId
  state: WorkflowState
  history: StepId[]
}

export type WorkflowActionType =
  | 'NEXT'
  | 'PREVIOUS'
  | 'GOTO'
  | 'RESTART'
  | 'UPDATE_STATE'
  | 'TOGGLE_LANGUAGE'
  | 'TOGGLE_ORGANIZATION'
  | 'TOGGLE_RESOURCE'

export type WorkflowAction =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'GOTO'; step: StepId }
  | { type: 'RESTART' }
  | { type: 'UPDATE_STATE'; updates: Partial<WorkflowState> }
  | { type: 'TOGGLE_LANGUAGE'; code: string }
  | { type: 'TOGGLE_ORGANIZATION'; org: string }
  | { type: 'TOGGLE_RESOURCE'; resource: ResourceItem }

export { }

