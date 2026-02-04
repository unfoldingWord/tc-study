/**
 * Door43 API Integration Test Script
 * 
 * Run this to verify Door43ApiClient is working correctly in the mobile app
 * 
 * Usage:
 *   bun run scripts/test-door43-integration.ts
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api';

async function testDoor43Integration() {
  console.log('🧪 Testing Door43 API Integration in Mobile App\n');
  
  const client = getDoor43ApiClient();
  let passed = 0;
  let failed = 0;

  // Test 1: Get Languages
  try {
    console.log('📝 Test 1: Fetching languages...');
    const languages = await client.getLanguages();
    console.log(`   ✅ Found ${languages.length} languages`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 2: Get English Resources
  try {
    console.log('\n📝 Test 2: Fetching English resources...');
    const resources = await client.getResourcesByLanguage('en');
    console.log(`   ✅ Found ${resources.length} English resources`);
    
    // List some resources
    const resourceNames = resources.slice(0, 5).map(r => `${r.id} (${r.owner})`);
    console.log(`   Resources: ${resourceNames.join(', ')}`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 3: Find unfoldingWord Resources
  try {
    console.log('\n📝 Test 3: Finding unfoldingWord resources...');
    const uwResources = await client.getResourcesByOwnerAndLanguage('unfoldingWord', 'en');
    console.log(`   ✅ Found ${uwResources.length} unfoldingWord English resources`);
    
    const resourceIds = uwResources.map(r => r.id).join(', ');
    console.log(`   IDs: ${resourceIds}`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 4: Find Repository (ULT)
  try {
    console.log('\n📝 Test 4: Finding en_ult repository...');
    const ult = await client.findRepository('unfoldingWord', 'en_ult');
    if (ult) {
      console.log(`   ✅ Found: ${ult.name} (v${ult.version || 'unknown'})`);
      passed++;
    } else {
      console.error('   ❌ Repository not found');
      failed++;
    }
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 5: Find Repository (Translation Questions)
  try {
    console.log('\n📝 Test 5: Finding en_tq repository...');
    const tq = await client.findRepository('unfoldingWord', 'en_tq');
    if (tq) {
      console.log(`   ✅ Found: ${tq.name} (v${tq.version || 'unknown'})`);
      passed++;
    } else {
      console.error('   ❌ Repository not found');
      failed++;
    }
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 6: Fetch Content (TSV file)
  try {
    console.log('\n📝 Test 6: Fetching Translation Questions content...');
    const content = await client.fetchTextContent('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
    console.log(`   ✅ Fetched ${content.length} characters`);
    console.log(`   Contains tabs: ${content.includes('\t') ? 'Yes' : 'No'}`);
    console.log(`   Contains "Reference": ${content.includes('Reference') ? 'Yes' : 'No'}`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 7: Check File Exists
  try {
    console.log('\n📝 Test 7: Checking if file exists...');
    const exists = await client.checkFileExists('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
    if (exists) {
      console.log('   ✅ File exists');
      passed++;
    } else {
      console.error('   ❌ File does not exist');
      failed++;
    }
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 8: Search Repositories
  try {
    console.log('\n📝 Test 8: Searching repositories...');
    const results = await client.searchRepositories('bible', { limit: 5 });
    console.log(`   ✅ Found ${results.length} repositories`);
    
    const repoNames = results.map(r => r.name).slice(0, 3);
    console.log(`   Examples: ${repoNames.join(', ')}`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 9: Fetch USFM Content
  try {
    console.log('\n📝 Test 9: Fetching USFM scripture content...');
    const usfm = await client.fetchTextContent('unfoldingWord', 'en_ult', '01-GEN.usfm');
    console.log(`   ✅ Fetched ${usfm.length} characters`);
    console.log(`   Contains USFM markers: ${usfm.includes('\\id') ? 'Yes' : 'No'}`);
    passed++;
  } catch (error) {
    console.error('   ❌ Failed:', error);
    failed++;
  }

  // Test 10: Error Handling (non-existent file)
  try {
    console.log('\n📝 Test 10: Testing error handling...');
    try {
      await client.fetchTextContent('unfoldingWord', 'en_tq', 'nonexistent-file.txt');
      console.error('   ❌ Should have thrown an error');
      failed++;
    } catch (error: any) {
      if (error.message && error.code) {
        console.log(`   ✅ Error handled correctly: ${error.code}`);
        passed++;
      } else {
        console.error('   ❌ Error not formatted correctly');
        failed++;
      }
    }
  } catch (error) {
    console.error('   ❌ Test failed:', error);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Door43ApiClient is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.\n');
    process.exit(1);
  }
}

// Run tests
testDoor43Integration().catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});

