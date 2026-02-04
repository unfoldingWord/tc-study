/**
 * Collection Export Service
 * 
 * Handles exporting workspace collections as downloadable packages that can be shared.
 * Collections include:
 * - Resource metadata (minimum requirement)
 * - Panel configuration
 * - Optional: Downloaded content for offline use
 */

import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import type { ResourceInfo } from '../../contexts/types'
import type { WorkspacePackage } from '../stores/workspaceStore'

export interface CollectionManifest {
  format: 'bt-synergy-collection'
  formatVersion: '1.0.0'
  id: string
  name: string
  version: string
  description?: string
  createdAt: string
  createdBy?: string
  
  // Resource pointers (same shape as local collection)
  resources: CollectionResource[]
  
  // Panel configuration
  panelLayout: {
    panels: CollectionPanel[]
    orientation?: 'horizontal' | 'vertical'
  }
}

/**
 * Lightweight resource pointer (same as local collection)
 * All metadata lives in metadata/*.json files
 */
export interface CollectionResource {
  server: string
  owner: string
  language: string
  resourceId: string
}

export interface CollectionPanel {
  id: string
  title?: string
  resourceIds: string[]         // Base resource keys (no instance identifiers)
  defaultResourceId?: string    // Default selected resource
  minimized?: boolean
  width?: number
}

export interface ExportOptions {
  includeContent: boolean // Include downloaded content
  contentFilter?: {
    resourceKeys?: string[] // Only include content for specific resources
    books?: string[] // Only include specific books
  }
}

export class CollectionExportService {
  /**
   * Export workspace as a downloadable collection package
   */
  async exportCollection(
    workspace: WorkspacePackage,
    catalogManager: any,
    cacheAdapter: any,
    options: ExportOptions = { includeContent: false }
  ): Promise<void> {
    const zip = new JSZip()
    
    // 1. Create manifest
    const manifest = await this.createManifest(
      workspace,
      catalogManager,
      cacheAdapter,
      options
    )
    
    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    
    // 2. Add resource metadata (standardized fields)
    const metadataFolder = zip.folder('metadata')
    if (metadataFolder) {
      for (const [resourceKey, resourceInfo] of workspace.resources) {
        try {
          const metadata = await catalogManager.getResourceMetadata(resourceKey)
          if (metadata) {
            // Metadata now has standardized field names (readme, license)
            const filename = `${resourceKey.replace(/\//g, '_')}.json`
            metadataFolder.file(filename, JSON.stringify(metadata, null, 2))
          }
        } catch (error) {
          console.warn(`⚠️ Could not get metadata for ${resourceKey}:`, error)
        }
      }
    }
    
    // 3. Optionally include content
    if (options.includeContent) {
      const contentFolder = zip.folder('content')
      if (contentFolder) {
        await this.addContentToZip(
          contentFolder,
          workspace,
          cacheAdapter,
          options.contentFilter
        )
      }
    }
    
    // 4. Add README
    const readme = this.generateReadme(manifest, options.includeContent)
    zip.file('README.md', readme)
    
    // 5. Generate and download ZIP
    const blob = await zip.generateAsync({ type: 'blob' })
    const filename = `${workspace.name.replace(/\s+/g, '-').toLowerCase()}-v${workspace.version}.btc.zip`
    saveAs(blob, filename)
    
    console.log(`📦 Exported collection: ${filename}`)
  }
  
  /**
   * Create collection manifest
   * Manifest contains only:
   * - Collection metadata
   * - Resource pointers (lightweight)
   * - Panel configuration
   * 
   * All resource metadata goes in metadata/*.json files
   */
  private async createManifest(
    workspace: WorkspacePackage,
    catalogManager: any,
    cacheAdapter: any,
    options: ExportOptions
  ): Promise<CollectionManifest> {
    const resources: CollectionResource[] = []
    
    // Helper to extract base resource key (remove instance identifiers)
    const extractBaseKey = (key: string): string => key.split('#')[0]
    
    // Helper to parse resource key into components
    const parseResourceKey = (key: string): CollectionResource => {
      const baseKey = extractBaseKey(key)
      const parts = baseKey.split('/')
      return {
        server: 'https://git.door43.org', // Default, can be overridden from metadata
        owner: parts[0] || '',
        language: parts[1] || '',
        resourceId: parts[2] || '',
      }
    }
    
    for (const [resourceKey, resourceInfo] of workspace.resources) {
      try {
        const resource = parseResourceKey(resourceKey)
        
        // Use actual server from metadata if available
        const metadata = await catalogManager.getResourceMetadata(extractBaseKey(resourceKey))
        if (metadata?.server) {
          resource.server = metadata.server
        }
        
        resources.push(resource)
      } catch (error) {
        console.warn(`⚠️ Could not process resource ${resourceKey}:`, error)
      }
    }
    
    return {
      format: 'bt-synergy-collection',
      formatVersion: '1.0.0',
      id: workspace.id,
      name: workspace.name,
      version: workspace.version,
      description: workspace.description,
      createdAt: new Date().toISOString(),
      resources,
      panelLayout: {
        panels: workspace.panels.map(panel => ({
          id: panel.id,
          title: panel.name,
          resourceIds: panel.resourceKeys.map(extractBaseKey), // Strip instance identifiers
          defaultResourceId: panel.resourceKeys[panel.activeIndex] 
            ? extractBaseKey(panel.resourceKeys[panel.activeIndex])
            : undefined,
        })),
        orientation: 'horizontal' as const,
      },
    }
  }
  
  
  /**
   * Add cached content files to ZIP
   * 
   * Discovers content by querying cache for keys that start with resource key
   * Example: "unfoldingWord/en/ult" finds all chapters cached for ULT
   */
  private async addContentToZip(
    contentFolder: JSZip,
    workspace: WorkspacePackage,
    cacheAdapter: any,
    filter?: ExportOptions['contentFilter']
  ): Promise<void> {
    // Determine which resources to export
    const resourcesToExport = filter?.resourceKeys 
      ? Array.from(workspace.resources.keys()).filter(k => filter.resourceKeys!.includes(k))
      : Array.from(workspace.resources.keys())
    
    console.log(`📦 [EXPORT] Starting content export for ${resourcesToExport.length} resources`)
    
    // Get all cache keys once
    const allCacheKeys = await cacheAdapter.keys?.() || []
    console.log(`📦 [EXPORT] Total cache keys available: ${allCacheKeys.length}`)
    
    let totalFilesAdded = 0
    const BATCH_SIZE = 10 // Process 10 files at a time
    
    for (const resourceKey of resourcesToExport) {
      try {
        // Find all content for this resource
        const baseKey = resourceKey.split('#')[0] // Remove instance identifiers
        
        // Cache keys include a type prefix (e.g., "scripture:owner/lang/id:book")
        // So we need to match keys that contain the resource key after the type prefix
        const contentKeys = allCacheKeys.filter((key: string) => {
          // Match keys like "scripture:owner/lang/id:..." or "notes:owner/lang/id:..."
          return key.includes(baseKey)
        })
        
        console.log(`📦 [EXPORT] ${baseKey}: Found ${contentKeys.length} cache entries`)
        
        // Process in batches to avoid blocking the main thread
        for (let i = 0; i < contentKeys.length; i += BATCH_SIZE) {
          const batch = contentKeys.slice(i, i + BATCH_SIZE)
          
          // Process batch
          for (const cacheKey of batch) {
            const cacheEntry = await cacheAdapter.get(cacheKey)
            
            if (cacheEntry && cacheEntry.content) {
              // Convert cache key to filename: "owner/lang/id/book/chapter" -> "owner_lang_id_book_chapter.json"
              const filename = `${cacheKey.replace(/\//g, '_')}.json`
              // Store the complete cache entry (with content, metadata, timestamp, etc.)
              contentFolder.file(filename, JSON.stringify(cacheEntry, null, 2))
              totalFilesAdded++
            }
          }
          
          // Yield to the browser after each batch to prevent blocking
          if (i + BATCH_SIZE < contentKeys.length) {
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }
        
        console.log(`📦 [EXPORT] ✅ ${baseKey}: Added ${contentKeys.length} files`)
      } catch (error) {
        console.warn(`⚠️ Could not export content for ${resourceKey}:`, error)
      }
    }
    
    console.log(`📦 [EXPORT] Finished! Total files added to content folder: ${totalFilesAdded}`)
  }
  
  /**
   * Generate README file
   */
  private generateReadme(manifest: CollectionManifest, hasContent: boolean): string {
    return `# ${manifest.name}

**Version:** ${manifest.version}  
**Created:** ${new Date(manifest.createdAt).toLocaleString()}  
**Format:** BT Synergy Collection v${manifest.formatVersion}

${manifest.description ? `\n## Description\n\n${manifest.description}\n` : ''}

## Contents

### Resources (${manifest.resources.length})

${manifest.resources.map(r => `- **${r.owner}/${r.language}/${r.resourceId}**
  - Server: ${r.server}
`).join('\n')}

*Full resource metadata available in \`metadata/\` folder*

### Panels (${manifest.panelLayout.panels.length})

${manifest.panelLayout.panels.map(p => `- **${p.title || p.id}**
  - Resources: ${p.resourceIds.length}
  - Default: ${p.defaultResourceId || 'None'}
`).join('\n')}

## How to Use

1. Open BT Synergy application
2. Go to Collections → Import
3. Select this ZIP file
4. The collection will be imported with all resources and panel configurations

${hasContent ? `
## Offline Use

This collection includes downloaded content in the \`content/\` folder.
You can use these resources offline without internet connection.
` : `
## Online Required

This collection contains only metadata. Resource content will be downloaded on-demand when accessed.
An internet connection is required to load content.
`}

## Package Structure

\`\`\`
manifest.json        - Collection metadata and panel configuration
metadata/            - Full metadata for each resource (title, description, etc.)
content/             - Cached content files (if included)
README.md            - This file
\`\`\`

---

Generated by BT Synergy
`
  }
  
  /**
   * Import a collection from ZIP file
   */
  async importCollection(
    file: File,
    catalogManager: any,
    cacheAdapter: any
  ): Promise<WorkspacePackage> {
    const zip = await JSZip.loadAsync(file)
    
    // 1. Read manifest
    const manifestFile = zip.file('manifest.json')
    if (!manifestFile) {
      throw new Error('Invalid collection: missing manifest.json')
    }
    
    const manifestText = await manifestFile.async('text')
    const manifest: CollectionManifest = JSON.parse(manifestText)
    
    // 2. Import resource metadata
    const metadataFolder = zip.folder('metadata')
    if (metadataFolder) {
      for (const file of Object.values(metadataFolder.files)) {
        if (file.name.endsWith('.json') && !file.dir) {
          try {
            const content = await file.async('text')
            const metadata: ResourceMetadata = JSON.parse(content)
            await catalogManager.addResourceToCatalog(metadata)
            console.log(`✅ Imported metadata: ${metadata.title}`)
          } catch (error) {
            console.warn(`⚠️ Failed to import metadata from ${file.name}:`, error)
          }
        }
      }
    }
    
    // 3. Import content (if included)
    const contentFolder = zip.folder('content')
    if (contentFolder) {
      for (const file of Object.values(contentFolder.files)) {
        if (file.name.endsWith('.json') && !file.dir) {
          try {
            const content = await file.async('text')
            const cached = JSON.parse(content)
            const cacheKey = file.name.replace('content/', '').replace('.json', '').replace(/_/g, '/')
            await cacheAdapter.set(cacheKey, cached)
            console.log(`✅ Imported content: ${cacheKey}`)
          } catch (error) {
            console.warn(`⚠️ Failed to import content from ${file.name}:`, error)
          }
        }
      }
    }
    
    // 4. Convert to WorkspacePackage
    // Build resource map by loading metadata
    const resourcesMap = new Map()
    
    for (const resourcePointer of manifest.resources) {
      const resourceKey = `${resourcePointer.owner}/${resourcePointer.language}/${resourcePointer.resourceId}`
      
      // Try to get from catalog (already imported from metadata folder)
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      
      if (metadata) {
        // Metadata now uses standardized field names
        resourcesMap.set(resourceKey, {
          id: resourceKey,
          key: resourceKey,
          title: metadata.title || resourceKey,
          type: metadata.type || 'unknown',
          category: String(metadata.type).toLowerCase() || 'unknown',
          format: metadata.format || 'unknown',
          language: metadata.language || resourcePointer.language,
          languageCode: metadata.language || resourcePointer.language,
          languageName: metadata.languageName || '',
          owner: metadata.owner || resourcePointer.owner,
          server: metadata.server || resourcePointer.server,
          subject: metadata.subject || '',
          description: metadata.description || '',
          readme: metadata.readme || '',      // ✅ Standardized field
          license: metadata.license || '',    // ✅ Standardized field
          resourceId: metadata.resourceId || resourcePointer.resourceId,
          metadata_url: metadata.urls?.metadata || '',
        } as ResourceInfo)
      }
    }
    
    const workspace: WorkspacePackage = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      resources: resourcesMap,
      panels: manifest.panelLayout.panels.map((p, index) => ({
        id: p.id,
        name: p.title || `Panel ${index + 1}`,
        resourceKeys: p.resourceIds,
        activeIndex: p.defaultResourceId 
          ? p.resourceIds.indexOf(p.defaultResourceId)
          : 0,
        position: index,
      })),
    }
    
    console.log(`📦 Imported collection: ${manifest.name} (${manifest.resources.length} resources)`)
    
    return workspace
  }
}

// Singleton instance
export const collectionExportService = new CollectionExportService()
