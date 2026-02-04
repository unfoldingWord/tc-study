/**
 * Semantic ID Generator Utility
 * Generates deterministic numeric IDs for original language tokens
 * ensuring cross-panel compatibility
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
export function generateSemanticId(content: string, verseRef: string, occurrence = 1): number {
  const input = `${verseRef}:${content}:${occurrence}`;
  let hash = 0;
  
  // Simple but effective hash function
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Return positive integer within reasonable range
  return Math.abs(hash) % 1000000;
}

/**
 * @deprecated Use generateSemanticId instead - this function redirects to the new implementation
 * Generates a semantic ID with occurrence support
 * For cases where the same word appears multiple times in a verse
 * 
 * @param content - The original language word content
 * @param verseRef - The verse reference
 * @param occurrence - The occurrence number (1-based)
 * @returns A deterministic numeric ID that includes occurrence
 */
export function generateSemanticIdWithOccurrence(
  content: string, 
  verseRef: string, 
  occurrence = 1
): number {
  // Redirect to the new implementation
  return generateSemanticId(content, verseRef, occurrence);
}

/**
 * Validates that a semantic ID is within expected range
 * @param id - The semantic ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSemanticId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < 1000000;
}

/**
 * Batch generates semantic IDs for multiple tokens
 * Useful for processing entire verses or chapters
 * 
 * @param tokens - Array of token data
 * @returns Map of semantic IDs keyed by token identifier
 */
export function batchGenerateSemanticIds(tokens: {
  content: string;
  verseRef: string;
  occurrence?: number;
}[]): Map<string, number> {
  const idMap = new Map<string, number>();
  
  for (const token of tokens) {
    const key = `${token.verseRef}:${token.content}:${token.occurrence || 1}`;
    const id = generateSemanticId(
      token.content, 
      token.verseRef, 
      token.occurrence || 1
    );
    idMap.set(key, id);
  }
  
  return idMap;
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
  return `${verseRef}:${content}:${occurrence}`;
}

/**
 * Performance test function for semantic ID generation
 * Used for benchmarking and optimization
 */
export function benchmarkSemanticIdGeneration(iterations = 10000): {
  totalTime: number;
  avgTime: number;
  idsPerSecond: number;
} {
  const testData = [
    { content: 'Παῦλος', verseRef: 'tit 1:1', occurrence: 1 },
    { content: 'δοῦλος', verseRef: 'tit 1:1', occurrence: 1 },
    { content: 'Θεοῦ', verseRef: 'tit 1:1', occurrence: 1 },
    { content: 'Ἰησοῦ', verseRef: 'tit 1:1', occurrence: 1 },
    { content: 'Χριστοῦ', verseRef: 'tit 1:1', occurrence: 1 }
  ];
  
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    for (const token of testData) {
      generateSemanticId(token.content, token.verseRef, token.occurrence);
    }
  }
  
  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;
  const idsPerSecond = (testData.length * iterations) / (totalTime / 1000);
  
  return {
    totalTime,
    avgTime,
    idsPerSecond: Math.round(idsPerSecond)
  };
}

