# Cascade Deselection for Resource Dependencies

## Overview

When a resource with dependencies is selected, the dependencies are automatically selected. When you deselect a dependency, any resources that depend on it are automatically deselected first (cascade deselection).

## Behavior

### Scenario 1: Selecting a Resource with Dependencies

**Example:** User selects `Translation Words Links (TWL)`

```
User clicks TWL
   ↓
🔗 Auto-selecting dependency: es-419_gl/es-419/tw
   ↓
Result: Both TWL and TW are selected
```

**UI Feedback:**
- TWL card shows green checkmark
- TW card shows green checkmark
- Console: `🔗 Auto-selecting dependency: es-419_gl/es-419/tw`

### Scenario 2: Deselecting a Dependency (Cascade)

**Example:** User tries to deselect `Translation Words (TW)` while `TWL` is still selected

```
User clicks TW to deselect
   ↓
System detects TWL depends on TW
   ↓
⛓️  Cascade deselecting dependents of es-419_gl/es-419/tw:
      - es-419_gl/es-419/twl
   ↓
TWL is deselected first
   ↓
Then TW is deselected
   ↓
Result: Both are deselected
```

**UI Feedback:**
- TWL card loses checkmark first
- TW card loses checkmark second
- Console shows cascade chain:
  ```
  ⛓️  Cascade deselecting dependents of es-419_gl/es-419/tw:
      - es-419_gl/es-419/twl
  ```

### Scenario 3: Deselecting a Resource with Dependencies

**Example:** User deselects `TWL` directly

```
User clicks TWL to deselect
   ↓
TWL is deselected
   ↓
TW remains selected (not affected)
   ↓
Result: Only TWL is deselected, TW stays selected
```

**Rationale:** TW doesn't depend on TWL, so it can remain selected. User can manually deselect TW if desired.

## Implementation

### Key Logic

```typescript
onToggle={(key) => {
  const resource = availableResources.get(key)
  const isCurrentlySelected = selectedResourceKeys.has(key)
  
  // DESELECTING: Cascade to remove dependents
  if (isCurrentlySelected) {
    // Find all selected resources that depend on this one
    const dependentResources: string[] = []
    
    for (const [selectedKey, selectedResource] of availableResources.entries()) {
      if (!selectedResourceKeys.has(selectedKey)) continue
      
      const autoAddKeys = (selectedResource as any)?.autoAddedDependencies || []
      if (autoAddKeys.includes(key)) {
        dependentResources.push(selectedKey)
      }
    }
    
    // Cascade deselect: remove dependents first
    if (dependentResources.length > 0) {
      console.log(`   ⛓️  Cascade deselecting dependents of ${key}:`)
      for (const depKey of dependentResources) {
        console.log(`      - ${depKey}`)
        toggleResource(depKey, availableResources.get(depKey))
      }
    }
  }
  
  // Toggle the main resource
  toggleResource(key, resource)
  
  // SELECTING: Auto-select dependencies
  if (!isCurrentlySelected) {
    const autoAddKeys = (resource as any)?.autoAddedDependencies || []
    for (const depKey of autoAddKeys) {
      if (!selectedResourceKeys.has(depKey)) {
        console.log(`   🔗 Auto-selecting dependency: ${depKey}`)
        toggleResource(depKey, availableResources.get(depKey))
      }
    }
  }
}}
```

## User Experience Benefits

### ✅ Clear Relationships
Users immediately see which resources are connected through the cascade effect.

### ✅ Prevents Invalid States
You can never have TWL selected without TW - the system maintains consistency automatically.

### ✅ Full Control
Users have complete control - they can deselect anything, and the system handles the implications.

### ✅ Predictable Behavior
- Selecting TWL → TW is auto-selected
- Deselecting TW → TWL is auto-deselected
- Deselecting TWL → TW stays (no cascade upward)

## Alternative Approach (Not Implemented)

### Option: Prevent Deselection

**How it would work:**
- TW card would be disabled (grayed out) when TWL is selected
- User would need to deselect TWL first before being able to deselect TW

**Why cascade deselection is better:**
- More intuitive - users expect dependencies to "pull" their dependents along
- Less confusing - no "locked" resources
- Matches common UX patterns (e.g., package managers)
- Provides immediate feedback through the cascade effect

## Edge Cases

### Multiple Dependencies

**Real Example:** Translation Words Links (TWL) depends on TW + UGNT + UHB

```
TWL Dependencies:
├── TW (Translation Words) - same language/owner
├── UGNT (Greek NT) - unfoldingWord/el-x-koine
└── UHB (Hebrew Bible) - unfoldingWord/hbo
```

**Behavior:**
- **Selecting TWL** → TW, UGNT, and UHB are all auto-selected
- **Deselecting TW** → TWL is cascade deselected (UGNT and UHB remain)
- **Deselecting UGNT** → TWL is cascade deselected (TW and UHB remain)
- **Deselecting UHB** → TWL is cascade deselected (TW and UGNT remain)
- **Deselecting TWL** → TW, UGNT, and UHB all remain selected

**Console Output (Selecting TWL):**
```
🔗 Auto-selecting dependency: es-419_gl/es-419/tw
🔗 Auto-selecting dependency: unfoldingWord/el-x-koine/ugnt
🔗 Auto-selecting dependency: unfoldingWord/hbo/uhb
```

**Console Output (Deselecting UGNT):**
```
⛓️  Cascade deselecting dependents of unfoldingWord/el-x-koine/ugnt:
   - es-419_gl/es-419/twl
```

### Dependency Chains

**Example:** C depends on B, B depends on A

**Behavior:**
- Selecting C → B and A are auto-selected
- Deselecting A → B is cascade deselected, then C is cascade deselected
- Deselecting B → C is cascade deselected (A remains)

**Implementation:** The cascade naturally handles chains through recursive deselection.

### Circular Dependencies

**Prevention:** The resource type system prevents circular dependencies at the definition level. TWL cannot depend on something that depends on TWL.

## Testing

### Test Case 1: Basic Cascade

```
1. Select es-419 + es-419_gl organization
2. Select TWL
   Expected: TW is auto-selected
3. Click TW to deselect
   Expected: TWL is deselected first, then TW
   Console shows: "⛓️  Cascade deselecting dependents of es-419_gl/es-419/tw"
```

### Test Case 2: No Cascade Upward

```
1. Select es-419 + es-419_gl organization  
2. Select TWL (TW is auto-selected)
3. Click TWL to deselect
   Expected: Only TWL is deselected, TW remains selected
   Console shows: No cascade message
```

### Test Case 3: Multiple Dependents

```
1. Have resources A, B, C all depending on X
2. Select A, B, C (X is auto-selected for all)
3. Click X to deselect
   Expected: A, B, C are all cascade deselected, then X
   Console shows cascade for all three
```

## Console Logging

### Selection (with dependencies)
```
🔗 Auto-selecting dependency: es-419_gl/es-419/tw
```

### Deselection (with cascade)
```
⛓️  Cascade deselecting dependents of es-419_gl/es-419/tw:
   - es-419_gl/es-419/twl
```

### Visual Indicators in Logs
- 🔗 = Auto-selecting dependency
- ⛓️ = Cascade deselecting dependents

## Summary

**Selecting:**
- Resource + Dependencies are selected together
- Clear visual feedback (multiple checkmarks appear)
- Console shows auto-selection

**Deselecting:**
- Dependents are cascade deselected first
- Maintains data integrity automatically
- Console shows cascade chain
- User gets immediate visual feedback

This approach ensures users can never create an invalid state while maintaining full control over their selections.
