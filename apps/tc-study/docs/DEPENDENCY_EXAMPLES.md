# Resource Dependency Examples - Quick Reference

## Visual Flow

```
User adds: unfoldingWord/es-419_twl
                    ↓
System checks: Does it have dependencies?
                    ↓
             YES: Requires TW
                    ↓
Matching rules: { resourceType: 'words', sameLanguage: true, sameOwner: true }
                    ↓
System looks for: unfoldingWord/es-419_tw
                    ↓
         ┌──────────┴──────────┐
         ↓                     ↓
    FOUND in workspace    NOT FOUND
         ↓                     ↓
    ✓ Continue          Search in wizard
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
               FOUND in wizard     NOT FOUND
                    ↓                   ↓
          Auto-download TW        ⚠️  Show error
          Then add TWL            Don't add TWL
```

## Code Examples

### Example 1: Translation Words Links → Translation Words

**Resource Type Definition** (`translationWordsLinks.ts`):
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  sameLanguage: true,   // Must match TWL's language
  sameOwner: true,      // Must match TWL's organization
}]
```

**Real-World Scenario**:
| You Add | System Requires | Why |
|---------|----------------|-----|
| `unfoldingWord/es-419_twl` | `unfoldingWord/es-419_tw` | TWL links reference TW articles |
| `door43/swh_twl` | `door43/swh_tw` | Same language & org |
| `custom-org/en_twl` | `custom-org/en_tw` | Same language & org |

### Example 2: Translation Notes → ULT (Hypothetical)

**Resource Type Definition**:
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
  language: 'en',              // Always English
  owner: 'unfoldingWord',      // Always unfoldingWord
  // Could add: resourceId: 'ult' if we had that feature
}]
```

**Real-World Scenario**:
| You Add | System Requires | Why |
|---------|----------------|-----|
| `unfoldingWord/es-419_tn` | `unfoldingWord/en_ult` | Notes aligned to English ULT |
| `door43/swh_tn` | `unfoldingWord/en_ult` | Notes aligned to English ULT |
| `custom-org/fr_tn` | `unfoldingWord/en_ult` | Notes aligned to English ULT |

### Example 3: Complex Multi-Dependency (Hypothetical)

**Resource Type Definition**:
```typescript
dependencies: [
  // Needs TW from same language and org
  {
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sameLanguage: true,
    sameOwner: true,
  },
  // Also needs English ULT
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'en',
    owner: 'unfoldingWord',
  },
  // Also needs English TW from unfoldingWord
  {
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    language: 'en',
    owner: 'unfoldingWord',
  }
]
```

**Real-World Scenario**:
| You Add | System Requires | Why |
|---------|----------------|-----|
| `custom-org/swh_advanced-notes` | 1. `custom-org/swh_tw`<br>2. `unfoldingWord/en_ult`<br>3. `unfoldingWord/en_tw` | Complex resource needing multiple dependencies |

## Dependency Type Comparison

| Type | Code | Result | Use Case |
|------|------|--------|----------|
| **Any** | `'words'` | Any TW from any language/org | Rare - too loose |
| **Same Language** | `{ resourceType: 'words', sameLanguage: true }` | TW from same language, any org | Medium |
| **Same Org** | `{ resourceType: 'words', sameOwner: true }` | TW from same org, any language | Rare |
| **Both** ⭐ | `{ resourceType: 'words', sameLanguage: true, sameOwner: true }` | TW from same language AND org | **Most common** |
| **Fixed Language** | `{ resourceType: 'words', language: 'en' }` | Always English TW, any org | Medium |
| **Fixed Org** | `{ resourceType: 'words', owner: 'unfoldingWord' }` | Always unfoldingWord TW, any language | Rare |
| **Mixed** | `{ resourceType: 'words', sameLanguage: true, owner: 'unfoldingWord' }` | TW from same language, always unfoldingWord | Use for "official" dependencies |

## Quick Decision Guide

**"Should the dependency match the resource's language?"**
- **YES** → Add `sameLanguage: true`
- **NO, always English** → Add `language: 'en'`
- **NO, doesn't matter** → Leave out language fields

**"Should the dependency match the resource's organization?"**
- **YES** → Add `sameOwner: true`
- **NO, always unfoldingWord** → Add `owner: 'unfoldingWord'`
- **NO, doesn't matter** → Leave out owner fields

## Most Common Pattern ⭐

For most resource dependencies, use this pattern:

```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.REQUIRED_RESOURCE,
  sameLanguage: true,
  sameOwner: true,
}]
```

This ensures the dependency matches both language and organization, which is almost always what you want.

## Console Output Examples

### Successful Auto-Download
```
✓ Found dependency: words -> unfoldingWord Spanish Translation Words
   🔗 Auto-adding dependencies: [unfoldingWord/es-419_tw]
```

### Missing Dependency (Warning)
```
⚠️  unfoldingWord Spanish Translation Words Links requires: Translation Words (same language & org)
⚠️  Could not find dependency: Translation Words (same language & org)
```

### Already Have Dependency
```
(No console output - dependency check passes silently)
```

## Testing Checklist

When testing a new resource dependency:

- [ ] Try adding with dependency already in workspace
- [ ] Try adding without dependency (should auto-download)
- [ ] Try adding when dependency not available (should show error)
- [ ] Verify correct dependency is selected (right language/org)
- [ ] Check console for helpful messages

## Common Mistakes

### ❌ Wrong: Using string when you need context
```typescript
dependencies: ['words']  // Will match ANY TW, even wrong language!
```

### ✅ Correct: Use object with rules
```typescript
dependencies: [{
  resourceType: 'words',
  sameLanguage: true,
  sameOwner: true
}]
```

### ❌ Wrong: Typo in resource type
```typescript
dependencies: [{
  resourceType: 'translation-words'  // Wrong! Not the actual ID
}]
```

### ✅ Correct: Use constants
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS  // Type-safe!
}]
```

### ❌ Wrong: Forgetting to import constants
```typescript
dependencies: [{
  resourceType: 'words'  // Magic string, prone to typos
}]
```

### ✅ Correct: Import and use constants
```typescript
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS
}]
```
