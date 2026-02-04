/**
 * Fast TOC Generator using Zipball
 * 
 * Downloads the entire repository as a zip archive and processes files locally.
 * This dramatically reduces API requests from 1000+ to just 1.
 */

import { Door43ApiClient } from '@bt-synergy/door43-api';
import type { TocBuilder, TocBuilderConfig, TocIngredient } from './types.js';
import JSZip from 'jszip';
import { extractMarkdownTitle } from './generators/utils.js';

export interface FastTocGeneratorOptions {
  server: string;
  owner: string;
  language: string;
  resourceId: string;
  ref?: string; // Release tag, branch, or commit SHA
  tocBuilder: TocBuilder;
  token?: string;
  debug?: boolean;
}

export interface FastTocGeneratorResult {
  ingredients: TocIngredient[];
  fileCount: number;
  processingTimeMs: number;
}

/**
 * Generate TOC ingredients using zipball download (fast method)
 * 
 * This method:
 * 1. Downloads the entire repository as a zip archive (1 API request)
 * 2. Extracts the zip locally
 * 3. Processes all files from the extracted archive
 * 4. Returns the ingredients list
 * 
 * @param options - Configuration options
 * @returns TOC ingredients and metadata
 */
export async function generateFastToc(
  options: FastTocGeneratorOptions
): Promise<FastTocGeneratorResult> {
  const startTime = Date.now();
  
  const {
    server,
    owner,
    language,
    resourceId,
    ref = 'master',
    tocBuilder,
    token,
    debug = false,
  } = options;

  // Initialize Door43 API client
  const door43Client = new Door43ApiClient({
    baseUrl: server,
    token,
    debug,
  });

  const repo = `${language}_${resourceId}`;

  if (debug) {
    console.log(`🚀 Fast TOC generation started for ${owner}/${repo}@${ref}`);
  }

  // Step 1: Download zipball
  if (debug) {
    console.log(`📦 Step 1: Downloading zipball...`);
  }
  const zipballStartTime = Date.now();
  const zipballBuffer = await door43Client.downloadZipball(owner, repo, ref);
  const zipballTime = Date.now() - zipballStartTime;
  
  if (debug) {
    const sizeMB = (zipballBuffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`✅ Zipball downloaded: ${sizeMB} MB in ${zipballTime}ms`);
  }

  // Step 2: Extract zip archive
  if (debug) {
    console.log(`📂 Step 2: Extracting zip archive...`);
  }
  const extractStartTime = Date.now();
  const zip = await JSZip.loadAsync(zipballBuffer);
  const extractTime = Date.now() - extractStartTime;
  
  if (debug) {
    const entryCount = Object.keys(zip.files).length;
    console.log(`✅ Extracted ${entryCount} entries in ${extractTime}ms`);
  }

  // Step 3: Convert zip entries to file list format
  // Zip entries have paths like: "repo-name/bible/kt/god.md" or "repo-name-{ref}/bible/kt/god.md"
  // We need to strip the repo prefix - detect it automatically
  const files: Array<{ name: string; path: string; type: 'file' | 'dir' }> = [];
  
  // Find the common prefix by looking at the first few entries
  let repoPrefix = '';
  const entryPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir);
  if (entryPaths.length > 0) {
    // Get the first file path and extract the prefix (everything before the first file)
    const firstPath = entryPaths[0];
    const firstSlashIndex = firstPath.indexOf('/');
    if (firstSlashIndex > 0) {
      repoPrefix = firstPath.substring(0, firstSlashIndex + 1); // Include the trailing slash
    }
  }
  
  if (debug && repoPrefix) {
    console.log(`📂 Detected repo prefix: "${repoPrefix}"`);
  }
  
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue; // Skip directories
    }
    
    // Remove repo prefix from path
    let filePath = entryPath;
    if (repoPrefix && filePath.startsWith(repoPrefix)) {
      filePath = filePath.substring(repoPrefix.length);
    }
    
    const fileName = filePath.split('/').pop() || filePath;
    
    files.push({
      name: fileName,
      path: filePath,
      type: 'file',
    });
  }

  if (debug) {
    console.log(`📄 Found ${files.length} files in archive`);
  }

  // Step 4: Create file content getter function
  const getFileContent = async (filePath: string): Promise<string> => {
    // Try with prefix first, then without (in case prefix detection was wrong)
    const fullPath = repoPrefix ? `${repoPrefix}${filePath}` : filePath;
    let entry = zip.files[fullPath];
    
    // If not found, try without prefix (maybe prefix detection was incorrect)
    if (!entry && repoPrefix) {
      entry = zip.files[filePath];
    }
    
    if (!entry || entry.dir) {
      throw new Error(`File not found in zip: ${filePath} (tried: ${fullPath}${repoPrefix ? ` and ${filePath}` : ''})`);
    }
    
    // Extract and return file content as UTF-8 string
    return await entry.async('string');
  };

  // Step 5: Build ingredients using the TOC builder
  if (debug) {
    console.log(`🔨 Step 3: Building ingredients using ${tocBuilder.constructor.name}...`);
  }
  const buildStartTime = Date.now();
  
  const config: TocBuilderConfig = {
    server,
    owner,
    language,
    resourceId,
    ref,
  };
  
  const ingredients = await tocBuilder.buildIngredients(config, files, getFileContent);
  const buildTime = Date.now() - buildStartTime;
  
  if (debug) {
    console.log(`✅ Generated ${ingredients.length} ingredients in ${buildTime}ms`);
  }

  const totalTime = Date.now() - startTime;
  
  if (debug) {
    console.log(`🎉 Fast TOC generation completed in ${totalTime}ms`);
    console.log(`   - Zipball download: ${zipballTime}ms`);
    console.log(`   - Extraction: ${extractTime}ms`);
    console.log(`   - Ingredient building: ${buildTime}ms`);
  }

  return {
    ingredients,
    fileCount: files.length,
    processingTimeMs: totalTime,
  };
}
