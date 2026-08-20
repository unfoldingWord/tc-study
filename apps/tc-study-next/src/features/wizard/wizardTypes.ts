/**
 * Ephemeral resource-selection wizard contracts.
 * Not part of workspace package SoT / persistence.
 */

import type { ResourceInfo } from '../../contexts/types'

export type WizardMode = 'load-package' | 'edit-workspace' | null
export type WizardStep =
  | 'languages'
  | 'organizations'
  | 'resources'
  | 'original-languages'
  | 'assign'
  | null

export type WizardLanguage = {
  code: string
  name: string
  /** Door43 `ang` — English/display name for empty-state copy (picker cards show `name`). */
  anglicizedName?: string
  source: 'catalog' | 'door43'
  direction?: 'ltr' | 'rtl'
}

export type WizardOrganization = {
  id: string
  username: string
  name: string
  description?: string
  avatarUrl?: string
}

export interface WizardState {
  wizardMode: WizardMode
  wizardStep: WizardStep
  selectedLanguages: Set<string>
  selectedOrganizations: Set<string>
  selectedResourceKeys: Set<string>
  /** Language catalog cache (shared with viewers; not cleared on closeWizard). */
  availableLanguages: WizardLanguage[]
  availableOrganizations: WizardOrganization[]
  availableResources: Map<string, ResourceInfo>
}

export interface WizardActions {
  startWizard: (mode: 'load-package' | 'edit-workspace') => void
  closeWizard: () => void
  setWizardStep: (step: WizardStep) => void
  toggleLanguage: (languageCode: string) => void
  toggleOrganization: (organizationName: string) => void
  toggleResource: (resourceKey: string, resourceInfo?: ResourceInfo) => void
  setAvailableLanguages: (languages: WizardLanguage[]) => void
  setAvailableOrganizations: (organizations: WizardOrganization[]) => void
  setAvailableResources: (resources: Map<string, ResourceInfo>) => void
  clearWizardSelections: () => void
}

export type WizardStore = WizardState & WizardActions

export type WizardSet = (fn: (state: WizardStore) => void) => void
export type WizardGet = () => WizardStore
