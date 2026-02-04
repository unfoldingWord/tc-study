/**
 * Translation Words TOC Builder
 * 
 * Uses the shared ingredients generator from @bt-synergy/translation-words-loader
 */

import type { TocBuilder, TocBuilderConfig, TocIngredient } from '../types.js';

export class TranslationWordsTocBuilder implements TocBuilder {
  async buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]> {
    // Note: The files and getFileContent parameters are provided by the TOC generator
    // but we'll use the shared ingredients generator which handles zipball/recursive logic
    // However, we need access to door43Client, so we'll need to get it from the config
    
    // For now, we'll use the files provided (from zipball or recursive scan)
    // and extract titles using getFileContent
    const ingredients: TocIngredient[] = [];
    
    // Filter to only .md files in bible/ directory
    const markdownFiles = files.filter(
      file => file.type === 'file' && 
      file.path.startsWith('bible/') && 
      file.name.endsWith('.md')
    );

    // Debug logging
    if (typeof console !== 'undefined' && console.log) {
      console.log(`📚 Found ${markdownFiles.length} markdown files in bible/ directory`);
      if (markdownFiles.length === 0 && files.length > 0) {
        // Show some example file paths to help debug
        const samplePaths = files.slice(0, 10).map(f => f.path).join(', ');
        console.log(`⚠️  No files found in bible/ directory. Sample file paths: ${samplePaths}`);
      }
    }

    // Process files in batches to extract titles
    const batchSize = 10;
    for (let i = 0; i < markdownFiles.length; i += batchSize) {
      const batch = markdownFiles.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (file) => {
          try {
            // Extract entry ID from path (remove .md extension)
            const entryId = file.path.replace(/\.md$/, '');
            
            // Extract category from path (e.g., "bible/kt/god.md" -> "kt")
            const categoryMatch = entryId.match(/bible\/([^/]+)/);
            const category = categoryMatch ? categoryMatch[1] : 'other';
            
            // Extract term ID (last part of path)
            const termId = entryId.split('/').pop() || entryId;
            
            // Fetch file content to extract title
            const content = await getFileContent(file.path);
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : termId;
            
            ingredients.push({
              identifier: entryId,
              title,
              path: file.path,
              categories: [category],
            });
          } catch (error) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn(`⚠️  Failed to process ${file.path}:`, error);
            }
            // Continue with other files even if one fails
            // Use filename as fallback
            const entryId = file.path.replace(/\.md$/, '');
            const termId = entryId.split('/').pop() || entryId;
            ingredients.push({
              identifier: entryId,
              title: termId,
              path: file.path,
            });
          }
        })
      );
    }

    // Sort by identifier for consistent ordering
    ingredients.sort((a, b) => a.identifier.localeCompare(b.identifier));

    return ingredients;
  }
}
