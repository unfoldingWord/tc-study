/**
 * Package manifest generation logic
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { DEFAULT_PACKAGE_CONFIG } from './config'
import { getDependencies, sortByDependencies } from './dependencies'
import {
    getResourceKey,
    inferResourceType,
    sortResources,
} from './resource-utils'
import { calculatePackageStats } from './statistics'
import type {
    LanguageInfo,
    PackageConfig,
    PackageManifest,
    ResourceManifestEntry,
} from './types'

export interface ManifestGeneratorOptions {
  packageId?: string
  packageName?: string
  packageDescription?: string
  packageVersion?: string
  config?: Partial<PackageConfig>
  createdBy?: string
  languageInfo?: Map<string, LanguageInfo>
}

/**
 * Generate a complete package manifest from selected resources
 */
export function generateManifest(
  resources: Door43Resource[],
  options: ManifestGeneratorOptions = {}
): PackageManifest {
  const now = new Date().toISOString()
  const sortedResources = sortResources(resources)
  
  // Convert resources to manifest entries
  const resourceEntries = sortedResources.map((resource: any) => {
    const langInfo = options.languageInfo?.get(resource.language)
    const simplifiedInfo = langInfo ? {
      name: langInfo.name,
      direction: (langInfo.direction || 'ltr') as 'ltr' | 'rtl'
    } : undefined
    return createResourceEntry(resource, simplifiedInfo)
  })
  
  // Sort by dependencies  
  const sortedEntries = sortByDependencies(resourceEntries) as typeof resourceEntries
  
  // Calculate statistics
  const stats = calculatePackageStats(sortedEntries)
  
  // Generate simple random ID
  const randomId = Math.random().toString(36).substring(2, 9)
  
  const manifest: PackageManifest = {
    formatVersion: '2.0.0',
    id: options.packageId || `pkg-${Date.now()}-${randomId}`,
    name: options.packageName || 'Untitled Package',
    description: options.packageDescription,
    version: options.packageVersion || '1.0.0',
    createdAt: now,
    updatedAt: now,
    createdBy: options.createdBy,
    resources: sortedEntries,
    config: {
      ...DEFAULT_PACKAGE_CONFIG,
      ...options.config,
    },
    stats,
  }
  
  return manifest
}

/**
 * Create a resource manifest entry from a Door43 resource
 */
export function createResourceEntry(
  resource: Door43Resource,
  languageInfo?: { name: string; direction: 'ltr' | 'rtl' }
): ResourceManifestEntry {
  const typeStr = inferResourceType(resource)
  const version = resource.release?.tag_name || resource.commit_sha?.substring(0, 7) || 'latest'
  const downloadUrl = resource.release?.zipball_url || resource.html_url || ''
  
  // Build repository URL
  const repoUrl = resource.html_url || 
    `https://git.door43.org/${resource.owner}/${resource.language}_${resource.id}`
  
  // Construct potential documentation URLs (not guaranteed to exist)
  const tag = resource.release?.tag_name || version
  const readmeUrl = resource.repo_name && tag 
    ? `https://git.door43.org/${resource.owner}/${resource.repo_name}/raw/tag/${tag}/README.md`
    : undefined
  const licenseUrl = resource.repo_name && tag
    ? `https://git.door43.org/${resource.owner}/${resource.repo_name}/raw/tag/${tag}/LICENSE.md`
    : undefined
  
  return {
    id: getResourceKey(resource),
    type: typeStr as any,
    owner: resource.owner,
    language: {
      code: resource.language,
      name: languageInfo?.name || resource.language_title || resource.language,
      direction: languageInfo?.direction || resource.language_direction || 'ltr',
      isGatewayLanguage: resource.language_is_gl,
    },
    resourceId: resource.id,
    version,
    
    download: {
      url: downloadUrl,
      format: downloadUrl.endsWith('.tar.gz') ? 'tar.gz' : 'zip',
      tarballUrl: resource.release?.tarball_url,
    },
    
    source: {
      repoUrl,
      releaseTag: resource.release?.tag_name,
      releasedAt: resource.release?.published_at,
      releaseUrl: resource.release?.html_url,
      
      // Metadata URLs from catalog (guaranteed)
      manifestUrl: resource.metadata_url,
      metadataApiUrl: resource.metadata_json_url,
      contentsApiUrl: resource.contents_url,
      
      // Documentation URLs (constructed, may not exist)
      readmeUrl,
      licenseUrl,
    },
    
    content: {
      subject: resource.subject || typeStr,
      title: resource.title || resource.name,
      description: resource.description,
      format: resource.content_format || resource.format,
      flavorType: resource.flavor_type,
      flavor: resource.flavor,
      lastUpdated: resource.released || resource.release?.published_at || new Date().toISOString(),
      books: resource.books,
      ingredients: resource.ingredients,
    },
    
    metadata: (resource.metadata_type || resource.checking_level) ? {
      type: resource.metadata_type || 'unknown',
      version: resource.metadata_version || 'unknown',
      checkingLevel: resource.checking_level,
    } : undefined,
    
    dependencies: getDependencies(resource),
  }
}

/**
 * Generate a unique package ID
 */
export function generatePackageId(
  organization?: string,
  language?: string
): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const orgCode = organization || 'custom'
  const langCode = language || 'multi'
  return `pkg-${orgCode}-${langCode}-${timestamp}-${random}`
}

/**
 * Generate a package name from statistics
 */
export function generatePackageName(stats: {
  languages: LanguageInfo[]
  organizations: string[]
  resourceCount: number
}): string {
  if (stats.languages.length === 1 && stats.organizations.length === 1) {
    return `${stats.organizations[0]} - ${stats.languages[0].name || stats.languages[0].code}`
  } else if (stats.languages.length === 1) {
    return `${stats.languages[0].name || stats.languages[0].code} - ${stats.organizations.length} Organizations`
  } else if (stats.organizations.length === 1) {
    return `${stats.organizations[0]} - ${stats.languages.length} Languages`
  } else {
    return `Multi-Language Package (${stats.languages.length} langs, ${stats.organizations.length} orgs)`
  }
}

/**
 * Infer package category from resources
 */
export function inferPackageCategory(resources: Door43Resource[]): string {
  const hasBible = resources.some(r => 
    r.subject?.includes('Bible') || ['ult', 'ust', 'glt', 'gst'].includes(r.id)
  )
  const hasNotes = resources.some(r => 
    r.subject?.includes('Translation Notes') || r.id === 'tn'
  )
  const hasQuestions = resources.some(r => 
    r.subject?.includes('Translation Questions') || r.id === 'tq'
  )
  const hasWords = resources.some(r => 
    r.subject?.includes('Translation Words') || ['tw', 'twl'].includes(r.id)
  )
  
  if (hasBible && hasNotes && hasQuestions) {
    return 'complete'
  } else if (hasBible) {
    return 'bible'
  } else if (hasNotes || hasQuestions || hasWords) {
    return 'helps'
  }
  
  return 'custom'
}
