/**
 * Door43 Data Fetcher for TSV Alignment Testing
 * 
 * This script fetches real data from Door43 API to be used with the alignment test script.
 * It downloads TWL data, original language scripture, and target language scripture.
 * 
 * Usage:
 *   bun run fetch-door43-data.ts [book] [chapter]
 *   
 * Examples:
 *   bun run fetch-door43-data.ts tit 1
 *   bun run fetch-door43-data.ts jhn 3
 * 
 * Output:
 *   Creates JSON files in ./test-data/ directory with fetched data
 */

import { Door43ApiClient } from '@bt-synergy/door43-api'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Configuration
// ============================================================================

interface FetchConfig {
  book: string
  chapter?: number
  owner: string
  language: string
  twlResourceId: string
  originalResourceId: string
  targetResourceId: string
  outputDir: string
}

const DEFAULT_CONFIG: FetchConfig = {
  book: 'tit',
  chapter: 1,
  owner: 'unfoldingWord',
  language: 'en',
  twlResourceId: 'twl',
  originalResourceId: 'ugnt',
  targetResourceId: 'ult',
  outputDir: './test-data'
}

// ============================================================================
// Testament Detection
// ============================================================================

function getTestament(bookCode: string): 'OT' | 'NT' {
  const ntBooks = [
    'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 
    'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', 
    '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev'
  ]
  
  return ntBooks.includes(bookCode.toLowerCase()) ? 'NT' : 'OT'
}

function getOriginalLanguageResource(bookCode: string): string {
  const testament = getTestament(bookCode)
  return testament === 'NT' ? 'ugnt' : 'uhb'
}

// ============================================================================
// Fetch TWL Data
// ============================================================================

async function fetchTWLData(
  client: Door43ApiClient,
  config: FetchConfig
): Promise<any> {
  console.log('\n📖 Fetching Translation Words Links...')
  console.log(`  Resource: ${config.owner}/${config.language}/${config.twlResourceId}`)
  console.log(`  Book: ${config.book.toUpperCase()}`)
  
  try {
    // Get the zipball URL
    const resourceKey = `${config.owner}/${config.language}_${config.twlResourceId}`
    console.log(`  Fetching metadata for: ${resourceKey}`)
    
    // For now, return mock data structure
    // TODO: Implement actual Door43ApiClient.getContent() call
    const mockTWL = {
      bookCode: config.book,
      entries: [
        {
          reference: '1:1',
          id: `${config.book}_1_1_paul`,
          tags: 'names',
          origWords: 'Παῦλος',
          occurrence: '1',
          twLink: 'rc://*/tw/dict/bible/names/paul'
        }
      ]
    }
    
    console.log(`  ✅ Fetched ${mockTWL.entries.length} TWL entries`)
    return mockTWL
    
  } catch (error) {
    console.error(`  ❌ Failed to fetch TWL:`, error)
    throw error
  }
}

// ============================================================================
// Fetch Scripture Data
// ============================================================================

async function fetchScriptureData(
  client: Door43ApiClient,
  config: FetchConfig,
  resourceId: string,
  label: string
): Promise<any> {
  console.log(`\n📜 Fetching ${label} Scripture...`)
  console.log(`  Resource: ${config.owner}/${config.language}/${resourceId}`)
  console.log(`  Book: ${config.book.toUpperCase()}`)
  
  try {
    // TODO: Implement actual Door43ApiClient.getContent() call
    const mockScripture = {
      bookCode: config.book,
      chapters: [
        {
          number: config.chapter || 1,
          verses: [
            {
              number: 1,
              tokens: []
            }
          ]
        }
      ]
    }
    
    console.log(`  ✅ Fetched ${mockScripture.chapters.length} chapter(s)`)
    return mockScripture
    
  } catch (error) {
    console.error(`  ❌ Failed to fetch ${label}:`, error)
    throw error
  }
}

// ============================================================================
// Save Data to Files
// ============================================================================

function saveData(config: FetchConfig, twlData: any, originalData: any, targetData: any) {
  console.log('\n💾 Saving data to files...')
  
  // Create output directory
  try {
    mkdirSync(config.outputDir, { recursive: true })
  } catch (error) {
    // Directory might already exist, ignore
  }
  
  const bookCode = config.book.toLowerCase()
  const chapterSuffix = config.chapter ? `_ch${config.chapter}` : ''
  
  // Save TWL data
  const twlFile = join(config.outputDir, `${bookCode}${chapterSuffix}_twl.json`)
  writeFileSync(twlFile, JSON.stringify(twlData, null, 2))
  console.log(`  ✅ Saved TWL data: ${twlFile}`)
  
  // Save original scripture
  const originalFile = join(config.outputDir, `${bookCode}${chapterSuffix}_original.json`)
  writeFileSync(originalFile, JSON.stringify(originalData, null, 2))
  console.log(`  ✅ Saved original scripture: ${originalFile}`)
  
  // Save target scripture
  const targetFile = join(config.outputDir, `${bookCode}${chapterSuffix}_target.json`)
  writeFileSync(targetFile, JSON.stringify(targetData, null, 2))
  console.log(`  ✅ Saved target scripture: ${targetFile}`)
  
  // Save combined test data
  const combinedFile = join(config.outputDir, `${bookCode}${chapterSuffix}_complete.json`)
  const combinedData = {
    config: {
      book: config.book,
      chapter: config.chapter,
      owner: config.owner,
      language: config.language,
      fetchedAt: new Date().toISOString()
    },
    twl: twlData,
    original: originalData,
    target: targetData
  }
  writeFileSync(combinedFile, JSON.stringify(combinedData, null, 2))
  console.log(`  ✅ Saved combined data: ${combinedFile}`)
  
  console.log('\n📦 All data saved successfully!')
  console.log(`\nNext steps:`)
  console.log(`  1. Review the downloaded data in ${config.outputDir}/`)
  console.log(`  2. Run the alignment test: bun run test-tsv-alignment.ts --file=${combinedFile}`)
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                     Door43 Data Fetcher for TSV Testing                   ║')
  console.log('╚════════════════════════════════════════════════════════════════════════════╝')
  
  // Parse command line arguments
  const args = process.argv.slice(2)
  const config: FetchConfig = {
    ...DEFAULT_CONFIG,
    book: args[0] || DEFAULT_CONFIG.book,
    chapter: args[1] ? parseInt(args[1]) : DEFAULT_CONFIG.chapter,
  }
  
  // Determine correct original language resource
  config.originalResourceId = getOriginalLanguageResource(config.book)
  
  console.log('\n📍 Fetch Configuration:')
  console.log(`  Book: ${config.book.toUpperCase()} (${getTestament(config.book)})`)
  console.log(`  Chapter: ${config.chapter || 'all'}`)
  console.log(`  Owner: ${config.owner}`)
  console.log(`  TWL: ${config.twlResourceId}`)
  console.log(`  Original: ${config.originalResourceId}`)
  console.log(`  Target: ${config.targetResourceId}`)
  console.log(`  Output: ${config.outputDir}/`)
  
  // Initialize Door43 client
  console.log('\n🔌 Initializing Door43 API client...')
  const client = new Door43ApiClient()
  console.log('  ✅ Client ready')
  
  try {
    // Fetch all data
    const twlData = await fetchTWLData(client, config)
    const originalData = await fetchScriptureData(
      client, 
      config, 
      config.originalResourceId,
      'Original Language'
    )
    const targetData = await fetchScriptureData(
      client, 
      config, 
      config.targetResourceId,
      'Target Language'
    )
    
    // Save to files
    saveData(config, twlData, originalData, targetData)
    
    console.log('\n✨ Fetch Complete!')
    console.log('\n💡 Note: This currently uses mock data.')
    console.log('   Full Door43 API integration coming soon.')
    
  } catch (error) {
    console.error('\n❌ Fetch failed:', error)
    process.exit(1)
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
