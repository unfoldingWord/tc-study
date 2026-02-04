# Storage Adapters

This directory contains storage adapters that implement the `StorageAdapter` interface for different storage backends.

## Available Adapters

### 1. DrizzleSQLiteStorageAdapter (Recommended)

**File**: `DrizzleSQLiteStorageAdapter.ts`

A modern SQLite storage adapter using Drizzle ORM that integrates with the unified database system.

**Features:**
- ✅ Full `StorageAdapter` interface compatibility
- ✅ Integrates with unified Drizzle database
- ✅ Type-safe database operations
- ✅ Transaction support with rollback
- ✅ Batch operations for performance
- ✅ Automatic storage statistics tracking
- ✅ Cache expiration management
- ✅ Comprehensive error handling
- ✅ Migration support via Drizzle

**Usage:**
```typescript
import { createDrizzleStorageAdapter } from '@/lib/services/storage/DrizzleSQLiteStorageAdapter';

// Create adapter instance
const storageAdapter = createDrizzleStorageAdapter();

// Initialize (will use existing DatabaseManager)
await storageAdapter.initialize();

// Use with ResourceManager
await resourceManager.initialize(storageAdapter, adapters);
```

### 2. ExpoSQLiteStorageAdapter (Legacy)

**File**: `ExpoSQLiteStorageAdapter.ts`

A standalone SQLite storage adapter using expo-sqlite directly.

**Features:**
- ✅ Full `StorageAdapter` interface compatibility
- ✅ Direct expo-sqlite integration
- ✅ Independent database instance
- ⚠️ Separate from unified database system

### 3. IndexedDBStorageAdapter (Web Only)

**File**: `IndexedDBStorageAdapter.ts`

A browser-based storage adapter using IndexedDB.

**Features:**
- ✅ Full `StorageAdapter` interface compatibility
- ✅ Browser-native storage
- ✅ Offline capabilities
- ⚠️ Web platform only

### 4. SQLiteStorageAdapter (Node.js Only)

**File**: `SQLiteStorageAdapter.ts`

A Node.js storage adapter using better-sqlite3.

**Features:**
- ✅ Full `StorageAdapter` interface compatibility
- ✅ File-based SQLite storage
- ✅ Perfect for testing
- ⚠️ Node.js platform only

## StorageAdapter Interface

All storage adapters implement the following interface:

```typescript
interface StorageAdapter {
  // Metadata operations
  getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]>;
  saveResourceMetadata(metadata: ResourceMetadata[]): Promise<void>;
  
  // Content operations
  getResourceContent(key: string): Promise<ResourceContent | null>;
  saveResourceContent(content: ResourceContent): Promise<void>;
  
  // Batch operations
  getMultipleContent(keys: string[]): Promise<ResourceContent[]>;
  saveMultipleContent(contents: ResourceContent[]): Promise<void>;
  
  // Transaction support
  beginTransaction(): Promise<StorageTransaction>;
  
  // Cache management
  clearExpiredContent(): Promise<void>;
  clearAllContent(): Promise<void>;
  
  // Storage info and quotas
  getStorageInfo(): Promise<StorageInfo>;
  checkQuota(): Promise<QuotaInfo>;
}
```

## Data Structures

### ResourceMetadata
Contains metadata about resources (scripture, notes, questions, etc.):
- Resource identification (id, server, owner, language, type)
- Display information (title, description, name)
- Version and availability status
- Table of contents structure
- Language metadata (direction, title, gateway language flag)
- SHA-based change detection

### ResourceContent
Contains actual content data:
- Content identification (key, resourceId, bookCode, articleId)
- Processed content data (JSON)
- Caching information (lastFetched, cachedUntil, checksum)
- Size and integrity information
- SHA-based change detection

## Migration from AsyncStorage

The `DrizzleSQLiteStorageAdapter` is designed to replace AsyncStorage-based storage with a more robust, structured approach:

### Before (AsyncStorage)
```typescript
// Simple key-value storage
await AsyncStorage.setItem('key', JSON.stringify(data));
const data = JSON.parse(await AsyncStorage.getItem('key') || '{}');
```

### After (DrizzleSQLiteStorageAdapter)
```typescript
// Structured, type-safe storage
const storageAdapter = createDrizzleStorageAdapter();
await storageAdapter.saveResourceContent(content);
const content = await storageAdapter.getResourceContent(key);
```

### Migration Benefits
1. **Type Safety**: Full TypeScript support with Drizzle ORM
2. **Performance**: Indexed queries and batch operations
3. **Reliability**: ACID transactions and data integrity
4. **Scalability**: Handles large datasets efficiently
5. **Unified Database**: Integrates with app's main database
6. **Migration Support**: Automatic schema migrations

## Integration Examples

### WorkspaceContext Integration

```typescript
// Replace ExpoSQLiteStorageAdapter with DrizzleSQLiteStorageAdapter
import { createDrizzleStorageAdapter } from '../services/storage/DrizzleSQLiteStorageAdapter';

// In initializeWorkspace function:
const storageAdapter = createDrizzleStorageAdapter();
const resourceManager = createResourceManager();

// Initialize storage (will use existing DatabaseManager)
await storageAdapter.initialize();

// Use with ResourceManager
const { processedConfig, panelConfig, anchorResource } = await initializeAppResources(
  resourceConfigs,
  { server, owner, language },
  storageAdapter, // Use Drizzle adapter
  resourceManager
);
```

### Direct Usage

```typescript
import { createDrizzleStorageAdapter } from '@/lib/services/storage/DrizzleSQLiteStorageAdapter';

const adapter = createDrizzleStorageAdapter();
await adapter.initialize();

// Save metadata
await adapter.saveResourceMetadata([metadata]);

// Get content
const content = await adapter.getResourceContent('server/owner/lang/resource/book');

// Batch operations
const contents = await adapter.getMultipleContent(keys);
await adapter.saveMultipleContent(contents);

// Transactions
const transaction = await adapter.beginTransaction();
await transaction.save(content1);
await transaction.save(content2);
await transaction.commit();

// Cache management
await adapter.clearExpiredContent();
const info = await adapter.getStorageInfo();
const quota = await adapter.checkQuota();
```

## Performance Considerations

1. **Batch Operations**: Use `saveMultipleContent` for bulk inserts
2. **Transactions**: Use transactions for atomic operations
3. **Indexes**: The schema includes optimized indexes for common queries
4. **Cache Management**: Regularly clean expired content
5. **Statistics**: Monitor storage usage with `getStorageInfo`

## Testing

All storage adapters can be tested using the same interface:

```typescript
import { createDrizzleStorageAdapter } from '@/lib/services/storage/DrizzleSQLiteStorageAdapter';

describe('DrizzleSQLiteStorageAdapter', () => {
  let adapter: DrizzleSQLiteStorageAdapter;

  beforeEach(async () => {
    adapter = createDrizzleStorageAdapter();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.deleteAllData();
    await adapter.close();
  });

  it('should save and retrieve metadata', async () => {
    await adapter.saveResourceMetadata([metadata]);
    const result = await adapter.getResourceMetadata('server', 'owner', 'lang');
    expect(result).toHaveLength(1);
  });
});
```

## Troubleshooting

### Common Issues

1. **Database Not Initialized**: Ensure `DatabaseManager.initialize()` is called before using the adapter
2. **Migration Errors**: Run `npm run db:generate` after schema changes
3. **Type Errors**: Ensure all required fields are provided in ResourceMetadata/ResourceContent
4. **Performance Issues**: Use batch operations and transactions for bulk data

### Debug Information

```typescript
// Get adapter info


// Get storage statistics
const info = await adapter.getStorageInfo();


// Get quota information
const quota = await adapter.checkQuota();

```

