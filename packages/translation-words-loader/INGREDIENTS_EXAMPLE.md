# Translation Words Ingredients Example

This document shows the shape/structure of TW ingredients when using the Door43 contents API endpoint.

## Comparison: Catalog API vs Contents API

### Catalog API Response (High-Level Only)
The Door43 catalog API only returns a top-level directory ingredient:
```json
{
  "categories": null,
  "identifier": "bible",
  "path": "./bible",
  "sort": 0,
  "title": "translationWords",
  "versification": "",
  "exists": true,
  "is_dir": true,
  "size": 0
}
```

### Contents API Response (Extended with Individual Files)
Our implementation extends this by recursively discovering individual `.md` files, creating detailed ingredients that match the same `Door43Ingredient` interface structure.

## Example Ingredients Array

Based on the recursive file listing from `bible/` directory, here's what the extended ingredients array would look like:

```json
[
  {
    "identifier": "bible/kt/abomination",
    "title": "Abomination",
    "categories": ["kt"],
    "path": "bible/kt/abomination.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  },
  {
    "identifier": "bible/kt/adoption",
    "title": "Adoption",
    "categories": ["kt"],
    "path": "bible/kt/adoption.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  },
  {
    "identifier": "bible/kt/god",
    "title": "God",
    "categories": ["kt"],
    "path": "bible/kt/god.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  },
  {
    "identifier": "bible/names/abraham",
    "title": "Abraham",
    "categories": ["names"],
    "path": "bible/names/abraham.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  },
  {
    "identifier": "bible/names/jesus",
    "title": "Jesus",
    "categories": ["names"],
    "path": "bible/names/jesus.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  },
  {
    "identifier": "bible/other/covenant",
    "title": "Covenant",
    "categories": ["other"],
    "path": "bible/other/covenant.md",
    "sort": 0,
    "exists": true,
    "is_dir": false
  }
]
```

## Field Descriptions

- **`identifier`**: The entry ID without the `.md` extension (e.g., `"bible/kt/god"`)
- **`title`**: Human-readable title formatted from the term ID (e.g., `"god"` → `"God"`)
- **`categories`**: Array containing the category extracted from the path (e.g., `"kt"`, `"names"`, `"other"`)
- **`path`**: Full file path including `.md` extension (e.g., `"bible/kt/god.md"`)
- **`sort`**: Optional sort order (currently set to 0, can be used for custom ordering)
- **`exists`**: Boolean indicating if the file exists (always `true` for discovered files)
- **`is_dir`**: Boolean indicating if it's a directory (always `false` for `.md` files)

## Title Formatting

The `formatTitle()` function returns the filename exactly as-is, with no modifications.

**Why?** The actual title is stored in the markdown file content (e.g., `# word of God, word of Yahweh...`). We don't parse it at the ingredients stage because:
1. It would require fetching every file, which is expensive
2. The title will be extracted on-demand when loading the actual file content

### Formatting Examples

| File Name | Term ID | Title (in ingredients) | Actual Title (in markdown) |
|-----------|---------|------------------------|----------------------------|
| `god.md` | `god` | `god` | `# God` |
| `wordofgod.md` | `wordofgod` | `wordofgod` | `# word of God, word of Yahweh...` |
| `bornagain.md` | `bornagain` | `bornagain` | `# born again, born of God...` |
| `arkofthecovenant.md` | `arkofthecovenant` | `arkofthecovenant` | `# ark of the covenant...` |
| `call-speakloudly.md` | `call-speakloudly` | `call-speakloudly` | `# call, speak loudly...` |

**Note**: The title in ingredients is just the filename as-is. The real, properly formatted title will be extracted from the markdown content when the file is loaded.

## Structure Compatibility

✅ **Yes, it follows the same shape as native ingredients from the Door43 catalog API.**

Both use the `Door43Ingredient` interface:
```typescript
interface Door43Ingredient {
  identifier: string;
  title: string;
  categories?: string[];
  sort?: number;
  path?: string;
  size?: number;
  alignment_count?: number;
  versification?: string;
  exists?: boolean;
  is_dir?: boolean;
}
```

**Key Differences:**
- **Catalog API**: Only provides top-level directory (`bible/`)
- **Contents API (Our Implementation)**: Extends this by discovering individual files recursively

## How It's Generated

1. **Recursive Scan**: `listRepositoryFilesRecursive()` scans from `bible/` directory using the release tag
2. **Filter**: Only includes files ending with `.md`
3. **Path Parsing**: 
   - Extracts category from `bible/{category}/` pattern
   - Extracts term ID from filename (removes `.md`)
   - Creates identifier as `bible/{category}/{termId}`
4. **Title Formatting**: Converts term ID to title, handling:
   - Hyphens: `"born-again"` → `"Born Again"`
   - Underscores: `"born_again"` → `"Born Again"`
   - Simple words: `"god"` → `"God"`

## Real API Response Structure

The Door43 contents API returns files like this:

```json
{
  "name": "abomination.md",
  "path": "bible/kt/abomination.md",
  "type": "file",
  "size": 1990
}
```

Which gets transformed into the ingredient structure above.
