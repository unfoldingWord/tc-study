/**
 * Workflow State Machine
 * 
 * Manages step transitions and state updates for the package creator wizard
 */

import {
    PACKAGE_CREATOR_STEPS,
    canProceedFromStep,
    getNextStep,
    getPreviousStep,
    getStepById
} from './steps'
import type { StepId, WorkflowAction, WorkflowMachineState } from './types'

/**
 * Create initial workflow machine state
 */
export function createInitialState(): WorkflowMachineState {
  return {
    currentStep: PACKAGE_CREATOR_STEPS[0].id,
    state: {
      selectedLanguages: new Set(),
      selectedOrganizations: new Set(),
      selectedResources: new Map(),
      availableLanguages: [],
      availableOrganizations: [],
      availableResources: [],
    },
    history: [PACKAGE_CREATOR_STEPS[0].id],
  }
}

/**
 * Workflow state machine reducer
 */
export function workflowReducer(
  machineState: WorkflowMachineState,
  action: WorkflowAction
): WorkflowMachineState {
  switch (action.type) {
    case 'NEXT': {
      const nextStep = getNextStep(machineState.currentStep, machineState.state)
      if (!nextStep) return machineState
      
      if (!canProceedFromStep(machineState.currentStep, machineState.state)) {
        return machineState // Can't proceed
      }
      
      return {
        ...machineState,
        previousStep: machineState.currentStep,
        currentStep: nextStep.id,
        history: [...machineState.history, nextStep.id],
      }
    }
    
    case 'PREVIOUS': {
      const prevStep = getPreviousStep(machineState.currentStep, machineState.state)
      if (!prevStep) return machineState
      
      return {
        ...machineState,
        previousStep: machineState.currentStep,
        currentStep: prevStep.id,
        history: [...machineState.history, prevStep.id],
      }
    }
    
    case 'GOTO': {
      const step = getStepById(action.step)
      if (!step) return machineState
      
      return {
        ...machineState,
        previousStep: machineState.currentStep,
        currentStep: action.step,
        history: [...machineState.history, action.step],
      }
    }
    
    case 'RESTART': {
      return {
        ...machineState,
        previousStep: machineState.currentStep,
        currentStep: PACKAGE_CREATOR_STEPS[0].id,
        history: [...machineState.history, PACKAGE_CREATOR_STEPS[0].id],
      }
    }
    
    case 'UPDATE_STATE': {
      return {
        ...machineState,
        state: {
          ...machineState.state,
          ...action.updates,
        },
      }
    }
    
    case 'TOGGLE_LANGUAGE': {
      const newLanguages = new Set(machineState.state.selectedLanguages)
      if (newLanguages.has(action.code)) {
        newLanguages.delete(action.code)
      } else {
        newLanguages.add(action.code)
      }
      
      return {
        ...machineState,
        state: {
          ...machineState.state,
          selectedLanguages: newLanguages,
        },
      }
    }
    
    case 'TOGGLE_ORGANIZATION': {
      const newOrgs = new Set(machineState.state.selectedOrganizations)
      if (newOrgs.has(action.org)) {
        newOrgs.delete(action.org)
      } else {
        newOrgs.add(action.org)
      }
      
      return {
        ...machineState,
        state: {
          ...machineState.state,
          selectedOrganizations: newOrgs,
        },
      }
    }
    
    case 'TOGGLE_RESOURCE': {
      const resourceKey = `${action.resource.owner}_${action.resource.language}_${action.resource.id}`
      const newResources = new Map(machineState.state.selectedResources)
      
      if (newResources.has(resourceKey)) {
        newResources.delete(resourceKey)
      } else {
        newResources.set(resourceKey, action.resource)
      }
      
      return {
        ...machineState,
        state: {
          ...machineState.state,
          selectedResources: newResources,
        },
      }
    }
    
    default:
      return machineState
  }
}

/**
 * Create workflow controller
 */
export function createWorkflowController(initialState?: WorkflowMachineState) {
  let state = initialState || createInitialState()
  const listeners: Array<(state: WorkflowMachineState) => void> = []
  
  return {
    getState: () => state,
    
    dispatch: (action: WorkflowAction) => {
      state = workflowReducer(state, action)
      listeners.forEach(listener => listener(state))
      return state
    },
    
    subscribe: (listener: (state: WorkflowMachineState) => void) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index > -1) listeners.splice(index, 1)
      }
    },
    
    // Convenience methods
    next: function() {
      state = workflowReducer(state, { type: 'NEXT' })
      listeners.forEach(listener => listener(state))
      return state
    },
    
    previous: function() {
      state = workflowReducer(state, { type: 'PREVIOUS' })
      listeners.forEach(listener => listener(state))
      return state
    },
    
    goTo: function(step: StepId) {
      state = workflowReducer(state, { type: 'GOTO', step })
      listeners.forEach(listener => listener(state))
      return state
    },
    
    restart: function() {
      state = workflowReducer(state, { type: 'RESTART' })
      listeners.forEach(listener => listener(state))
      return state
    },
    
    canProceed: () => {
      return canProceedFromStep(state.currentStep, state.state)
    },
  }
}
