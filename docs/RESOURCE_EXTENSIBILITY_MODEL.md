# Resource Extensibility Model

**Dual-Mode Architecture**: Support both packaged and in-app resources

**Status**: ✅ **IMPLEMENTED**

---

## 📊 Implementation Summary

### ✅ What's Built

1. **CLI Support** - `@bt-synergy/resource-cli` now supports:
   - `--location-type external` for standalone packages
   - `--location-type internal` for app modules
   - Auto-detection of app directories
   - Interactive prompts for choosing mode

2. **Auto-Registration** - Internal resources are automatically discovered:
   - Scans `apps/tc-study/src/resourceTypes/` directory
   - Uses Vite's `import.meta.glob` for dynamic discovery
   - Registers all found resource types on app startup

3. **Dual Templates** - Different templates for each mode:
   - External: Full package with loader, viewer, signals, types
   - Internal: Minimal structure (index.ts + resourceType.ts)

4. **Documentation** - Complete guides:
   - CLI README updated with both modes
   - This extensibility model document
   - PHASE_4_COMPLETE_SUMMARY.md

### 🎯 How to Use

**Create External Package:**
```bash
cd bt-synergy  # monorepo root
node tools/resource-cli/dist/index.js create my-resource --location-type external
```

**Create Internal App Module:**
```bash
cd apps/tc-study
node ../../tools/resource-cli/dist/index.js create my-resource --location-type internal
```

**Interactive Mode (Recommended):**
```bash
node tools/resource-cli/dist/index.js create
# CLI auto-detects if in app directory and offers both options
```

---

## 🎯 The Vision

Developers should be able to:

1. **Use published packages** - `@bt-synergy/scripture-resource`
2. **Create in-app resources** - `apps/tc-study/src/resourceTypes/my-resource/`
3. **Extract to packages later** - When a resource is ready to share

**Same pattern, different locations!**

---

## 🏗️ Two Modes, One Pattern

### Mode 1: Package Resources (Reusable)

**Location**: `packages/my-resource-resource/`

**When to use**:
- Resource will be used across multiple apps
- Resource is stable and well-tested
- Want to version and publish separately
- General-purpose resource (scripture, notes, etc.)

**Example**:
```
packages/
└── scripture-resource/
    └── src/
        ├── createResourceType.ts
        ├── loader/
        └── signals/
```

### Mode 2: App Resources (App-Specific)

**Location**: `apps/my-app/src/resourceTypes/my-resource/`

**When to use**:
- Resource is app-specific
- Prototyping / experimenting
- Custom integration for one app
- Not (yet) ready to share

**Example**:
```
apps/tc-study/src/resourceTypes/
└── myCustomResource/
    ├── index.ts
    └── resourceType.ts
```

**Note**: The viewer component is created separately in `src/components/resources/` and imported into the resource type definition.

---

## 📁 Proposed Structure

### In-App Resources Directory

```
apps/tc-study/src/
├── contexts/           # App contexts
├── components/
│   └── resources/      # Shared viewers (for package resources)
│       ├── ScriptureViewer/
│       └── NotesViewer/
├── resources/          # ← NEW: App-specific resources
│   ├── my-custom-resource/
│   │   ├── index.ts
│   │   ├── createResourceType.ts
│   │   ├── loader.ts
│   │   ├── viewer.tsx
│   │   └── signals.ts
│   └── my-experimental-resource/
│       └── ...
└── resourceTypes/
    ├── index.ts        # Registers all resources
    ├── scripture/
    │   └── index.ts    # Uses package
    └── myCustom/
        └── index.ts    # Uses app resource
```

---

## 🔧 CLI Support for Both Modes

### Update CLI to Support Target Location

```bash
# Create in packages/ (default)
pnpm resource create my-resource

# Create in app's resources/ directory
pnpm resource create my-resource --app-dir apps/tc-study

# Or from within the app:
cd apps/tc-study
pnpm resource create my-custom --local
```

### CLI Options

```
Options:
  --app-dir <path>      Create in app's resources/ directory
  --local               Create in current app (if in app dir)
  --package             Create in packages/ (default)
  --with-viewer         Include viewer in resource (for app resources)
```

---

## 📝 Pattern Comparison

### Package Resource

```typescript
// packages/scripture-resource/src/createResourceType.ts
export function createScriptureResourceType(viewer) {
  return defineResourceType({
    id: 'scripture',
    viewer, // ← Injected from app
    // ... config
  })
}

// App usage:
import { createScriptureResourceType } from '@bt-synergy/scripture-resource'
import { ScriptureViewer } from '../../components/resources/ScriptureViewer'
export const scriptureResourceType = createScriptureResourceType(ScriptureViewer)
```

### App Resource

```typescript
// apps/tc-study/src/resources/my-custom/index.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { MyCustomViewer } from './viewer'
import { MyCustomLoader } from './loader'

export const myCustomResourceType = defineResourceType({
  id: 'my-custom',
  viewer: MyCustomViewer, // ← Defined right here
  loader: MyCustomLoader,
  // ... config
})

// Can still use app contexts!
```

**Key difference**: Viewer can be in the same directory for app resources.

---

## 🎯 Registration Pattern

### Centralized Registration

```typescript
// apps/tc-study/src/resourceTypes/index.ts

// ===== PACKAGE RESOURCES =====
// Import from packages, provide viewers
import { createScriptureResourceType } from '@bt-synergy/scripture-resource'
import { createNotesResourceType } from '@bt-synergy/notes-resource'
import { ScriptureViewer } from '../components/resources/ScriptureViewer'
import { NotesViewer } from '../components/resources/NotesViewer'

export const scriptureResourceType = createScriptureResourceType(ScriptureViewer)
export const notesResourceType = createNotesResourceType(NotesViewer)

// ===== APP RESOURCES =====
// Import from app's resources directory (self-contained)
export { myCustomResourceType } from '../resources/my-custom'
export { myExperimentalResourceType } from '../resources/my-experimental'

// ===== REGISTER ALL =====
export function registerAllResources(registry) {
  // Package resources
  registry.register(scriptureResourceType)
  registry.register(notesResourceType)
  
  // App resources
  registry.register(myCustomResourceType)
  registry.register(myExperimentalResourceType)
}
```

---

## 🔄 Migration Path

### Start in App → Move to Package

**Step 1: Prototype in App**
```bash
cd apps/tc-study
pnpm resource create my-resource --local
# Creates in src/resources/my-resource/
```

**Step 2: Develop & Test**
```typescript
// src/resources/my-resource/index.ts
export const myResourceType = defineResourceType({
  // All code here
})
```

**Step 3: Use in App**
```typescript
// src/resourceTypes/index.ts
export { myResourceType } from '../resources/my-resource'
registry.register(myResourceType)
```

**Step 4: When Ready, Extract to Package**
```bash
# Move to packages/
mv apps/tc-study/src/resources/my-resource packages/my-resource-resource

# Update to factory pattern
# Split viewer out
# Publish if desired
```

---

## 📦 CLI Implementation

### Update CLI Commands

```typescript
// tools/resource-cli/src/commands/create.ts

interface CreateOptions {
  // Existing
  platforms: Platform[]
  description?: string
  subjects?: string[]
  
  // NEW
  target: 'package' | 'app'  // Where to create
  appDir?: string             // Which app (if target=app)
  includeViewer?: boolean     // Include viewer in resource (for app resources)
}

export async function createCommand(name: string, options: CreateOptions) {
  // Determine target directory
  const targetDir = options.target === 'app'
    ? path.join(options.appDir!, 'src', 'resources', name)
    : path.join(process.cwd(), 'packages', `${name}-resource`)
  
  // Generate appropriate structure
  if (options.target === 'app') {
    await generateAppResource(targetDir, context)
  } else {
    await generatePackageResource(targetDir, context)
  }
}
```

### App Resource Template

```typescript
// Different from package template:
// - Includes viewer by default
// - No factory function needed
// - All in one place
// - Can use app contexts freely

function generateAppResource(targetDir, context) {
  // Create structure:
  // - index.ts (exports defineResourceType directly)
  // - loader.ts (full implementation)
  // - viewer.tsx (full component with app contexts)
  // - signals.ts (custom signals)
  // - types.ts (types)
  // - README.md
}
```

---

## 🎁 Benefits

### For Developers

**Package Resources**:
- ✅ Reusable across apps
- ✅ Versioned independently
- ✅ Can be published to npm
- ✅ Tested in isolation

**App Resources**:
- ✅ Fast prototyping
- ✅ No packaging overhead
- ✅ App-specific customizations
- ✅ Can use any app internals
- ✅ Extract to package when ready

### For Apps

**Flexibility**:
- ✅ Use community packages
- ✅ Create custom resources
- ✅ Mix and match
- ✅ Gradual extraction

**Example Mix**:
```typescript
// App registers both types equally:
registry.register(scriptureResourceType)    // Package
registry.register(notesResourceType)        // Package  
registry.register(myCustomResourceType)     // App-specific
registry.register(prototypeResourceType)    // App-specific (experimenting)
```

---

## 📊 Comparison Matrix

| Aspect | Package Resources | App Resources |
|--------|------------------|---------------|
| **Location** | `packages/` | `apps/my-app/src/resources/` |
| **Reusability** | High | Low (app-specific) |
| **Setup Time** | Medium | Fast |
| **Viewer Location** | App provides | Can be in resource |
| **App Context** | Via props | Direct access |
| **Versioning** | Independent | With app |
| **Publishing** | Can publish | Not published |
| **Best For** | Stable, shared | Prototype, custom |
| **Migration** | N/A | Can extract later |

---

## 🔍 Discovery & Auto-Registration

### Option: Auto-Discover App Resources

```typescript
// apps/tc-study/src/resourceTypes/index.ts

// Auto-discover resources from src/resources/
const appResourcesContext = require.context(
  '../resources',
  true,
  /index\.ts$/
)

export function registerAllResources(registry) {
  // Package resources (explicit)
  registry.register(scriptureResourceType)
  registry.register(notesResourceType)
  
  // App resources (auto-discovered)
  appResourcesContext.keys().forEach(key => {
    const module = appResourcesContext(key)
    if (module.resourceType) {
      registry.register(module.resourceType)
    }
  })
}
```

**Benefit**: Drop a resource folder in `src/resources/` and it's automatically registered!

---

## 🚀 Example Scenarios

### Scenario 1: Using Community Package

```typescript
// 1. Install package
pnpm add @community/custom-resource

// 2. Provide viewer
import { createCustomResourceType } from '@community/custom-resource'
import { CustomViewer } from '../components/resources/CustomViewer'
export const customResourceType = createCustomResourceType(CustomViewer)

// 3. Register
registry.register(customResourceType)
```

### Scenario 2: Quick App-Specific Resource

```bash
# 1. Generate in app
cd apps/tc-study
pnpm resource create sermon-notes --local --with-viewer

# 2. Implement
# Everything in src/resources/sermon-notes/

# 3. Auto-registered!
# Or explicitly register if not using auto-discovery
```

### Scenario 3: Prototype → Package

```bash
# 1. Start in app
pnpm resource create prototype --local

# 2. Develop & test in app

# 3. When stable, extract to package
pnpm resource extract prototype --to-package

# 4. Converts to factory pattern, moves to packages/
```

---

## 📋 Implementation Checklist

### Phase 1: Directory Structure
- [x] Use existing `apps/tc-study/src/resourceTypes/` directory
- [x] Document structure in README

### Phase 2: CLI Updates
- [x] Add `--location-type external|internal` option
- [x] Add app directory detection
- [x] Create internal app module templates
- [x] Interactive mode with both options
- [ ] Add `extract` command to migrate internal → external (optional)

### Phase 3: Registration
- [x] Create auto-registration system (`autoRegister.ts`)
- [x] Integrate with CatalogContext
- [x] Auto-discovery using `import.meta.glob`
- [x] Update documentation

### Phase 4: Documentation
- [x] Update CLI README with both modes
- [x] Update RESOURCE_EXTENSIBILITY_MODEL.md
- [x] Add implementation status
- [ ] Create step-by-step tutorial (optional)

---

## 💡 Recommendations

### Default Behavior

**For New Resources**:
1. Start with `--local` (app resource) for prototyping
2. Develop and test
3. When stable, extract to package (if reusable)

**For Stable Resources**:
1. Use packages for anything reusable
2. Version properly
3. Share with community

### Best Practices

1. **App Resources**: Great for experimentation and app-specific needs
2. **Package Resources**: Use when resource is stable and reusable
3. **Mixed Approach**: Most apps will use both!
4. **Easy Migration**: Start in app, extract when ready

---

## 🎯 Summary

**Two modes, one pattern, maximum flexibility!**

| Mode | Location | Use Case | Viewer |
|------|----------|----------|--------|
| **Package** | `packages/` | Reusable | App provides |
| **App** | `app/src/resources/` | Custom | In resource |

**Benefits**:
- ✅ Fast prototyping (app resources)
- ✅ Easy sharing (package resources)
- ✅ Gradual extraction (start app, move to package)
- ✅ Same v2.0 API everywhere
- ✅ Mix and match freely

**Result**: Best of both worlds! 🎉

---

## 🎉 Status

**✅ Implementation Complete!**

### What's Working

1. **CLI Tool** (`@bt-synergy/resource-cli`)
   - Interactive mode with location type selection
   - External package generation
   - Internal app module generation
   - Auto-detection of app directories

2. **Auto-Registration** (`apps/tc-study/src/resourceTypes/autoRegister.ts`)
   - Automatic discovery of internal resource types
   - Dynamic import using `import.meta.glob`
   - Graceful error handling
   - Integration with CatalogContext

3. **Documentation**
   - CLI README with both modes
   - Resource Extensibility Model (this document)
   - PHASE_4_COMPLETE_SUMMARY.md

### Next Steps

**For Developers:**
1. Use the CLI to create resource types in either mode
2. Follow the "Definitions in Packages, Viewers in Apps" pattern
3. Internal resources are auto-discovered on app startup

**Optional Enhancements:**
- [ ] Add `extract` command to migrate internal → external
- [ ] Create step-by-step video tutorial
- [ ] Build example internal resource type for reference

**Status**: Ready for Production Use 🚀

