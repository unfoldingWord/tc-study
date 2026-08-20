# BT Synergy Framework Guide

A comprehensive guide to extending and customizing the BT Synergy framework for building Bible translation and study applications.

## 🎯 Framework Philosophy

BT Synergy is designed as a **modular, extensible framework** that enables developers to:
- ✅ Create custom Bible study and translation applications
- ✅ Support multiple resource types (scripture, notes, questions, etc.)
- ✅ Add unlimited panels with flexible layouts
- ✅ Extend with custom resource loaders and viewers
- ✅ Bundle resources for offline-first experiences

---

## 📐 Core Architecture

### Module System

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                   (tc-study, your-app)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Workspace   │  │   Panels     │  │   Wizard     │     │
│  │   Manager    │  │   Layout     │  │   System     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│                    Framework Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Catalog    │  │   Resource   │  │   Content    │     │
│  │   Manager    │  │   Registry   │  │   Loaders    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│                    Package Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Scripture   │  │    Notes     │  │  Questions   │     │
│  │   Loader     │  │   Loader     │  │   Loader     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   USFM       │  │  Markdown    │  │     TSV      │     │
│  │   Parser     │  │   Parser     │  │   Parser     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

#### 1. **Resource Metadata** (Catalog Layer)
- Describes WHAT the resource is
- Stored in IndexedDB (catalog database)
- Enables search, filtering, and discovery
- Preloadable for instant availability

#### 2. **Resource Loaders** (Content Layer)
- Handles HOW to fetch and parse content
- Implements caching strategies
- Supports on-demand loading
- Extensible for new resource types

#### 3. **Resource Viewers** (Presentation Layer)
- Handles HOW to display content
- Panel-based rendering
- Interactive features (highlighting, navigation)
- Customizable per resource type

#### 4. **Workspace** (State Management)
- User's current working environment
- Panel configuration and resources
- Saved to localStorage
- Synchronized across tabs

---

## 🛠️ Extension Points

### 1. Adding New Resource Types

**Example: Adding Translation Questions**

#### Step 1: Create a Loader Package

```typescript
// packages/questions-loader/src/QuestionsLoader.ts
import { ResourceLoader } from '@bt-synergy/resource-catalog'

export class QuestionsLoader implements ResourceLoader {
  id = 'questions'
  supportedTypes = ['questions']
  
  async loadContent(
    resourceKey: string,
    identifier: string // book code
  ): Promise<ProcessedQuestions> {
    // 1. Get metadata
    const metadata = await this.catalogAdapter.get(resourceKey)
    
    // 2. Find the ingredient (file path) for this book
    const ingredient = metadata.contentMetadata?.ingredients?.find(
      ing => ing.identifier === identifier
    )
    
    if (!ingredient) {
      throw new Error(`No ingredient found for ${identifier}`)
    }
    
    // 3. Fetch raw content from Door43
    const rawContent = await this.door43Client.fetchTextContent(
      metadata.owner,
      `${metadata.language}_${metadata.resourceId}`,
      ingredient.path
    )
    
    // 4. Parse the TSV content
    const questions = this.parseTSV(rawContent)
    
    // 5. Cache for offline access
    await this.cacheAdapter.set(
      `${resourceKey}:${identifier}`,
      questions
    )
    
    return questions
  }
  
  private parseTSV(content: string): ProcessedQuestions {
    // Parse Tab-Separated Values format
    const lines = content.split('\n')
    const questions = []
    
    for (const line of lines) {
      const [ref, question, answer] = line.split('\t')
      questions.push({ ref, question, answer })
    }
    
    return { questions }
  }
  
  async isOfflineAvailable(resourceKey: string): Promise<boolean> {
    return await this.cacheAdapter.has(resourceKey)
  }
}
```

#### Step 2: Create a Viewer Component

```typescript
// packages/resource-viewers/src/QuestionsViewer/index.tsx
import { ResourceViewerProps } from '@bt-synergy/resource-types'
import { useQuestions } from './hooks/useQuestions'

export function QuestionsViewer({
  resourceId,
  resourceKey,
  isAnchor
}: ResourceViewerProps) {
  const { questions, loading, error } = useQuestions(resourceKey)
  const reference = useReferenceContext()
  
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorDisplay error={error} />
  
  // Filter questions for current reference
  const currentQuestions = questions?.filter(q => 
    matchesReference(q.ref, reference)
  )
  
  return (
    <div className="questions-viewer">
      {currentQuestions?.map((q, i) => (
        <QuestionCard
          key={i}
          question={q.question}
          answer={q.answer}
          reference={q.ref}
        />
      ))}
    </div>
  )
}
```

#### Step 3: Register the Resource Type

```typescript
// packages/resource-types/src/questions.ts
import { ResourceTypeDefinition } from '@bt-synergy/resource-types'

export const questionsResourceType: ResourceTypeDefinition = {
  id: 'questions',
  name: 'Translation Questions',
  description: 'Comprehension and checking questions for translators',
  category: 'helps',
  
  supportedSubjects: ['Translation Questions'],
  supportedFormats: ['tsv'],
  
  loaderFactory: (deps) => new QuestionsLoader(deps),
  viewerComponent: QuestionsViewer,
  
  features: {
    search: true,
    export: true,
    offline: true,
    linking: true, // Links to scripture references
  },
  
  // Icon for the resource type
  icon: 'HelpCircle',
}
```

#### Step 4: Register in Your App

```typescript
// apps/tc-study/src/contexts/CatalogContext.tsx
import { questionsResourceType } from '@bt-synergy/resource-types'

export function CatalogProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    // Register the resource type
    resourceTypeRegistry.register(questionsResourceType)
    
    // Create and register the loader
    const loader = new QuestionsLoader({
      catalogAdapter,
      door43Client,
      cacheAdapter,
    })
    loaderRegistry.register('questions', loader)
    
    // Register the viewer
    viewerRegistry.register({
      id: 'questions',
      component: QuestionsViewer,
      displayName: 'Translation Questions',
      supportedTypes: ['questions'],
    })
  }, [])
  
  return <CatalogContext.Provider value={catalogManager}>{children}</CatalogContext.Provider>
}
```

#### Step 5: Add to Preloaded Resources (Optional)

```javascript
// scripts/generate-preloaded-resources.mjs
const TARGET_RESOURCES = [
  // ... existing resources
  { repoName: 'en_tq', title: 'Translation Questions' },
]
```

---

### 2. Adding New Panel Types

The framework supports unlimited panels with custom configurations.

#### Dynamic Panel Creation

```typescript
// Custom hook for panel management
function useCustomPanels() {
  const addPanel = useWorkspaceStore(state => state.addPanel)
  const removePanel = useWorkspaceStore(state => state.removePanel)
  const panels = useWorkspaceStore(state => state.panels)
  
  const createTranslatorLayout = () => {
    // 4-panel translator workspace
    const panelIds = [
      addPanel('Original Text'),    // UGNT/UHB
      addPanel('Gateway Language'),  // ULT
      addPanel('Simplified'),        // UST
      addPanel('Translation Notes'), // TN
    ]
    
    return panelIds
  }
  
  const createCheckerLayout = () => {
    // 3-panel checker workspace
    const panelIds = [
      addPanel('Source'),            // Original resource
      addPanel('Translation'),       // User's translation
      addPanel('Questions'),         // Checking questions
    ]
    
    return panelIds
  }
  
  return {
    createTranslatorLayout,
    createCheckerLayout,
    addPanel,
    removePanel,
    panels,
  }
}

// Use in your component
function WorkspaceTemplates() {
  const { createTranslatorLayout, createCheckerLayout } = useCustomPanels()
  
  return (
    <div>
      <button onClick={createTranslatorLayout}>
        Translator Workspace
      </button>
      <button onClick={createCheckerLayout}>
        Checker Workspace
      </button>
    </div>
  )
}
```

#### Custom Panel Layouts

```typescript
// Custom panel layout component
function CustomPanelLayout() {
  return (
    <div className="grid grid-cols-2 grid-rows-2 h-screen">
      {/* Top-left: Original language */}
      <Panel id="panel-1" className="border-r border-b" />
      
      {/* Top-right: Gateway language */}
      <Panel id="panel-2" className="border-b" />
      
      {/* Bottom-left: Notes */}
      <Panel id="panel-3" className="border-r" />
      
      {/* Bottom-right: Questions */}
      <Panel id="panel-4" />
    </div>
  )
}
```

#### Saved Panel Configurations

```typescript
// Panel templates system
interface PanelTemplate {
  id: string
  name: string
  description: string
  layout: PanelConfiguration[]
  defaultResources?: Record<string, string[]>
}

const panelTemplates: PanelTemplate[] = [
  {
    id: 'translator-basic',
    name: 'Basic Translator',
    description: 'Two-panel layout for translation work',
    layout: [
      { id: 'panel-1', width: '50%', height: '100%' },
      { id: 'panel-2', width: '50%', height: '100%' },
    ],
    defaultResources: {
      'panel-1': ['unfoldingWord/en/ult'],
      'panel-2': [], // User will add their translation
    },
  },
  
  {
    id: 'study-advanced',
    name: 'Advanced Study',
    description: 'Four-panel layout for in-depth study',
    layout: [
      { id: 'panel-1', width: '50%', height: '50%' },
      { id: 'panel-2', width: '50%', height: '50%' },
      { id: 'panel-3', width: '50%', height: '50%' },
      { id: 'panel-4', width: '50%', height: '50%' },
    ],
    defaultResources: {
      'panel-1': ['unfoldingWord/el-x-koine/ugnt'],
      'panel-2': ['unfoldingWord/en/ult'],
      'panel-3': ['unfoldingWord/en/tn'],
      'panel-4': ['unfoldingWord/en/tq'],
    },
  },
]

// Apply a template
function applyTemplate(templateId: string) {
  const template = panelTemplates.find(t => t.id === templateId)
  if (!template) return
  
  // Create panels
  template.layout.forEach(panelConfig => {
    const panelId = useWorkspaceStore.getState().addPanel(panelConfig.name)
    
    // Load default resources
    const resources = template.defaultResources?.[panelConfig.id] || []
    resources.forEach(resourceKey => {
      useWorkspaceStore.getState().addResourceToPanel(panelId, resourceKey)
    })
  })
}
```

---

### 3. Custom Resource Sources

Support resources from multiple sources, not just Door43.

#### Custom Resource Provider

```typescript
// lib/customResourceProvider.ts
interface ResourceProvider {
  id: string
  name: string
  fetchMetadata(resourceId: string): Promise<ResourceMetadata>
  fetchContent(resourceId: string, identifier: string): Promise<string>
  searchResources(query: string): Promise<ResourceMetadata[]>
}

class ParatextProvider implements ResourceProvider {
  id = 'paratext'
  name = 'Paratext'
  
  async fetchMetadata(projectId: string): Promise<ResourceMetadata> {
    const response = await fetch(`https://paratext-api.com/projects/${projectId}`)
    const data = await response.json()
    
    return {
      resourceKey: `paratext/${data.language}/${projectId}`,
      resourceId: projectId,
      server: 'paratext.org',
      owner: data.organization,
      language: data.language,
      title: data.name,
      subject: 'Bible',
      version: data.version,
      type: ResourceType.SCRIPTURE,
      format: ResourceFormat.USFM,
      // ... rest of metadata
    }
  }
  
  async fetchContent(projectId: string, bookCode: string): Promise<string> {
    const response = await fetch(
      `https://paratext-api.com/projects/${projectId}/books/${bookCode}`
    )
    return response.text()
  }
  
  async searchResources(query: string): Promise<ResourceMetadata[]> {
    const response = await fetch(
      `https://paratext-api.com/search?q=${encodeURIComponent(query)}`
    )
    const data = await response.json()
    return data.projects.map(this.fetchMetadata)
  }
}

// Register the provider
const resourceProviders = new Map<string, ResourceProvider>()
resourceProviders.set('paratext', new ParatextProvider())
resourceProviders.set('door43', new Door43Provider())

// Use in the wizard
function ResourceSourceSelector() {
  const [selectedProvider, setSelectedProvider] = useState('door43')
  const provider = resourceProviders.get(selectedProvider)
  
  const searchResources = async (query: string) => {
    return provider?.searchResources(query) || []
  }
  
  return (
    <div>
      <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
        <option value="door43">Door43</option>
        <option value="paratext">Paratext</option>
        <option value="custom">Custom Server</option>
      </select>
      
      <ResourceSearch onSearch={searchResources} />
    </div>
  )
}
```

---

### 4. Custom Parsers

Add support for new content formats.

#### Example: JSON Scripture Parser

```typescript
// packages/scripture-loader/src/parsers/JsonScriptureParser.ts
import { ContentParser, ProcessedScripture } from '@bt-synergy/resource-catalog'

export class JsonScriptureParser implements ContentParser {
  format = 'json'
  
  async parse(content: string, bookId: string): Promise<ProcessedScripture> {
    const data = JSON.parse(content)
    
    const chapters = data.chapters.map(chapter => ({
      chapter: chapter.number,
      verses: chapter.verses.map(verse => ({
        verse: verse.number,
        text: verse.text,
        tokens: this.tokenize(verse.text),
      })),
    }))
    
    return {
      book: bookId,
      chapters,
      metadata: {
        title: data.title,
        abbrev: data.abbrev,
      },
    }
  }
  
  private tokenize(text: string): WordToken[] {
    return text.split(/\s+/).map((word, index) => ({
      id: `${index}`,
      text: word,
      type: 'word',
    }))
  }
}

// Register the parser
const scriptureLoader = new ScriptureLoader(/* ... */)
scriptureLoader.registerParser(new JsonScriptureParser())
scriptureLoader.registerParser(new USFMParser())
scriptureLoader.registerParser(new USXParser())
```

---

### 5. Extending the Wizard System

Add custom steps to the resource wizard.

#### Custom Wizard Step

```typescript
// components/wizard/CustomFilterStep.tsx
interface CustomFilterStepProps {
  onComplete: (data: FilterData) => void
  initialData?: FilterData
}

export function CustomFilterStep({ onComplete, initialData }: CustomFilterStepProps) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(
    new Set(initialData?.topics || [])
  )
  
  const topics = ['Law', 'History', 'Poetry', 'Prophecy', 'Gospels', 'Epistles']
  
  const handleNext = () => {
    onComplete({
      topics: Array.from(selectedTopics),
    })
  }
  
  return (
    <div className="wizard-step">
      <h2>Filter by Topic</h2>
      <div className="grid grid-cols-3 gap-3">
        {topics.map(topic => (
          <button
            key={topic}
            onClick={() => {
              const newSet = new Set(selectedTopics)
              if (newSet.has(topic)) {
                newSet.delete(topic)
              } else {
                newSet.add(topic)
              }
              setSelectedTopics(newSet)
            }}
            className={selectedTopics.has(topic) ? 'selected' : ''}
          >
            {topic}
          </button>
        ))}
      </div>
      <button onClick={handleNext}>Next</button>
    </div>
  )
}

// Add to wizard configuration
const customWizardSteps = [
  LanguageSelectorStep,
  CustomFilterStep,      // Your custom step
  ResourceSelectorStep,
  OriginalLanguageSelectorStep,
]
```

---

## 🎨 Theming & Customization

### Custom Themes

```typescript
// themes/translator-theme.ts
export const translatorTheme = {
  colors: {
    primary: '#2563eb',
    secondary: '#10b981',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f3f4f6',
    text: '#1f2937',
  },
  
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: {
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
    },
  },
  
  layout: {
    panelGap: '1rem',
    sidebarWidth: '300px',
    headerHeight: '60px',
  },
}

// Apply theme
function App() {
  return (
    <ThemeProvider theme={translatorTheme}>
      <YourApp />
    </ThemeProvider>
  )
}
```

---

## 📦 Building Custom Apps

### Create a New App Based on BT Synergy

```bash
# 1. Create a new app in the monorepo
cd apps
mkdir my-translation-app
cd my-translation-app

# 2. Initialize package.json
pnpm init

# 3. Install framework packages
pnpm add @bt-synergy/catalog-manager
pnpm add @bt-synergy/scripture-loader
pnpm add @bt-synergy/resource-types
pnpm add @bt-synergy/panel-system
```

```typescript
// apps/my-translation-app/src/App.tsx
import { CatalogProvider } from '@bt-synergy/catalog-manager'
import { WorkspaceProvider } from '@bt-synergy/panel-system'
import { TranslatorStudio } from './components/TranslatorStudio'

function App() {
  return (
    <CatalogProvider>
      <WorkspaceProvider>
        <TranslatorStudio />
      </WorkspaceProvider>
    </CatalogProvider>
  )
}
```

### Minimal Translation App

```typescript
// apps/my-translation-app/src/components/TranslatorStudio.tsx
export function TranslatorStudio() {
  const { panels, addPanel } = useWorkspace()
  const catalogManager = useCatalogManager()
  
  useEffect(() => {
    // Load preloaded resources
    initializePreloadedResources(catalogManager)
    
    // Create initial 2-panel layout
    const sourcePanel = addPanel('Source')
    const targetPanel = addPanel('Translation')
    
    // Load ULT into source panel
    addResourceToPanel(sourcePanel, 'unfoldingWord/en/ult')
  }, [])
  
  return (
    <div className="translator-studio">
      <Header />
      <div className="flex">
        <Sidebar />
        <PanelContainer panels={panels} />
      </div>
      <Footer />
    </div>
  )
}
```

---

## 🧪 Testing Custom Extensions

### Testing a Custom Loader

```typescript
// packages/my-loader/__tests__/MyLoader.test.ts
import { MyCustomLoader } from '../src/MyCustomLoader'

describe('MyCustomLoader', () => {
  let loader: MyCustomLoader
  
  beforeEach(() => {
    loader = new MyCustomLoader({
      catalogAdapter: mockCatalogAdapter,
      door43Client: mockDoor43Client,
      cacheAdapter: mockCacheAdapter,
    })
  })
  
  it('should load content on-demand', async () => {
    const content = await loader.loadContent('test/en/resource', 'gen')
    
    expect(content).toBeDefined()
    expect(content.identifier).toBe('gen')
  })
  
  it('should cache loaded content', async () => {
    await loader.loadContent('test/en/resource', 'gen')
    
    const isCached = await loader.isOfflineAvailable('test/en/resource')
    expect(isCached).toBe(true)
  })
  
  it('should handle missing ingredients', async () => {
    await expect(
      loader.loadContent('test/en/no-ingredients', 'gen')
    ).rejects.toThrow('No ingredient found')
  })
})
```

---

## 📚 Additional Resources

- **API Documentation**: See `docs/API.md`
- **Component Library**: See `docs/COMPONENTS.md`
- **Preloaded Resources**: See `docs/PRELOADED_RESOURCES.md`
- **Deployment Guide**: See `docs/DEPLOYMENT.md`

---

## 🤝 Contributing

We welcome contributions! To add new features:

1. Fork the repository
2. Create a feature branch
3. Implement your extension following the patterns above
4. Add tests
5. Update documentation
6. Submit a pull request

---

## 📝 License

See LICENSE file in the root directory.
