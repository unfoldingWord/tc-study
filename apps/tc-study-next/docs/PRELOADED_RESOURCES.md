# Preloaded Resources Framework

A scalable framework for bundling resource metadata with your application, enabling instant availability of resources while keeping the app lightweight through on-demand content loading.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Adding New Preloaded Resources](#adding-new-preloaded-resources)
- [Supporting New Resource Types](#supporting-new-resource-types)
- [Extending the System](#extending-the-system)
- [Developer Guide](#developer-guide)
- [API Reference](#api-reference)

---

## Architecture Overview

The preloaded resources system consists of three layers:

### 1. **Build-Time Layer** (Metadata Generation)
```
Door43 API → generate-preloaded-resources.mjs → JSON files
```
- Fetches resource metadata from Door43 catalog API
- Extracts essential metadata (title, owner, language, ingredients)
- Generates `manifest.json` and individual resource metadata files
- **Key Feature**: Only metadata is bundled, not content (~KB vs MB/GB)

### 2. **Runtime Layer** (Metadata Loading)
```
JSON files → PreloadedResourcesLoader → CatalogManager + WorkspaceStore
```
- Loads bundled metadata at application startup
- Adds resources to catalog for discoverability
- Automatically adds to workspace collection for immediate access
- **Key Feature**: No network calls required for initial resource list

### 3. **On-Demand Layer** (Content Fetching)
```
User opens resource → ScriptureLoader → Door43 raw content → Parsed & cached
```
- Content fetched only when user accesses a specific book
- Uses `ingredients` metadata to construct correct file paths
- Implements 3-tier caching (memory → IndexedDB → network)
- **Key Feature**: Progressive loading keeps app responsive

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  BUILD TIME                                                  │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Door43 API │───▶│ Build Script │───▶│ JSON Bundles │   │
│  └────────────┘    └──────────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  RUNTIME (App Startup)                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ JSON Bundles │───▶│   Loader     │───▶│   Catalog    │ │
│  └──────────────┘    │   Module     │    │  + Workspace │ │
│                      └──────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  USER INTERACTION                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ User Opens   │───▶│ Content      │───▶│  Rendered    │ │
│  │ Resource     │    │ Fetcher      │    │  in Panel    │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### For End Users

Preloaded resources are automatically available when you first launch the app:
- **UGNT** - Greek New Testament (27 books)
- **UHB** - Hebrew Bible (39 books)
- **ULT** - Literal Text (50 books)
- **UST** - Simplified Text (49 books)

These appear in your workspace collection sidebar immediately, ready to drag into panels.

### For Developers

To regenerate the preloaded metadata (e.g., when resources are updated):

```bash
cd apps/tc-study
node scripts/generate-preloaded-resources.mjs
```

This fetches the latest metadata from Door43 and updates the bundled files.

---

## Adding New Preloaded Resources

### Step 1: Update the Build Script

Edit `apps/tc-study/scripts/generate-preloaded-resources.mjs`:

```javascript
const TARGET_RESOURCES = [
  // Existing resources
  { repoName: 'el-x-koine_ugnt', title: 'Greek New Testament' },
  { repoName: 'hbo_uhb', title: 'Hebrew Bible' },
  { repoName: 'en_ult', title: 'Literal Text' },
  { repoName: 'en_ust', title: 'Simplified Text' },
  
  // Add your new resources
  { repoName: 'en_tn', title: 'Translation Notes' },
  { repoName: 'en_tw', title: 'Translation Words' },
];
```

**Finding the `repoName`:**
- Go to https://git.door43.org/unfoldingWord
- Find the resource repository (e.g., `en_tn`)
- The repo name format is always `{language}_{resourceId}`

### Step 2: Generate the Metadata

```bash
node scripts/generate-preloaded-resources.mjs
```

This will:
1. Fetch metadata from Door43 API
2. Extract `resourceId` from `repoName`
3. Generate `manifest.json` with correct `resourceKey` format
4. Save individual JSON files to `public/preloaded/`

### Step 3: Verify the Output

Check `apps/tc-study/public/preloaded/`:
- ✅ New JSON file exists: `unfoldingWord_{lang}_{repoName}.json`
- ✅ `manifest.json` includes the new resource
- ✅ ResourceKey format is correct: `unfoldingWord/{lang}/{resourceId}`

### Step 4: Test in the App

1. Clear browser storage (DevTools → Application → Clear site data)
2. Refresh the app
3. Check the sidebar - your new resource should appear
4. Drag it to a panel to test on-demand content loading

---

## Supporting New Resource Types

To add support for a new resource type (e.g., Translation Questions, Study Notes):

### Step 1: Create a Resource Loader

Create a new loader in `packages/` following the pattern:

```typescript
// packages/questions-loader/src/QuestionsLoader.ts
import { ResourceLoader, ResourceMetadata } from '@bt-synergy/resource-catalog'

export class QuestionsLoader implements ResourceLoader {
  id = 'questions'
  supportedTypes = ['questions']
  
  async loadContent(resourceKey: string, identifier: string): Promise<ProcessedQuestions> {
    // 1. Get metadata from catalog
    const metadata = await this.catalogAdapter.get(resourceKey)
    
    // 2. Find ingredient for this identifier (e.g., book code)
    const ingredient = metadata.contentMetadata?.ingredients?.find(
      ing => ing.identifier === identifier
    )
    
    // 3. Fetch raw content from Door43 using ingredient.path
    const rawContent = await this.door43Client.fetchTextContent(
      metadata.owner,
      `${metadata.language}_${metadata.resourceId}`,
      ingredient.path
    )
    
    // 4. Parse and return structured content
    return this.parseQuestions(rawContent, identifier)
  }
  
  async isOfflineAvailable(resourceKey: string): Promise<boolean> {
    // Check if content is cached
    return await this.cacheAdapter.has(resourceKey)
  }
}
```

### Step 2: Register the Resource Type

In `packages/resource-types/src/index.ts`:

```typescript
import { ResourceType } from '@bt-synergy/resource-types'
import { QuestionsLoader } from '@bt-synergy/questions-loader'
import { QuestionsViewer } from './components/QuestionsViewer'

export const questionsResourceType: ResourceTypeDefinition = {
  id: 'questions',
  name: 'Translation Questions',
  description: 'Comprehension and checking questions',
  supportedSubjects: ['Translation Questions'],
  loader: QuestionsLoader,
  viewer: QuestionsViewer,
  features: ['search', 'navigation', 'export'],
  category: 'helps',
}
```

### Step 3: Register in the App

In `apps/tc-study/src/contexts/CatalogContext.tsx`:

```typescript
import { questionsResourceType } from '@bt-synergy/resource-types'

// Register in the initialization effect
useEffect(() => {
  // ... existing registrations
  resourceTypeRegistry.register(questionsResourceType)
  loaderRegistry.register(questionsResourceType.id, new QuestionsLoader(/* ... */))
  viewerRegistry.register(questionsResourceType)
}, [])
```

### Step 4: Create a Viewer Component

Create `QuestionsViewer.tsx`:

```typescript
import { ResourceViewerProps } from '@bt-synergy/resource-types'

export function QuestionsViewer({ resourceId, resourceKey }: ResourceViewerProps) {
  const { data, loading, error } = useQuestions(resourceKey)
  
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorDisplay error={error} />
  
  return (
    <div className="questions-viewer">
      {data?.questions.map(q => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </div>
  )
}
```

### Step 5: Add to Preloaded Resources

Follow the steps in [Adding New Preloaded Resources](#adding-new-preloaded-resources) to bundle the metadata.

---

## Extending the System

### Adding More Panels

The system supports dynamic panel management. To add more panels:

#### Via UI:
Users can add panels through the workspace interface (already implemented).

#### Programmatically:

```typescript
import { useWorkspaceStore } from './lib/stores/workspaceStore'

function MyCustomLayout() {
  const addPanel = useWorkspaceStore(state => state.addPanel)
  
  const createThreePanelLayout = () => {
    addPanel('Scripture')
    addPanel('Notes')
    addPanel('Questions')
  }
  
  return <button onClick={createThreePanelLayout}>3-Panel Layout</button>
}
```

### Custom Workspace Configurations

Create preset workspace configurations:

```typescript
// lib/workspacePresets.ts
export const workspacePresets = {
  translatorBasic: {
    panels: [
      { id: 'panel-1', resources: ['unfoldingWord/en/ult'] },
      { id: 'panel-2', resources: ['unfoldingWord/en/ust'] },
    ]
  },
  
  translatorAdvanced: {
    panels: [
      { id: 'panel-1', resources: ['unfoldingWord/el-x-koine/ugnt'] },
      { id: 'panel-2', resources: ['unfoldingWord/en/ult'] },
      { id: 'panel-3', resources: ['unfoldingWord/en/ust'] },
      { id: 'panel-4', resources: ['unfoldingWord/en/tn'] },
    ]
  },
  
  checkerWorkspace: {
    panels: [
      { id: 'panel-1', resources: ['unfoldingWord/en/ult'] },
      { id: 'panel-2', resources: ['gateway-language/xyz/glt'] }, // User's translation
      { id: 'panel-3', resources: ['unfoldingWord/en/tq'] },
    ]
  },
}

// Apply a preset
function loadPreset(presetName: string) {
  const preset = workspacePresets[presetName]
  // Create panels and load resources
}
```

### Custom Resource Sources

To support resources from sources other than Door43:

```typescript
// lib/customResourceSource.ts
export class CustomResourceSource {
  async fetchMetadata(resourceId: string) {
    // Fetch from your custom API
    const response = await fetch(`https://your-api.com/resources/${resourceId}`)
    return response.json()
  }
  
  async generatePreloadedBundle() {
    const resources = await this.fetchMetadata('all')
    // Convert to manifest format
    const manifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      resources: resources.map(r => ({
        resourceKey: `${r.org}/${r.language}/${r.id}`,
        name: r.title,
        filename: `${r.org}_${r.language}_${r.id}.json`
      }))
    }
    // Save files
  }
}
```

---

## Developer Guide

### Project Structure

```
apps/tc-study/
├── scripts/
│   └── generate-preloaded-resources.mjs    # Build-time metadata generation
├── public/
│   └── preloaded/
│       ├── manifest.json                    # List of all preloaded resources
│       └── *.json                           # Individual resource metadata files
├── src/
│   ├── lib/
│   │   └── preloadedResources.ts           # Runtime loader
│   ├── contexts/
│   │   └── CatalogContext.tsx              # Initialization & registration
│   └── components/
│       └── wizard/
│           ├── ResourceSelectorStep.tsx     # Shows resources with status icons
│           └── OriginalLanguageSelectorStep.tsx

packages/
├── catalog-manager/
│   └── src/CatalogManager.ts               # Resource catalog & metadata storage
├── scripture-loader/
│   └── src/ScriptureLoader.ts              # On-demand content fetching
└── resource-types/
    └── src/                                 # Resource type definitions & registry
```

### Key Concepts

#### 1. **ResourceKey Format**
Always use the format: `{owner}/{language}/{resourceId}`
```typescript
// ✅ Correct
'unfoldingWord/en/ult'
'unfoldingWord/el-x-koine/ugnt'

// ❌ Wrong (duplicated language)
'unfoldingWord/el-x-koine/el-x-koine_ugnt'
```

#### 2. **Ingredients**
Ingredients are the key to on-demand downloading:
```typescript
interface Ingredient {
  identifier: string    // e.g., 'gen', 'mat' (book code)
  title: string        // e.g., 'Genesis', 'Matthew'
  path: string         // e.g., '01-GEN.usfm' (file path in repo)
  size?: number
  sort?: number
}
```

The loader uses `ingredients` to construct the correct URL for fetching individual books:
```
https://git.door43.org/{owner}/{repoName}/raw/branch/master/{ingredient.path}
```

#### 3. **Three-Tier Caching**
```typescript
Memory Cache (Map) → IndexedDB Cache → Network (Door43)
         ↑                  ↑                 ↑
      Instant           Fast (~10ms)    Slow (~500ms+)
```

#### 4. **Resource Status**
Resources can have multiple states:
- 🟣 **In Collection** (metadata in workspace)
- 🟢 **Cached** (full content downloaded)
- 🔵 **Online** (available from Door43)

### Common Tasks

#### Task: Add a new language's resources

1. Update the build script:
```javascript
const TARGET_RESOURCES = [
  // ... existing
  { repoName: 'fr_ult', title: 'French Literal Text' },
  { repoName: 'fr_ust', title: 'French Simplified Text' },
];
```

2. Regenerate: `node scripts/generate-preloaded-resources.mjs`
3. Commit the new JSON files in `public/preloaded/`

#### Task: Change which resources are preloaded

Edit the `TARGET_RESOURCES` array in the build script, then regenerate.

#### Task: Update preloaded resources to latest versions

Simply run the build script again - it fetches the latest metadata from Door43:
```bash
node scripts/generate-preloaded-resources.mjs
```

#### Task: Debug resource loading issues

1. Enable debug mode in `ScriptureLoader`:
```typescript
const loader = new ScriptureLoader(catalogAdapter, door43Client, cacheAdapter, {
  debug: true  // Logs all fetch operations
})
```

2. Check browser console for:
   - ✅ Resource cataloging logs
   - 📥 Content fetch logs
   - ⚠️ Error messages with file paths

---

## API Reference

### PreloadedResourcesLoader

```typescript
class PreloadedResourcesLoader {
  constructor(catalogManager: CatalogManager)
  
  /**
   * Load all preloaded resources from bundled JSON files
   * @param addToWorkspace - Callback to add resources to workspace collection
   * @returns Statistics (success, skipped, failed counts)
   */
  async loadAll(addToWorkspace?: (resource: ResourceInfo) => void): Promise<{
    success: number
    skipped: number
    failed: number
  }>
}
```

### Resource Metadata Format

```typescript
interface ResourceMetadata {
  resourceKey: string           // e.g., 'unfoldingWord/en/ult'
  resourceId: string           // e.g., 'ult'
  server: string               // e.g., 'git.door43.org'
  owner: string                // e.g., 'unfoldingWord'
  language: string             // e.g., 'en', 'el-x-koine'
  title: string                // e.g., 'unfoldingWord® Literal Text'
  subject: string              // e.g., 'Bible', 'Greek New Testament'
  version: string              // e.g., 'v87'
  
  type: ResourceType           // scripture, words, notes, etc.
  format: ResourceFormat       // usfm, markdown, etc.
  
  contentMetadata?: {
    ingredients?: Ingredient[] // Critical for on-demand loading
    books?: string[]          // List of available book codes
  }
  
  locations: ResourceLocation[] // Where to fetch content from
  license?: { id: string; url?: string }
}
```

### Workspace Store API

```typescript
// Add a preloaded resource to workspace
const addResourceToPackage = useWorkspaceStore(state => state.addResourceToPackage)
addResourceToPackage({
  key: 'unfoldingWord/en/ult',
  id: 'ult',
  title: 'Literal Text',
  type: 'scripture',
  // ... other fields
})

// Check if resource is in workspace
const hasResource = useWorkspaceStore(state => state.hasResourceInPackage)
const isInWorkspace = hasResource('unfoldingWord/en/ult')

// Get all workspace resources
const currentPackage = useWorkspaceStore(state => state.currentPackage)
const resources = Array.from(currentPackage?.resources.values() || [])
```

---

## Best Practices

### 1. **Keep Metadata Small**
Only bundle essential metadata. Don't include:
- ❌ Full content files
- ❌ Large readme files
- ❌ Binary data
- ✅ Resource info, ingredients, subjects
- ✅ Small descriptions

### 2. **Validate resourceKey Format**
Always ensure the resourceKey follows the correct pattern:
```typescript
function validateResourceKey(key: string): boolean {
  const parts = key.split('/')
  return parts.length === 3 && !parts.includes('')
}
```

### 3. **Handle Missing Ingredients**
Always check for ingredients before attempting on-demand loading:
```typescript
const metadata = await catalogManager.getResourceMetadata(resourceKey)
if (!metadata?.contentMetadata?.ingredients) {
  console.warn('Resource has no ingredients - cannot load on-demand')
  return null
}
```

### 4. **Version Control for Metadata**
Commit the generated JSON files to git so that:
- Users get consistent resources without running the build script
- Changes to preloaded resources are tracked
- CI/CD can validate the metadata

### 5. **Cache Invalidation**
When updating preloaded resources, increment the version in manifest.json:
```json
{
  "version": "1.1.0",  // Incremented
  "generatedAt": "2026-01-07T...",
  "resources": [...]
}
```

---

## Troubleshooting

### Issue: Resources not showing in sidebar

**Cause**: Timing issue - workspace trying to load before catalog initialized

**Solution**: The app uses a polling mechanism. Check console for:
```
✅ Preloaded resources: 4 cataloged, 0 skipped, 0 failed
✅ Added 4/4 preloaded resources to workspace
```

If you see errors, clear browser storage and refresh.

### Issue: "No viewer found for resource type"

**Cause**: Resource type not registered in ResourceTypeRegistry

**Solution**: Ensure the resource type is registered in `CatalogContext.tsx`:
```typescript
resourceTypeRegistry.register(scriptureResourceType)
```

### Issue: Content not loading (404 errors)

**Cause**: Incorrect file path or missing ingredients

**Solution**: 
1. Check that ingredients exist in the metadata
2. Verify the ingredient.path is correct
3. Enable debug mode to see the constructed URL

### Issue: Purple icon not showing for preloaded resources

**Cause**: ResourceKey mismatch between wizard and workspace

**Solution**: Use debug logging to check:
```typescript
console.log('Checking:', resourceKey)
console.log('In workspace:', workspaceStore.hasResourceInPackage(resourceKey))
```

---

## Contributing

When contributing new resource types or preloaded resources:

1. **Follow naming conventions**: Use clear, descriptive names
2. **Document your changes**: Update this file with your additions
3. **Test thoroughly**: Clear browser storage and test fresh installations
4. **Validate metadata**: Ensure JSON files are valid and follow the schema
5. **Update examples**: Add examples showing how to use your new resource type

---

## License

This framework is part of the BT Synergy project. See the main LICENSE file for details.

---

## Support

For questions or issues:
- Check the [Troubleshooting](#troubleshooting) section
- Review the [Developer Guide](#developer-guide)
- Open an issue on the project repository
