# Bible Translator Web App

A platform-agnostic web application for working with Bible translation resources, built with maximum code reuse in mind.

## 🎯 Architecture

### **Shared Codebase Strategy**
This app is designed to share **90%+ code** with the mobile app:
- ✅ Business logic (hooks, state management)
- ✅ UI components (platform-agnostic React components)
- ✅ Data processing (parsers, adapters)
- ❌ Platform adapters (10% web-specific: IndexedDB, Web APIs)

### **Tech Stack**
- **Framework**: Vite + React + TypeScript
- **Routing**: React Router v6
- **State**: Zustand
- **Storage**: IndexedDB (via `idb`)
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Panels**: linked-panels (web port coming)

### **Dependencies**
Platform-agnostic libraries from the monorepo:
- `@bt-synergy/door43-api` - Door43 catalog & content fetching
- `@bt-synergy/resource-parsers` - USFM, TSV, Markdown parsing
- `@bt-synergy/resource-adapters` - Resource processing pipeline
- `@bt-synergy/package-builder` - Package manifest handling

## 📁 Project Structure

```
bible-web/
├── src/
│   ├── pages/              # Route pages
│   │   ├── Home.tsx
│   │   ├── Browse.tsx      # Browse Door43 catalog
│   │   ├── Library.tsx     # My downloaded resources
│   │   ├── Reader.tsx      # Two-panel reader
│   │   └── Settings.tsx
│   │
│   ├── components/         # Reusable UI components
│   │   ├── Layout.tsx
│   │   ├── panels/         # Panel system (to be added)
│   │   └── resources/      # Resource viewers (to be added)
│   │
│   ├── lib/                # Business logic (REUSABLE)
│   │   ├── hooks/          # Custom hooks
│   │   ├── stores/         # Zustand stores
│   │   ├── storage/        # IndexedDB wrapper
│   │   └── extensions/     # Manifest extensions
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 🚀 Development

### **Install Dependencies**
```bash
bun install
```

### **Run Dev Server**
```bash
bun run dev
```

Visit: http://localhost:5173

### **Build for Production**
```bash
bun run build
```

### **Type Check**
```bash
bun run type-check
```

## 📦 Planned Features

### **Phase 1: Foundation** ✅ (Complete)
- [x] App structure & routing
- [x] Navigation layout
- [x] Home, Browse, Library, Reader, Settings pages

### **Phase 2: State & Storage** (Next)
- [ ] Zustand stores (packages, resources, panels)
- [ ] IndexedDB wrapper for offline storage
- [ ] Package loading & caching

### **Phase 3: Panel System**
- [ ] Two-panel layout with linked navigation
- [ ] Panel state management
- [ ] Resource switching
- [ ] Manifest extension system

### **Phase 4: Resource Viewers**
- [ ] Bible reader (USFM rendering)
- [ ] Translation notes viewer
- [ ] Translation questions viewer
- [ ] Translation words viewer
- [ ] Original language viewer

### **Phase 5: Integration**
- [ ] Door43 catalog browsing
- [ ] Resource download manager
- [ ] Package installation
- [ ] Cross-resource linking

## 🔄 Code Reuse Plan

### **To Be Extracted to Shared Packages**

As we build features, we'll extract reusable code into shared packages:

1. **`@bt-synergy/app-core`** (NEW)
   - Custom hooks (useResource, usePanel, etc.)
   - Business logic controllers
   - Type definitions
   
2. **`@bt-synergy/ui-components`** (NEW)
   - BibleReader component
   - NotesViewer component  
   - ResourceCard component
   - All platform-agnostic UI
   
3. **`@bt-synergy/manifest-extensions`** (NEW)
   - Extension schema
   - Merger logic
   - Storage interface

### **Platform-Specific (Web)**
- IndexedDB storage adapter
- Web Workers for parsing
- Service Worker for PWA
- Web-specific routing

### **Platform-Specific (Mobile)**
- SQLite storage adapter
- React Native navigation
- Native modules integration

## 🎨 Design Principles

1. **Platform Agnostic First**: Write code that works on both web and mobile
2. **Inject Platform Adapters**: Use dependency injection for platform-specific code
3. **React for UI**: Same React components work everywhere
4. **TypeScript**: Type safety across platforms
5. **Composable**: Build with small, reusable pieces

## 📚 Documentation

- Architecture diagrams (coming soon)
- Component documentation (coming soon)
- API references (in package READMEs)

## 🤝 Contributing

This app is part of the bt-synergy monorepo. See monorepo README for contribution guidelines.

---

**Status**: 🚧 **Under Active Development**  
**Current Phase**: Foundation Complete, Building State Management Next