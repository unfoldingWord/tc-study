# TOC Generators

This directory contains TOC builders for different resource types. Each generator implements the `TocBuilder` interface and handles the specific logic for extracting ingredients from a resource type.

## Adding a New Generator

1. **Create a new generator file** (e.g., `translation-notes.ts`):

```typescript
import type { TocBuilder, TocBuilderConfig, TocIngredient } from '../types.js';
import { extractMarkdownTitle } from './utils.js';

export class TranslationNotesTocBuilder implements TocBuilder {
  async buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]> {
    // Your custom logic here
    const ingredients: TocIngredient[] = [];
    
    // Filter files, extract titles, build ingredients...
    
    return ingredients;
  }
}
```

2. **Register the generator** in `index.ts`:

```typescript
import { TranslationNotesTocBuilder } from './translation-notes.js';

export const GENERATORS: Record<string, GeneratorInfo> = {
  // ... existing generators
  'tn': {
    id: 'tn',
    name: 'Translation Notes',
    description: 'Generates TOC for Translation Notes resources',
    builder: new TranslationNotesTocBuilder(),
  },
};
```

3. **Use it in the CLI**:

```bash
toc-generator generate --builder tn --owner unfoldingWord --language en --resource-id tn
```

## Available Utilities

- `extractMarkdownTitle(content, fallback)`: Extracts the first `#` heading from markdown content

## Generator Interface

All generators must implement the `TocBuilder` interface:

```typescript
interface TocBuilder {
  buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]>;
}
```

## Examples

### Translation Words Generator

Scans `bible/` directory for `.md` files and extracts titles from markdown headings.

### Custom Generator Template

```typescript
export class MyCustomTocBuilder implements TocBuilder {
  async buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]> {
    const ingredients: TocIngredient[] = [];
    
    // 1. Filter files based on your resource type's structure
    const relevantFiles = files.filter(/* your filter logic */);
    
    // 2. Process files (in batches if needed)
    for (const file of relevantFiles) {
      // 3. Extract identifier, title, categories, etc.
      const content = await getFileContent(file.path);
      const title = extractMarkdownTitle(content, file.name);
      
      // 4. Build ingredient
      ingredients.push({
        identifier: /* your identifier logic */,
        title,
        path: file.path,
        categories: /* your categories */,
      });
    }
    
    // 5. Sort and return
    return ingredients.sort(/* your sort logic */);
  }
}
```
