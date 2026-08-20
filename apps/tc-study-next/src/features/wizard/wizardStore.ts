/**
 * Dedicated Zustand store for ephemeral resource-selection wizard UI.
 * Not persisted with workspace package layout (see workspacePersistence).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WizardStore } from './wizardTypes'

export type {
  WizardLanguage,
  WizardMode,
  WizardOrganization,
  WizardStep,
  WizardStore,
} from './wizardTypes'

export const useWizardStore = create<WizardStore>()(
  immer((set) => ({
    wizardMode: null,
    wizardStep: null,
    selectedLanguages: new Set(),
    selectedOrganizations: new Set(),
    selectedResourceKeys: new Set(),
    availableLanguages: [],
    availableOrganizations: [],
    availableResources: new Map(),

    startWizard: (mode) => {
      set((state) => {
        state.wizardMode = mode
        state.wizardStep = 'languages'
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
      })
    },

    closeWizard: () => {
      set((state) => {
        state.wizardMode = null
        state.wizardStep = null
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
        // Keep availableLanguages — App/viewers use it as a language catalog cache.
        state.availableOrganizations = []
        state.availableResources = new Map()
      })
    },

    setWizardStep: (step) => {
      set((state) => {
        state.wizardStep = step
      })
    },

    toggleLanguage: (languageCode) => {
      set((state) => {
        const next = new Set(state.selectedLanguages)
        if (next.has(languageCode)) next.delete(languageCode)
        else next.add(languageCode)
        state.selectedLanguages = next
      })
    },

    toggleOrganization: (organizationName) => {
      set((state) => {
        const next = new Set(state.selectedOrganizations)
        if (next.has(organizationName)) next.delete(organizationName)
        else next.add(organizationName)
        state.selectedOrganizations = next
      })
    },

    toggleResource: (resourceKey, resourceInfo) => {
      set((state) => {
        const next = new Set(state.selectedResourceKeys)
        if (next.has(resourceKey)) {
          next.delete(resourceKey)
        } else {
          next.add(resourceKey)
          if (resourceInfo && !state.availableResources.has(resourceKey)) {
            state.availableResources.set(resourceKey, resourceInfo)
          }
        }
        state.selectedResourceKeys = next
      })
    },

    setAvailableLanguages: (languages) => {
      set((state) => {
        state.availableLanguages = languages
      })
    },

    setAvailableOrganizations: (organizations) => {
      set((state) => {
        state.availableOrganizations = organizations
      })
    },

    setAvailableResources: (resources) => {
      set((state) => {
        state.availableResources = resources
      })
    },

    clearWizardSelections: () => {
      set((state) => {
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
      })
    },
  }))
)
