# Translation Questions Loader

Resource loader for Door43 Translation Questions (tq) resources.

## Overview

Translation Questions provide comprehension questions and answers for specific Bible passages, helping translators and teachers verify understanding of the biblical text.

## Features

- Loads TSV-formatted Translation Questions from Door43
- Processes questions by book and chapter
- Supports background downloading
- Caches processed questions for offline use

## Usage

```typescript
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'

const loader = new TranslationQuestionsLoader({
  cacheAdapter,
  catalogAdapter,
  door43Client,
  debug: false
})

// Load questions for a specific book
const questions = await loader.loadContent('unfoldingWord/en/tq', 'tit')

// Download entire resource
await loader.downloadResource('unfoldingWord/en/tq', {
  onProgress: ({ loaded, total, percentage }) => {
    console.log(`Progress: ${percentage}%`)
  }
})
```

## TSV Format

Translation Questions use tab-separated values (TSV) with columns:
- `Reference` - Scripture reference (e.g., "1:1")
- `ID` - Unique identifier
- `Tags` - Optional tags
- `Quote` - Referenced scripture text
- `Occurrence` - Occurrence number
- `Question` - The comprehension question
- `Response` - The answer to the question
