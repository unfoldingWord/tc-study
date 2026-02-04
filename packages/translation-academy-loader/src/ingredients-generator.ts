/**
 * Translation Academy Ingredients Generator
 * 
 * Generates ingredients for Translation Academy resources by:
 * 1. Using zipball for release tags (fast, single API request)
 * 2. Falling back to recursive file listing for branches
 * 3. Extracting titles from markdown content
 * 
 * This module is shared between:
 * - TOC generator (for creating toc.json files)
 * - TA loader (for metadata creation in tc-study app)
 */

import type { Door43ApiClient } from '@bt-synergy/door43-api'
import JSZip from 'jszip'

export interface TAIngredient {
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
  ingredients: TAIngredient[]
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
 * TA manual directories to scan
 */
const TA_MANUALS = ['translate', 'checking', 'intro', 'process']

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
  
  // Find repo prefix (e.g., "en_ta/" or "en_ta-v37/")
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
  
  // TA structure: Each entry is a directory containing title.md, sub-title.md, 01.md
  // We need to group files by directory and check for the required files
  const ingredients: TAIngredient[] = []
  const entryDirs = new Map<string, Map<string, any>>() // dirPath -> (filename -> zipEntry)
  
  // Collect all files grouped by their parent directory
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    
    // Remove repo prefix
    let filePath = entryPath
    if (repoPrefix && filePath.startsWith(repoPrefix)) {
      filePath = filePath.substring(repoPrefix.length)
    }
    
    // Check if this is a file in a manual directory with the pattern: manual/article-name/file.md
    const match = filePath.match(/^(translate|checking|intro|process)\/([^/]+)\/(title\.md|sub-title\.md|01\.md)$/)
    if (match) {
      const [, manual, articleId, filename] = match
      const dirPath = `${manual}/${articleId}`
      
      if (!entryDirs.has(dirPath)) {
        entryDirs.set(dirPath, new Map())
      }
      entryDirs.get(dirPath)!.set(filename, entry)
    }
  }
  
  if (debug) {
    console.log(`📚 Found ${entryDirs.size} TA entry directories`)
  }
  
  // Process each directory that has the required files
  const entries = Array.from(entryDirs.entries())
  const batchSize = 10
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async ([dirPath, files]) => {
        try {
          // Check if directory has required file (01.md is mandatory)
          if (!files.has('01.md')) {
            if (debug) {
              console.warn(`⚠️  Skipping ${dirPath}: missing 01.md`)
            }
            return
          }
          
          // Extract manual and article ID from dirPath
          const [manual, articleId] = dirPath.split('/')
          
          // Try to extract title from title.md if it exists
          let title = articleId // fallback to article ID
          
          if (files.has('title.md')) {
            try {
              const titleEntry = files.get('title.md')!
              const titleContent = await titleEntry.async('string')
              // Title file typically contains just the title text, no markdown heading
              const cleanTitle = titleContent.trim().replace(/^#+\s*/, '')
              if (cleanTitle) {
                title = cleanTitle
              }
            } catch (err) {
              if (debug) {
                console.warn(`⚠️  Failed to read title.md for ${dirPath}:`, err)
              }
            }
          }
          
          // The identifier is the directory path (without trailing slash)
          // The path also points to the directory
          ingredients.push({
            identifier: dirPath,
            title,
            path: dirPath,
            categories: [manual],
          })
        } catch (error) {
          if (debug) {
            console.warn(`⚠️  Failed to process ${dirPath}:`, error)
          }
          // Continue with other entries even if one fails
          const articleId = dirPath.split('/').pop() || dirPath
          ingredients.push({
            identifier: dirPath,
            title: articleId,
            path: dirPath,
            categories: [dirPath.split('/')[0]],
          })
        }
      })
    )
  }
  
  // Sort by identifier for consistent ordering
  ingredients.sort((a, b) => a.identifier.localeCompare(b.identifier))
  
  return {
    ingredients,
    fileCount: entryDirs.size,
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
  
  const ingredients: TAIngredient[] = []
  const entryDirs = new Map<string, Set<string>>() // dirPath -> set of filenames
  
  // Scan each manual directory
  for (const manual of TA_MANUALS) {
    try {
      if (debug) {
        console.log(`🔍 Listing files recursively from '${manual}' directory in ${owner}/${repoName}@${ref}`)
      }
      
      const manualFiles = await door43Client.listRepositoryFilesRecursive(
        owner,
        repoName,
        manual,
        ref,
        (file) => file.type === 'file' && file.name.endsWith('.md')
      )
      
      if (debug) {
        console.log(`📚 Found ${manualFiles.length} markdown files in ${manual}/ directory`)
      }
      
      // Group files by their parent directory
      for (const file of manualFiles) {
        // Pattern: translate/article-name/file.md
        const match = file.path.match(/^([^/]+)\/([^/]+)\/(title\.md|sub-title\.md|01\.md)$/)
        if (match) {
          const [, , articleId, filename] = match
          const dirPath = `${manual}/${articleId}`
          
          if (!entryDirs.has(dirPath)) {
            entryDirs.set(dirPath, new Set())
          }
          entryDirs.get(dirPath)!.add(filename)
        }
      }
    } catch (error) {
      if (debug) {
        console.warn(`⚠️  Failed to scan ${manual}/ directory:`, error)
      }
      // Continue with other manuals even if one fails
    }
  }
  
  if (debug) {
    console.log(`📚 Found ${entryDirs.size} TA entry directories`)
  }
  
  // Process each directory that has the required files
  const entries = Array.from(entryDirs.entries())
  const batchSize = 10
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async ([dirPath, foundFiles]) => {
        try {
          // Check if directory has required file (01.md is mandatory)
          if (!foundFiles.has('01.md')) {
            if (debug) {
              console.warn(`⚠️  Skipping ${dirPath}: missing 01.md`)
            }
            return
          }
          
          // Extract manual and article ID from dirPath
          const [manual, articleId] = dirPath.split('/')
          
          // Try to extract title from title.md if it exists
          let title = articleId // fallback to article ID
          
          if (foundFiles.has('title.md')) {
            try {
              const titlePath = `${dirPath}/title.md`
              const titleContent = await door43Client.fetchTextContent(
                owner,
                repoName,
                titlePath,
                ref
              )
              // Title file typically contains just the title text, no markdown heading
              const cleanTitle = titleContent.trim().replace(/^#+\s*/, '')
              if (cleanTitle) {
                title = cleanTitle
              }
            } catch (err) {
              if (debug) {
                console.warn(`⚠️  Failed to read title.md for ${dirPath}:`, err)
              }
            }
          }
          
          // The identifier is the directory path (without trailing slash)
          // The path also points to the directory
          ingredients.push({
            identifier: dirPath,
            title,
            path: dirPath,
            categories: [manual],
          })
        } catch (error) {
          if (debug) {
            console.warn(`⚠️  Failed to process ${dirPath}:`, error)
          }
          // Continue with other entries even if one fails
          const articleId = dirPath.split('/').pop() || dirPath
          ingredients.push({
            identifier: dirPath,
            title: articleId,
            path: dirPath,
            categories: [dirPath.split('/')[0]],
          })
        }
      })
    )
  }
  
  // Sort by identifier for consistent ordering
  ingredients.sort((a, b) => a.identifier.localeCompare(b.identifier))
  
  return {
    ingredients,
    fileCount: ingredients.length,
    method: 'recursive',
  }
}

/**
 * Generate ingredients for Translation Academy resource
 * 
 * Automatically chooses the best method:
 * - Zipball for release tags (fast, single API request)
 * - Recursive scan for branches (slower, multiple API requests)
 * 
 * @param options - Generator options
 * @returns Generated ingredients with metadata
 */
export async function generateTAIngredients(
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
