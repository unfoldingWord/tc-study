# Cache System Implementation

## Overview

Two focused, composable packages for resource caching and catalog management:

### 1. @bt-synergy/resource-catalog

**Purpose**: Manage catalog of available resources (metadata only)

**Responsibilities**:
- Store/query resource metadata
- Organize by server/owner/language/resource_id
- Offline catalog support
- Catalog queries and filters
- **NO content caching** (metadata only)

**Key Files**:
- `src/ResourceCatalog.ts` - Main catalog class
- `src/types.ts` - Catalog types
- `src/storage/base.ts` - Base adapter
- `src/storage/memory.ts` - Memory adapter (testing)
- `src/storage/indexeddb.ts` - IndexedDB adapter (web)

**Usage**:
```typescript
import { ResourceCatalog } from '@bt-synergy/resource-catalog'

const catalog = new ResourceCatalog()

await catalog.addResource({
  server: 'git.door43.org',
  owner: 'unfoldingWord',
  language: 'en',
  resourceId: 'ult',
  subject: 'Bible',
  version: '1.0.0',
  title: 'unfoldingWord Literal Text',
  catalogedAt: new Date().toISOString()
})

const resources = await catalog.query({ language: 'en', subject: 'Bible' })
```

---

### 2. @bt-synergy/resource-cache

**Purpose**: Cache resource content with multi-tier strategy

**Responsibilities**:
- Multi-tier cache (memory → storage → network)
- Storage adapters (IndexedDB, SQLite, Memory)
- Cache policies (TTL, LRU, LFU, Size)
- Network security settings
- **NO catalog management** (content only)

**Key Files**:
- `src/ResourceCache.ts` - Main cache class with multi-tier strategy
- `src/types/index.ts` - Cache types
- `src/cache/MemoryCache.ts` - Fast in-memory cache
- `src/cache/policies.ts` - Eviction policies (LRU, LFU, TTL, Size)
- `src/storage/memory.ts` - Memory adapter (testing)
- `src/storage/indexeddb.ts` - IndexedDB adapter (web)

**Usage**:
```typescript
import { ResourceCache } from '@bt-synergy/resource-cache'

const cache = new ResourceCache({
  memoryMaxSize: 50 * 1024 * 1024,
  defaultTTL: 7 * 24 * 60 * 60 * 1000
})

// Set content
await cache.set('git.door43.org/unfoldingWord/en/ult', {
  type: 'text',
  content: 'Genesis 1...',
  cachedAt: new Date().toISOString()
})

// Get content (checks memory → storage → network)
const entry = await cache.get('git.door43.org/unfoldingWord/en/ult', {
  allowNetwork: true
})
```

---

## Integration Example

Using both packages together:

```typescript
import { ResourceCatalog } from '@bt-synergy/resource-catalog'
import { ResourceCache } from '@bt-synergy/resource-cache'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'

// Setup
const catalog = new ResourceCatalog()
const cache = new ResourceCache()
const api = getDoor43ApiClient()

// Configure network fetcher for cache
cache.setNetworkFetcher(async (key) => {
  const [server, owner, language, resourceId] = key.split('/')
  const content = await api.getResourceContent(owner, language, resourceId)
  return {
    type: 'text',
    content,
    cachedAt: new Date().toISOString()
  }
})

// Get resource with full fallback chain
async function getResource(server, owner, language, resourceId) {
  const key = `${server}/${owner}/${language}/${resourceId}`
  
  // 1. Check catalog for metadata
  const metadata = await catalog.get(server, owner, language, resourceId)
  if (!metadata) {
    throw new Error('Resource not in catalog')
  }
  
  // 2. Get content from cache (memory → storage → network)
  const entry = await cache.get(key, { allowNetwork: true })
  
  return {
    metadata,
    content: entry?.content,
    source: entry?.source // 'memory' | 'storage' | 'network'
  }
}
```

---

## Architecture Benefits

✅ **Single Responsibility**: Each package does ONE thing well  
✅ **Composable**: Use together or separately  
✅ **Testable**: Clear boundaries  
✅ **Flexible**: Don't need catalog? Skip it. Don't need caching? Skip it.  
✅ **Maintainable**: Easier to understand and update  
✅ **Cross-platform**: Web (IndexedDB) and Mobile (SQLite) adapters

---

## Package Comparison

| Feature | resource-catalog | resource-cache |
|---------|------------------|----------------|
| **Purpose** | Metadata management | Content caching |
| **Data** | Resource metadata only | Actual content |
| **Organization** | server/owner/language/id | Key-value |
| **Queries** | Rich filtering | Key lookup |
| **Storage** | IndexedDB, Memory | IndexedDB, Memory |
| **Network** | No | Yes (with security) |
| **Policies** | No | Yes (LRU, LFU, TTL, Size) |
| **TTL/Expiration** | No | Yes |
| **Use Case** | "What's available?" | "Get me content" |

---

## Next Steps

1. Build both packages: `cd packages/resource-catalog && pnpm build`
2. Build cache: `cd packages/resource-cache && pnpm build`
3. Integrate into tc-study app
4. Add SQLite adapters for mobile app

