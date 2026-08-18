# BT Synergy Documentation

Welcome to the BT Synergy framework documentation! This framework enables you to build powerful, extensible Bible translation and study applications.

## 📚 Documentation Index

### Getting Started
- **[Extending registries](./extending-registries.md)** - Resource types, panel entries, panel modes
- **[Framework Guide](./FRAMEWORK_GUIDE.md)** - Panels, custom sources, building apps
  - Architecture overview
  - Creating custom panels
  - Building custom apps

### Core Features
- **[Preloaded Resources](./PRELOADED_RESOURCES.md)** - Bundling resources with your app
  - How it works
  - Adding new preloaded resources
  - Developer guide
  - Troubleshooting

### For Developers

#### I want to...

**Add a new resource type** (e.g., Translation Questions, Study Notes)
- → See [Extending registries](./extending-registries.md)
- → See [Preloaded Resources - Supporting New Resource Types](./PRELOADED_RESOURCES.md#supporting-new-resource-types)

**Add more preloaded resources** (e.g., French translations, Study helps)
- → See [Preloaded Resources - Adding New Resources](./PRELOADED_RESOURCES.md#adding-new-preloaded-resources)

**Create a custom panel layout** (e.g., 4-panel translator workspace)
- → See [Framework Guide - Adding New Panel Types](./FRAMEWORK_GUIDE.md#2-adding-new-panel-types)

**Support resources from a custom source** (e.g., Paratext, custom server)
- → See [Framework Guide - Custom Resource Sources](./FRAMEWORK_GUIDE.md#3-custom-resource-sources)

**Create a new app based on BT Synergy**
- → See [Framework Guide - Building Custom Apps](./FRAMEWORK_GUIDE.md#-building-custom-apps)

**Debug resource loading issues**
- → See [Preloaded Resources - Troubleshooting](./PRELOADED_RESOURCES.md#troubleshooting)

---

## 🏗️ Framework Overview

BT Synergy is built on three core principles:

### 1. **Modularity**
Everything is a plugin - resource types, loaders, parsers, and viewers are all modular and replaceable.

```typescript
// Resource types load. Panel entries paint. See extending-registries.md
resourceTypeRegistry.register(myResourceType)
panelEntryRegistry.register(myPaneMemberEntry)
```

### 2. **Extensibility**
The framework provides extension points at every layer:
- **Resource Types**: Add support for new content types
- **Loaders**: Custom logic for fetching and caching
- **Parsers**: Support for new file formats
- **Viewers**: Custom UI for displaying resources
- **Panels**: Unlimited panels with custom layouts

### 3. **Offline-First**
Built for offline operation:
- Preloaded metadata bundled with the app
- On-demand content fetching
- Three-tier caching (memory → IndexedDB → network)
- Progressive loading for responsiveness

---

## 🚀 Quick Examples

### Example 1: Load a Preloaded Resource into a Panel

```typescript
import { useWorkspaceStore } from './lib/stores/workspaceStore'
import { useAppStore } from './lib/stores/appStore'

function MyComponent() {
  const addResourceToPanel = useWorkspaceStore(state => state.addResourceToPanel)
  
  const loadUGNT = () => {
    addResourceToPanel('panel-1', 'unfoldingWord/el-x-koine/ugnt')
  }
  
  return <button onClick={loadUGNT}>Load Greek NT</button>
}
```

### Example 2: Add a New Resource Type

A resource type loads. A panel entry paints. Dual-register if the type should appear in a pane.

See **[extending-registries.md](./extending-registries.md)**.

### Example 3: Create a Custom Panel Layout

```typescript
function TranslatorWorkspace() {
  const { createPanel } = useWorkspace()
  
  useEffect(() => {
    // Create a 3-panel layout
    const originalPanel = createPanel('Original')
    const gatewayPanel = createPanel('Gateway')
    const translationPanel = createPanel('Translation')
    
    // Load resources
    addResourceToPanel(originalPanel, 'unfoldingWord/el-x-koine/ugnt')
    addResourceToPanel(gatewayPanel, 'unfoldingWord/en/ult')
    // User will add their translation to translationPanel
  }, [])
  
  return <PanelGrid />
}
```

---

## 📦 Package Structure

```
packages/
├── catalog-manager/         # Resource metadata & catalog
├── scripture-loader/        # Scripture content loading
├── resource-types/          # Type definitions & registry
├── panel-system/            # Panel management
├── door43-client/          # Door43 API client
└── storage/                # IndexedDB & caching

apps/
├── tc-study/               # Main translation/study app
└── your-custom-app/        # Your custom app here!
```

---

## 🎯 Key Concepts

### Resource Key Format
Always use: `{owner}/{language}/{resourceId}`
```typescript
// ✅ Correct
'unfoldingWord/en/ult'
'unfoldingWord/el-x-koine/ugnt'

// ❌ Wrong
'unfoldingWord/el-x-koine/el-x-koine_ugnt'  // Duplicated language
'ult'  // Missing owner and language
```

### Ingredients
The secret to on-demand loading. Each ingredient represents a downloadable unit (usually a book):
```typescript
interface Ingredient {
  identifier: string  // e.g., 'gen', 'mat'
  title: string      // e.g., 'Genesis', 'Matthew'
  path: string       // e.g., '01-GEN.usfm' (file path)
}
```

### Resource Status Icons
- 🟣 **Purple Package** - In your workspace collection (metadata available)
- 🟢 **Green Database** - Fully downloaded (content cached)
- 🔵 **Blue Wifi** - Available online (can be downloaded)

---

## 🛠️ Development Workflow

### 1. Adding a New Resource
```bash
# Edit the build script
code apps/tc-study/scripts/generate-preloaded-resources.mjs

# Generate metadata
cd apps/tc-study
node scripts/generate-preloaded-resources.mjs

# Test in the app
pnpm dev
```

### 2. Developing a New Resource Type
```bash
# Create a new package
mkdir packages/my-resource-loader
cd packages/my-resource-loader
pnpm init

# Install dependencies
pnpm add @bt-synergy/resource-catalog

# Implement loader and tests
# Register in your app
```

### 3. Testing
```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @bt-synergy/my-package test

# Type checking
pnpm type-check
```

---

## 📖 Best Practices

1. **Always validate resourceKey format** - Use the helper functions
2. **Handle missing ingredients gracefully** - Not all resources have them
3. **Implement caching in loaders** - For better offline experience
4. **Use TypeScript** - Catch errors at compile time
5. **Add tests** - Especially for custom loaders and parsers
6. **Document your extensions** - Help other developers

---

## 🐛 Troubleshooting

### Common Issues

**Resources not showing in sidebar**
- Check browser console for errors
- Verify resourceKey format
- Clear browser storage and refresh

**Content not loading**
- Check that ingredients exist in metadata
- Verify file paths in ingredients
- Enable debug mode in loader

**Type errors**
- Run `pnpm type-check` to find issues
- Ensure interfaces match across packages

**Build errors**
- Run `pnpm install` to update dependencies
- Check that all packages are built: `pnpm build`

---

## 🤝 Contributing

We welcome contributions! Please:
1. Read the relevant documentation first
2. Follow existing patterns and conventions
3. Add tests for new features
4. Update documentation
5. Submit a pull request

---

## 📞 Support

- **Documentation**: You're reading it! Check the guides above
- **Issues**: Open an issue on GitHub
- **Questions**: Check existing issues or start a discussion

---

## 🎓 Learning Path

**New to the framework?**
1. Read the [Framework Guide](./FRAMEWORK_GUIDE.md) architecture section
2. Explore the tc-study app code
3. Try adding a preloaded resource (easiest)
4. Try creating a custom panel layout
5. Try adding a new resource type (advanced)

**Ready to build your own app?**
1. Read [Building Custom Apps](./FRAMEWORK_GUIDE.md#-building-custom-apps)
2. Study the minimal translation app example
3. Start with the framework packages
4. Customize for your use case

---

## 📄 License

This framework is part of the BT Synergy project. See the main LICENSE file for details.
