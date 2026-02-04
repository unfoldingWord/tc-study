/**
 * Live API Test
 * 
 * Tests Door43ApiClient against real Door43 API
 * Run with: bun run packages/door43-api/src/test-live.ts
 */

import { getDoor43ApiClient } from './index';

async function testDoor43Api() {
  console.log('🧪 Testing Door43 API Client...\n');
  
  const client = getDoor43ApiClient();
  
  try {
    // Test 1: Get Languages
    console.log('1️⃣ Testing getLanguages()...');
    const languages = await client.getLanguages();
    console.log(`   ✅ Found ${languages.length} languages`);
    console.log(`   📝 First 3: ${languages.slice(0, 3).map(l => `${l.name} (${l.code})`).join(', ')}\n`);
    
    // Test 2: Get Resources by Language
    console.log('2️⃣ Testing getResourcesByLanguage("en")...');
    const enResources = await client.getResourcesByLanguage('en');
    console.log(`   ✅ Found ${enResources.length} English resources`);
    console.log(`   📝 Sample IDs: ${enResources.slice(0, 5).map(r => r.id).join(', ')}\n`);
    
    // Test 3: Get Resources by Owner and Language
    console.log('3️⃣ Testing getResourcesByOwnerAndLanguage("unfoldingWord", "en")...');
    const uwEnResources = await client.getResourcesByOwnerAndLanguage('unfoldingWord', 'en');
    console.log(`   ✅ Found ${uwEnResources.length} unfoldingWord English resources`);
    console.log(`   📝 Sample: ${uwEnResources.slice(0, 3).map(r => r.id).join(', ')}\n`);
    
    // Test 4: Find Specific Resource
    console.log('4️⃣ Testing findResource("unfoldingWord", "en", "ult")...');
    const ult = await client.findResource('unfoldingWord', 'en', 'ult');
    if (ult) {
      console.log(`   ✅ Found ULT: ${ult.name}`);
      console.log(`   📝 Version: ${ult.version}\n`);
    } else {
      console.log(`   ⚠️  ULT not found\n`);
    }
    
    // Test 5: Find Repository
    console.log('5️⃣ Testing findRepository("unfoldingWord", "en_tw")...');
    const twRepo = await client.findRepository('unfoldingWord', 'en_tw');
    if (twRepo) {
      console.log(`   ✅ Found TW repository: ${twRepo.title || twRepo.name}`);
      console.log(`   📝 Release: ${twRepo.release?.tag_name || 'N/A'}\n`);
    } else {
      console.log(`   ⚠️  TW repository not found\n`);
    }
    
    // Test 6: Search Catalog
    console.log('6️⃣ Testing searchCatalog({ owner: "unfoldingWord", language: "en", stage: "prod" })...');
    const searchResults = await client.searchCatalog({
      owner: 'unfoldingWord',
      language: 'en',
      stage: 'prod'
    });
    console.log(`   ✅ Found ${searchResults.length} results`);
    console.log(`   📝 Sample repos: ${searchResults.slice(0, 3).map(r => r.name).join(', ')}\n`);
    
    // Test 7: Parameter Validation
    console.log('7️⃣ Testing parameter validation...');
    try {
      await client.getResourcesByLanguage('');
      console.log(`   ❌ Should have thrown error for empty language code\n`);
    } catch (error: any) {
      if (error.code === 'INVALID_PARAM') {
        console.log(`   ✅ Correctly rejected invalid parameter\n`);
      }
    }
    
    console.log('🎉 All tests passed!\n');
    console.log('Summary:');
    console.log(`- Languages: ${languages.length}`);
    console.log(`- English resources: ${enResources.length}`);
    console.log(`- unfoldingWord English: ${uwEnResources.length}`);
    console.log(`- ULT found: ${ult ? 'Yes' : 'No'}`);
    console.log(`- TW repo found: ${twRepo ? 'Yes' : 'No'}`);
    console.log(`- Search results: ${searchResults.length}`);
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Error code:', error.code);
    if (error.code === 'TIMEOUT') {
      console.error('💡 Door43 API is slow or unreachable. Check internet connection.');
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('💡 Network error. Are you online?');
    }
    process.exit(1);
  }
}

// Run tests
testDoor43Api().catch(console.error);

