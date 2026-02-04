# @bt-synergy/scripture-resource

Bible texts in USFM format with verse-level precision

## Installation

```bash
pnpm add @bt-synergy/scripture-resource
```

## Usage

```typescript
import { scriptureResourceType } from '@bt-synergy/scripture-resource'

// Register the resource type
resourceTypeRegistry.register(scriptureResourceType)
```

## Features

- ✅ Cross-platform support (Web only)
- ✅ Type-safe signal communication
- ✅ Automatic enhancement with panel communication
- ✅ Full TypeScript support

## Resource Type

**ID**: `scripture`  
**Display Name**: Scripture  
**Subjects**: Bible, Aligned Bible, Greek New Testament, Hebrew Old Testament

## Signals

This resource type:
- **Receives**: (Define signals this resource handles)
- **Emits**: (Define signals this resource sends)

See `src/signals/index.ts` for signal definitions.

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev
```

## License

MIT © 2025
