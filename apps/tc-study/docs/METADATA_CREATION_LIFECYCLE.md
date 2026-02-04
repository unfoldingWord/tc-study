# Metadata Creation Lifecycle

## Overview

README and license data are **added in a separate enrichment step** after the initial metadata is created. This is by design, as these fields require additional network requests.

## The Two-Phase Process

### Phase 1: Initial Metadata (Fast)
Door43 catalog search API returns basic metadata synchronously.

### Phase 2: Enrichment (Slow)
Additional files (README, LICENSE, manifest.yaml) are fetched asynchronously.

---

## Detailed Flow

### Step 1: Door43 Catalog Search

**API Call:** `door43Client.searchCatalog()`

**Returns:** `Door43Resource` interface with:

```typescript
{
  id: 'ult',
  name: 'en_ult',
  title: 'Unlocked Literal Bible',
  owner: 'unfoldingWord',
  language: 'en',
  subject: 'Bible',
  version: '45',
  description: 'Short description from repo',  // ✅ Available immediately
  license: 'CC BY-SA 4.0',                       // ⚠️ Sometimes available from catalog
  metadata_url: 'https://git.door43.org/...',
  // ❌ NO readme field
  // ❌ NO ingredients field
  // ❌ NO full license text
}
```

**Source:** `packages/door43-api/src/Door43ApiClient.ts` lines 48-78

**Key Point:** The catalog API returns only **basic metadata** - no README content!

---

### Step 2: Enrichment (Separate Network Calls)

**API Call:** `door43Client.enrichResourceMetadata(resource)`

This function makes **3 additional HTTP requests**:

#### 2a. Fetch `manifest.yaml`

```
URL: resource.metadata_url
Example: https://git.door43.org/unfoldingWord/en_ult/raw/branch/master/manifest.yaml
```

**Extracts:**
- `license` (from `rights:` field)
- `ingredients` (list of books/chapters)

**Code:** Lines 517-596

#### 2b. Fetch `README.md`

```
URL: resource.metadata_url.replace('manifest.yaml', 'README.md')
Example: https://git.door43.org/unfoldingWord/en_ult/raw/branch/master/README.md
```

**Returns:**
- Full README content (markdown)

**Code:** Lines 603-627

#### 2c. Fetch `LICENSE` file

```
Tries multiple filenames: LICENSE, LICENSE.md, LICENSE.txt, LICENCE, LICENCE.md
Example: https://git.door43.org/unfoldingWord/en_ult/raw/branch/master/LICENSE.md
```

**Returns:**
- Full license text

**Code:** Lines 629-655

---

## Implementation in the Wizard

### In `AddToCatalogWizard.tsx`

```typescript
// Step 1: Initial metadata from Door43 catalog (FAST)
const door43Resources = await door43Client.searchCatalog({ ... })

for (const resource of door43Resources) {
  // resource has:
  // ✅ title, description, owner, language
  // ❌ NO readme, NO ingredients

  // Step 2: Enrichment (SLOW - separate network calls)
  const enrichedData = await door43Client.enrichResourceMetadata(resource)
  // enrichedData has:
  // ✅ readme (from README.md)
  // ✅ license (from LICENSE file)
  // ✅ ingredients (from manifest.yaml)

  // Step 3: Merge enriched data into catalog metadata
  const resourceMetadata = {
    // Basic fields from Step 1
    title: resource.title,
    description: resource.description,
    
    // Enriched fields from Step 2
    longDescription: enrichedData?.readme || undefined,
    license: enrichedData?.license ? { id: enrichedData.license } : undefined,
    contentMetadata: {
      ingredients: enrichedData?.ingredients,
    }
  }

  // Step 4: Save to catalog
  await catalogManager.addResourceToCatalog(resourceMetadata)
}
```

**Location:** Lines 365-443

---

## The Problem This Causes

### Issue 1: Timing Gap

There's a gap between when the metadata object is created and when README/license are added:

```typescript
// Metadata created (Phase 1)
const metadata = { title: '...', description: '...' }

// ... some time passes (network requests) ...

// README added (Phase 2)
metadata.longDescription = enrichedData.readme
metadata.license = { id: enrichedData.license }
```

### Issue 2: Field Name Inconsistency

Different code paths use different field names:

| Phase | Field Name | Type |
|-------|------------|------|
| **Catalog Storage** | `longDescription` | string |
| **Runtime Expectation** | `readme` | string |
| **Catalog Storage** | `license: { id }` | object |
| **Runtime Expectation** | `license` | string |

### Issue 3: Optional Enrichment

The enrichment step can fail or be skipped:

```typescript
try {
  enrichedData = await door43Client.enrichResourceMetadata(resource)
} catch (err) {
  console.warn('Failed to enrich metadata:', err)
  // ⚠️ Continue without README/license
}
```

If this fails, the resource is saved **without** README/license data.

---

## Why This Architecture?

### Performance Tradeoff

**Good:**
- Fast initial load (catalog search is 1 API call)
- Can display resource list quickly
- Enrichment only needed when actually using the resource

**Bad:**
- README/license may not be available immediately
- Requires error handling for failed enrichment
- Field name mapping complexity

### Network Efficiency

Fetching README/license for **all** resources would be slow:

```
Search returns 50 resources
→ 1 API call (fast)

If we enriched all:
→ 50 × 3 = 150 additional API calls (very slow!)
```

Instead, we only enrich when:
- Adding to catalog (one-time)
- User clicks info button (on-demand)

---

## Solutions

### Option 1: Eager Enrichment (Current)

✅ Enrich when adding to catalog (already implemented)

```typescript
// In AddToCatalogWizard.tsx
const enrichedData = await door43Client.enrichResourceMetadata(resource)
await catalogManager.addResourceToCatalog({
  ...metadata,
  longDescription: enrichedData.readme,
  license: { id: enrichedData.license }
})
```

### Option 2: Lazy Enrichment (On-Demand)

Enrich only when user opens info modal:

```typescript
// In ResourceInfoModal.tsx
const [readme, setReadme] = useState('')

useEffect(() => {
  if (!resource.readme && resource.metadata_url) {
    door43Client.enrichResourceMetadata(resource).then(enriched => {
      setReadme(enriched.readme)
    })
  }
}, [resource])
```

### Option 3: Background Enrichment

Enrich all catalog resources in the background:

```typescript
// In CatalogManager
async enrichAllResources() {
  const allResources = await this.getAllResources()
  
  for (const resource of allResources) {
    if (!resource.readme && resource.metadata_url) {
      const enriched = await door43Client.enrichResourceMetadata(resource)
      await this.updateResource(resource.resourceKey, {
        readme: enriched.readme,
        license: enriched.license
      })
    }
  }
}
```

---

## Current Implementation Status

### ✅ What Works

1. **Wizard adds new resources**
   - Enrichment happens before saving to catalog
   - README/license stored correctly

2. **Wizard adds existing resources**
   - Reads from catalog (has README/license from previous enrichment)

3. **Export collections**
   - Normalizes field names during export

4. **Import collections**
   - Extracts README/license from metadata files

### ⚠️ What Could Be Better

1. **Enrichment failures are silent**
   - If enrichment fails, resource is saved without README/license
   - No retry mechanism

2. **No background enrichment**
   - If a resource is added to catalog without enrichment, it stays without README

3. **Field name mapping is fragile**
   - Relies on runtime checks: `metadata.readme || metadata.longDescription`
   - Could break if catalog structure changes

---

## Recommendations

### Short Term

1. **Add enrichment validation**

```typescript
const enrichedData = await door43Client.enrichResourceMetadata(resource)

if (!enrichedData.readme) {
  console.warn(`⚠️ No README found for ${resource.title}`)
}

if (!enrichedData.license && !resource.license) {
  console.warn(`⚠️ No license found for ${resource.title}`)
}
```

2. **Retry failed enrichment**

```typescript
async function enrichWithRetry(resource, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await door43Client.enrichResourceMetadata(resource)
    } catch (err) {
      if (i === maxRetries - 1) throw err
      await sleep(1000 * (i + 1)) // Exponential backoff
    }
  }
}
```

### Long Term

1. **Standardize field names in catalog**
   - Always use `readme` (not `longDescription`)
   - Always use `license: string` (not `license: { id: string }`)

2. **Add enrichment queue**
   - Background worker enriches catalog resources
   - Updates metadata when README/license are found

3. **Cache enrichment results**
   - Store enriched data separately
   - Merge when needed (don't duplicate in catalog)

---

## Key Takeaway

**Yes, you're absolutely right!** README and license are added **separately** from initial metadata creation through an async enrichment process that makes 3 additional network requests. This is why:

1. Field names are inconsistent (`longDescription` vs `readme`)
2. Data may be missing if enrichment fails
3. We need extraction logic everywhere

The current fixes handle the field name mapping, but the underlying architecture could be improved with better enrichment strategies.
