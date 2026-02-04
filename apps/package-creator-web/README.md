# BT Synergy Package Creator (Web)

🧪 **A testing and reference implementation for Door43 API integration**

This is NOT a production app - it's a debugging tool to validate that Door43 API calls work correctly and return proper data.

## Purpose

- **Test Door43 API integration** - Verify all API endpoints return expected data
- **Identify data quality issues** - Show incomplete or malformed API responses
- **Reference implementation** - Demonstrate how to use `@bt-synergy/door43-api` package
- **Create test manifests** - Generate package manifests for testing the mobile app

## Key Features

✅ **No Fallbacks** - Shows actual API data only, no hardcoded defaults  
✅ **Data Quality Reporting** - Highlights incomplete or missing fields  
✅ **Console Logging** - Detailed debugging output for all API calls  
✅ **Error Transparency** - Shows exactly what went wrong and where  
✅ **Raw Data Display** - View JSON responses directly in the UI

## Quick Start

```bash
# From repository root
cd apps/package-creator-web

# Start dev server
bun dev

# Open http://localhost:3001
```

## What You'll See

### Step 1: Languages
- **API Status Card** - Shows total vs valid vs incomplete languages
- **Valid Languages Grid** - Only languages with code + name
- **Incomplete Data Warning** - Shows problematic API responses with JSON samples
- **Console Logs** - Detailed API response analysis

### Step 2: Organizations
- Fetches organizations from Door43
- Shows all orgs with their metadata
- Displays API response statistics

### Step 3: Resources
- Fetches resources for each language + organization combination
- Groups by language, organization, or subject
- Automatically includes Greek (UGNT) and Hebrew (UHB) references
- Shows API call count and timing

### Step 4: Package Info
- Enter package metadata
- Configure settings

### Step 5: Preview & Download
- View complete manifest JSON
- See package statistics
- Download or copy to clipboard

## API Endpoints Tested

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/catalog/list/languages` | `getLanguages()` | List all languages |
| `/api/v1/orgs` | `getOrganizations()` | List organizations |
| `/api/v1/catalog/search` | `getResourcesByOrgAndLanguage()` | Search resources |
| `/api/v1/repos/{owner}/{repo}` | `findRepository()` | Get repo details |
| `/api/v1/catalog/search` | `getResourceSubjects()` | Get resource subjects |

## Console Output

The app logs detailed information:

```javascript
✅ Door43 API Response: {
  endpoint: '/api/v1/catalog/list/languages',
  count: 8947,
  sample: [...]
}

⚠️ API Data Quality Issues: {
  total: 8947,
  missingCode: 5234,
  missingName: 3421,
  message: 'Some languages are missing required fields'
}
```

## Known Issues to Test

1. **Languages Endpoint** - Returns many entries with only `direction`, missing `code` and `name`
2. **Incomplete Metadata** - Some resources lack required fields
3. **Repository Structure** - Owner field sometimes object vs string

## Tech Stack

- **Vite** - Fast development
- **React 19** - Latest React
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **@bt-synergy/door43-api** - Shared API client

## For Developers

### Adding New API Tests

1. Add method to `@bt-synergy/door43-api`
2. Add integration test
3. Call method in appropriate component
4. Display results with data quality checks
5. Log to console for debugging

### Data Quality Checks

Always check API responses for:
- Required fields (code, name, owner, etc.)
- Data types (string vs object)
- Empty arrays vs undefined
- Consistent structure

### Example Component Pattern

```typescript
const loadData = async () => {
  try {
    const data = await client.someMethod()
    
    console.log('✅ API Response:', { count: data.length, sample: data[0] })
    
    // Check data quality
    const invalid = data.filter(item => !item.requiredField)
    if (invalid.length > 0) {
      console.warn('⚠️ Data Quality Issues:', { invalid: invalid.length })
    }
    
    setData(data) // Show ALL data, even if incomplete
  } catch (error) {
    console.error('❌ API Error:', error)
    // Don't set fallbacks - let error be visible
  }
}
```

## Not For Production

This app intentionally:
- ❌ Has no fallback data
- ❌ Shows errors prominently
- ❌ Logs everything to console
- ❌ Displays raw API responses
- ❌ Doesn't handle edge cases gracefully

These are **features** for a testing tool!

## Contributing

When the Door43 API changes or improves:
1. Update this app to test new endpoints
2. Add new data quality checks
3. Update integration tests
4. Document findings in console output

## License

Same as parent BT Synergy project.