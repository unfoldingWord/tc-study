import type { ResourceInfo } from '../../../contexts/types'
import type { Door43Resource } from '../../../lib/services/ResourceMetadataFactory'
import type { WizardStep as StoreWizardStep } from '../../../features/wizard/wizardTypes'

/** Local flow includes review; store WizardStep does not. */
export type WizardStep = Exclude<StoreWizardStep, 'assign' | null> | 'review'

export type WizardSelectableResource = Omit<ResourceInfo, 'release' | 'ingredients'> & {
  isInWorkspace?: boolean
  release?: Door43Resource['release']
  name?: string
  id?: string
  html_url?: string
  released?: string
  zipball_url?: string
  tarball_url?: string
  metadata_url?: string
  description?: string
  ingredients?: Array<{
    identifier: string
    title?: string
    path?: string
    size?: number
    categories?: string[]
    sort?: number
    alignmentCount?: number
    alignment_count?: number
    versification?: string
    exists?: boolean
    isDir?: boolean
    is_dir?: boolean
  }>
}

export interface AddToCatalogWizardProps {
  onClose: () => void
  onComplete?: () => void
  isEmbedded?: boolean
  targetPanel?: 'panel-1' | 'panel-2' | null
}

export const WIZARD_STEPS: WizardStep[] = [
  'languages',
  'organizations',
  'resources',
  'original-languages',
  'review',
]
