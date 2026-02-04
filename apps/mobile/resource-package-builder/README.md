# Resource Package Builder v2.0

A localized, namespace-prefixed resource package builder with dependency support.

## 🎯 Key Features

- **🏠 Localized Resources**: Each resource is self-contained in its own directory
- **🏷️ Namespace Prefixes**: Resources prefixed with `uw_` (unfoldingWord) for clarity
- **🔗 Dependency Support**: Resources can depend on other resources for enhanced processing
- **⚡ Two-Pass Processing**: Basic processing first, then dependency-enhanced processing
- **🛠️ Server Abstraction**: Reusable server clients with constants
- **📦 Simple Configuration**: End users work with simple JSON package files
- **🔄 Configuration Inheritance**: Package-level server config inherited by all resources
- **💾 Memoization**: Server instances and resources are cached for performance
- **🎛️ Override Support**: Resources can override package-level configuration

## 📁 Architecture

```
resource-package-builder/
├── resources/                    # Resource implementations
│   ├── uw_lt/                   # UnfoldingWord Literal Text
│   │   ├── index.ts             # Resource definition
│   │   ├── fetcher.ts           # Server fetching
│   │   ├── raw-processor.ts     # Basic processing
│   │   ├── dependency-processor.ts # Enhanced processing
│   │   └── README.md            # Documentation
│   ├── uw_st/                   # Simplified Text
│   ├── uw_tn/                   # Translation Notes
│   ├── uw_ta/                   # Translation Academy
│   ├── uw_tw/                   # Translation Words
│   └── ...
├── servers/                     # Server implementations
│   ├── door43/
│   │   ├── index.ts             # Server interface
│   │   ├── Door43Client.ts      # Reusable client
│   │   └── constants.ts         # Server constants
│   └── ...
├── packages/                    # Package configurations (End User)
│   ├── translation-notes.json   # User creates these
│   └── ...
├── core/                        # Core system
│   └── PackageBuilder.ts        # Main orchestrator
└── cli/                         # Command-line interface
    └── build.ts                 # CLI commands
```

## 🏷️ Resource Namespace

Resources use namespace prefixes to distinguish between different providers:

- **`uw_`** - UnfoldingWord resources
  - `uw_lt` - Literal Text
  - `uw_st` - Simplified Text  
  - `uw_tn` - Translation Notes
  - `uw_ta` - Translation Academy
  - `uw_tw` - Translation Words
  - `uw_twl` - Translation Words Links
  - `uw_tq` - Translation Questions
  - `uw_gn` - Greek New Testament
  - `uw_ho` - Hebrew Old Testament

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd resource-package-builder
npm install
```

### 2. Create a Package

```bash
# Create a new package template
npm run create-package my-bible-package

# Edit the generated package file
# packages/my-bible-package.json
```

### 3. Build Package

```bash
# Build the package
npm run build my-bible-package

# List available packages
npm run list-packages

# List available resources
npm run list-resources

# List supported servers and their config requirements
npm run list-servers

# Get configuration example for a specific server
npm run server-config door43
npm run server-config github
npm run server-config custom_api

# Build with verbose output (shows cache stats)
npm run build my-bible-package --verbose

# Cache management
npm run build cache --stats    # Show cache statistics
npm run build cache --clear    # Clear all caches
```

## 📋 Package Configuration

Create JSON files in the `packages/` directory with inheritance support:

### Simple Configuration (All Resources Inherit)

```json
{
  "name": "translation-notes-with-dependencies",
  "version": "1.0.0",
  "description": "English Translation Notes with dependencies",
  "outputDir": "outputs/translation-notes",
  "server": "door43",
  "config": {
    "owner": "unfoldingWord",
    "language": "en",
    "version": "v86",
    "stage": "prod"
  },
  "resources": [
    {
      "id": "uw_lt"
    },
    {
      "id": "uw_tn",
      "dependencies": [
        {
          "resourceId": "uw_lt",
          "purpose": "original_quotes",
          "required": true
        }
      ]
    }
  ]
}
```

### Mixed Configuration (Some Override)

```json
{
  "name": "mixed-servers-example",
  "version": "1.0.0",
  "description": "Example with inheritance and overrides",
  "outputDir": "outputs/mixed-example",
  "server": "door43",
  "config": {
    "owner": "unfoldingWord",
    "language": "en",
    "version": "v86"
  },
  "resources": [
    {
      "id": "uw_lt"
    },
    {
      "id": "uw_tw",
      "config": {
        "language": "es",
        "version": "v85"
      }
    },
    {
      "id": "uw_ta",
      "server": "other_server",
      "config": {
        "baseUrl": "https://api.other-server.com",
        "language": "en"
      }
    }
  ]
}
```

## 🖥️ Server-Specific Configurations

Different servers have different configuration requirements:

### Door43 Server

```json
{
  "server": "door43",
  "config": {
    "owner": "unfoldingWord",    // Required
    "language": "en",            // Required
    "version": "v86",            // Optional (defaults to "latest")
    "stage": "prod",             // Optional (defaults to "prod")
    "apiToken": "your-token"     // Optional
  }
}
```

### GitHub Server

```json
{
  "server": "github",
  "config": {
    "owner": "myorg",            // Required
    "repo": "my-resource",       // Required
    "branch": "main",            // Optional
    "tag": "v1.0.0",            // Optional
    "token": "ghp_..."          // Optional
  }
}
```

### Custom API Server

```json
{
  "server": "custom_api",
  "config": {
    "baseUrl": "https://api.example.com",  // Required
    "endpoint": "/resources",              // Required
    "apiKey": "your-key",                  // Optional
    "timeout": 30000,                      // Optional
    "retries": 3,                          // Optional
    "headers": {                           // Optional
      "User-Agent": "MyApp/1.0"
    }
  }
}
```

### Server Configuration Validation

The system validates configurations against server schemas:

```bash
# List all supported servers
npm run list-servers

# Get configuration details for a server
npm run server-config door43
```

**Validation Features:**

- ✅ **Required Fields**: Ensures all required fields are present
- ✅ **Type Checking**: Validates field types (string, number, boolean, etc.)
- ✅ **Unknown Fields**: Warns about unrecognized fields
- ✅ **Normalization**: Normalizes values (e.g., version defaults)
- ✅ **Error Messages**: Clear error messages for invalid configs

## 🔧 Adding New Resources

### 1. Create Resource Directory

```bash
mkdir resources/uw_new_resource
```

### 2. Implement Required Files

```typescript
// resources/uw_new_resource/index.ts
export class UW_NewResource {
  public readonly id = 'uw_new_resource';
  public readonly name = 'New Resource';
  // ... implementation
}

// resources/uw_new_resource/fetcher.ts
export class UW_NewResource_Fetcher {
  // ... fetching logic
}

// resources/uw_new_resource/raw-processor.ts
export class UW_NewResource_RawProcessor {
  // ... basic processing
}

// resources/uw_new_resource/dependency-processor.ts
export class UW_NewResource_DependencyProcessor {
  // ... enhanced processing
}
```

### 3. Add Documentation

```markdown
# resources/uw_new_resource/README.md
# Document the resource, its dependencies, and usage
```

## 🌐 Adding New Servers

### 1. Create Server Directory

```bash
mkdir servers/new_server
```

### 2. Implement Server Files

```typescript
// servers/new_server/constants.ts
export const NEW_SERVER_CONSTANTS = {
  BASE_URL: 'https://api.example.com',
  ENDPOINTS: {
    SEARCH: '/search',
    DOWNLOAD: '/download'
  }
  // ... other constants
};

// servers/new_server/NewServerClient.ts
export class NewServerClient {
  // ... client implementation
}

// servers/new_server/index.ts
export class NewServer {
  // ... server interface
}
```

## 🔄 Processing Pipeline

### Pass 1: Raw Processing

1. Download resources from servers
2. Extract archives
3. Process raw content (TSV, USFM, Markdown)
4. Generate basic statistics

### Pass 2: Dependency Processing

1. Load dependency data from Pass 1
2. Enhance content with cross-references
3. Add link titles and original quotes
4. Generate enhanced statistics

## 📊 Example Output

```typescript
// Raw Processing Output
{
  type: 'notes',
  format: 'tsv',
  notes: [
    {
      Reference: '1:1',
      Quote: '\\q1 In the beginning',
      Note: 'This is a note...',
      bookCode: 'gen',
      chapter: 1,
      verse: 1
    }
  ],
  statistics: {
    totalNotes: 100,
    totalQuotes: 150
  }
}

// Enhanced Processing Output
{
  // ... raw processing output
  notes: [
    {
      // ... raw note data
      originalQuotes: [
        {
          text: 'In the beginning',
          reference: '1:1',
          found: true,
          context: 'In the beginning God created...'
        }
      ],
      enhancedSupportRefs: [
        {
          reference: 'kt/creation',
          title: 'Creation',
          enhanced: true
        }
      ]
    }
  ],
  enhancements: {
    originalQuotesFound: 120,
    linkTitlesEnhanced: 60
  }
}
```

## 🔄 Configuration Inheritance

The package builder supports powerful configuration inheritance:

### Package-Level Configuration

- **Server**: All resources inherit the package server unless overridden
- **Config**: All resources inherit package config, with resource-specific overrides
- **Server-Specific**: Each server type has its own configuration schema
- **Validation**: Server configurations are validated against their schemas
- **Version Defaults**: Version defaults to "latest" if not specified
- **Memoization**: Server instances are cached and reused across resources

### Resource-Level Overrides

- **Server Override**: Resource can specify different server
- **Config Override**: Resource can override specific config values
- **Version Handling**: Supports "latest", specific versions (e.g., "v86"), or undefined (defaults to "latest")
- **Dependencies**: Resource-specific dependency declarations

### Example Inheritance Flow

```json
{
  "server": "door43",           // ← Inherited by all resources
  "config": {                   // ← Base config for all resources
    "owner": "unfoldingWord",
    "language": "en"
    // version omitted - defaults to "latest"
  },
  "resources": [
    {
      "id": "uw_lt"             // ← Inherits server + config (version = "latest")
    },
    {
      "id": "uw_tw",
      "config": {               // ← Overrides language and version
        "language": "es",
        "version": "v86"
      }
    },
    {
      "id": "uw_ta",
      "config": {               // ← Explicitly uses "latest"
        "version": "latest"
      }
    },
    {
      "id": "uw_tn",
      "server": "other_server", // ← Overrides server entirely
      "config": {               // ← New config for other server
        "baseUrl": "https://api.other.com"
        // version omitted - defaults to "latest"
      }
    }
  ]
}
```

### Version Handling Examples

```json
{
  "resources": [
    {
      "id": "uw_lt"
      // No version specified → defaults to "latest"
    },
    {
      "id": "uw_tn",
      "config": {
        "version": "v86"
        // Explicit version specification
      }
    },
    {
      "id": "uw_tw",
      "config": {
        "version": "latest"
        // Explicitly use latest version
      }
    },
    {
      "id": "uw_ta",
      "config": {
        "version": null
        // Explicitly null → defaults to "latest"
      }
    }
  ]
}
```

## 💾 Memoization & Performance

The package builder includes intelligent caching:

### Server Memoization

- **Cache Key**: `${serverId}:${JSON.stringify(config)}`
- **Reuse**: Same server+config combination reused across resources
- **Performance**: Avoids re-initializing server instances

### Resource Memoization

- **Resource Classes**: Cached after first load
- **Fetchers**: Reused for same resource type
- **Processors**: Cached for performance

### Cache Management

```bash
# Show cache statistics
npm run build cache --stats

# Clear all caches
npm run build cache --clear

# Build with verbose output (shows cache stats)
npm run build my-package --verbose
```

## 🎯 Benefits

### For End Users

- **Simple Configuration**: Just JSON files, no code
- **DRY Principle**: Define server config once, inherit everywhere
- **Clear Dependencies**: Easy to understand what depends on what
- **Namespace Clarity**: `uw_tn` vs `other_tn` is obvious
- **Future GUI Ready**: Perfect for visual package builders

### For Maintainers

- **Localized Resources**: Everything for a resource in one place
- **Reusable Servers**: Server constants and clients are shared
- **Easy to Extend**: Adding new resources is straightforward
- **Clear Separation**: Code vs configuration is obvious
- **Performance**: Memoization reduces redundant operations

### For the System

- **Two-Pass Processing**: Ensures dependencies are available
- **Dependency Resolution**: Automatic ordering and validation
- **Error Handling**: Clear error messages and validation
- **Performance**: Optimized for large datasets with caching
- **Memory Efficient**: Reuses server instances and resource classes

## 🚀 Future Enhancements

- **GUI Application**: Visual package builder
- **Resource Discovery**: Browse available resources
- **Template Generator**: Auto-generate package configs
- **Cloud Storage**: Upload/download packages
- **Real-time Updates**: Watch for resource changes

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your resource or server
4. Add tests and documentation
5. Submit a pull request

## 👨‍💻 Developer Resources

- **Developer Guide**: [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Complete guide for adding servers and resources
- **Quick Reference**: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick reference for developers
- **Server Schemas**: `core/types/ServerConfig.ts` - Server configuration schemas
- **Resource Examples**: `resources/uw_tn/` - Example resource implementation

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: README files in each resource directory
