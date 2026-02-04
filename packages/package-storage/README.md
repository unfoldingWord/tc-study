# @bt-synergy/package-storage

**Resource package management** - Virtual groupings of catalog resources.

> 📦 **Packages** are configurations that reference resources in the catalog.  
> 📚 **Catalog** contains the actual resource metadata and locations.

## Purpose

Manage user-defined collections of resources that can be loaded together:
- Create and organize resource packages
- Load packages by resolving resources from catalog
- Share/export packages as JSON
- Check package availability

## Installation

```bash
npm install @bt-synergy/package-storage @bt-synergy/resource-catalog
```

## Quick Start

```typescript
import { PackageManager } from '@bt-synergy/package-storage'
import { ResourceCatalog } from '@bt-synergy/resource-catalog'

// Create package manager with catalog
const catalog = new ResourceCatalog(catalogAdapter)
const packageManager = new PackageManager(packageStorage, catalog)

// Create a package
await packageManager.createPackage({
  id: 'spanish-translation-kit',
  name: 'Spanish Translation Kit',
  description: 'Resources for Spanish Bible translation',
  version: '1.0.0',
  resources: [
    {
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'es',
      resourceId: 'ult',
      required: true,
      panel: 'primary'
    },
    {
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'es',
      resourceId: 'tn',
      required: true,
      panel: 'secondary'
    }
  ],
  tags: ['spanish', 'translation', 'bible']
})

// Load package (resolves from catalog)
const result = await packageManager.loadPackage('spanish-translation-kit')

console.log('Package:', result.package.name)
console.log('Resources:', result.resources.length)
console.log('Missing:', result.missing)
```

## Core Concepts

### Package vs Catalog

**Packages** are lightweight configs with **references** to catalog entries:
```typescript
{
  id: 'my-package',
  resources: [
    'git.door43.org/unfoldingWord/es/ult',  // Just a reference!
    'git.door43.org/unfoldingWord/es/tn'
  ]
}
```

**Catalog** contains the actual metadata:
```typescript
{
  id: 'git.door43.org/unfoldingWord/es/ult',
  title: 'unfoldingWord Literal Text',
  type: 'scripture',
  availability: { offline: true, ... },
  locations: [...]
}
```

**Key**: Same resource can be in multiple packages!

## API

### Package Management

```typescript
// Create package
await packageManager.createPackage(pkg)

// Get package
const pkg = await packageManager.getPackage('package-id')

// List packages
const packages = await packageManager.listPackages({
  category: 'translation',
  tags: ['spanish']
})

// Update package
await packageManager.updatePackage('package-id', {
  name: 'New Name'
})

// Delete package
await packageManager.deletePackage('package-id')
```

### Package Loading

```typescript
// Load package (resolves resources from catalog)
const result = await packageManager.loadPackage('package-id')
// Returns: { package, resources, missing }

// Check if can load
const check = await packageManager.canLoadPackage('package-id')
// Returns: { canLoad, available, missing, missingResources }
```

### Import/Export

```typescript
// Export package as JSON
const json = await packageManager.exportPackage('package-id')

// Import package from JSON
const pkg = await packageManager.importPackage(json)
```

## Package Structure

```typescript
interface ResourcePackage {
  // Identity
  id: string
  name: string
  description?: string
  version: string
  
  // Metadata
  author?: string
  createdAt: string
  updatedAt?: string
  
  // Resource references (NOT metadata!)
  resources: PackageResource[]
  
  // UI configuration
  panelLayout?: PanelLayout
  
  // Settings
  settings?: {
    defaultServer?: string
    defaultOwner?: string
    defaultLanguage?: string
    offlineEnabled?: boolean
    autoUpdate?: boolean
  }
  
  // Organization
  tags?: string[]
  category?: string
}

interface PackageResource {
  // Catalog reference
  server: string
  owner: string
  language: string
  resourceId: string
  
  // Optional overrides
  displayName?: string
  required?: boolean
  priority?: number
  
  // UI hints
  panel?: string
  minimized?: boolean
}
```

## Storage Adapters

### Memory (Testing)

```typescript
import { MemoryPackageStorage } from '@bt-synergy/package-storage'

const storage = new MemoryPackageStorage()
const packageManager = new PackageManager(storage, catalog)
```

### IndexedDB (Web)

```typescript
import { IndexedDBPackageStorage } from '@bt-synergy/package-storage'

const storage = new IndexedDBPackageStorage({
  dbName: 'my-packages'
})
const packageManager = new PackageManager(storage, catalog)
```

### SQLite (Mobile - Future)

```typescript
import { SQLitePackageStorage } from '@bt-synergy/package-storage'

const storage = new SQLitePackageStorage({
  dbPath: './packages.db'
})
const packageManager = new PackageManager(storage, catalog)
```

## Integration Example

```typescript
import { ResourceCatalog } from '@bt-synergy/resource-catalog'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { PackageManager, IndexedDBPackageStorage } from '@bt-synergy/package-storage'

// Setup catalog
const catalog = new ResourceCatalog(
  new IndexedDBCatalogAdapter({ dbName: 'catalog' })
)

// Setup package manager
const packageManager = new PackageManager(
  new IndexedDBPackageStorage({ dbName: 'packages' }),
  catalog
)

// Load a package
const result = await packageManager.loadPackage('my-package')

// Access resolved resources
for (const resource of result.resources) {
  console.log('Resource:', resource.title)
  console.log('Available offline:', resource.availability.offline)
  console.log('Locations:', resource.locations)
}
```

## Benefits

✅ **Lightweight** - Packages are just configs  
✅ **Flexible** - Same resource in multiple packages  
✅ **Portable** - Easy to share/export  
✅ **Reusable** - Resources exist independently  
✅ **Type-safe** - Strong TypeScript support  
✅ **Platform-agnostic** - Works everywhere  

## License

MIT