/**
 * Semantic ID Generator Utility
 * Generates deterministic numeric IDs for original language tokens
 * ensuring cross-panel compatibility
 * 
 * Ported from mobile app for consistency
 */

/**
 * Generates a semantic ID for an original language token
 * The same content + verseRef + occurrence will always produce the same ID
 * across all panels and processing sessions
 * 
 * @param content - The original language word content (e.g., "Παῦλος")
 * @param verseRef - The verse reference (e.g., "tit 1:1")
 * @param occurrence - The occurrence number of this word in the verse (e.g., 1, 2, 3...)
 * @returns A deterministic numeric ID
 */
// Track generated IDs for collision detection (dev mode only)
const generatedIds = new Map<number, string>()

export function generateSemanticId(content: string, verseRef: string, occurrence = 1): number {
  const input = `${verseRef}:${content}:${occurrence}`
  let hash = 0
  
  // Simple but effective hash function
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  // Return positive integer within reasonable range
  const id = Math.abs(hash) % 1000000
  
  // Collision detection (dev mode)
  if (process.env.NODE_ENV === 'development') {
    if (generatedIds.has(id)) {
      const existing = generatedIds.get(id)
      if (existing !== input) {
        console.warn(`⚠️ Semantic ID collision detected!`)
        console.warn(`   ID: ${id}`)
        console.warn(`   Existing: ${existing}`)
        console.warn(`   New: ${input}`)
      }
    } else {
      generatedIds.set(id, input)
    }
  }
  
  return id
}

/**
 * Validates that a semantic ID is within expected range
 * @param id - The semantic ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSemanticId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < 1000000
}

/**
 * Creates a lookup key for semantic ID mapping
 * @param content - The word content
 * @param verseRef - The verse reference
 * @param occurrence - The occurrence number
 * @returns A standardized lookup key
 */
export function createSemanticIdKey(
  content: string, 
  verseRef: string, 
  occurrence = 1
): string {
  return `${verseRef}:${content}:${occurrence}`
}
