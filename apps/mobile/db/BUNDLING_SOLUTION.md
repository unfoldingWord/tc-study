# Drizzle ORM Bundling Issue Solution

## Problem

The original Drizzle setup was causing a bundling error in React Native/Expo:

```
Unable to resolve "../logger.cjs" from "node_modules\drizzle-orm\expo-sqlite\driver.cjs"
```

This error occurred because:
1. `drizzle-orm/expo-sqlite/migrator` has dependencies that don't bundle well in React Native
2. The migration system expects Node.js-style file system access
3. Some Drizzle ORM modules use CommonJS imports that conflict with React Native bundling

## Solution

We implemented a **two-tier approach** to resolve the bundling issues while maintaining full functionality:

### 1. Simplified DatabaseManager

**File**: `db/DatabaseManager.ts`

**Changes Made:**
- ✅ Removed `drizzle-orm/expo-sqlite/migrator` import
- ✅ Replaced `migrate()` function with manual table creation
- ✅ Used raw SQL `CREATE TABLE IF NOT EXISTS` statements
- ✅ Kept Drizzle ORM for type-safe queries
- ✅ Added `ensureTables()` method for schema initialization

**Benefits:**
- No bundling conflicts
- Still uses Drizzle for queries
- Automatic table creation on first run
- Compatible with React Native/Expo

### 2. Simplified Storage Adapter

**File**: `lib/services/storage/SimplifiedDrizzleStorageAdapter.ts`

**Features:**
- ✅ Full `StorageAdapter` interface compatibility
- ✅ Uses `DatabaseManager.getSqliteDb()` for raw SQL queries
- ✅ Avoids complex Drizzle ORM features that cause bundling issues
- ✅ Maintains type safety for data structures
- ✅ Supports transactions, batch operations, and all required methods

**Why This Approach:**
- Raw SQL queries are more reliable in React Native
- No dependency on Drizzle's advanced query builder
- Still benefits from unified database architecture
- Full compatibility with existing `StorageAdapter` interface

## Implementation Details

### Database Schema Creation

Instead of migrations, we use direct SQL table creation:

```typescript
// OLD (caused bundling issues)
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
await migrate(db, { migrationsFolder: './db/migrations' });

// NEW (works in React Native)
await this.sqliteDb.execAsync(`
  CREATE TABLE IF NOT EXISTS resource_metadata (
    resource_key TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    server TEXT NOT NULL,
    // ... rest of schema
  );
`);
```

### Storage Adapter Usage

```typescript
// OLD (ExpoSQLiteStorageAdapter)
const storageAdapter = createExpoSQLiteStorage('bt-synergy-workspace');

// NEW (SimplifiedDrizzleStorageAdapter)
const storageAdapter = createSimplifiedDrizzleStorageAdapter();
```

### Query Execution

```typescript
// Uses raw SQL for reliability
const rows = await db.getAllAsync(
  'SELECT * FROM resource_metadata WHERE server = ? AND owner = ? AND language = ?',
  [server, owner, language]
);

// Still maintains type safety
const metadata: ResourceMetadata[] = rows.map(row => ({
  id: row.id,
  server: row.server,
  // ... properly typed conversion
}));
```

## Files Modified

1. **`db/DatabaseManager.ts`**
   - Removed migration imports
   - Added `ensureTables()` method
   - Uses raw SQL for table creation

2. **`lib/services/storage/SimplifiedDrizzleStorageAdapter.ts`**
   - New storage adapter using raw SQL
   - Full `StorageAdapter` interface implementation
   - Integrates with unified database

3. **`lib/contexts/WorkspaceContext.tsx`**
   - Updated to use `SimplifiedDrizzleStorageAdapter`
   - Maintains same initialization pattern

## Benefits of This Solution

### ✅ Resolves Bundling Issues
- No more `logger.cjs` import errors
- Compatible with React Native bundler
- Works with Expo development and production builds

### ✅ Maintains Functionality
- Full `StorageAdapter` interface compatibility
- All storage operations work as expected
- Transaction support and batch operations
- Storage statistics and quota management

### ✅ Unified Database Architecture
- Still uses single database for all app data
- Integrates with existing `DatabaseManager`
- Compatible with other database services

### ✅ Type Safety
- Maintains TypeScript type safety
- Proper data structure conversion
- Interface compatibility with existing code

### ✅ Performance
- Raw SQL queries are often faster
- No ORM overhead for simple operations
- Optimized for mobile performance

## Migration Path

### For Existing Projects

1. **Update imports:**
   ```typescript
   // Replace this
   import { createExpoSQLiteStorage } from '../services/storage/ExpoSQLiteStorageAdapter';
   
   // With this
   import { createSimplifiedDrizzleStorageAdapter } from '../services/storage/SimplifiedDrizzleStorageAdapter';
   ```

2. **Update initialization:**
   ```typescript
   // Replace this
   const storageAdapter = createExpoSQLiteStorage('bt-synergy-workspace');
   
   // With this
   const storageAdapter = createSimplifiedDrizzleStorageAdapter();
   ```

3. **No other changes needed** - the interface is identical!

### For New Projects

Simply use `SimplifiedDrizzleStorageAdapter` from the start:

```typescript
import { createSimplifiedDrizzleStorageAdapter } from '@/lib/services/storage/SimplifiedDrizzleStorageAdapter';

const storageAdapter = createSimplifiedDrizzleStorageAdapter();
await storageAdapter.initialize();
```

## Future Considerations

### When Drizzle ORM Fixes Bundling Issues

If future versions of Drizzle ORM resolve the React Native bundling issues, we can:

1. **Keep the current solution** (recommended for stability)
2. **Gradually migrate** to full Drizzle ORM features
3. **Hybrid approach** - use Drizzle for complex queries, raw SQL for simple ones

### Adding New Features

- **New tables**: Add to `ensureTables()` method in `DatabaseManager`
- **New queries**: Add methods to `SimplifiedDrizzleStorageAdapter`
- **Complex operations**: Can still use Drizzle ORM where it works

## Testing

The solution has been tested to ensure:
- ✅ No bundling errors in development
- ✅ Compatible with Expo builds
- ✅ All storage operations work correctly
- ✅ Type safety maintained
- ✅ Performance is acceptable

## Conclusion

This solution provides the **best of both worlds**:
- **Reliability**: No bundling issues, works in all React Native environments
- **Functionality**: Full storage adapter capabilities with unified database
- **Maintainability**: Clean, well-documented code with type safety
- **Performance**: Optimized for mobile with efficient SQL queries

The `SimplifiedDrizzleStorageAdapter` is now the **recommended storage solution** for React Native apps using this architecture.

