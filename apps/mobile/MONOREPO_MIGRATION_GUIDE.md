# Monorepo Migration Guide

## Overview

This guide will help you migrate the current BT-Synergy app into a Turborepo monorepo structure with Bun.

## Structure

```
bt-synergy/
├── apps/
│   └── mobile/          # React Native + Expo (moved from root)
├── packages/
│   └── shared/          # Shared code between mobile and web
├── turbo.json
├── package.json         # Workspace root
└── bun.lockb
```

## Migration Steps

### 1. Prerequisites

Stop all running processes:
- Stop Expo dev server (Ctrl+C in terminal)
- Close VS Code completely
- Make sure no other processes have files open

### 2. Run Migration Script

```bash
# From the root directory
./migrate-to-monorepo.bat
```

This will move all mobile app files to `apps/mobile/`.

### 3. Update Mobile Package Name

Edit `apps/mobile/package.json` and change the name:

```json
{
  "name": "@bt-synergy/mobile",
  ...
}
```

### 4. Install Dependencies

```bash
# Install Bun if not already installed
npm install -g bun

# Install workspace dependencies
bun install

# Install turbo globally (optional, for better CLI)
bun add -g turbo
```

### 5. Verify Structure

Check that files are in the right place:

```
✓ apps/mobile/app/
✓ apps/mobile/lib/
✓ apps/mobile/android/
✓ apps/mobile/app.json
✓ apps/mobile/metro.config.js
✓ packages/shared/src/
✓ turbo.json
✓ package.json (workspace root)
```

### 6. Run Mobile App

```bash
# From root
bun mobile          # Start Expo
bun mobile:android  # Run Android
bun mobile:web      # Run Web (note: still has import.meta issues)
```

Or from the mobile directory:

```bash
cd apps/mobile
bun start
```

## Next Steps

### Phase 1: Verify Mobile Works ✅
- [ ] Mobile app runs on Android
- [ ] Mobile app runs on iOS
- [ ] All features work as before

### Phase 2: Extract Shared Code
- [ ] Move types from `apps/mobile/lib/types/` to `packages/shared/src/types/`
- [ ] Move utils from `apps/mobile/lib/utils/` to `packages/shared/src/utils/`
- [ ] Move config from `apps/mobile/lib/config/` to `packages/shared/src/config/`
- [ ] Update imports in mobile app to use `@bt-synergy/shared`

### Phase 3: Create Web App
- [ ] Create `apps/web/` with Next.js or Vite
- [ ] Use `@bt-synergy/shared` for business logic
- [ ] Implement web-specific UI components
- [ ] Set up proper IndexedDB storage
- [ ] Deploy web app

## Troubleshooting

### Files won't move
- Make sure VS Code is closed
- Stop all terminals
- Kill any node/expo processes: `taskkill /F /IM node.exe`

### Bun install fails
- Delete `node_modules/` and `bun.lockb`
- Run `bun install` again

### Mobile app won't start
- Check that `apps/mobile/package.json` name is `@bt-synergy/mobile`
- Run `cd apps/mobile && bun install`
- Try `cd apps/mobile && bun start --clear`

## Benefits of Monorepo

1. **Shared Code**: Types, utils, and business logic shared between mobile and web
2. **Independent Deployment**: Deploy web and mobile separately
3. **Better Tooling**: Use best tools for each platform (Expo for mobile, Next.js for web)
4. **Faster Development**: Turbo caching speeds up builds and tests
5. **Clear Boundaries**: Forces better architecture and separation of concerns

## Commands Reference

```bash
# Workspace commands (from root)
bun dev              # Run all apps in dev mode
bun build            # Build all apps
bun lint             # Lint all packages
bun type-check       # Type check all packages

# Mobile commands
bun mobile           # Start Expo
bun mobile:android   # Run Android
bun mobile:ios       # Run iOS
bun mobile:web       # Run Web

# Individual package commands
cd apps/mobile && bun start
cd packages/shared && bun lint
```

