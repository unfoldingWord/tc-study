# Manifest Format Enhancements

## Overview
All enhancements use **catalog-only data** - no additional API requests required!

## What Was Added

### 1. Gateway Language Flag 🌍
```json
"language": {
  "code": "en",
  "name": "English", 
  "direction": "ltr",
  "isGatewayLanguage": true  // ← NEW
}
```
**Purpose**: Apps can prioritize gateway languages for translation workflows

### 2. Enhanced Download Options 📥
```json
"download": {
  "url": "https://.../archive/v87.zip",
  "format": "zip",
  "tarballUrl": "https://.../archive/v87.tar.gz"  // ← NEW
}
```
**Purpose**: Apps can choose between zip or tarball formats

### 3. Complete Source Attribution 🔗
```json
"source": {
  "repoUrl": "https://git.door43.org/unfoldingWord/en_ult",
  "releaseTag": "v87",                        // ← NEW
  "releasedAt": "2025-11-20T22:38:42Z",      // ← NEW
  "releaseUrl": "https://.../releases/tag/v87",  // ← NEW
  
  // Metadata URLs (from catalog - guaranteed to exist)
  "manifestUrl": "https://.../manifest.yaml",        // ← NEW (raw file)
  "metadataApiUrl": "https://...metadata/...",       // ← NEW (parsed JSON)
  "contentsApiUrl": "https://.../contents?ref=...",  // ← NEW (browse files)
  
  // Documentation URLs (constructed - may not exist, verify before using)
  "readmeUrl": "https://.../README.md",          // ← NEW (long description)
  "licenseUrl": "https://.../LICENSE.md"         // ← NEW (license terms)
}
```
**Purpose**: 
- Full attribution and traceability
- **Guaranteed URLs** from catalog (manifestUrl, metadataApiUrl, contentsApiUrl)
- **Optional URLs** constructed for convenience (readmeUrl, licenseUrl)
- Apps can fetch license/readme on-demand (no forced downloads)
- Users can verify release authenticity

**Important**: README and LICENSE URLs are constructed but not verified. Use the provided verification utilities:
```typescript
import { verifyDocumentationUrls } from '@bt-synergy/package-builder'

const result = await verifyDocumentationUrls(
  resource.source.readmeUrl,
  resource.source.licenseUrl
)

if (result.readme?.exists) {
  // Fetch README safely
}
```

### 4. Rich Content Metadata 📚
```json
"content": {
  "subject": "Aligned Bible",
  "title": "unfoldingWord® Literal Text",
  "description": "An open-licensed update...",  // ← NEW (short description)
  "format": "usfm",                             // ← NEW (file format)
  "flavorType": "scripture",                    // ← NEW (resource type)
  "flavor": "textTranslation",                  // ← NEW (specific flavor)
  "lastUpdated": "2025-11-20T22:38:42Z",
  "books": ["GEN", "EXO", ...],
  "ingredients": [...]
}
```
**Purpose**: Apps can display resource info without downloading/extracting files

### 5. Enhanced Ingredients 🧩
```json
"ingredients": [{
  "identifier": "gen",
  "title": "Genesis",
  "categories": ["bible-ot"],
  "sort": 1,
  "path": "./01-GEN.usfm",
  "size": 5154229,
  "alignmentCount": 23020,  // ← NEW (word alignments)
  "versification": "ufw",   // ← NEW (verse mapping system)
  "exists": true,           // ← NEW (file presence check)
  "isDir": false            // ← NEW (directory flag)
}]
```
**Purpose**: 
- Apps can show alignment progress
- Proper verse mapping across versions
- Pre-validation before download

### 6. Quality & Standards ⭐
```json
"metadata": {
  "type": "rc",              // ← NEW (metadata format)
  "version": "0.2",          // ← NEW (format version)
  "checkingLevel": "3"       // ← NEW (quality level: 1-3)
}
```
**Purpose**: 
- Filter resources by quality level
- Understand metadata format for parsing
- Quality assurance indicators

## Complete Example

```json
{
  "formatVersion": "2.0.0",
  "id": "pkg-unfoldingWord-en-1734209587058",
  "name": "English Gateway Resources",
  "version": "1.0.0",
  "createdAt": "2025-12-14T20:13:07Z",
  "updatedAt": "2025-12-14T20:13:07Z",
  
  "resources": [{
    "id": "unfoldingWord_en_ult",
    "type": "scripture",
    "owner": "unfoldingWord",
    
    "language": {
      "code": "en",
      "name": "English",
      "direction": "ltr",
      "isGatewayLanguage": true
    },
    
    "resourceId": "ult",
    "version": "v87",
    
    "download": {
      "url": "https://git.door43.org/unfoldingWord/en_ult/archive/v87.zip",
      "format": "zip",
      "tarballUrl": "https://git.door43.org/unfoldingWord/en_ult/archive/v87.tar.gz"
    },
    
    "source": {
      "repoUrl": "https://git.door43.org/unfoldingWord/en_ult",
      "releaseTag": "v87",
      "releasedAt": "2025-11-20T22:38:42Z",
      "releaseUrl": "https://git.door43.org/unfoldingWord/en_ult/releases/tag/v87",
      "manifestUrl": "https://git.door43.org/unfoldingWord/en_ult/raw/commit/517e84f/manifest.yaml",
      "readmeUrl": "https://git.door43.org/unfoldingWord/en_ult/raw/tag/v87/README.md",
      "licenseUrl": "https://git.door43.org/unfoldingWord/en_ult/raw/tag/v87/LICENSE.md"
    },
    
    "content": {
      "subject": "Aligned Bible",
      "title": "unfoldingWord® Literal Text",
      "description": "unfoldingWord® Literal Text (formerly ULB)",
      "format": "usfm",
      "flavorType": "scripture",
      "flavor": "textTranslation",
      "lastUpdated": "2025-11-20T22:38:42Z",
      "books": ["GEN", "EXO", "LEV", ...],
      "ingredients": [{
        "identifier": "gen",
        "title": "Genesis",
        "categories": ["bible-ot"],
        "sort": 1,
        "path": "./01-GEN.usfm",
        "size": 5154229,
        "alignmentCount": 23020,
        "versification": "ufw",
        "exists": true,
        "isDir": false
      }]
    },
    
    "metadata": {
      "type": "rc",
      "version": "0.2",
      "checkingLevel": "3"
    },
    
    "dependencies": ["unfoldingWord_el-x-koine_ugnt", "unfoldingWord_hbo_uhb"]
  }],
  
  "config": {
    "defaultServer": "https://git.door43.org"
  },
  
  "stats": {
    "estimatedSize": 16000000
  }
}
```

## What Apps Can Now Do

✅ **Prioritize gateway languages** (isGatewayLanguage)  
✅ **Show resource descriptions** (content.description)  
✅ **Display quality indicators** (metadata.checkingLevel)  
✅ **Track versions & releases** (source.releaseTag, releasedAt)  
✅ **Show alignment progress** (ingredients.alignmentCount)  
✅ **Map verses correctly** (ingredients.versification)  
✅ **Choose download format** (download.url vs tarballUrl)  
✅ **Fetch license on-demand** (source.licenseUrl)  
✅ **Show long descriptions** (source.readmeUrl)  
✅ **Verify authenticity** (source.releaseUrl)  
✅ **Pre-validate downloads** (ingredients.exists, size)  
✅ **Filter by resource type** (content.flavorType, flavor)  

## Performance

- **Zero extra API calls** - all data from catalog
- **Instant metadata access** - no file extraction needed
- **On-demand detail fetching** - apps fetch license/readme only when needed
- **Efficient bandwidth** - apps choose zip vs tarball based on needs

## Backward Compatibility

All new fields are **optional** - existing consumers continue to work unchanged.

