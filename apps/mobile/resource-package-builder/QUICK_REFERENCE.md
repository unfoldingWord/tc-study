# Quick Reference Guide

## 🚀 Quick Start

### Adding a New Server

1. **Create server directory**: `mkdir servers/my_server`
2. **Add constants**: `servers/my_server/constants.ts`
3. **Add client**: `servers/my_server/MyServerClient.ts`
4. **Add interface**: `servers/my_server/index.ts`
5. **Register schema**: Update `core/types/ServerConfig.ts`

### Adding a New Resource

1. **Create resource directory**: `mkdir resources/my_resource`
2. **Add interface**: `resources/my_resource/index.ts`
3. **Add fetcher**: `resources/my_resource/fetcher.ts`
4. **Add raw processor**: `resources/my_resource/raw-processor.ts`
5. **Add dependency processor**: `resources/my_resource/dependency-processor.ts`
6. **Add documentation**: `resources/my_resource/README.md`

## 📁 File Structure

```
resource-package-builder/
├── servers/
│   └── my_server/
│       ├── constants.ts          # Server constants
│       ├── MyServerClient.ts     # API client
│       └── index.ts              # Server interface
├── resources/
│   └── my_resource/
│       ├── index.ts              # Resource interface
│       ├── fetcher.ts            # Data fetching
│       ├── raw-processor.ts      # Basic processing
│       ├── dependency-processor.ts # Enhanced processing
│       └── README.md             # Documentation
└── core/
    └── types/
        └── ServerConfig.ts       # Server schemas
```

## 🔧 CLI Commands

```bash
# Development
npm run list-servers              # List supported servers
npm run server-config <server>    # Get server config help
npm run list-resources            # List available resources
npm run build <package> --verbose # Build with details

# Testing
npm run build cache --stats       # Show cache statistics
npm run build cache --clear       # Clear caches
```

## 📋 Configuration Templates

### Server Configuration

```json
{
  "server": "my_server",
  "config": {
    "requiredField1": "value1",
    "requiredField2": "value2",
    "optionalField1": "value3"
  }
}
```

### Resource Configuration

```json
{
  "id": "my_resource",
  "server": "my_server",
  "config": {
    "query": "search term",
    "type": "resource_type"
  },
  "dependencies": [
    {
      "resourceId": "uw_lt",
      "purpose": "original_quotes",
      "required": true
    }
  ]
}
```

## 🎯 Key Interfaces

### Server Interface
```typescript
export class MyServer {
  constructor(config: ServerConfig)
  getServerInfo()
  searchResources(config: ResourceConfig)
  getResourceMetadata(id: string)
  downloadResource(id: string)
  validateResourceConfig(config: ResourceConfig)
}
```

### Resource Interface
```typescript
export class MyResource {
  readonly id: string
  readonly name: string
  readonly type: string
  getResourceInfo()
  getDependencyRequirements()
  validateConfig(config: ResourceConfig)
  getServer(): MyServer
}
```

### Fetcher Interface
```typescript
export class MyResourceFetcher {
  constructor(server: MyServer)
  fetchMetadata(config: ResourceConfig)
  fetchResource(config: ResourceConfig)
  downloadResource(config: ResourceConfig)
  isAvailable(config: ResourceConfig)
}
```

### Processor Interfaces
```typescript
export class MyResourceRawProcessor {
  processRawContent(content: string, metadata: any)
  getProcessorInfo()
}

export class MyResourceDependencyProcessor {
  processWithDependencies(rawData: any, dependencyData: any)
  getProcessorInfo()
}
```

## 🔗 Dependency System

### Dependency Purposes
- `original_quotes`: Original language scripture for quotes
- `link_titles`: Translation Words/Academy for link titles
- `cross_references`: Cross-linking between resources
- `alignment_data`: Alignment information
- `support_references`: Support reference data
- `content_enhancement`: General content enhancement

### Dependency Data Structure
```typescript
interface DependencyData {
  originalScripture?: any;
  linkTitles?: any;
  crossReferences?: any;
  alignmentData?: any;
  supportReferences?: any;
  contentEnhancement?: any;
}
```

## 🧪 Testing Checklist

### Server Testing
- [ ] Server schema registered
- [ ] Configuration validation works
- [ ] API client handles errors
- [ ] Authentication works
- [ ] Rate limiting respected

### Resource Testing
- [ ] Resource interface implemented
- [ ] Fetcher works with server
- [ ] Raw processor handles data
- [ ] Dependency processor enhances data
- [ ] Configuration validation works
- [ ] Dependencies resolved correctly

### Integration Testing
- [ ] Package builds successfully
- [ ] CLI commands work
- [ ] Error messages are clear
- [ ] Performance is acceptable
- [ ] Documentation is complete

## 🐛 Common Issues

### Server Issues
- **Missing schema**: Register server schema in `ServerConfig.ts`
- **Validation errors**: Check required fields and types
- **API errors**: Implement proper error handling
- **Authentication**: Ensure auth headers are correct

### Resource Issues
- **Import errors**: Check file paths and exports
- **Type errors**: Ensure interfaces match
- **Processing errors**: Validate input data
- **Dependency errors**: Check dependency resolution

### Configuration Issues
- **Missing fields**: Check server schema requirements
- **Type mismatches**: Ensure correct field types
- **Unknown fields**: Remove or add to schema
- **Version issues**: Check version normalization

## 📚 Resources

- **Full Guide**: `DEVELOPER_GUIDE.md`
- **Architecture**: `README.md`
- **Examples**: `packages/` directory
- **Server Schemas**: `core/types/ServerConfig.ts`
- **Resource Examples**: `resources/uw_tn/`

## 🆘 Getting Help

1. **Check documentation** first
2. **Look at examples** in existing code
3. **Test with CLI** commands
4. **Create GitHub issue** if stuck
5. **Ask in discussions** for general questions

---

**Happy coding!** 🚀
















