/**
 * Translation Academy TOC Builder
 * 
 * Uses the shared ingredients generator from @bt-synergy/translation-academy-loader
 */

import type { TocBuilder, TocBuilderConfig, TocIngredient } from '../types.js';

export class TranslationAcademyTocBuilder implements TocBuilder {
  async buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]> {
    // TA has a different structure than TW:
    // - Each entry is a DIRECTORY (e.g., "translate/figs-metaphor/")
    // - Each directory contains: title.md, sub-title.md, 01.md
    // - The identifier is the directory path (e.g., "translate/figs-metaphor")
    
    const ingredients: TocIngredient[] = [];
    
    // TA manual directories to scan
    const TA_MANUALS = ['translate', 'checking', 'intro', 'process'];
    
    // Find all directories that contain 01.md (this is how we identify TA entries)
    // Map to collect directories: directory path -> files in that directory
    const entryDirs = new Map<string, Set<string>>();
    
    for (const file of files) {
      if (file.type !== 'file') continue;
      
      // Check if file is in a manual directory
      const manualMatch = file.path.match(/^(translate|checking|intro|process)\/([^/]+)\/(title\.md|sub-title\.md|01\.md)$/);
      if (manualMatch) {
        const [, manual, articleId, filename] = manualMatch;
        const dirPath = `${manual}/${articleId}`;
        
        if (!entryDirs.has(dirPath)) {
          entryDirs.set(dirPath, new Set());
        }
        entryDirs.get(dirPath)!.add(filename);
      }
    }

    // Debug logging
    if (typeof console !== 'undefined' && console.log) {
      console.log(`📚 Found ${entryDirs.size} TA entry directories`);
      if (entryDirs.size === 0 && files.length > 0) {
        const samplePaths = files.slice(0, 10).map(f => f.path).join(', ');
        console.log(`⚠️  No TA entries found. Sample file paths: ${samplePaths}`);
      }
    }

    // Process each directory that contains the required files
    const entries = Array.from(entryDirs.entries());
    const batchSize = 10;
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async ([dirPath, foundFiles]) => {
          try {
            // Check if directory has required files
            if (!foundFiles.has('01.md')) {
              console.warn(`⚠️  Skipping ${dirPath}: missing 01.md`);
              return;
            }
            
            // Extract manual and article ID from dirPath
            const [manual, articleId] = dirPath.split('/');
            
            // Try to extract title from title.md if it exists
            let title = articleId; // fallback to article ID
            
            if (foundFiles.has('title.md')) {
              try {
                const titlePath = `${dirPath}/title.md`;
                const titleContent = await getFileContent(titlePath);
                // Title file typically contains just the title text, no markdown heading
                const cleanTitle = titleContent.trim().replace(/^#\s+/, '');
                if (cleanTitle) {
                  title = cleanTitle;
                }
              } catch (err) {
                console.warn(`⚠️  Failed to read title.md for ${dirPath}:`, err);
              }
            }
            
            // The identifier is the directory path (without trailing slash)
            // The path points to the directory, not a specific file
            ingredients.push({
              identifier: dirPath,
              title,
              path: dirPath, // Directory path, not file path
              categories: [manual],
            });
          } catch (error) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn(`⚠️  Failed to process ${dirPath}:`, error);
            }
            // Continue with other entries even if one fails
            const articleId = dirPath.split('/').pop() || dirPath;
            ingredients.push({
              identifier: dirPath,
              title: articleId,
              path: dirPath,
              categories: [dirPath.split('/')[0]],
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
