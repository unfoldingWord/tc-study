/**
 * Ingredients Generators for different resource types
 * 
 * These generators extract proper titles from content files during metadata creation.
 * They reuse the TOC builder logic to ensure consistency.
 */

import JSZip from 'jszip'
import type { Door43Resource, IngredientsGenerator } from './ResourceMetadataFactory'

/**
 * Extract markdown title from file content
 * Looks for the first # heading in the markdown
 */
function extractMarkdownTitle(content: string, fallback: string): string {
  // Match first # heading (h1)
  const titleMatch = content.match(/^#\s+(.+)$/m)
  if (titleMatch) {
    return titleMatch[1].trim()
  }
  
  // Fallback to filename if no title found
  return fallback
}

/**
 * Generate ingredients for Translation Words resources
 * 
 * This generator:
 * 1. Checks for toc.json first (if available, uses it)
 * 2. Otherwise, uses zipball for release tags (fast) or recursive file listing
 * 3. Extracts titles from markdown files
 * 4. Returns ingredients with proper titles
 */
export const generateTranslationWordsIngredients: IngredientsGenerator = async (
  door43Resource: Door43Resource,
  door43Client: any
) => {
  let { owner, language, id: resourceId } = door43Resource
  
  // Handle case where resourceId might be missing (shouldn't happen, but defensive)
  if (!resourceId && language && language.includes('_')) {
    const lastUnderscoreIndex = language.lastIndexOf('_')
    if (lastUnderscoreIndex > 0) {
      resourceId = language.substring(lastUnderscoreIndex + 1)
      language = language.substring(0, lastUnderscoreIndex)
      console.warn(`[generateTranslationWordsIngredients] Extracted resourceId from language: ${resourceId}`)
    }
  }
  
  if (!resourceId) {
    throw new Error(`Invalid door43Resource: missing resourceId. owner=${owner}, language=${language}`)
  }
  
  const repoName = `${language}_${resourceId}`
  
  // Validate repoName doesn't contain "undefined"
  if (repoName.includes('undefined')) {
    throw new Error(`Invalid repoName: ${repoName}. owner=${owner}, language=${language}, resourceId=${resourceId}`)
  }
  
  // Determine ref (release tag, version, or master)
  // Check for release info in various possible locations
  const releaseTag = (door43Resource as any).release?.tag_name || 
                     (door43Resource as any).tag_name ||
                     door43Resource.version || 
                     'master'
  const ref = releaseTag
  
  // Step 1: Try to load TOC file first (if it exists, it has proper titles)
  try {
    const tocContent = await door43Client.fetchTextContent(
      owner,
      repoName,
      'toc.json',
      ref
    )
    
    if (tocContent) {
      const tocData = JSON.parse(tocContent)
      if (tocData.ingredients && Array.isArray(tocData.ingredients)) {
        // TOC file exists - use it directly (it already has proper titles)
        return tocData.ingredients
      }
    }
  } catch {
    // TOC file not found - continue to generate from files
  }
  
  // Step 2: Generate ingredients from files
  // Use zipball for release tags (faster), recursive listing for branches
  const isReleaseTag = /^v\d/.test(ref)
  let files: Array<{ name: string; path: string; type: 'file' | 'dir' }> = []
  let getFileContent: (filePath: string) => Promise<string>
  
  if (isReleaseTag) {
    // Use zipball method for release tags
    const zipballBuffer = await door43Client.downloadZipball(owner, repoName, ref)
    const zip = await JSZip.loadAsync(zipballBuffer)
    
    // Find repo prefix
    let repoPrefix = ''
    const entryPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir)
    if (entryPaths.length > 0) {
      const firstPath = entryPaths[0]
      const firstSlashIndex = firstPath.indexOf('/')
      if (firstSlashIndex > 0) {
        repoPrefix = firstPath.substring(0, firstSlashIndex + 1)
      }
    }
    
    // Build file list
    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      
      let filePath = entryPath
      if (repoPrefix && filePath.startsWith(repoPrefix)) {
        filePath = filePath.substring(repoPrefix.length)
      }
      
      const fileName = filePath.split('/').pop() || filePath
      
      files.push({
        name: fileName,
        path: filePath,
        type: 'file',
      })
    }
    
    // Create file content getter from zip
    getFileContent = async (filePath: string): Promise<string> => {
      const fullPath = repoPrefix ? `${repoPrefix}${filePath}` : filePath
      let entry = zip.files[fullPath]
      
      if (!entry && repoPrefix) {
        entry = zip.files[filePath]
      }
      
      if (!entry || entry.dir) {
        throw new Error(`File not found in zip: ${filePath}`)
      }
      
      return await entry.async('string')
    }
  } else {
    // Use recursive file listing for branches
    files = await door43Client.listRepositoryFilesRecursive(
      owner,
      repoName,
      'bible',
      ref,
      (file) => file.type === 'file' && file.name.endsWith('.md')
    )
    
    // Create file content getter using API
    getFileContent = async (filePath: string): Promise<string> => {
      return await door43Client.fetchTextContent(owner, repoName, filePath, ref)
    }
  }
  
  // Step 3: Filter to only .md files in bible/ directory and extract titles
  const markdownFiles = files.filter(
    file => file.type === 'file' && 
    file.path.startsWith('bible/') && 
    file.name.endsWith('.md')
  )
  
  const ingredients: any[] = []
  
  // Process files in batches
  const batchSize = 10
  for (let i = 0; i < markdownFiles.length; i += batchSize) {
    const batch = markdownFiles.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async (file) => {
        try {
          const entryId = file.path.replace(/\.md$/, '')
          const categoryMatch = entryId.match(/bible\/([^/]+)/)
          const category = categoryMatch ? categoryMatch[1] : 'other'
          const termId = entryId.split('/').pop() || entryId
          
          // Fetch file content to extract title
          const content = await getFileContent(file.path)
          const title = extractMarkdownTitle(content, termId)
          
          ingredients.push({
            identifier: entryId,
            title,
            path: file.path,
            categories: [category],
          })
        } catch (error) {
          // Use filename as fallback
          const entryId = file.path.replace(/\.md$/, '')
          const termId = entryId.split('/').pop() || entryId
          ingredients.push({
            identifier: entryId,
            title: termId,
            path: file.path,
          })
        }
      })
    )
  }
  
  // Sort by identifier for consistent ordering
  ingredients.sort((a, b) => a.identifier.localeCompare(b.identifier))
  
  return ingredients
}

/**
 * Get the appropriate ingredients generator for a resource type
 */
export function getIngredientsGenerator(
  subject: string,
  resourceId?: string
): IngredientsGenerator | undefined {
  const subjectLower = subject.toLowerCase()
  const resourceIdLower = resourceId?.toLowerCase() || ''
  
  // Translation Words
  if (
    (subjectLower.includes('words') && !subjectLower.includes('links')) ||
    subjectLower.includes('tw') ||
    resourceIdLower === 'tw'
  ) {
    return generateTranslationWordsIngredients
  }
  
  // Add more generators here for other resource types
  // if (subjectLower.includes('notes') || resourceIdLower === 'tn') {
  //   return generateTranslationNotesIngredients
  // }
  
  return undefined
}
