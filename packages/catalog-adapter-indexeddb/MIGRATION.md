# IndexedDBCatalogAdapter API Migration

## ✅ Updated to Current CatalogAdapter Interface

The `IndexedDBCatalogAdapter` has been updated to match the current `CatalogAdapter` interface from `@bt-synergy/catalog-manager`.

## 🔄 Breaking Changes

### Method Renames

| Old Method | New Method | Notes |
|------------|------------|-------|
| `save(key, metadata)` | `set(resourceKey, metadata)` | Parameter renamed for clarity |
| `query(filters)` | `search(filters)` | Simpler interface |

### Return Type Changes

| Method | Old Return Type | New Return Type |
|--------|----------------|-----------------|
| `getAll()` | `Promise<Map<string, ResourceMetadata>>` | `Promise<string[]>` | Now returns only keys |

### Removed Methods

These methods were removed as they're not in the `CatalogAdapter` interface:

- ❌ `has(key): Promise<boolean>` - Use `get()` and check for null instead
- ❌ `saveMany(items): Promise<void>` - Use individual `set()` calls
- ❌ `count(): Promise<number>` - Get all keys and check length

### Type Changes

- `CatalogQuery` → `SearchFilters` (simpler, more focused interface)
- No longer extends `BaseCatalogStorageAdapter`
- Directly implements `CatalogAdapter`

## 🎯 Current CatalogAdapter Interface

```typescript
export interface CatalogAdapter {
  /** Get resource metadata */
  get(resourceKey: string): Promise<ResourceMetadata | null>
  
  /** Set resource metadata */
  set(resourceKey: string, metadata: ResourceMetadata): Promise<void>
  
  /** Search resources */
  search(filters: SearchFilters): Promise<ResourceMetadata[]>
  
  /** Delete resource metadata */
  delete(resourceKey: string): Promise<void>
  
  /** Get all resource keys */
  getAll(): Promise<string[]>
  
  /** Clear all metadata */
  clear(): Promise<void>
}
```

## 📊 SearchFilters Interface

The new `SearchFilters` is much simpler:

```typescript
export interface SearchFilters {
  /** Filter by resource type */
  type?: string
  
  /** Filter by subject */
  subject?: string
  
  /** Filter by language */
  language?: string
  
  /** Filter by owner */
  owner?: string
  
  /** Search query (title, description) */
  query?: string
  
  /** Limit results */
  limit?: number
  
  /** Offset for pagination */
  offset?: number
}
```

## 🚀 Performance Features

### IndexedDB Optimization

The adapter uses IndexedDB indexes for better performance:

- **Indexed fields**: `server`, `owner`, `language`, `resourceId`, `subject`
- **Smart querying**: Uses indexes when a single filter is provided
- **Fallback**: Full scan with filtering when multiple filters are used

### Example Usage

```typescript
// Single filter - uses index (fast!)
const englishResources = await adapter.search({ language: 'en' })

// Multiple filters - full scan with filtering
const englishScripture = await adapter.search({ 
  language: 'en', 
  subject: 'Bible' 
})

// Text search
const results = await adapter.search({ 
  query: 'translation' // searches title and description
})

// Pagination
const page2 = await adapter.search({ 
  language: 'en',
  offset: 20,
  limit: 10
})
```

## ✅ Migration Checklist

If you're updating code that uses the old API:

- [ ] Replace `save()` calls with `set()`
- [ ] Update `getAll()` usage - now returns only keys, not full metadata
- [ ] Replace `query()` calls with `search()`
- [ ] Update filter objects from `CatalogQuery` to `SearchFilters`
- [ ] Replace `has()` with `get()` + null check
- [ ] Replace `saveMany()` with individual `set()` calls or batch them yourself
- [ ] Replace `count()` with `getAll().then(keys => keys.length)`

## 🎉 Benefits

1. ✅ **Compatible with current API** - Matches the latest `CatalogAdapter` interface
2. ✅ **Web Worker compatible** - IndexedDB works in workers (unlike localStorage)
3. ✅ **Better performance** - Uses IndexedDB indexes for optimized queries
4. ✅ **Simpler interface** - Removed unnecessary complexity
5. ✅ **Type-safe** - Full TypeScript support with correct types

---

**Status**: ✅ Migration complete  
**Version**: Updated to match `@bt-synergy/catalog-manager` v0.1.0+  
**Last updated**: 2026-01-30
