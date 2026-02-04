/**
 * TOC Generator - Main logic for generating and saving TOC files
 */

import { Door43ApiClient } from '@bt-synergy/door43-api';
import JSZip from 'jszip';
import type { TocGeneratorOptions, TocGeneratorPreview, TocGeneratorResult, TocIngredient } from './types.js';

export class TocGenerator {
  private door43Client: Door43ApiClient;
  private options: TocGeneratorOptions;

  constructor(options: TocGeneratorOptions) {
    this.options = options;
    
    // Create authenticated Door43 API client
    this.door43Client = new Door43ApiClient({
      baseUrl: options.server.startsWith('http') 
        ? options.server 
        : `https://${options.server}`,
      username: options.username,
      password: options.password,
      token: options.token,
      debug: options.debug || false,
    });
  }

  /**
   * Check if a ref is a release tag (starts with 'v' followed by a digit)
   */
  private isReleaseTag(ref: string): boolean {
    return /^v\d/.test(ref);
  }

  /**
   * Generate ingredients preview (without committing)
   * This is step 1 - generate the ingredients so the user can review them
   */
  async generatePreview(): Promise<TocGeneratorPreview> {
    try {
      const { owner, language, resourceId, ref, tocBuilder } = this.options;
      const repoName = `${language}_${resourceId}`;
      
      // Determine ref to read files from (release tag, version, or master)
      // If not provided, try to get it from the Door43 catalog API
      let gitRef = ref;
      if (!gitRef) {
        try {
          // Try to get the release tag from the catalog API
          const repo = await this.door43Client.findRepository(owner, repoName, 'prod');
          if (repo?.release?.tag_name) {
            gitRef = repo.release.tag_name;
          } else if (repo?.version) {
            gitRef = repo.version;
          } else {
            gitRef = 'master';
          }
        } catch {
          // Fallback to master if we can't fetch from catalog
          gitRef = 'master';
        }
      }

      // Get files and file content getter
      // Use zipball for release tags (faster), individual fetches for branches
      let allFiles: Array<{ name: string; path: string; type: 'file' | 'dir' }>;
      let getFileContent: (filePath: string) => Promise<string>;
      
      // Performance timing
      const performanceMetrics = {
        zipballDownloadMs: 0,
        zipballExtractMs: 0,
        fileListBuildMs: 0,
        ingredientsBuildMs: 0,
        totalMs: 0,
      };
      const step1StartTime = Date.now();

      if (this.isReleaseTag(gitRef)) {
        // Use zipball method for release tags (much faster)
        if (this.options.debug) {
          console.log(`📦 Using zipball method for release tag ${gitRef}...`);
        }
        
        // Download zipball
        const zipballStartTime = Date.now();
        const zipballBuffer = await this.door43Client.downloadZipball(owner, repoName, gitRef);
        performanceMetrics.zipballDownloadMs = Date.now() - zipballStartTime;
        
        if (this.options.debug) {
          const sizeMB = (zipballBuffer.byteLength / (1024 * 1024)).toFixed(2);
          console.log(`✅ Downloaded zipball: ${sizeMB} MB in ${performanceMetrics.zipballDownloadMs}ms`);
        }

        // Extract zip archive
        const extractStartTime = Date.now();
        const zip = await JSZip.loadAsync(zipballBuffer);
        performanceMetrics.zipballExtractMs = Date.now() - extractStartTime;
        
        if (this.options.debug) {
          const entryCount = Object.keys(zip.files).length;
          console.log(`✅ Extracted ${entryCount} entries in ${performanceMetrics.zipballExtractMs}ms`);
        }

        // Convert zip entries to file list format
        allFiles = [];
        
        // Find the common prefix by looking at the first few entries
        let repoPrefix = '';
        const entryPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir);
        if (entryPaths.length > 0) {
          const firstPath = entryPaths[0];
          const firstSlashIndex = firstPath.indexOf('/');
          if (firstSlashIndex > 0) {
            repoPrefix = firstPath.substring(0, firstSlashIndex + 1);
          }
        }
        
        // Build file list from zip entries
        const fileListStartTime = Date.now();
        
        if (this.options.debug && repoPrefix) {
          console.log(`📂 Detected repo prefix: "${repoPrefix}"`);
        }
        
        for (const [entryPath, entry] of Object.entries(zip.files)) {
          if (entry.dir) {
            continue;
          }
          
          let filePath = entryPath;
          if (repoPrefix && filePath.startsWith(repoPrefix)) {
            filePath = filePath.substring(repoPrefix.length);
          }
          
          const fileName = filePath.split('/').pop() || filePath;
          
          allFiles.push({
            name: fileName,
            path: filePath,
            type: 'file',
          });
        }
        
        performanceMetrics.fileListBuildMs = Date.now() - fileListStartTime;

        if (this.options.debug) {
          console.log(`📁 Found ${allFiles.length} files in zipball (processed in ${performanceMetrics.fileListBuildMs}ms)`);
        }

        // Create file content getter from zip entries
        getFileContent = async (filePath: string): Promise<string> => {
          const fullPath = repoPrefix ? `${repoPrefix}${filePath}` : filePath;
          let entry = zip.files[fullPath];
          
          if (!entry && repoPrefix) {
            entry = zip.files[filePath];
          }
          
          if (!entry || entry.dir) {
            throw new Error(`File not found in zip: ${filePath}`);
          }
          
          return await entry.async('string');
        };
      } else {
        // Use individual file fetches for branches
        if (this.options.debug) {
          console.log(`🔍 Listing all files in repository ${owner}/${repoName} (ref: ${gitRef})...`);
        }
        
        const fileListStartTime = Date.now();
        allFiles = await this.door43Client.listRepositoryFilesRecursive(
          owner,
          repoName,
          '',
          gitRef,
          (file) => file.type === 'file'
        );
        performanceMetrics.fileListBuildMs = Date.now() - fileListStartTime;

        if (this.options.debug) {
          console.log(`📁 Found ${allFiles.length} total files in repository (listed in ${performanceMetrics.fileListBuildMs}ms)`);
        }

        getFileContent = async (filePath: string): Promise<string> => {
          return await this.door43Client.fetchTextContent(
            owner,
            repoName,
            filePath,
            gitRef
          );
        };
      }
      
      performanceMetrics.totalMs = Date.now() - step1StartTime;

      // Build ingredients using the provided TOC builder
      if (this.options.debug) {
        console.log(`🔨 Building ingredients using ${tocBuilder.constructor.name}...`);
      }
      
      const ingredientsStartTime = Date.now();
      const ingredients = await tocBuilder.buildIngredients(
        {
          server: this.options.server,
          owner,
          language,
          resourceId,
          ref: gitRef,
        },
        allFiles,
        getFileContent
      );
      performanceMetrics.ingredientsBuildMs = Date.now() - ingredientsStartTime;
      
      const totalProcessingTime = Date.now() - step1StartTime;
      
      if (this.options.debug) {
        console.log(`\n📊 Performance Metrics (X-Ray):`);
        console.log(`   ┌─────────────────────────────────────────┐`);
        if (this.isReleaseTag(gitRef)) {
          console.log(`   │ 📥 Zipball download:      ${String(performanceMetrics.zipballDownloadMs).padStart(8)}ms │`);
          console.log(`   │ 📦 Zipball extraction:    ${String(performanceMetrics.zipballExtractMs).padStart(8)}ms │`);
          console.log(`   │ 📋 File list building:   ${String(performanceMetrics.fileListBuildMs).padStart(8)}ms │`);
        } else {
          console.log(`   │ 📋 File listing (API):   ${String(performanceMetrics.fileListBuildMs).padStart(8)}ms │`);
        }
        console.log(`   │ 🔨 Ingredients building:  ${String(performanceMetrics.ingredientsBuildMs).padStart(8)}ms │`);
        console.log(`   ├─────────────────────────────────────────┤`);
        console.log(`   │ ⏱️  Total processing:      ${String(totalProcessingTime).padStart(8)}ms │`);
        console.log(`   │    (${(totalProcessingTime / 1000).toFixed(2)}s)                              │`);
        console.log(`   │ 📈 Ingredients generated:  ${String(ingredients.length).padStart(8)}    │`);
        console.log(`   └─────────────────────────────────────────┘\n`);
      }

      return {
        success: true,
        ingredients,
        ingredientsCount: ingredients.length,
        gitRef,
        fileCount: allFiles.length,
        performanceMetrics,
      };
    } catch (error) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        errorMessage = errObj.message || errObj.error || JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      
      return {
        success: false,
        ingredients: [],
        ingredientsCount: 0,
        gitRef: this.options.ref || 'master',
        fileCount: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Commit ingredients to a branch (step 2 - after user confirmation)
   */
  async commitIngredients(
    ingredients: TocIngredient[],
    gitRef: string,
    branch?: string
  ): Promise<TocGeneratorResult> {
    try {
      const { owner, language, resourceId, tocFilePath = 'toc.json' } = this.options;
      const repoName = `${language}_${resourceId}`;

      // Determine branch to commit to (create new branch if not specified)
      let targetBranch = branch;
      if (!targetBranch) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        targetBranch = `toc-update-${timestamp}`;
      }

      const baseBranch = 'master';
      
      // Create the branch if it doesn't exist
      try {
        if (this.options.debug) {
          console.log(`🔨 Creating branch '${targetBranch}' from '${baseBranch}'...`);
        }
        await this.door43Client.createBranch(owner, repoName, targetBranch, baseBranch);
        if (this.options.debug) {
          console.log(`✅ Branch '${targetBranch}' created successfully from '${baseBranch}'`);
        }
      } catch (error) {
        const errObj = error as any;
        if (errObj.code === 'HTTP_ERROR' && errObj.message?.includes('already exists')) {
          if (this.options.debug) {
            console.log(`ℹ️  Branch '${targetBranch}' already exists, will update it`);
          }
        } else {
          let errorMessage: string;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'object' && error !== null) {
            const err = error as any;
            if (err.message && err.code) {
              errorMessage = `${err.message} (code: ${err.code}, status: ${err.status || 'N/A'})`;
            } else {
              errorMessage = err.message || err.error || JSON.stringify(error, null, 2);
            }
          } else {
            errorMessage = String(error);
          }
          throw new Error(`Failed to create branch '${targetBranch}' from '${baseBranch}': ${errorMessage}`);
        }
      }

      // Wait a moment for the branch to be fully available
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (this.options.debug) {
        console.log(`🔍 Verifying branch '${targetBranch}' exists before creating file...`);
      }
      
      try {
        await this.door43Client.fetchTextContent(owner, repoName, 'README.md', targetBranch).catch(() => {});
        if (this.options.debug) {
          console.log(`✅ Branch '${targetBranch}' is accessible`);
        }
      } catch (error) {
        if (this.options.debug) {
          console.warn(`⚠️  Branch verification failed, but continuing anyway:`, error);
        }
      }

      // Check if file already exists
      let existingSha: string | null = null;
      try {
        existingSha = await this.door43Client.getFileSha(
          owner,
          repoName,
          tocFilePath,
          targetBranch
        );
      } catch (error) {
        if (this.options.debug) {
          console.log(`📄 File ${tocFilePath} does not exist in branch ${targetBranch}, will create new file`);
        }
      }

      // Create TOC structure
      const tocData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        ref: gitRef,
        ingredients,
      };

      // Create or update the TOC file
      const commitMessage = existingSha
        ? `Update TOC file (${ingredients.length} ingredients)`
        : `Add TOC file (${ingredients.length} ingredients)`;

      if (this.options.debug) {
        console.log(`📝 ${existingSha ? 'Updating' : 'Creating'} TOC file with ${ingredients.length} ingredients`);
      }

      const commitSha = await this.door43Client.createOrUpdateFile(
        owner,
        repoName,
        tocFilePath,
        JSON.stringify(tocData, null, 2),
        commitMessage,
        targetBranch,
        existingSha || undefined
      );

      return {
        success: true,
        ingredientsCount: ingredients.length,
        filePath: tocFilePath,
        commitSha,
        branch: targetBranch,
      };
    } catch (error) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        errorMessage = errObj.message || errObj.error || JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      
      return {
        success: false,
        ingredientsCount: ingredients.length,
        filePath: this.options.tocFilePath || 'toc.json',
        error: errorMessage,
      };
    }
  }

  /**
   * Generate TOC file and save it to the repository (legacy method - calls preview then commit)
   */
  async generate(): Promise<TocGeneratorResult> {
    // Generate preview first
    const preview = await this.generatePreview();
    
    if (!preview.success) {
      return {
        success: false,
        ingredientsCount: 0,
        filePath: this.options.tocFilePath || 'toc.json',
        error: preview.error,
      };
    }
    
    // Then commit (using the branch from options if provided)
    return await this.commitIngredients(
      preview.ingredients,
      preview.gitRef,
      this.options.branch
    );
  }
}
