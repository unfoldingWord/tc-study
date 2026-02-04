# Translation Academy Loader

Resource loader for Translation Academy (TA) articles - training content for Bible translators.

## Overview

Translation Academy provides training articles organized by manual/category:
- **Process Manual**: Translation process and workflow
- **Translate Manual**: Translation principles and techniques  
- **Checking Manual**: Quality assurance and review
- **Intro Manual**: Introduction to translation

## Structure

```
translation-academy-loader/
├── src/
│   ├── TranslationAcademyLoader.ts    # Main loader class
│   ├── ingredients-generator.ts        # Generates article list from repo
│   ├── types.ts                        # TypeScript interfaces
│   └── index.ts                        # Public exports
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

```ts
import { TranslationAcademyLoader } from '@bt-synergy/translation-academy-loader'

const loader = new TranslationAcademyLoader({
  cacheAdapter,
  catalogAdapter,
  door43Client,
  debug: false
})

// Load an article
const article = await loader.loadContent(
  'unfoldingWord/en/ta',
  'translate/translate-unknown'
)
```

## Adapted from Translation Words Loader

This package follows the same architecture as `@bt-synergy/translation-words-loader`:
- Uses zipball for release tags (fast)
- Falls back to recursive listing for branches
- Extracts titles from markdown content
- Generates TOC ingredients dynamically
