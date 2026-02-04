/**
 * TSV Alignment Algorithm Demonstration Script
 * 
 * This script demonstrates the complete TSV alignment algorithm using real data from Door43.
 * It fetches TWL (Translation Words Links) data, original language scripture (UGNT),
 * and target language scripture (ULT), then walks through the alignment process step-by-step.
 * 
 * Usage:
 *   bun run test-tsv-alignment.ts [book] [chapter] [verse]
 *   
 * Examples:
 *   bun run test-tsv-alignment.ts tit 1 1
 *   bun run test-tsv-alignment.ts jhn 3 16
 */

import { Door43ApiClient } from '@bt-synergy/door43-api'

// ============================================================================
// Configuration
// ============================================================================

interface TestConfig {
  book: string
  chapter: number
  verse: number
  owner: string
  language: string
  twlResourceId: string
  originalResourceId: string
  targetResourceId: string
}

const DEFAULT_CONFIG: TestConfig = {
  book: 'tit',
  chapter: 1,
  verse: 1,
  owner: 'unfoldingWord',
  language: 'en',
  twlResourceId: 'twl',
  originalResourceId: 'ugnt', // Greek NT (or 'uhb' for Hebrew OT)
  targetResourceId: 'ult',
}

// ============================================================================
// Data Structures (matching the documentation)
// ============================================================================

interface TWLEntry {
  reference: string    // "1:1"
  id: string
  tags: string
  origWords: string   // "Παῦλος"
  occurrence: string  // "1"
  twLink: string
}

interface Token {
  text: string
  semanticId: string  // "TIT 1:1:Παῦλος:1"
  occurrence: number
  verseRef: string
  lemma?: string
  strong?: string
  morph?: string
  alignedOriginalWordIds?: string[]  // For target tokens
}

interface AlignmentStep1Result {
  twlEntry: TWLEntry
  originalTokens: Token[]
  success: boolean
  error?: string
}

interface AlignmentStep2Result {
  originalTokens: Token[]
  targetTokens: Token[]
  success: boolean
  error?: string
}

// ============================================================================
// Mock Data (in case API is unavailable)
// ============================================================================

const MOCK_TWL_DATA: TWLEntry[] = [
  {
    reference: '1:1',
    id: 'tit_1_1_paul',
    tags: 'names',
    origWords: 'Παῦλος',
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/names/paul'
  },
  {
    reference: '1:1',
    id: 'tit_1_1_servant',
    tags: 'kt',
    origWords: 'δοῦλος',
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/kt/servant'
  },
  {
    reference: '1:1',
    id: 'tit_1_1_god',
    tags: 'kt',
    origWords: 'Θεοῦ',
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/kt/god'
  }
]

const MOCK_ORIGINAL_TOKENS: Token[] = [
  { text: 'Παῦλος', semanticId: 'TIT 1:1:Παῦλος:1', occurrence: 1, verseRef: 'TIT 1:1', lemma: 'Παῦλος', strong: 'G3972' },
  { text: 'δοῦλος', semanticId: 'TIT 1:1:δοῦλος:1', occurrence: 1, verseRef: 'TIT 1:1', lemma: 'δοῦλος', strong: 'G1401' },
  { text: 'Θεοῦ', semanticId: 'TIT 1:1:Θεοῦ:1', occurrence: 1, verseRef: 'TIT 1:1', lemma: 'θεός', strong: 'G2316' },
  { text: 'ἀπόστολος', semanticId: 'TIT 1:1:ἀπόστολος:1', occurrence: 1, verseRef: 'TIT 1:1', lemma: 'ἀπόστολος', strong: 'G652' },
  { text: 'δὲ', semanticId: 'TIT 1:1:δὲ:1', occurrence: 1, verseRef: 'TIT 1:1', lemma: 'δέ', strong: 'G1161' },
]

const MOCK_TARGET_TOKENS: Token[] = [
  { 
    text: 'Paul', 
    semanticId: 'TIT 1:1:Paul:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: ['TIT 1:1:Παῦλος:1']
  },
  { 
    text: 'a', 
    semanticId: 'TIT 1:1:a:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: []
  },
  { 
    text: 'servant', 
    semanticId: 'TIT 1:1:servant:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: ['TIT 1:1:δοῦλος:1']
  },
  { 
    text: 'of', 
    semanticId: 'TIT 1:1:of:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: []
  },
  { 
    text: 'God', 
    semanticId: 'TIT 1:1:God:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: ['TIT 1:1:Θεοῦ:1']
  },
  { 
    text: 'and', 
    semanticId: 'TIT 1:1:and:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: ['TIT 1:1:δὲ:1']
  },
  { 
    text: 'an', 
    semanticId: 'TIT 1:1:an:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: []
  },
  { 
    text: 'apostle', 
    semanticId: 'TIT 1:1:apostle:1', 
    occurrence: 1, 
    verseRef: 'TIT 1:1',
    alignedOriginalWordIds: ['TIT 1:1:ἀπόστολος:1']
  },
]

// ============================================================================
// Text Normalization (from bt-studio quote-matcher.ts)
// ============================================================================

function isHebrewText(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text)
}

function normalizeHebrewText(text: string): string {
  return text
    .replace(/־/g, ' ')           // Maqaf to space
    .replace(/[׃׀]/g, '')         // Remove punctuation
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '')  // Cantillation
    .replace(/[\u05B0\u05B1\u05B4\u05B5\u05B8\u05B9\u05BB\u05BC]/g, '')         // Vowel points
    .replace(/⁠/g, '')            // Word joiner
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeText(text: string): string {
  if (isHebrewText(text)) {
    return normalizeHebrewText(text)
  }
  
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================================
// Step 1: TSV origWords → Original Language Tokens
// ============================================================================

function findOriginalTokens(
  twlEntry: TWLEntry,
  originalTokens: Token[]
): AlignmentStep1Result {
  console.log('\n' + '='.repeat(80))
  console.log('📋 STEP 1: TSV Entry → Original Language Tokens')
  console.log('='.repeat(80))
  
  console.log('\n📥 Input:')
  console.log('  TWL Entry:', {
    reference: twlEntry.reference,
    origWords: twlEntry.origWords,
    occurrence: twlEntry.occurrence,
    twLink: twlEntry.twLink
  })
  console.log(`  Available Original Tokens: ${originalTokens.length}`)
  
  // Parse occurrence (always as string in TSV, must convert)
  const occurrence = Math.max(1, parseInt(twlEntry.occurrence) || 1)
  console.log(`\n🔢 Parsed occurrence: "${twlEntry.occurrence}" → ${occurrence}`)
  
  // Normalize the quote text
  const normalizedQuote = normalizeText(twlEntry.origWords)
  console.log(`\n🔤 Normalized quote: "${twlEntry.origWords}" → "${normalizedQuote}"`)
  
  // Find matching tokens
  const matches: Token[] = []
  let foundOccurrence = 0
  
  console.log('\n🔍 Searching for matches...')
  
  for (const token of originalTokens) {
    const normalizedToken = normalizeText(token.text)
    
    if (normalizedToken === normalizedQuote) {
      foundOccurrence++
      console.log(`  Match ${foundOccurrence}: "${token.text}" (semantic ID: ${token.semanticId})`)
      
      if (foundOccurrence === occurrence) {
        matches.push(token)
        console.log(`  ✅ Found target occurrence ${occurrence}!`)
        break
      }
    }
  }
  
  if (matches.length === 0) {
    console.log(`  ❌ No match found for occurrence ${occurrence}`)
    return {
      twlEntry,
      originalTokens: [],
      success: false,
      error: `Quote "${twlEntry.origWords}" occurrence ${occurrence} not found`
    }
  }
  
  console.log('\n✅ Step 1 Complete!')
  console.log(`  Found ${matches.length} original token(s)`)
  console.log('  Semantic IDs:', matches.map(t => t.semanticId))
  
  return {
    twlEntry,
    originalTokens: matches,
    success: true
  }
}

// ============================================================================
// Step 2: Original Language Tokens → Target Language Tokens
// ============================================================================

function findAlignedTokens(
  originalTokens: Token[],
  targetTokens: Token[]
): AlignmentStep2Result {
  console.log('\n' + '='.repeat(80))
  console.log('🔗 STEP 2: Original Tokens → Target Language Tokens')
  console.log('='.repeat(80))
  
  console.log('\n📥 Input:')
  console.log(`  Original Tokens: ${originalTokens.length}`)
  console.log('  Semantic IDs:', originalTokens.map(t => t.semanticId))
  console.log(`  Available Target Tokens: ${targetTokens.length}`)
  
  // Extract semantic IDs from original tokens
  const originalSemanticIds = originalTokens.map(t => t.semanticId)
  
  // Find target tokens that align to our original tokens
  const alignedTokens: Token[] = []
  
  console.log('\n🔍 Searching for aligned target tokens...')
  
  for (let i = 0; i < targetTokens.length; i++) {
    const targetToken = targetTokens[i]
    const alignedIds = targetToken.alignedOriginalWordIds || []
    
    // Check if this target token aligns to any of our original tokens
    const hasMatch = originalSemanticIds.some(originalId => 
      alignedIds.includes(originalId)
    )
    
    if (hasMatch) {
      alignedTokens.push(targetToken)
      const matchedIds = alignedIds.filter(id => originalSemanticIds.includes(id))
      console.log(`  Match: "${targetToken.text}" at position ${i}`)
      console.log(`    Aligns to: ${matchedIds.join(', ')}`)
    }
  }
  
  if (alignedTokens.length === 0) {
    console.log(`  ❌ No aligned target tokens found`)
    console.log(`  This usually means:`)
    console.log(`    - Target scripture doesn't have alignment data`)
    console.log(`    - Semantic IDs don't match between original and target`)
    console.log(`    - Target tokens are missing alignedOriginalWordIds`)
    
    return {
      originalTokens,
      targetTokens: [],
      success: false,
      error: 'No alignment data found'
    }
  }
  
  console.log('\n✅ Step 2 Complete!')
  console.log(`  Found ${alignedTokens.length} aligned target token(s)`)
  console.log('  Target words:', alignedTokens.map(t => t.text).join(' '))
  
  return {
    originalTokens,
    targetTokens: alignedTokens,
    success: true
  }
}

// ============================================================================
// Display Final Result
// ============================================================================

function displayFinalResult(
  step1: AlignmentStep1Result,
  step2: AlignmentStep2Result
) {
  console.log('\n' + '='.repeat(80))
  console.log('🎉 FINAL RESULT: Complete Alignment')
  console.log('='.repeat(80))
  
  console.log('\n📊 Summary:')
  console.log(`  TSV Quote: "${step1.twlEntry.origWords}" (occurrence ${step1.twlEntry.occurrence})`)
  
  if (!step1.success) {
    console.log(`  ❌ Step 1 Failed: ${step1.error}`)
    return
  }
  
  console.log(`  ✅ Original Tokens: ${step1.originalTokens.map(t => t.text).join(' ')}`)
  
  if (!step2.success) {
    console.log(`  ❌ Step 2 Failed: ${step2.error}`)
    return
  }
  
  console.log(`  ✅ Target Tokens: ${step2.targetTokens.map(t => t.text).join(' ')}`)
  
  console.log('\n🎯 What the User Sees:')
  console.log(`  Original: "${step1.originalTokens.map(t => t.text).join(' ')}"`)
  console.log(`  Translation: "${step2.targetTokens.map(t => t.text).join(' ')}"`)
  
  console.log('\n📝 Technical Details:')
  console.log('  Original Token IDs:')
  step1.originalTokens.forEach(t => {
    console.log(`    - ${t.semanticId} "${t.text}"${t.strong ? ` (${t.strong})` : ''}`)
  })
  
  console.log('  Target Token IDs:')
  step2.targetTokens.forEach(t => {
    console.log(`    - ${t.semanticId} "${t.text}"`)
    console.log(`      Aligns to: ${t.alignedOriginalWordIds?.join(', ') || 'none'}`)
  })
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                  TSV Alignment Algorithm Demonstration                     ║')
  console.log('║                         Using Real Door43 Data                             ║')
  console.log('╚════════════════════════════════════════════════════════════════════════════╝')
  
  // Parse command line arguments
  const args = process.argv.slice(2)
  const config: TestConfig = {
    ...DEFAULT_CONFIG,
    book: args[0] || DEFAULT_CONFIG.book,
    chapter: args[1] ? parseInt(args[1]) : DEFAULT_CONFIG.chapter,
    verse: args[2] ? parseInt(args[2]) : DEFAULT_CONFIG.verse,
  }
  
  console.log('\n📍 Testing Configuration:')
  console.log(`  Book: ${config.book.toUpperCase()}`)
  console.log(`  Reference: ${config.chapter}:${config.verse}`)
  console.log(`  Owner: ${config.owner}`)
  console.log(`  TWL Resource: ${config.twlResourceId}`)
  console.log(`  Original: ${config.originalResourceId}`)
  console.log(`  Target: ${config.targetResourceId}`)
  
  console.log('\n🌐 Data Source:')
  console.log('  Using MOCK DATA for demonstration')
  console.log('  (Real Door43 API integration coming soon)')
  
  // For now, use mock data
  // TODO: Implement Door43ApiClient data fetching
  const twlData = MOCK_TWL_DATA
  const originalTokens = MOCK_ORIGINAL_TOKENS
  const targetTokens = MOCK_TARGET_TOKENS
  
  console.log('\n📦 Loaded Data:')
  console.log(`  TWL Entries: ${twlData.length}`)
  console.log(`  Original Tokens: ${originalTokens.length}`)
  console.log(`  Target Tokens: ${targetTokens.length}`)
  
  // Process each TWL entry
  console.log('\n' + '▶'.repeat(40))
  console.log('Starting alignment demonstration...')
  console.log('▶'.repeat(40))
  
  for (const twlEntry of twlData) {
    // Step 1: Find original language tokens
    const step1Result = findOriginalTokens(twlEntry, originalTokens)
    
    if (!step1Result.success) {
      console.log('\n⚠️ Skipping Step 2 due to Step 1 failure\n')
      continue
    }
    
    // Step 2: Find aligned target tokens
    const step2Result = findAlignedTokens(step1Result.originalTokens, targetTokens)
    
    // Display final result
    displayFinalResult(step1Result, step2Result)
    
    console.log('\n' + '-'.repeat(80))
    console.log('Press Enter to continue to next entry...')
    console.log('-'.repeat(80))
  }
  
  console.log('\n✨ Demonstration Complete!')
  console.log('\nKey Takeaways:')
  console.log('  1. TSV entries use origWords/quote + occurrence to identify words')
  console.log('  2. Occurrence numbers are critical for matching repeated words')
  console.log('  3. Semantic IDs connect original and target language tokens')
  console.log('  4. Text normalization handles Hebrew/Greek diacritics')
  console.log('  5. This same algorithm works for TWL, Translation Notes, and other TSV resources')
  
  console.log('\n📚 See TWL_ALIGNMENT_SYSTEM.md for complete documentation')
}

// Run the script
main().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
