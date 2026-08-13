# Migrating to Resource Type Packages

## Current State → Target State

### Current: Resource Types in App

```
apps/tc-study/
├── src/
│   ├── resourceTypes/
│   │   ├── scripture/           # Resource type definition
│   │   ├── translationWords.ts
│   │   └── translationWordsLinks.ts
│   ├── components/resources/    # Viewers
│   │   ├── ScriptureViewer/
│   │   ├── TranslationWordsViewer.tsx
│   │   └── WordsLinksViewer.tsx
│   └── contexts/
│       └── CatalogContext.tsx   # Registration
```

### Target: Resource Types as Packages

```
packages/
├── scripture-resource/          # ✅ Self-contained package
│   ├── src/
│   │   ├── loader/
│   │   ├── viewer/
│   │   ├── signals/
│   │   ├── types/
│   │   ├── resourceType.ts
│   │   └── index.ts
│   └── package.json
│
├── translation-words-resource/  # ✅ Self-contained package
│   └── ... (same structure)
│
└── translation-words-links-resource/  # ✅ Self-contained package
    └── ... (same structure)

apps/tc-study/
└── src/
    └── contexts/
        └── CatalogContext.tsx   # Just imports and registers
```

## Migration Steps

### Phase 1: Scripture Resource (Example)

#### 1. Create Package Structure

```bash
mkdir -p packages/scripture-resource/src/{loader,viewer,signals,types}
```

#### 2. Move Loader

```bash
# Loader already exists in separate package
# @bt-synergy/scripture-loader

# Reference it in resourceType.ts
```

#### 3. Move Viewer

```bash
# From:
apps/tc-study/src/components/resources/ScriptureViewer/

# To:
packages/scripture-resource/src/viewer/

# Copy all files, update imports
```

#### 4. Extract Types

```typescript
// packages/scripture-resource/src/types/index.ts
export interface ScriptureContent {
  // ... existing types from viewer
}

export interface ScriptureViewerProps {
  // ... props interface
}
```

#### 5. Create resourceType.ts

```typescript
// packages/scripture-resource/src/resourceType.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'  // Existing package
import { ScriptureViewer } from './viewer'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  // ... rest of definition from apps/tc-study/src/resourceTypes/scripture/
  loader: ScriptureLoader,
  viewer: ScriptureViewer
})
```

#### 6. Create Package Entry Point

```typescript
// packages/scripture-resource/src/index.ts
export { scriptureResourceType } from './resourceType'
export { ScriptureViewer } from './viewer'
export type * from './types'
```

#### 7. Create package.json

```json
{
  "name": "@bt-synergy/scripture-resource",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@bt-synergy/scripture-loader": "workspace:*",
    "@bt-synergy/resource-types": "workspace:*",
    "@bt-synergy/resource-panels": "workspace:*"
  }
}
```

#### 8. Update App

```typescript
// apps/tc-study/src/contexts/CatalogContext.tsx

// Old:
// import { scriptureResourceType } from '../resourceTypes/scripture'

// New:
import { scriptureResourceType } from '@bt-synergy/scripture-resource'

// Registration stays the same:
resourceTypeRegistry.register(scriptureResourceType)
```

#### 9. Update App package.json

```json
{
  "dependencies": {
    "@bt-synergy/scripture-resource": "workspace:*"
  }
}
```

#### 10. Remove Old Files

```bash
# Remove from app:
rm -rf apps/tc-study/src/resourceTypes/scripture/
rm -rf apps/tc-study/src/components/resources/ScriptureViewer/
```

### Phase 2: Translation Words Resource

Repeat the same process for Translation Words:

```bash
mkdir -p packages/translation-words-resource/src/{loader,viewer,types}
# Move files...
# Create resourceType.ts...
# Update app imports...
```

### Phase 3: Other Resources

Continue for:
- Translation Words Links
- Translation Notes (future)
- Translation Questions (future)
- Translation Academy (future)

## Benefits After Migration

### Before (Current)

```typescript
// In app - everything mixed together
import { ScriptureViewer } from '../components/resources/ScriptureViewer'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { scriptureResourceType } from '../resourceTypes/scripture'

// Manual coordination between files
```

### After (Packages)

```typescript
// In app - clean single import
import { scriptureResourceType } from '@bt-synergy/scripture-resource'

// Everything bundled together:
// - Loader
// - Viewer
// - Types
// - Signals
// - Configuration
```

## Backward Compatibility

The migration is **non-breaking** for app code:

```typescript
// This still works:
resourceTypeRegistry.register(scriptureResourceType)

// Viewers still get the same props
// Loaders still work the same way
// Only the import path changes
```

## Testing During Migration

### 1. Create Package

```bash
cd packages/scripture-resource
pnpm build
```

### 2. Update App Imports

```bash
cd apps/tc-study
# Update import in CatalogContext.tsx
pnpm install  # Link the new package
```

### 3. Test

```bash
# Run the app
pnpm dev

# Navigate to /test page
# Verify scripture resources still work
# Check inter-panel communication
```

### 4. If Issues

```bash
# Enable debug mode
const scriptureResourceType = defineResourceType({
  // ... config
  debug: true  // Add this
})
```

## Migration Checklist

For each resource type:

- [ ] Create package directory structure
- [ ] Move loader (or reference existing)
- [ ] Move viewer component
- [ ] Extract TypeScript types
- [ ] Create resourceType.ts
- [ ] Create package.json
- [ ] Create README.md
- [ ] Build package
- [ ] Update app imports
- [ ] Update app package.json
- [ ] Test in app
- [ ] Remove old files from app
- [ ] Update documentation

## Timeline

### Immediate (Can Do Now)

- [x] Create architecture docs
- [x] Create example structure
- [x] Create migration guide
- [ ] Migrate scripture resource
- [ ] Test scripture package

### Phase 2 (After Testing)

- [ ] Migrate translation-words resource
- [ ] Migrate translation-words-links resource
- [ ] Update documentation

### Phase 3 (Future)

- [ ] Create packages for future resource types
- [ ] Enable community packages
- [ ] Create package templates/generators

## Questions & Answers

**Q: Will this break existing code?**
A: No, only import paths change. The API remains the same.

**Q: Can we mix packaged and non-packaged resources?**
A: Yes! Migrate incrementally.

**Q: What about shared utilities?**
A: Keep shared utilities in app or create separate packages like `@bt-synergy/resource-utils`.

**Q: How do we handle versions?**
A: Use workspace protocol (`workspace:*`) within monorepo. For external packages, use semver.

**Q: What about testing?**
A: Test packages in isolation + integration tests in app.

## Next Steps

1. ✅ Review this migration guide
2. ✅ Create first package (scripture-resource)
3. Test thoroughly
4. Migrate remaining resources
5. Update all documentation
6. Create package template for new resources

---

**Ready to migrate?** Start with scripture-resource as the example, then apply the pattern to other resource types!
