/**
 * Content Discovery Service
 * 
 * Handles discovery of available content for different resource types using
 * the most appropriate Door43 API endpoints.
 */

export interface DiscoveredFile {
  path: string;
  name: string;
  category?: string;
  entryId?: string;
  size?: number;
  sha?: string;
}

export interface ContentDiscoveryResult {
  files: DiscoveredFile[];
  totalCount: number;
  discoveryMethod: 'catalog-ingredients' | 'repository-contents' | 'git-trees-recursive';
}

export class ContentDiscovery {
  
  /**
   * Discover content for book-organized resources (Scripture, Notes, Questions)
   */
  async discoverBookContent(
    server: string,
    owner: string,
    language: string,
    resourceId: string
  ): Promise<ContentDiscoveryResult> {
    const repoName = `${language}_${resourceId}`;
    
    try {
      // Method 1: Try catalog ingredients first (works well for Scripture)
      const catalogResult = await this.discoverFromCatalog(server, owner, repoName);
      if (catalogResult.files.length > 0) {
        return catalogResult;
      }
      
      // Method 2: Fallback to repository contents API
      return await this.discoverFromRepositoryContents(server, owner, repoName);
      
    } catch (error) {
      console.warn(`Content discovery failed for ${repoName}:`, error);
      return { files: [], totalCount: 0, discoveryMethod: 'repository-contents' };
    }
  }

  /**
   * Discover content for entry-organized resources (Academy, Translation Words)
   */
  async discoverEntryContent(
    server: string,
    owner: string,
    language: string,
    resourceId: string
  ): Promise<ContentDiscoveryResult> {
    const repoName = `${language}_${resourceId}`;
    
    try {
      // For topic-organized resources, use recursive git trees API
      return await this.discoverFromGitTrees(server, owner, repoName);
      
    } catch (error) {
      console.warn(`Entry content discovery failed for ${repoName}:`, error);
      return { files: [], totalCount: 0, discoveryMethod: 'git-trees-recursive' };
    }
  }

  /**
   * Discover content from Door43 catalog ingredients
   */
  private async discoverFromCatalog(
    server: string,
    owner: string,
    repoName: string
  ): Promise<ContentDiscoveryResult> {
    const catalogUrl = `https://${server}/api/v1/catalog/search?repo=${repoName}&owner=${owner}&stage=prod`;
    
    console.log(`🔍 Discovering content via catalog: ${catalogUrl}`);
    
    const response = await fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`Catalog API failed: ${response.status}`);
    }
    
    const catalogData = await response.json();
    
    if (!catalogData.ok || !catalogData.data || !Array.isArray(catalogData.data) || catalogData.data.length === 0) {
      return { files: [], totalCount: 0, discoveryMethod: 'catalog-ingredients' };
    }
    
    const resource = catalogData.data[0];
    const ingredients = resource.ingredients || [];
    
    // Filter out directories and front matter, convert to file list
    const files: DiscoveredFile[] = ingredients
      .filter((ingredient: any) => !ingredient.is_dir && ingredient.identifier !== 'frt')
      .map((ingredient: any) => ({
        path: ingredient.path?.replace('./', '') || `${ingredient.identifier}.usfm`,
        name: ingredient.identifier,
        category: 'book',
        entryId: ingredient.identifier,
        size: ingredient.size || 0
      }));
    
    console.log(`📋 Catalog discovery found ${files.length} files`);
    
    return {
      files,
      totalCount: files.length,
      discoveryMethod: 'catalog-ingredients'
    };
  }

  /**
   * Discover content from repository contents API
   */
  private async discoverFromRepositoryContents(
    server: string,
    owner: string,
    repoName: string
  ): Promise<ContentDiscoveryResult> {
    const contentsUrl = `https://${server}/api/v1/repos/${owner}/${repoName}/contents`;
    
    console.log(`🔍 Discovering content via repository contents: ${contentsUrl}`);
    
    const response = await fetch(contentsUrl);
    if (!response.ok) {
      throw new Error(`Repository contents API failed: ${response.status}`);
    }
    
    const contents = await response.json();
    const files: DiscoveredFile[] = [];
    
    for (const item of contents) {
      if (item.type === 'file') {
        // Handle different file types
        if (item.name.endsWith('.usfm')) {
          // Scripture files
          const bookCode = this.extractBookCodeFromFilename(item.name);
          files.push({
            path: item.name,
            name: bookCode,
            category: 'book',
            entryId: bookCode,
            size: item.size || 0
          });
        } else if (item.name.endsWith('.tsv')) {
          // Notes/Questions files
          const bookCode = item.name.replace(/^tn_|^tq_/, '').replace('.tsv', '');
          files.push({
            path: item.name,
            name: bookCode,
            category: 'book',
            entryId: bookCode.toLowerCase(),
            size: item.size || 0
          });
        }
      }
    }
    
    console.log(`📋 Repository contents discovery found ${files.length} files`);
    
    return {
      files,
      totalCount: files.length,
      discoveryMethod: 'repository-contents'
    };
  }

  /**
   * Discover content using recursive git trees API
   */
  private async discoverFromGitTrees(
    server: string,
    owner: string,
    repoName: string
  ): Promise<ContentDiscoveryResult> {
    // First get the default branch/tag from catalog
    const catalogUrl = `https://${server}/api/v1/catalog/search?repo=${repoName}&owner=${owner}&stage=prod`;
    
    let branchOrTag = 'master'; // Default fallback
    
    try {
      const catalogResponse = await fetch(catalogUrl);
      if (catalogResponse.ok) {
        const catalogData = await catalogResponse.json();
        if (catalogData.ok && catalogData.data && catalogData.data.length > 0) {
          branchOrTag = catalogData.data[0].branch_or_tag_name || 'master';
        }
      }
    } catch (error) {
      console.warn('Could not get branch info from catalog, using master');
    }
    
    const treesUrl = `https://${server}/api/v1/repos/${owner}/${repoName}/git/trees/${branchOrTag}?recursive=1&per_page=99999`;
    
    console.log(`🔍 Discovering content via git trees: ${treesUrl}`);
    
    const response = await fetch(treesUrl);
    if (!response.ok) {
      throw new Error(`Git trees API failed: ${response.status}`);
    }
    
    const treesData = await response.json();
    const files: DiscoveredFile[] = [];
    
    for (const item of treesData.tree || []) {
      if (item.type === 'blob' && item.path) {
        // Process different file types based on path patterns
        
        if (item.path.endsWith('.md')) {
          // Translation Words or Academy files
          if (item.path.startsWith('bible/')) {
            // Translation Words: bible/kt/grace.md -> bible/kt/grace
            const entryId = item.path.replace('.md', '');
            const pathParts = entryId.split('/');
            const category = pathParts.length > 2 ? pathParts[pathParts.length - 2] : 'other';
            
            files.push({
              path: item.path,
              name: pathParts[pathParts.length - 1],
              category,
              entryId,
              size: item.size || 0,
              sha: item.sha
            });
          } else if (item.path.includes('/') && !item.path.startsWith('.')) {
            // Translation Academy: translate/figs-metaphor/01.md -> translate/figs-metaphor
            const pathParts = item.path.split('/');
            if (pathParts.length >= 2 && item.path.endsWith('/01.md')) {
              // Main content file for TA articles
              const entryId = pathParts.slice(0, -1).join('/');
              const category = pathParts[0];
              
              files.push({
                path: item.path,
                name: pathParts[pathParts.length - 2],
                category,
                entryId,
                size: item.size || 0,
                sha: item.sha
              });
            }
          }
        }
      }
    }
    
    console.log(`📋 Git trees discovery found ${files.length} files`);
    
    return {
      files,
      totalCount: files.length,
      discoveryMethod: 'git-trees-recursive'
    };
  }

  /**
   * Extract book code from USFM filename
   */
  private extractBookCodeFromFilename(filename: string): string {
    // Handle patterns like "01-GEN.usfm", "41-MAT.usfm", etc.
    const match = filename.match(/(\d+-)?(.*?)\.usfm$/i);
    if (match) {
      return match[2].toLowerCase();
    }
    
    // Fallback: remove extension
    return filename.replace(/\.(usfm|md|tsv)$/i, '').toLowerCase();
  }

  /**
   * Get file content URL for downloading
   */
  getFileContentUrl(
    server: string,
    owner: string,
    repoName: string,
    filePath: string,
    branchOrTag: string = 'master'
  ): string {
    // Use tag format for releases, branch format for master
    if (branchOrTag.startsWith('v')) {
      return `https://${server}/${owner}/${repoName}/raw/tag/${branchOrTag}/${filePath}`;
    }
    return `https://${server}/${owner}/${repoName}/raw/branch/${branchOrTag}/${filePath}`;
  }

  /**
   * Get raw file URL using commit SHA (more reliable)
   */
  getRawFileUrl(
    server: string,
    owner: string,
    repoName: string,
    filePath: string,
    commitSha?: string
  ): string {
    if (commitSha) {
      return `https://${server}/${owner}/${repoName}/raw/commit/${commitSha}/${filePath}`;
    }
    return `https://${server}/${owner}/${repoName}/raw/branch/master/${filePath}`;
  }
}
