/**
 * Translation Words Ingredients Generator
 * 
 * Generates ingredients for Translation Words resources by:
 * 1. Using zipball for release tags (fast, single API request)
 * 2. Falling back to recursive file listing for branches
 * 3. Extracting titles from markdown content
 * 
 * This module is shared between:
 * - TOC generator (for creating toc.json files)
 * - TW loader (for metadata creation in tc-study app)
 */

import type { Door43ApiClient } from '@bt-synergy/door43-api'
import JSZip from 'jszip'

export interface TWIngredient {
  identifier: string
  title: string
  path: string
  categories?: string[]
}

export interface IngredientsGeneratorOptions {
  owner: string
  language: string
  resourceId: string
  ref: string // Git reference (tag, branch, or commit)
  door43Client: Door43ApiClient
  debug?: boolean
}

export interface IngredientsGeneratorResult {
  ingredients: TWIngredient[]
  fileCount: number
  method: 'zipball' | 'recursive'
}

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
 * Check if a ref is a release tag (starts with 'v' followed by a digit)
 */
function isReleaseTag(ref: string): boolean {
  return /^v\d/.test(ref)
}

/**
 * Generate ingredients using zipball (fast method for release tags)
 */
async function generateFromZipball(
  options: IngredientsGeneratorOptions
): Promise<IngredientsGeneratorResult> {
  let { owner, language, resourceId, ref, door43Client, debug = false } = options
  
  // Validate and fix resourceId if needed
  if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
    console.error(`[generateFromZipball] resourceId is invalid: ${resourceId}. Attempting to extract from language: ${language}`)
    if (language && language.includes('_')) {
      const lastUnderscoreIndex = language.lastIndexOf('_')
      if (lastUnderscoreIndex > 0) {
        resourceId = language.substring(lastUnderscoreIndex + 1)
        language = language.substring(0, lastUnderscoreIndex)
        console.log(`[generateFromZipball] Extracted: language=${language}, resourceId=${resourceId}`)
      }
    }
  }
  
  if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
    throw new Error(`Invalid resourceId in generateFromZipball: ${resourceId}. owner=${owner}, language=${language}`)
  }
  
  const repoName = `${language}_${resourceId}`
  
  // Validate repoName doesn't contain "undefined"
  if (repoName.includes('undefined')) {
    throw new Error(`Invalid repoName in generateFromZipball: ${repoName}. owner=${owner}, language=${language}, resourceId=${resourceId}`)
  }
  
  if (debug) {
    console.log(`📦 Using zipball method for ${owner}/${repoName}@${ref}`)
  }
  
  // Download zipball
  const zipballBuffer = await door43Client.downloadZipball(owner, repoName, ref)
  
  if (debug) {
    const sizeMB = (zipballBuffer.byteLength / (1024 * 1024)).toFixed(2)
    console.log(`✅ Downloaded zipball: ${sizeMB} MB`)
  }
  
  // Extract zip archive
  const zip = await JSZip.loadAsync(zipballBuffer)
  
  // Find repo prefix (e.g., "es-419_tw/" or "es-419_tw-v37/")
  let repoPrefix = ''
  const entryPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir)
  if (entryPaths.length > 0) {
    const firstPath = entryPaths[0]
    const firstSlashIndex = firstPath.indexOf('/')
    if (firstSlashIndex > 0) {
      repoPrefix = firstPath.substring(0, firstSlashIndex + 1)
    }
  }
  
  if (debug && repoPrefix) {
    console.log(`📂 Detected repo prefix: "${repoPrefix}"`)
  }
  
  // Process files
  const ingredients: TWIngredient[] = []
  const markdownFiles: Array<{ path: string; entry: any }> = []
  
  // Collect all markdown files in bible/ directory
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    
    // Remove repo prefix
    let filePath = entryPath
    if (repoPrefix && filePath.startsWith(repoPrefix)) {
      filePath = filePath.substring(repoPrefix.length)
    }
    
    // Only process .md files in bible/ directory
    if (filePath.startsWith('bible/') && filePath.endsWith('.md')) {
      markdownFiles.push({ path: filePath, entry })
    }
  }
  
  if (debug) {
    console.log(`📚 Found ${markdownFiles.length} markdown files in bible/ directory`)
  }
  
  // Process files in batches to extract titles
  const batchSize = 10
  for (let i = 0; i < markdownFiles.length; i += batchSize) {
    const batch = markdownFiles.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async ({ path, entry }) => {
        try {
          // Extract entry ID from path (remove .md extension)
          const entryId = path.replace(/\.md$/, '')
          
          // Extract category from path (e.g., "bible/kt/god.md" -> "kt")
          const categoryMatch = entryId.match(/bible\/([^/]+)/)
          const category = categoryMatch ? categoryMatch[1] : 'other'
          
          // Extract term ID (last part of path)
          const termId = entryId.split('/').pop() || entryId
          
          // Fetch file content to extract title
          const content = await entry.async('string')
          const title = extractMarkdownTitle(content, termId)
          
          ingredients.push({
            identifier: entryId,
            title,
            path,
            categories: [category],
          })
        } catch (error) {
          if (debug) {
            console.warn(`⚠️  Failed to process ${path}:`, error)
          }
          // Continue with other files even if one fails
          // Use filename as fallback
          const entryId = path.replace(/\.md$/, '')
          const termId = entryId.split('/').pop() || entryId
          ingredients.push({
            identifier: entryId,
            title: termId,
            path,
          })
        }
      })
    )
  }
  
  // Sort by identifier for consistent ordering
  ingredients.sort((a, b) => a.identifier.localeCompare(b.identifier))
  
  return {
    ingredients,
    fileCount: markdownFiles.length,
    method: 'zipball',
  }
}

/**
 * Generate ingredients using recursive file listing (for branches)
 */
async function generateFromRecursive(
  options: IngredientsGeneratorOptions
): Promise<IngredientsGeneratorResult> {
  let { owner, language, resourceId, ref, door43Client, debug = false } = options
  
  // Validate and fix resourceId if needed
  if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
    console.error(`[generateFromRecursive] resourceId is invalid: ${resourceId}. Attempting to extract from language: ${language}`)
    if (language && language.includes('_')) {
      const lastUnderscoreIndex = language.lastIndexOf('_')
      if (lastUnderscoreIndex > 0) {
        resourceId = language.substring(lastUnderscoreIndex + 1)
        language = language.substring(0, lastUnderscoreIndex)
        console.log(`[generateFromRecursive] Extracted: language=${language}, resourceId=${resourceId}`)
      }
    }
  }
  
  if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
    throw new Error(`Invalid resourceId in generateFromRecursive: ${resourceId}. owner=${owner}, language=${language}`)
  }
  
  const repoName = `${language}_${resourceId}`
  
  // Validate repoName doesn't contain "undefined"
  if (repoName.includes('undefined')) {
    throw new Error(`Invalid repoName in generateFromRecursive: ${repoName}. owner=${owner}, language=${language}, resourceId=${resourceId}`)
  }
  
  if (debug) {
    console.log(`🔍 Using recursive scan for ${owner}/${repoName}@${ref}`)
  }
  
  // Recursively list all .md files starting from 'bible' directory
  if (debug) {
    console.log(`🔍 Listing files recursively from 'bible' directory in ${owner}/${repoName}@${ref}`)
  }
  
  const allFiles = await door43Client.listRepositoryFilesRecursive(
    owner,
    repoName,
    'bible', // Start from bible directory
    ref,
    (file) => file.type === 'file' && file.name.endsWith('.md')
  )
  
  if (debug) {
    console.log(`📚 Found ${allFiles.length} markdown files in repository`)
    if (allFiles.length === 0) {
      console.warn(`⚠️  No markdown files found! This might mean:`)
      console.warn(`    - The ref '${ref}' doesn't exist`)
      console.warn(`    - The 'bible' directory doesn't exist at this ref`)
      console.warn(`    - There's an issue with the API call`)
    } else {
      console.log(`📄 Sample files:`, allFiles.slice(0, 5).map(f => f.path))
    }
  }
  
  const ingredients: TWIngredient[] = []
  
  // Process files in batches to extract titles
  const batchSize = 10
  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async (file) => {
        try {
          // Extract entry ID from path (remove .md extension)
          const entryId = file.path.replace(/\.md$/, '')
          
          // Extract category from path
          const categoryMatch = entryId.match(/bible\/([^/]+)/)
          const category = categoryMatch ? categoryMatch[1] : 'other'
          
          // Extract term ID (last part of path)
          const termId = entryId.split('/').pop() || entryId
          
          // Fetch file content to extract title
          const content = await door43Client.fetchTextContent(
            owner,
            repoName,
            file.path,
            ref
          )
          const title = extractMarkdownTitle(content, termId)
          
          ingredients.push({
            identifier: entryId,
            title,
            path: file.path,
            categories: [category],
          })
        } catch (error) {
          if (debug) {
            console.warn(`⚠️  Failed to process ${file.path}:`, error)
          }
          // Continue with other files even if one fails
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
  
  return {
    ingredients,
    fileCount: allFiles.length,
    method: 'recursive',
  }
}

/**
 * Generate ingredients for Translation Words resource
 * 
 * Automatically chooses the best method:
 * - Zipball for release tags (fast, single API request)
 * - Recursive scan for branches (slower, multiple API requests)
 * 
 * @param options - Generator options
 * @returns Generated ingredients with metadata
 */
export async function generateTWIngredients(
  options: IngredientsGeneratorOptions
): Promise<IngredientsGeneratorResult> {
  const { ref, debug = false } = options
  
  // Use zipball for release tags, recursive scan for branches
  if (isReleaseTag(ref)) {
    return await generateFromZipball(options)
  } else {
    return await generateFromRecursive(options)
  }
}
