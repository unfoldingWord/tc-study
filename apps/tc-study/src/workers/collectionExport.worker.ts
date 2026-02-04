/**
 * Collection Export Worker
 * 
 * Handles collection export in a background thread with direct IndexedDB access.
 * This prevents UI blocking by reading cache data and generating ZIP entirely in the worker.
 */

import JSZip from 'jszip'

// Message types
export interface ExportWorkerMessage {
  type: 'export'
  data: {
    collection: {
      id: string
      name: string
      version: string
      description?: string
      resources: Array<{
        server?: string
        owner: string
        language: string
        resourceId: string
      }>
      panelLayout?: {
        panels: Array<{
          id: string
          title?: string
          resourceIds: string[]
          defaultResourceId?: string
        }>
      }
    }
    dbConfig: {
      dbName: string
      storeName: string
      version?: number
    }
  }
}

export interface ExportWorkerResponse {
  type: 'progress' | 'complete' | 'error'
  data?: {
    progress?: number
    total?: number
    message?: string
    blob?: Blob
    filename?: string
    error?: string
  }
}

// Worker message handler
self.onmessage = async (event: MessageEvent<ExportWorkerMessage>) => {
  const { type, data } = event.data

  if (type === 'export') {
    try {
      console.log('[Export Worker] Starting export...')
      await exportCollection(data)
    } catch (error) {
      console.error('[Export Worker] Export failed:', error)
      const response: ExportWorkerResponse = {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
      self.postMessage(response)
    }
  }
}

/**
 * Open IndexedDB connection in worker
 */
async function openCacheDatabase(config: ExportWorkerMessage['data']['dbConfig']): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.dbName, config.version || 1)
    
    request.onerror = () => {
      console.error('[Export Worker] Failed to open IndexedDB:', request.error)
      reject(new Error(`Failed to open database: ${request.error?.message || 'Unknown error'}`))
    }
    
    request.onsuccess = () => {
      console.log('[Export Worker] IndexedDB connection opened successfully')
      resolve(request.result)
    }
    
    request.onblocked = () => {
      console.warn('[Export Worker] IndexedDB connection blocked')
    }
  })
}

/**
 * Read cache entries in batches using cursor for memory efficiency
 */
async function* readCacheEntriesInBatches(
  db: IDBDatabase,
  storeName: string,
  resourceKeys: string[],
  batchSize: number = 100
): AsyncGenerator<Array<{ key: string; entry: any }>, void, unknown> {
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  
  let batch: Array<{ key: string; entry: any }> = []
  let totalRead = 0
  
  return new Promise((resolve, reject) => {
    const request = store.openCursor()
    
    request.onerror = () => {
      console.error('[Export Worker] Cursor error:', request.error)
      reject(new Error(`Cursor error: ${request.error?.message || 'Unknown error'}`))
    }
    
    request.onsuccess = async (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      
      if (cursor) {
        const storageKey = cursor.key as string
        const storageValue = cursor.value
        
        // Extract the actual cache key from storage format
        // Storage format: { key: "cacheKey", entry: {...} }
        const cacheKey = storageValue.key || storageKey
        const cacheEntry = storageValue.entry || storageValue
        
        // Check if this cache entry is relevant to our export
        const isRelevant = resourceKeys.some(resourceKey => {
          const baseKey = resourceKey.split('#')[0]
          return cacheKey.includes(baseKey)
        })
        
        if (isRelevant && cacheEntry) {
          batch.push({ key: cacheKey, entry: cacheEntry })
          totalRead++
          
          // Yield batch when it reaches the batch size
          if (batch.length >= batchSize) {
            const batchToYield = batch
            batch = []
            
            // We need to return the generator, but we're in a callback
            // So we'll process batches synchronously within the cursor loop
            try {
              await processBatch(batchToYield)
            } catch (error) {
              reject(error)
              return
            }
          }
        }
        
        cursor.continue()
      } else {
        // Cursor exhausted - yield remaining batch
        if (batch.length > 0) {
          try {
            await processBatch(batch)
          } catch (error) {
            reject(error)
            return
          }
        }
        
        console.log(`[Export Worker] Finished reading ${totalRead} relevant cache entries`)
        resolve()
      }
    }
  })
  
  // This function will be defined in the calling context
  async function processBatch(batchData: Array<{ key: string; entry: any }>): Promise<void> {
    // This is a placeholder - actual processing happens in exportCollection
    return Promise.resolve()
  }
}

/**
 * Main export function
 */
async function exportCollection(config: ExportWorkerMessage['data']): Promise<void> {
  const { collection, dbConfig } = config
  
  // Report initial progress
  self.postMessage({
    type: 'progress',
    data: {
      progress: 0,
      total: 100,
      message: 'Opening cache database...'
    }
  } as ExportWorkerResponse)
  
  // Open IndexedDB connection
  let db: IDBDatabase
  try {
    // Check if IndexedDB is available in worker
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in Web Worker context')
    }
    
    db = await openCacheDatabase(dbConfig)
    
    // Verify we can actually access the store
    try {
      const tx = db.transaction(dbConfig.storeName, 'readonly')
      const store = tx.objectStore(dbConfig.storeName)
      // Try to open a cursor to ensure the store is accessible
      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor()
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (storeError) {
      db.close()
      throw new Error(`Cache store is not accessible: ${storeError instanceof Error ? storeError.message : 'Unknown error'}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Export Worker] IndexedDB access failed:', errorMessage)
    
    // Send error with specific flag indicating fallback is needed
    throw new Error(
      `Worker cannot access IndexedDB: ${errorMessage}. ` +
      `This may be due to browser security restrictions or private browsing mode. ` +
      `A fallback export method is required.`
    )
  }
  
  // Create ZIP
  const zip = new JSZip()
  
  // Build resource keys for filtering
  const resourceKeys = collection.resources.map(r => 
    `${r.owner}/${r.language}/${r.resourceId}`
  )
  
  console.log(`[Export Worker] Exporting ${resourceKeys.length} resources`)
  
  // 1. Create manifest
  const manifest = {
    format: 'bt-synergy-collection',
    formatVersion: '1.0.0',
    id: collection.id,
    name: collection.name,
    version: collection.version,
    description: collection.description,
    createdAt: new Date().toISOString(),
    resources: collection.resources.map(r => ({
      server: r.server || 'git.door43.org',
      owner: r.owner,
      language: r.language,
      resourceId: r.resourceId
    })),
    panelLayout: collection.panelLayout || { panels: [] }
  }
  
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  
  // 2. Add metadata folder (resource metadata from collection)
  const metadataFolder = zip.folder('metadata')
  if (metadataFolder) {
    for (const resource of collection.resources) {
      const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
      const filename = `${resourceKey.replace(/\//g, '_')}.json`
      metadataFolder.file(filename, JSON.stringify(resource, null, 2))
    }
  }
  
  // 3. Read cache entries and add to ZIP progressively
  self.postMessage({
    type: 'progress',
    data: {
      progress: 10,
      total: 100,
      message: 'Reading cached content...'
    }
  } as ExportWorkerResponse)
  
  const contentFolder = zip.folder('content')
  if (!contentFolder) {
    throw new Error('Failed to create content folder in ZIP')
  }
  
  let entriesProcessed = 0
  const encoder = new TextEncoder()
  
  // Use streaming approach: buffer entries per resource, flush to ZIP when buffer is full
  const MAX_ENTRIES_PER_FILE = 50 // Smaller chunks to reduce memory pressure
  const resourceBuffers = new Map<string, Array<{ key: string; entry: any }>>()
  const resourceFileCounters = new Map<string, number>()
  
  for (const resourceKey of resourceKeys) {
    resourceBuffers.set(resourceKey, [])
    resourceFileCounters.set(resourceKey, 0)
  }
  
  // Helper to flush a resource buffer to ZIP
  const flushResourceBuffer = (resourceKey: string, buffer: Array<{ key: string; entry: any }>) => {
    if (buffer.length === 0) return
    
    const resourceName = resourceKey.replace(/\//g, '_')
    const fileCounter = resourceFileCounters.get(resourceKey) || 0
    const filename = fileCounter > 0 
      ? `${resourceName}_part${fileCounter + 1}.json`
      : `${resourceName}.json`
    
    const cacheData: Record<string, any> = {}
    for (const { key, entry } of buffer) {
      cacheData[key] = entry
    }
    
    const jsonString = JSON.stringify(cacheData)
    const binaryData = encoder.encode(jsonString)
    contentFolder.file(filename, binaryData)
    
    resourceFileCounters.set(resourceKey, fileCounter + 1)
    console.log(`[Export Worker] Flushed ${buffer.length} entries for ${resourceKey}`)
  }
  
  // Read and stream cache entries to ZIP
  const tx = db.transaction(dbConfig.storeName, 'readonly')
  const store = tx.objectStore(dbConfig.storeName)
  
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor()
    
    request.onerror = () => reject(request.error)
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      
      if (cursor) {
        const storageValue = cursor.value
        const cacheKey = storageValue.key || (cursor.key as string)
        const cacheEntry = storageValue.entry || storageValue
        
        // Find which resource this entry belongs to
        for (const resourceKey of resourceKeys) {
          const baseKey = resourceKey.split('#')[0]
          if (cacheKey.includes(baseKey)) {
            const buffer = resourceBuffers.get(resourceKey)
            if (buffer) {
              buffer.push({ key: cacheKey, entry: cacheEntry })
              entriesProcessed++
              
              // Flush buffer when it reaches max size (memory management)
              if (buffer.length >= MAX_ENTRIES_PER_FILE) {
                flushResourceBuffer(resourceKey, buffer)
                buffer.length = 0 // Clear buffer
              }
              
              // Report progress every 100 entries
              if (entriesProcessed % 100 === 0) {
                self.postMessage({
                  type: 'progress',
                  data: {
                    progress: entriesProcessed,
                    total: resourceKeys.length,
                    message: `Processing entries...`
                  }
                } as ExportWorkerResponse)
              }
            }
            break
          }
        }
        
        cursor.continue()
      } else {
        // Flush remaining buffers
        for (const [resourceKey, buffer] of resourceBuffers.entries()) {
          flushResourceBuffer(resourceKey, buffer)
        }
        
        console.log(`[Export Worker] Processed ${entriesProcessed} cache entries`)
        
        if (entriesProcessed === 0) {
          reject(new Error(
            'Export failed: No content files were added to the archive. ' +
            `Processed ${resourceKeys.length} resources but found no cached content. ` +
            'Please ensure all resources are fully downloaded before exporting.'
          ))
          return
        }
        
        resolve()
      }
    }
  })
  
  // Report file creation complete
  const totalFiles = Array.from(resourceFileCounters.values()).reduce((sum, count) => sum + count, 0)
  console.log(`[Export Worker] Created ${totalFiles} archive files containing ${entriesProcessed} cache entries`)
  
  // Close database connection
  db.close()
  
  // 4. Add README
  const readme = generateReadme(manifest, true)
  zip.file('README.md', readme)
  
  // 5. Generate ZIP blob
  self.postMessage({
    type: 'progress',
    data: {
      progress: 80,
      total: 100,
      message: 'Generating ZIP file...'
    }
  } as ExportWorkerResponse)
  
  console.log('[Export Worker] Generating ZIP file...')
  
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  
  const filename = `${collection.name.replace(/\s+/g, '-').toLowerCase()}-v${collection.version}.btc.zip`
  
  console.log('[Export Worker] Export complete!')
  
  // Send blob back to main thread
  self.postMessage({
    type: 'complete',
    data: {
      blob,
      filename
    }
  } as ExportWorkerResponse)
}

/**
 * Generate README content
 */
function generateReadme(manifest: any, hasContent: boolean): string {
  return `# ${manifest.name}

**Version:** ${manifest.version}  
**Created:** ${new Date(manifest.createdAt).toLocaleString()}  
**Format:** BT Synergy Collection v${manifest.formatVersion}

${manifest.description ? `\n## Description\n\n${manifest.description}\n` : ''}

## Contents

### Resources (${manifest.resources.length})

${manifest.resources.map((r: any) => `- **${r.owner}/${r.language}/${r.resourceId}**
  - Server: ${r.server}
`).join('\n')}

*Full resource metadata available in \`metadata/\` folder*

### Panels (${manifest.panelLayout.panels.length})

${manifest.panelLayout.panels.map((p: any) => `- **${p.title || p.id}**
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
