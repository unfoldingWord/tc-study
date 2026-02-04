/**
 * Shared utilities for TOC generators
 */

/**
 * Extract markdown title from file content
 * Looks for the first # heading in the markdown
 */
export function extractMarkdownTitle(content: string, fallback: string): string {
  // Match first # heading (h1)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  // Fallback to filename if no title found
  return fallback;
}
