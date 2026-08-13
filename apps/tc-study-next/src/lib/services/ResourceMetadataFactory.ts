/**
 * Resource Metadata Factory
 * 
 * Unified metadata creation that includes enrichment as a core part of the process.
 * Ensures README and license are always fetched and stored with consistent field names.
 * 
 * NOTE: Ingredients come directly from the Door43 catalog API response (door43Resource.ingredients),
 * not from enrichment. Each resource type's loader can extend/modify ingredients as needed.
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { Door43Resource as ApiDoor43Resource } from '@bt-synergy/door43-api'
import type { ResourceMetadata, ResourceIngredient } from '@bt-synergy/resource-catalog'
import { LocationType, ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'

/**
 * Produce catalog ingredients during metadata creation when Door43 lacks full ingredient list.
 */
export type IngredientsGenerator = (
  door43Resource: Door43Resource,
  door43Client: ReturnType<typeof getDoor43ApiClient>
) => Promise<ResourceIngredient[]>

/**
 * Door43 resource from catalog search
 */
export interface Door43Resource {
  id: string
  name: string
  title?: string
  /** DCS display abbreviation (may differ from `id`, e.g. glt → tpl). */
  abbreviation?: string
  owner: string
  language: string
  language_title?: string
  language_direction?: 'ltr' | 'rtl'
  subject: string
  version: string
  format?: string
  content_format?: string
  metadata_url?: string
  description?: string
  released?: string
  zipball_url?: string
  tarball_url?: string
  html_url?: string
  server?: string
  tag_name?: string
  branch_or_tag_name?: string
  release?: {
    tag_name?: string
    zipball_url?: string
    tarball_url?: string
    published_at?: string
    html_url?: string
  }
  ingredients?: ResourceIngredient[]
}

/**
 * Enriched data from manifest.yaml, README.md, and LICENSE files
 * 
 * NOTE: Ingredients come directly from the Door43 catalog API response (door43Resource.ingredients),
 * not from enrichment. Each resource type's loader can extend/modify ingredients as needed.
 */
interface EnrichmentData {
  readme?: string
  license?: string
  licenseFile?: string
}

/**
 * Options for metadata creation
 */
export interface MetadataCreationOptions {
  /** Whether to fetch enrichment data (README, license from manifest.yaml) */
  includeEnrichment?: boolean
  
  /** Custom resource type mapping function - can return string ID or ResourceType enum */
  getResourceType?: (subject: string, format?: string) => ResourceType | string
  
  /** Resource type registry for extensible ingredients generation */
  resourceTypeRegistry?: {
    getTypeForSubject: (subject: string) => string | undefined
    get: (typeId: string) =>
      | { ingredientsGenerator?: IngredientsGenerator }
      | undefined
  }
  
  /** Catalog adapter to check for existing metadata and mutate it instead of creating new */
  catalogAdapter?: {
    get: (resourceKey: string) => Promise<ResourceMetadata | null | undefined>
  }
  
  /** Debug logging */
  debug?: boolean
}

/**
 * Create complete ResourceMetadata from Door43 resource
 * 
 * This is the SINGLE SOURCE OF TRUTH for metadata creation.
 * Always enriches the metadata before returning (unless explicitly disabled).
 * 
 * @param door43Resource - Resource from Door43 catalog search (includes ingredients from API)
 * @param options - Creation options
 * @returns Complete ResourceMetadata with README, license, and ingredients (from catalog API)
 */
export async function createResourceMetadata(
  door43Resource: Door43Resource,
  options: MetadataCreationOptions = {}
): Promise<ResourceMetadata> {
  const {
    includeEnrichment = true,
    getResourceType,
    debug = false
  } = options
  

  
  // Step 1: Extract base metadata from Door43 resource
  // Use standard app resource key format: owner/language/resourceId (forward slashes)
  // Note: Repository names use underscores (e.g., en_tw) but resource keys use slashes
  const resourceKey = `${door43Resource.owner}/${door43Resource.language}/${door43Resource.id}`
  
  // Step 1.5: Check catalog for existing metadata (if catalog adapter provided)
  // If existing metadata has complete ingredients, return it early to avoid regenerating
  let existingMetadata: ResourceMetadata | null = null
  if (options.catalogAdapter) {
    try {
      existingMetadata = (await options.catalogAdapter.get(resourceKey)) ?? null
      if (existingMetadata) {
        const existingIngredientsCount = existingMetadata.contentMetadata?.ingredients?.length || 0
        if (existingIngredientsCount > 10) {

          // Return existing metadata if it has complete ingredients - no need to regenerate
          return existingMetadata
        }
        // existingIngredientsCount > 0 but incomplete: fall through to regenerate
      }
    } catch (error) {
      if (debug) {
        console.warn(`  ⚠️ Failed to check catalog for existing metadata:`, error)
      }
    }
  }
  
  // Step 2: Enrich with README and license from manifest.yaml (if enabled)
  // NOTE: Ingredients come from door43Resource.ingredients (catalog API), not enrichment
  let enrichmentData: EnrichmentData = {}
  
  if (includeEnrichment && door43Resource.metadata_url) {
    try {

      
      const door43Client = getDoor43ApiClient({ debug })
      enrichmentData = await door43Client.enrichResourceMetadata(
        door43Resource as ApiDoor43Resource
      )
      

    } catch (error) {
      console.warn(`  ⚠️ Enrichment failed for ${resourceKey}:`, error)
      // Continue with base metadata
    }
  }
  
  // Step 3: Determine resource type
  const resourceTypeOrId = getResourceType 
    ? getResourceType(door43Resource.subject, door43Resource.format)
    : mapSubjectToResourceType(door43Resource.subject)
  
  // Convert ResourceType enum to string ID if needed
  // getResourceType may return a string ID (from registry) or ResourceType enum (from mapSubjectToResourceType)
  let resourceTypeId: string
  let resourceTypeEnum: ResourceType
  if (typeof resourceTypeOrId === 'string') {
    resourceTypeId = resourceTypeOrId // Already a string ID from registry
    // Convert string ID back to enum for mapContentStructure
    const enumKey = resourceTypeOrId.toUpperCase() as keyof typeof ResourceType
    const mapped = ResourceType[enumKey]
    resourceTypeEnum =
      typeof mapped === 'number' || typeof mapped === 'string'
        ? (mapped as ResourceType)
        : ResourceType.UNKNOWN
  } else {
    resourceTypeEnum = resourceTypeOrId // Already an enum
    // Convert enum to string ID (e.g., ResourceType.WORDS -> "words")
    const enumKey = ResourceType[resourceTypeEnum] as keyof typeof ResourceType
    resourceTypeId = enumKey ? enumKey.toLowerCase() : 'unknown'
  }
  
  // Step 3.5: Generate ingredients if resource type has a generator
  let ingredients = door43Resource.ingredients || undefined
  
  // Debug: Log ingredients from Door43

  
  if (options.resourceTypeRegistry) {
    try {
      // Find resource type definition by subject or type ID
      const typeId = options.resourceTypeRegistry.getTypeForSubject(door43Resource.subject) || resourceTypeId
      const resourceTypeDef = options.resourceTypeRegistry.get(typeId)
      
      if (resourceTypeDef?.ingredientsGenerator) {

        
        // Create Door43ApiClient configured with the resource's server
        const server = door43Resource.server || 'git.door43.org'
        const door43Client = getDoor43ApiClient({ 
          baseUrl: server.startsWith('http') ? server : `https://${server}`,
          debug 
        })
        

        
        const generatedIngredients = await resourceTypeDef.ingredientsGenerator(door43Resource, door43Client)
        

        
        if (generatedIngredients && generatedIngredients.length > 0) {
          ingredients = generatedIngredients

          
          // If we have existing metadata, mutate it with generated ingredients instead of creating new
          if (existingMetadata) {
            if (!existingMetadata.contentMetadata) {
              existingMetadata.contentMetadata = {}
            }
            existingMetadata.contentMetadata.ingredients = generatedIngredients.map((ing) => ({
              identifier: ing.identifier,
              title: ing.title,
              path: ing.path || '',
              categories: ing.categories || []
            }))

            return existingMetadata
          }
        }
      }
    } catch (error) {
      console.warn(`  ⚠️ Ingredients generation failed for ${resourceKey}:`, error)
      if (debug) {
        console.error(`  ❌ Ingredients generation error details:`, error)
      }
      // Fall back to catalog API ingredients
    }
  }
  
  const abbreviation =
    typeof door43Resource.abbreviation === 'string' && door43Resource.abbreviation.trim()
      ? door43Resource.abbreviation.trim()
      : undefined

  // Step 4: Build complete metadata with standardized field names
  const metadata: ResourceMetadata = {
    // Identity
    resourceKey,
    resourceId: door43Resource.id,
    ...(abbreviation ? { abbreviation } : {}),
    server: door43Resource.server || 'git.door43.org',
    owner: door43Resource.owner,
    language: door43Resource.language,
    
    // Basic info
    title: door43Resource.title || door43Resource.name || door43Resource.id,
    subject: door43Resource.subject,
    version: (() => {
      // Extract version from multiple possible sources
      const version = door43Resource.version 
        || door43Resource.release?.tag_name 
        || door43Resource.branch_or_tag_name;
      
      if (!version) {
        throw new Error(
          `Resource ${resourceKey} has no version (release tag). ` +
          `Only released resources are currently supported. ` +
          `Future versions will support non-released resources using commit SHA and last updated timestamp.`
        );
      }
      return version;
    })(),
    description: door43Resource.description || '',
    
    // 🌟 STANDARDIZED ENRICHMENT FIELDS (always present, may be empty)
    readme: enrichmentData.readme || '',
    license: enrichmentData.license ? { id: enrichmentData.license } : undefined,
    licenseFile: enrichmentData.licenseFile || '',
    
    // Resource type & format
    type: resourceTypeEnum, // Use ResourceType enum
    format: mapContentFormat(door43Resource.content_format || door43Resource.format),
    contentType: getContentType(door43Resource.content_format || door43Resource.format),
    contentStructure: mapContentStructure(resourceTypeEnum),
    
    // Availability
    availability: {
      online: true,
      offline: false,
      bundled: false,
      partial: false,
    },
    
    // Locations
    locations: [{
      type: LocationType.NETWORK,
      path: `${door43Resource.server || 'git.door43.org'}/${door43Resource.owner}/${door43Resource.language}_${door43Resource.id}`,
      priority: 1,
    }],
    
    // Content metadata (ingredients, books, etc.)
    // Ingredients come from:
    // 1. Resource type's ingredientsGenerator (if defined in registry) - extensible
    // 2. Door43 catalog API response (fallback)
    contentMetadata: {
      ingredients: ingredients,
      books: ingredients?.map((i) => i.identifier),
    },
    
    // Release information (for ZIP downloads)
    release: (() => {
      const tag_name = door43Resource.release?.tag_name ?? door43Resource.tag_name
      const zipball_url =
        door43Resource.release?.zipball_url || door43Resource.zipball_url
      if (!tag_name || !zipball_url) {
        throw new Error(
          `Resource ${door43Resource.owner}/${door43Resource.id} has no release tag. ` +
            `Only released resources are currently supported. ` +
            `Future versions will support non-released resources using commit SHA and last updated timestamp.`
        )
      }
      return {
        tag_name,
        zipball_url,
        tarball_url: door43Resource.release?.tarball_url || door43Resource.tarball_url,
        published_at:
          door43Resource.release?.published_at || door43Resource.released || '',
        html_url: door43Resource.release?.html_url || door43Resource.html_url,
      }
    })(),
    
    // URLs
    urls: {
      metadata: door43Resource.metadata_url,
      repository: door43Resource.html_url,
    },
    
    // Language metadata (extended)
    languageTitle: door43Resource.language_title,
    languageName: door43Resource.language_title, // Alias for compatibility
    languageDirection: door43Resource.language_direction,
    
    // Timestamps
    catalogedAt: new Date().toISOString(),
  }
  
  return metadata
}

/**
 * Map Door43 subject to ResourceType
 */
export function mapSubjectToResourceType(subject: string): ResourceType {
  const subjectLower = subject.toLowerCase()
  
  if (subjectLower.includes('bible') || subjectLower.includes('scripture')) {
    return ResourceType.SCRIPTURE
  }
  
  if (subjectLower.includes('notes') || subjectLower.includes('tn')) {
    return ResourceType.NOTES
  }
  
  if (subjectLower.includes('questions') || subjectLower.includes('tq')) {
    return ResourceType.QUESTIONS
  }
  
  if (subjectLower.includes('words') && subjectLower.includes('links')) {
    return ResourceType.WORDS_LINKS
  }
  
  if (subjectLower.includes('words') || subjectLower.includes('tw')) {
    return ResourceType.WORDS
  }
  
  if (subjectLower.includes('academy') || subjectLower.includes('ta')) {
    return ResourceType.ACADEMY
  }
  
  return ResourceType.UNKNOWN
}

/**
 * Map content format to ResourceFormat
 */
export function mapContentFormat(format?: string): ResourceFormat {
  if (!format) return ResourceFormat.USFM
  
  const formatLower = format.toLowerCase()
  
  if (formatLower.includes('usfm')) return ResourceFormat.USFM
  if (formatLower.includes('markdown') || formatLower.includes('md')) return ResourceFormat.MARKDOWN
  if (formatLower.includes('tsv')) return ResourceFormat.TSV
  if (formatLower.includes('json')) return ResourceFormat.JSON
  if (formatLower.includes('text') || formatLower.includes('txt')) return ResourceFormat.MARKDOWN
  
  return ResourceFormat.USFM
}

/**
 * Get content MIME type from format
 */
function getContentType(format?: string): string {
  if (!format) return 'text/usfm'
  
  const formatLower = format.toLowerCase()
  
  if (formatLower.includes('usfm')) return 'text/usfm'
  if (formatLower.includes('markdown') || formatLower.includes('md')) return 'text/markdown'
  if (formatLower.includes('tsv')) return 'text/tab-separated-values'
  if (formatLower.includes('json')) return 'application/json'
  if (formatLower.includes('text') || formatLower.includes('txt')) return 'text/plain'
  
  return 'text/usfm'
}

/**
 * Map resource type to content structure
 */
function mapContentStructure(type: ResourceType): 'book' | 'entry' {
  switch (type) {
    case ResourceType.SCRIPTURE:
    case ResourceType.NOTES:
    case ResourceType.QUESTIONS:
    case ResourceType.WORDS_LINKS:
      return 'book' // Organized by Bible books
    
    case ResourceType.WORDS:
    case ResourceType.ACADEMY:
    case ResourceType.UNKNOWN:
      return 'entry' // Organized by articles/entries
    
    default:
      return 'book'
  }
}

/**
 * Batch create metadata for multiple resources
 * 
 * @param door43Resources - Array of Door43 resources
 * @param options - Creation options
 * @param onProgress - Progress callback
 * @returns Array of complete ResourceMetadata
 */
export async function createResourceMetadataBatch(
  door43Resources: Door43Resource[],
  options: MetadataCreationOptions = {},
  onProgress?: (current: number, total: number, resourceName: string) => void
): Promise<ResourceMetadata[]> {
  const results: ResourceMetadata[] = []
  
  for (let i = 0; i < door43Resources.length; i++) {
    const resource = door43Resources[i]
    
    if (onProgress) {
      onProgress(i + 1, door43Resources.length, resource.title || resource.id)
    }
    
    try {
      const metadata = await createResourceMetadata(resource, options)
      results.push(metadata)
    } catch (error) {
      console.error(`❌ Failed to create metadata for ${resource.id}:`, error)
      // Continue with other resources
    }
  }
  
  return results
}
