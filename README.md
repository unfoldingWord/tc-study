# BT Synergy Monorepo

A monorepo for BT Synergy applications and shared packages.

## Structure

```
bt-synergy/
├── apps/
│   ├── mobile/     # React Native + Expo mobile app
│   └── web/        # Web application (Next.js/Vite)
├── packages/
│   └── shared/     # Shared types, utils, and business logic
└── package.json    # Root workspace configuration
```

## Getting Started

### Prerequisites

- Node.js >= 18
- Bun >= 1.0
- For mobile: Android Studio / Xcode

### Installation

```bash
# Install dependencies for all workspaces
bun install

# Install turbo globally (optional)
bun add -g turbo
```

### Development

```bash
# Run all apps in development mode
bun run dev

# Run mobile app only
bun run mobile

# Run web app only
bun run web
```

### Building

```bash
# Build all apps
bun run build

# Build specific app
bun --cwd apps/mobile build
bun --cwd apps/web build
```

## Workspaces

### apps/mobile
React Native + Expo application for iOS and Android.
See [apps/mobile/README.md](apps/mobile/README.md) for details.

### apps/web
Web application built with modern web tooling.
See [apps/web/README.md](apps/web/README.md) for details.

### packages/shared
Shared code used across mobile and web apps:
- TypeScript types
- Business logic
- Utilities
- Common components (platform-agnostic)

## Scripts

- `bun run dev` - Start all apps in development mode
- `bun run build` - Build all apps
- `bun run lint` - Lint all packages
- `bun run clean` - Clean build artifacts

## Contributing

See individual package READMEs for specific contribution guidelines.

