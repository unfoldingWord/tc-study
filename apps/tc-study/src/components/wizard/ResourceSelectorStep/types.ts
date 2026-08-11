import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import type { ResourceDependency } from '@bt-synergy/resource-types'
import type { DependencySearchResult } from '../../../utils/comprehensiveDependencySearch'
import type { ResourceInfo } from '../../../contexts/types'

export interface ResourceWithStatus extends Omit<ResourceMetadata, 'release' | 'ingredients'> {
  isCached: boolean
  isInWorkspace: boolean
  isSupported: boolean
  viewerName?: string
  hasDependencies?: boolean
  dependenciesAvailable?: boolean
  missingDependencies?: Array<{
    dependency: ResourceDependency
    searchResult: DependencySearchResult
    displayName: string
  }>
  autoAddedDependencies?: string[]
  isAutoIncluded?: boolean
  ingredients?: ResourceInfo['ingredients']
  release?: {
    tag_name?: string
    zipball_url?: string
    tarball_url?: string
    published_at?: string
    html_url?: string
  }
  name?: string
}
