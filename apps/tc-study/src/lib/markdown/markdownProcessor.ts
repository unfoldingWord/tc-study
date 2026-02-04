/**
 * Markdown Processing Utilities
 * 
 * Helper functions for processing markdown content for Translation Words and other resources
 */

/**
 * Remove the first heading from markdown content to avoid duplication with custom headers
 * Based on bt-studio's approach
 */
export function removeFirstHeading(content: string): string {
  const lines = content.split('\n')
  let firstHeadingRemoved = false
  
  return lines.filter(line => {
    // Skip the first heading (# Title)
    if (!firstHeadingRemoved && line.trim().startsWith('# ')) {
      firstHeadingRemoved = true
      return false
    }
    return true
  }).join('\n')
}

/**
 * Remove first heading and optionally the Definition heading that often follows
 */
export function removeFirstHeadingAndDefinition(content: string): string {
  const lines = content.split('\n')
  let firstHeadingRemoved = false
  let definitionHeadingRemoved = false
  
  return lines.filter(line => {
    const trimmed = line.trim()
    
    // Skip the first heading (# Title)
    if (!firstHeadingRemoved && trimmed.startsWith('# ')) {
      firstHeadingRemoved = true
      return false
    }
    
    // Skip ## Definition: if it comes right after (within 2 lines)
    if (firstHeadingRemoved && !definitionHeadingRemoved && trimmed.startsWith('## Definition:')) {
      definitionHeadingRemoved = true
      return false
    }
    
    return true
  }).join('\n')
}

/**
 * Extract title from entry ID
 * e.g., "bible/kt/grace" -> "grace"
 */
export function extractTitleFromEntryId(entryId: string): string {
  return entryId.split('/').pop() || entryId
}

/**
 * Extract category from entry ID
 * e.g., "bible/kt/grace" -> "kt"
 */
export function extractCategoryFromEntryId(entryId: string): string {
  const parts = entryId.split('/')
  return parts.length > 1 ? parts[parts.length - 2] : ''
}
