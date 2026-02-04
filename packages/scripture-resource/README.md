# @bt-synergy/scripture-resource

Complete Scripture resource type package for tc-study applications.

## Features

- ✅ **USFM Parser** - Parse Bible texts in USFM format
- ✅ **Verse-level precision** - Navigate and display at verse level
- ✅ **Inter-panel communication** - Send/receive signals for token clicks, navigation, etc.
- ✅ **Highlighting support** - Visual highlighting of verses and words
- ✅ **Configurable viewer** - Font size, verse numbers, red letters
- ✅ **Memory caching** - Fast performance with intelligent caching
- ✅ **TypeScript support** - Full type safety

## Installation

```bash
# In your app
pnpm add @bt-synergy/scripture-resource
```

## Quick Start

### 1. Register the Resource Type

```tsx
// src/contexts/CatalogContext.tsx
import { scriptureResourceType } from '@bt-synergy/scripture-resource'

// In your initialization:
resourceTypeRegistry.register(scriptureResourceType)
```

### 2. Done!

That's it! Scripture resources now work in your app with:
- Automatic loading from Door43
- Interactive viewer with word clicks
- Inter-panel communication
- Navigation signals

## Usage

### Basic Usage (Automatic)

Once registered, scripture resources are automatically handled when added to panels. No additional code needed!

### Advanced: Custom Implementation

If you need to customize the viewer or loader:

```tsx
import { ScriptureViewer, ScriptureLoader } from '@bt-synergy/scripture-resource'

// Use the viewer directly
<ScriptureViewer
  resourceId="en_ult"
  resourceKey="unfoldingWord/en_ult"
  isAnchor={true}
/>

// Use the loader directly
const loader = new ScriptureLoader(resourceKey, cache)
const chapter = await loader.loadChapter('GEN', 1)
```

## Signals

### Sends

- `token-click` - When a word is clicked
- `text-selection` - When text is selected
- `verse-navigation` - When navigating internally
- `resource-loaded` - When content finishes loading

### Receives

- `verse-navigation` - Navigate to a specific verse
- `book-navigation` - Navigate to a book/chapter
- `scroll-sync` - Sync scrolling with anchor resource

## Configuration

Customize in resource type settings:

```tsx
{
  showVerseNumbers: boolean,    // Display verse numbers
  fontSize: 'small' | 'medium' | 'large' | 'xlarge',
  showRedLetters: boolean,       // Red letters for Jesus' words
  enableWordLinks: boolean       // Make words clickable
}
```

## Package Structure

```
@bt-synergy/scripture-resource/
├── loader/          # ScriptureLoader class
├── viewer/          # ScriptureViewer component
├── signals/         # Custom signals (if any)
├── types/           # TypeScript types
├── resourceType.ts  # Registration definition
└── index.ts         # Public API
```

## Dependencies

- `@bt-synergy/resource-types` - Base resource type system
- `@bt-synergy/resource-panels` - Inter-panel communication
- `@bt-synergy/usfm-processor` - USFM parsing
- `@bt-synergy/resource-cache` - Caching infrastructure

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Clean
pnpm clean
```

## Examples

See `apps/tc-study` for a complete implementation using this package.

## License

MIT
