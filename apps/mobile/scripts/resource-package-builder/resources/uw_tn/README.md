# UnfoldingWord Translation Notes (uw_tn)

Translation Notes resource for the Resource Package Builder.

## Overview

This resource handles UnfoldingWord Translation Notes (TN) with support for:
- Raw TSV processing
- Dependency-enhanced processing with original quotes and link titles
- Support for multiple languages and versions

## Resource Information

- **ID**: `uw_tn`
- **Name**: UnfoldingWord Translation Notes
- **Type**: Notes
- **Format**: TSV
- **Version**: 2.0.0

## Dependencies

### Required Dependencies
- **Original Scripture**: `uw_lt`, `uw_st`, `uw_uhb`, `uw_ugnt`
  - **Purpose**: Extract original quotes for quote token generation
  - **Usage**: Matches quotes in notes with original scripture text

### Optional Dependencies
- **Link Titles**: `uw_tw`, `uw_ta`
  - **Purpose**: Extract titles for support references
  - **Usage**: Replaces `[[reference]]` with actual titles

- **Cross References**: `uw_tw`, `uw_ta`
  - **Purpose**: Add cross-references between resources
  - **Usage**: Links related concepts across resources

## Supported Servers

- **Door43**: Primary server for UnfoldingWord resources
  - **Resource ID**: `tn`
  - **File Pattern**: `*.tsv`
  - **Archive Format**: Tarball (preferred)

## Configuration

```json
{
  "id": "uw_tn",
  "server": "door43",
  "config": {
    "owner": "unfoldingWord",
    "language": "en",
    "version": "v86",
    "stage": "prod"
  },
  "dependencies": [
    {
      "resourceId": "uw_lt",
      "purpose": "original_quotes",
      "required": true
    },
    {
      "resourceId": "uw_tw", 
      "purpose": "link_titles",
      "required": true
    },
    {
      "resourceId": "uw_ta",
      "purpose": "link_titles", 
      "required": true
    }
  ]
}
```

## File Structure

```
resources/uw_tn/
├── index.ts                    # Resource definition
├── fetcher.ts                  # Server fetching logic
├── raw-processor.ts           # Basic TSV processing
├── dependency-processor.ts    # Enhanced processing with dependencies
└── README.md                  # This file
```

## Processing Pipeline

### 1. Raw Processing
- Parse TSV files
- Extract basic note data
- Parse references, tags, quotes
- Generate statistics

### 2. Dependency Processing
- Match quotes with original scripture
- Enhance support references with titles
- Add cross-references
- Calculate enhancement statistics

## Output Format

### Raw Processing Output
```typescript
{
  type: 'notes',
  format: 'tsv',
  notes: [
    {
      Reference: '1:1',
      ID: 'tn-1-1-1',
      Quote: '\\q1 In the beginning',
      Note: 'This is a note...',
      bookCode: 'gen',
      chapter: 1,
      verse: 1,
      quotes: ['In the beginning'],
      supportRefs: ['kt/creation']
    }
  ],
  statistics: {
    totalNotes: 100,
    totalQuotes: 150,
    totalSupportRefs: 75
  }
}
```

### Enhanced Processing Output
```typescript
{
  // ... raw processing output
  notes: [
    {
      // ... raw note data
      originalQuotes: [
        {
          text: 'In the beginning',
          reference: '1:1',
          verse: '1:1',
          context: 'In the beginning God created...',
          found: true
        }
      ],
      enhancedSupportRefs: [
        {
          reference: 'kt/creation',
          title: 'Creation',
          type: 'tw',
          enhanced: true
        }
      ]
    }
  ],
  enhancements: {
    originalQuotesFound: 120,
    linkTitlesEnhanced: 60,
    crossReferencesAdded: 25
  }
}
```

## Usage Examples

### Basic Usage
```typescript
import { UW_TN_Resource } from './resources/uw_tn';

const resource = new UW_TN_Resource();
const config = {
  owner: 'unfoldingWord',
  language: 'en'
};

// Validate configuration
const validation = resource.validateConfig(config);
if (!validation.valid) {
  console.error('Invalid config:', validation.errors);
}

// Get resource info
const info = resource.getResourceInfo();
console.log('Resource info:', info);
```

### Fetching Data
```typescript
import { UW_TN_Fetcher } from './resources/uw_tn/fetcher';
import { Door43Server } from './servers/door43';

const server = new Door43Server();
const fetcher = new UW_TN_Fetcher(server);

// Fetch resource metadata
const metadata = await fetcher.fetchMetadata(config);

// Download archive
const archive = await fetcher.downloadArchive(config);
```

### Processing
```typescript
import { UW_TN_RawProcessor } from './resources/uw_tn/raw-processor';
import { UW_TN_DependencyProcessor } from './resources/uw_tn/dependency-processor';

// Raw processing
const rawProcessor = new UW_TN_RawProcessor();
const rawResult = await rawProcessor.processRawContent(tsvContent, metadata);

// Enhanced processing with dependencies
const depProcessor = new UW_TN_DependencyProcessor();
const enhancedResult = await depProcessor.processWithDependencies(
  rawResult, 
  dependencyData
);
```

## Supported Languages

- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Portuguese (pt)
- Russian (ru)
- Arabic (ar)
- Hindi (hi)
- Chinese (zh)
- Japanese (ja)
- Korean (ko)

## Notes

- Translation Notes require original scripture for proper quote matching
- Support references are enhanced with titles from TW/TA resources
- Cross-references are automatically added when available
- Processing is optimized for large datasets
- All timestamps are in ISO 8601 format
