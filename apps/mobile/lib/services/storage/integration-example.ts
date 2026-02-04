/**
 * Integration Example: How to replace ExpoSQLiteStorageAdapter with DrizzleSQLiteStorageAdapter
 * 
 * This file shows how to update your WorkspaceContext to use the new Drizzle-based storage adapter
 * that integrates with the unified database system.
 */

// BEFORE: Using ExpoSQLiteStorageAdapter
/*
import { createExpoSQLiteStorage } from '../services/storage/ExpoSQLiteStorageAdapter';

// In initializeWorkspace function:
const storageAdapter = createExpoSQLiteStorage('bt-synergy-workspace');
await storageAdapter.initialize();
*/

// AFTER: Using DrizzleSQLiteStorageAdapter
import { initializeAppResources } from '../resource-config';
import { createResourceManager } from '../resources/ResourceManager';
import { createDrizzleStorageAdapter } from './DrizzleSQLiteStorageAdapter';

/**
 * Example integration in WorkspaceContext
 */
export async function initializeWorkspaceWithDrizzleStorage(
  owner: string,
  language: string,
  server = 'git.door43.org',
  resourceMode: 'minimal' | 'default' | 'comprehensive' = 'default'
) {
  try {
    // Step 1: Get resource configuration
    
    const resourceConfigs = getAppResourceConfig(resourceMode);
    
    // Step 2: Initialize Drizzle storage adapter
    
    const storageAdapter = createDrizzleStorageAdapter();
    
    // The adapter will automatically use the existing DatabaseManager instance
    // No need to call storageAdapter.initialize() separately as it's handled internally
    
    // Step 3: Initialize ResourceManager
    
    const resourceManager = createResourceManager();
    
    // Step 4: Process resource configurations with Drizzle storage
    
    const { processedConfig, panelConfig, anchorResource } = await initializeAppResources(
      resourceConfigs,
      { server, owner, language },
      storageAdapter, // Now using Drizzle adapter with unified database
      resourceManager
    );
    
    
    
    return {
      storageAdapter,
      resourceManager,
      processedConfig,
      panelConfig,
      anchorResource
    };
    
  } catch (error) {
    console.error('❌ Failed to initialize workspace with Drizzle storage:', error);
    throw error;
  }
}

/**
 * Example of direct storage adapter usage
 */
export async function exampleDirectUsage() {
  const adapter = createDrizzleStorageAdapter();
  
  // Example metadata
  const metadata = {
    id: 'ult',
    server: 'git.door43.org',
    owner: 'unfoldingword',
    language: 'en',
    type: 'scripture' as const,
    title: 'Unlocked Literal Text',
    description: 'A literal translation of the Bible',
    name: 'ULT',
    version: '1.0.0',
    lastUpdated: new Date(),
    available: true,
    toc: { books: [] },
    isAnchor: true,
  };
  
  // Save metadata
  await adapter.saveResourceMetadata([metadata]);
  
  
  // Get metadata
  const retrievedMetadata = await adapter.getResourceMetadata(
    'git.door43.org',
    'unfoldingword', 
    'en'
  );
  
  
  // Example content
  const content = {
    key: 'git.door43.org/unfoldingword/en/ult/gen',
    resourceKey: 'git.door43.org/unfoldingword/en/ult',
    resourceId: 'ult',
    server: 'git.door43.org',
    owner: 'unfoldingword',
    language: 'en',
    type: 'scripture' as const,
    bookCode: 'gen',
    content: { chapters: [] }, // ProcessedContent
    lastFetched: new Date(),
    size: 1024,
  };
  
  // Save content
  await adapter.saveResourceContent(content);
  
  
  // Get content
  const retrievedContent = await adapter.getResourceContent(content.key);
  
  
  // Storage statistics
  const storageInfo = await adapter.getStorageInfo();
  
  
  const quotaInfo = await adapter.checkQuota();
  
}

/**
 * Example transaction usage
 */
export async function exampleTransactionUsage() {
  const adapter = createDrizzleStorageAdapter();
  
  // Begin transaction
  const transaction = await adapter.beginTransaction();
  
  try {
    // Save multiple content items atomically
    await transaction.save(content1);
    await transaction.save(content2);
    await transaction.save(content3);
    
    // Commit all changes
    await transaction.commit();
    
    
  } catch (error) {
    // Rollback on error
    await transaction.rollback();
    console.error('❌ Transaction rolled back:', error);
    throw error;
  }
}

/**
 * Example batch operations
 */
export async function exampleBatchOperations() {
  const adapter = createDrizzleStorageAdapter();
  
  // Batch save multiple content items
  const contents = [content1, content2, content3];
  await adapter.saveMultipleContent(contents);
  
  
  // Batch retrieve multiple content items
  const keys = contents.map(c => c.key);
  const retrievedContents = await adapter.getMultipleContent(keys);
  
}

/**
 * Example cache management
 */
export async function exampleCacheManagement() {
  const adapter = createDrizzleStorageAdapter();
  
  // Clear expired content
  await adapter.clearExpiredContent();
  
  
  // Get storage statistics after cleanup
  const storageInfo = await adapter.getStorageInfo();
  
  
  // Check if approaching quota limits
  const quotaInfo = await adapter.checkQuota();
  if (quotaInfo.nearLimit) {
    console.warn('⚠️ Storage approaching limit, consider cleanup');
    
    // Clear all content if needed (keeps metadata)
    await adapter.clearAllContent();
    
  }
}

// Declare example content objects (would be defined elsewhere)
declare const content1: any;
declare const content2: any;
declare const content3: any;
declare const getAppResourceConfig: any;

