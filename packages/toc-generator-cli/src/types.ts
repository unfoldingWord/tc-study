/**
 * Types for TOC Generator
 */

export interface TocBuilderConfig {
  server: string;
  owner: string;
  language: string;
  resourceId: string;
  ref?: string; // Git reference (tag, branch, or commit)
}

export interface TocIngredient {
  identifier: string;
  title: string;
  path?: string;
  categories?: string[];
  sort?: number;
}

export interface TocBuilder {
  /**
   * Build TOC ingredients from repository files
   * @param config - Configuration for the resource
   * @param files - List of files found in the repository
   * @param getFileContent - Function to fetch file content
   * @returns Promise resolving to array of ingredients
   */
  buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]>;
}

export interface TocGeneratorOptions {
  server: string;
  owner: string;
  language: string;
  resourceId: string;
  ref?: string; // Reference to read files from (release tag, branch, or commit)
  branch?: string; // Branch name to create/commit to (default: auto-generated)
  tocBuilder: TocBuilder;
  tocFilePath?: string; // Path where TOC file should be saved (default: 'toc.json')
  username?: string;
  password?: string;
  token?: string;
  debug?: boolean; // Enable debug logging
}

export interface TocGeneratorPreview {
  success: boolean;
  ingredients: TocIngredient[];
  ingredientsCount: number;
  gitRef: string; // The ref used to read files
  fileCount: number;
  performanceMetrics?: {
    zipballDownloadMs: number;
    zipballExtractMs: number;
    fileListBuildMs: number;
    ingredientsBuildMs: number;
    totalMs: number;
  };
  error?: string;
}

export interface TocGeneratorResult {
  success: boolean;
  ingredientsCount: number;
  filePath: string;
  commitSha?: string;
  branch?: string; // Branch where the TOC file was committed
  error?: string;
}
