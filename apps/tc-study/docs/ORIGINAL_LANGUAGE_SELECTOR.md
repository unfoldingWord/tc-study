# Original Language Selector Implementation (Updated UI)

## Overview

Implemented a conditional "Original Languages" step in the resource addition wizard, similar to the one in `@bt-synergy/apps/package-creator-web`. This step appears only when users have selected "Aligned Bible" resources and allows them to select Greek and Hebrew source texts.

## Architecture

### Conditional Step Logic

The "Original Languages" step is **conditionally displayed** based on resource selection:

- **Appears when**: User has selected resources with `subject === 'Aligned Bible'`
- **Hidden when**: No Aligned Bible resources are selected
- **Position**: Between "Select Resources" and "Assign to Panels" steps

### Step Flow

1. **Languages** → Select target languages (en, es-419, etc.)
2. **Organizations** → Select resource owners (unfoldingWord, etc.)
3. **Resources** → Select Bible translations and other resources
4. **Original Languages** *(conditional)* → Select Greek/Hebrew texts for Aligned Bibles
5. **Assign to Panels** → Assign resources to workspace panels

## Key Components

### 1. `OriginalLanguageSelectorStep.tsx`

**Location**: `apps/tc-study/src/components/wizard/OriginalLanguageSelectorStep.tsx`

**Purpose**: Allows selection of Greek (Koine, `el-x-koine`) and Hebrew (Biblical, `hbo`) original language resources.

**Features**:
- Fetches Greek NT and Hebrew OT resources from Door43 API
- Auto-selects recommended resources (UGNT and UHB by default)
- Displays resources in grid layout with selection state
- Shows "Recommended" and "Cached" badges
- Provides selection summary at the bottom

**Key Logic**:
```typescript
// Check for Aligned Bible resources
const alignedBibleResources = Array.from(selectedResourceKeys)
  .map(key => availableResources.get(key))
  .filter(r => r && (r.category === 'Aligned Bible' || r.type === 'scripture'))

// Load Greek (el-x-koine) and Hebrew (hbo) resources
const greekDoor43 = await door43Client.getResourcesByOrgAndLanguage(
  'unfoldingWord',
  'el-x-koine',
  {
    subjects: resourceTypeRegistry.getSupportedSubjects(),
    stage: 'prod',
    topic: 'tc-ready',
  }
)

// Auto-select UGNT and UHB
const recommendedGreek = new Set<string>(['ugnt'])
const recommendedHebrew = new Set<string>(['uhb'])
```

### 2. `AddResourceWizard.tsx` Updates

**Conditional Step Array**:
```typescript
const allSteps = [
  { id: 'languages', label: 'Select Languages', icon: Languages, conditional: false },
  { id: 'organizations', label: 'Select Organizations', icon: Building2, conditional: false },
  { id: 'resources', label: 'Select Resources', icon: Book, conditional: false },
  { id: 'original-languages', label: 'Original Languages', icon: BookOpen, conditional: true },
  { id: 'assign', label: 'Assign to Panels', icon: Layers, conditional: false },
]

// Filter steps based on conditions
const steps = allSteps.filter(step => {
  if (step.id === 'original-languages') {
    return hasAlignedBibleResources // Only show if Aligned Bible resources selected
  }
  return true
})
```

**Navigation Logic**:
```typescript
const handleNext = () => {
  // Skip original-languages step if no Aligned Bible resources
  if (wizardStep === 'resources' && !hasAlignedBibleResources) {
    const targetStep = allSteps.find((s, i) => {
      const currentIdx = allSteps.findIndex(as => as.id === wizardStep)
      return i > currentIdx && s.id !== 'original-languages'
    })
    if (targetStep) {
      setWizardStep(targetStep.id)
      return
    }
  }
  
  setWizardStep(nextStep.id)
}
```

### 3. `WorkspaceStore` Updates

**Updated Types**:
```typescript
wizardStep: 'languages' | 'organizations' | 'resources' | 'original-languages' | 'assign' | null
```

**Enhanced `toggleResource` Method**:
```typescript
toggleResource: (resourceKey: string, resourceInfo?: ResourceInfo) => void

// Implementation
toggleResource: (resourceKey, resourceInfo) => {
  set((state) => {
    const newSet = new Set(state.selectedResourceKeys)
    if (newSet.has(resourceKey)) {
      newSet.delete(resourceKey)
    } else {
      newSet.add(resourceKey)
      // If resourceInfo is provided, add it to availableResources
      if (resourceInfo && !state.availableResources.has(resourceKey)) {
        state.availableResources.set(resourceKey, resourceInfo)
      }
    }
    state.selectedResourceKeys = newSet
  })
}
```

**Why the update?**: The Original Language Selector needs to add resources that weren't in the initial resource selection step (Greek and Hebrew texts). The optional `resourceInfo` parameter allows dynamically adding resources to `availableResources`.

## User Experience

### When Aligned Bible Resources Are Selected

1. User selects languages (e.g., English, Spanish)
2. User selects organizations (e.g., unfoldingWord)
3. User selects resources, including an **Aligned Bible** (e.g., unfoldingWord® Translation for English)
4. **Original Languages step appears**:
   - Shows Greek New Testament resources (UGNT, etc.)
   - Shows Hebrew Old Testament resources (UHB, etc.)
   - Auto-selects UGNT and UHB
   - User can change selections if desired
5. User continues to assign resources to panels

### When No Aligned Bible Resources Are Selected

1. User selects languages
2. User selects organizations
3. User selects resources (e.g., ULT, UST, but no Aligned Bible)
4. **Original Languages step is skipped automatically**
5. User proceeds directly to panel assignment

## Resource Recommendations

### Default Recommendations

When no alignment information is available from the Aligned Bible resources:

- **Greek**: UGNT (unfoldingWord® Greek New Testament)
- **Hebrew**: UHB (unfoldingWord® Hebrew Bible)

### Future Enhancement: Relation-Based Recommendations

The `package-creator-web` app checks the `relations` field in Aligned Bible resources to determine which Greek/Hebrew texts they're aligned to. This can be implemented in `tc-study` by:

1. Checking `resource.relations` for selected Aligned Bible resources
2. Extracting identifiers from relations where `lang === 'el-x-koine'` or `lang === 'hbo'`
3. Auto-selecting the matched Greek/Hebrew resources

Example from `package-creator-web`:
```typescript
alignedBibleResources.forEach(resource => {
  if (resource.relations && resource.relations.length > 0) {
    resource.relations.forEach(rel => {
      const lang = rel.lang
      const identifier = rel.identifier
      
      if (lang === 'el-x-koine' || identifier === 'ugnt') {
        recommendedGreek.add(identifier)
      } else if (lang === 'hbo' || identifier === 'uhb') {
        recommendedHebrew.add(identifier)
      }
    })
  }
})
```

## API Integration

### Door43 API Calls

**Greek Resources** (`el-x-koine`):
```typescript
await door43Client.getResourcesByOrgAndLanguage(
  'unfoldingWord',
  'el-x-koine',
  {
    subjects: ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament'],
    stage: 'prod',
    topic: 'tc-ready',
  }
)
```

**Hebrew Resources** (`hbo`):
```typescript
await door43Client.getResourcesByOrgAndLanguage(
  'unfoldingWord',
  'hbo',
  {
    subjects: ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament'],
    stage: 'prod',
    topic: 'tc-ready',
  }
)
```

### Resource Conversion

Door43 resources are converted to the `OriginalLanguageResource` format:
```typescript
interface OriginalLanguageResource extends ResourceMetadata {
  isCached: boolean
  isSupported: boolean
  viewerName?: string
}
```

## UI Features

### Resource Cards

Each resource is displayed as a selectable card with:

- **Title**: Resource name
- **ID Badge**: Resource identifier in uppercase (e.g., "UGNT", "UHB")
- **Recommended Badge**: Green badge for recommended resources
- **Cached Badge**: Blue badge for locally cached resources
- **Metadata**: Owner and subject
- **Selection Indicator**: Blue checkmark icon when selected

### Info Banner

Explains the purpose of original language selection:
> "Aligned Bible resources are word-aligned to original Greek and Hebrew texts. We've auto-selected the recommended texts (UGNT and UHB), but you can choose different ones if needed."

### Selection Summary

Shows at the bottom:
- ✓ Greek: UGNT
- ✓ Hebrew: UHB
- ⚠️ Warning if no original language resources selected

## Files Changed

1. **Created**:
   - `apps/tc-study/src/components/wizard/OriginalLanguageSelectorStep.tsx`
   - `apps/tc-study/docs/ORIGINAL_LANGUAGE_SELECTOR.md`

2. **Modified**:
   - `apps/tc-study/src/components/wizard/AddResourceWizard.tsx`
     - Added `OriginalLanguageSelectorStep` import
     - Added conditional step logic
     - Updated navigation to skip step when not needed
     - Added rendering of the new step
   
   - `apps/tc-study/src/lib/stores/workspaceStore.ts`
     - Added `'original-languages'` to `wizardStep` type
     - Updated `toggleResource` to accept optional `resourceInfo` parameter
     - Enhanced `toggleResource` implementation to add resources dynamically

## Testing

To test the Original Language Selector:

1. Open the Studio page
2. Click "Add Resource" from an empty panel
3. Select a language (e.g., English)
4. Select an organization (e.g., unfoldingWord)
5. Select an **Aligned Bible** resource (look for resources with `subject === 'Aligned Bible'`)
6. Click "Next" - the **Original Languages** step should appear
7. Verify that UGNT and UHB are auto-selected
8. Click "Next" to proceed to panel assignment

To verify conditional behavior:

1. Follow steps 1-4 above
2. Select **only non-Aligned resources** (e.g., ULT, UST, Translation Notes)
3. Click "Next" - should skip directly to panel assignment (no Original Languages step)

## Benefits

1. **Consistent UX**: Matches the workflow in `package-creator-web`
2. **Smart Defaults**: Auto-selects recommended Greek/Hebrew texts
3. **Conditional Display**: Only shows when relevant (Aligned Bible resources selected)
4. **Offline-First**: Checks for cached resources and displays badges
5. **Extensible**: Easy to add more original language resources or logic
6. **Type-Safe**: Fully typed with TypeScript interfaces

## Future Enhancements

1. **Relation-Based Recommendations**: Parse `relations` field from Aligned Bible resources to recommend specific Greek/Hebrew texts
2. **Multi-Organization Support**: Load Greek/Hebrew resources from multiple organizations
3. **Version Matching**: Match Greek/Hebrew version based on Aligned Bible alignment version
4. **Caching**: Pre-cache frequently used original language resources
5. **Tooltips**: Show alignment information on hover
6. **Preview**: Allow previewing aligned text before selection

## Related Documentation

- [Wizard System Design](./WIZARD_SYSTEM_DESIGN.md)
- [Dynamic Panels Architecture](./DYNAMIC_PANELS_ARCHITECTURE.md)
- [Extensibility Implementation](./EXTENSIBILITY_IMPLEMENTATION_COMPLETE.md)
- [Unified Plugin System](./UNIFIED_PLUGIN_SYSTEM.md)
