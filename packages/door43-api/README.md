# Door43 API Client

Centralized, testable API client for all Door43.org requests.

## Quick Start

```typescript
import { getDoor43ApiClient } from '@/lib/services/api/Door43ApiClient';

// Get singleton client
const client = getDoor43ApiClient();

// Fetch languages
const languages = await client.getLanguages();

// Get resources for English
const resources = await client.getResourcesByLanguage('en');

// Find specific resource
const ult = await client.findResource('unfoldingWord', 'en', 'ult');
```

## Features

✅ **Type-safe** - Full TypeScript support with interfaces  
✅ **Testable** - Easy to mock and test  
✅ **Validated** - Automatic parameter validation  
✅ **Error handling** - Standardized error types  
✅ **Timeout control** - Configurable timeouts  
✅ **Singleton pattern** - Reuse same instance  

## API Methods

### `getLanguages()`
Get all available languages from Door43 catalog.

```typescript
const languages = await client.getLanguages();
// Returns: Door43Language[]
```

### `getResourcesByLanguage(languageCode)`
Get all resources for a specific language.

```typescript
const resources = await client.getResourcesByLanguage('en');
// Returns: Door43Resource[]
```

### `getResourcesByOwnerAndLanguage(owner, languageCode)`
Filter resources by owner and language.

```typescript
const uwResources = await client.getResourcesByOwnerAndLanguage('unfoldingWord', 'en');
```

### `findResource(owner, language, resourceId)`
Find a specific resource.

```typescript
const ult = await client.findResource('unfoldingWord', 'en', 'ult');
// Returns: Door43Resource | null
```

### `getCatalog()`
Get the full Door43 catalog.

```typescript
const catalog = await client.getCatalog();
// Returns: { languages: [...], resources: [...] }
```

### `findRepository(owner, repoName)`
Find a specific repository in the catalog.

```typescript
const repo = await client.findRepository('unfoldingWord', 'en_ult');
// Returns: Door43Resource | null
```

### `searchCatalog(query, options)`
Search the catalog with filters.

```typescript
const results = await client.searchCatalog({
  owner: 'unfoldingWord',
  language: 'en',
  subject: 'Bible',
  stage: 'prod'
});
```

## Content Fetching Methods

### `fetchRawContent(owner, repo, filePath, branch?)`
Fetch raw file content from a repository.

```typescript
const response = await client.fetchRawContent(
  'unfoldingWord',
  'en_tq',
  'tq_GEN.tsv',
  'master'
);
// Returns: Response object
```

### `fetchTextContent(owner, repo, filePath, branch?)`
Fetch text file content directly.

```typescript
const tsvContent = await client.fetchTextContent(
  'unfoldingWord',
  'en_tq',
  'tq_GEN.tsv'
);
// Returns: string (file content)
```

### `checkFileExists(owner, repo, filePath, branch?)`
Check if a file exists in a repository.

```typescript
const exists = await client.checkFileExists(
  'unfoldingWord',
  'en_tq',
  'tq_GEN.tsv'
);
// Returns: boolean
```

## Repository Search

### `searchRepositories(query, options?)`
Search for repositories.

```typescript
const repos = await client.searchRepositories('translation', {
  owner: 'unfoldingWord',
  limit: 10
});
// Returns: Door43Resource[]
```

## Error Handling

```typescript
try {
  const resources = await client.getResourcesByLanguage('en');
} catch (error) {
  switch (error.code) {
    case 'TIMEOUT':
      // Handle timeout
      break;
    case 'NETWORK_ERROR':
      // Handle network error
      break;
    case 'HTTP_ERROR':
      // Handle HTTP error (4xx, 5xx)
      break;
    case 'INVALID_PARAM':
      // Handle invalid parameters
      break;
  }
}
```

## Testing

```typescript
import { createDoor43ApiClient } from '@/lib/services/api/Door43ApiClient';

// Create test client with custom config
const testClient = createDoor43ApiClient({
  baseUrl: 'https://test.door43.org',
  timeout: 5000
});

// Run tests
await testClient.getLanguages();
```

See `Door43ApiClient.test.ts` for full test examples.

## Configuration

```typescript
const client = createDoor43ApiClient({
  baseUrl: 'https://git.door43.org',  // Default
  timeout: 30000,                      // 30 seconds default
  headers: {
    'Custom-Header': 'value'
  }
});
```

## Guidelines

See `.cursorrules-door43-api` in the root for complete usage guidelines.

### Key Rules

1. **Always use Door43ApiClient** - Never make direct fetch calls
2. **Validate parameters** - Check inputs before API calls
3. **Handle errors** - Always use try/catch
4. **Provide fallbacks** - Support offline mode
5. **Write tests** - Test all Door43 API interactions

## Migration Examples

### Catalog Search

**Before (Direct Fetch)**
```typescript
// ❌ Old way
const catalogUrl = `https://git.door43.org/api/v1/catalog/search?repo=${repoName}&owner=${owner}`;
const response = await fetch(catalogUrl);
const data = await response.json();
const resource = data.data[0];
```

**After (API Client)**
```typescript
// ✅ New way
import { getDoor43ApiClient } from '@bt-synergy/door43-api';

const client = getDoor43ApiClient();
const resource = await client.findRepository(owner, repoName);
```

### Content Fetching

**Before (Direct Fetch)**
```typescript
// ❌ Old way
const fileUrl = `https://git.door43.org/${owner}/${repo}/raw/branch/master/${filePath}`;
const response = await fetch(fileUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch: ${response.status}`);
}
const content = await response.text();
```

**After (API Client)**
```typescript
// ✅ New way
const client = getDoor43ApiClient();
const content = await client.fetchTextContent(owner, repo, filePath);
// Error handling is built-in!
```

## Files

- `Door43ApiClient.ts` - Main API client
- `Door43ApiClient.test.ts` - Unit tests
- `.cursorrules-door43-api` - Usage guidelines

