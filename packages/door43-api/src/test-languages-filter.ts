/**
 * Quick test to verify language filtering works correctly
 */

import { getDoor43ApiClient } from './Door43ApiClient';

async function testLanguageFilters() {
  const client = getDoor43ApiClient();
  
  console.log('🧪 Testing Door43 Language API Filters\n');
  
  // Test 1: No filters (all languages)
  console.log('1️⃣ Fetching ALL languages (no filters)...');
  const allLanguages = await client.getLanguages();
  console.log(`   ✅ Received ${allLanguages.length} languages`);
  console.log(`   📊 Sample:`, allLanguages.slice(0, 2));
  console.log();
  
  // Test 2: With filters (published packages only)
  console.log('2️⃣ Fetching languages with filters...');
  console.log('   Filters: subjects=[Bible, ...], stage=prod, topic=tc-ready');
  const filteredLanguages = await client.getLanguages({
    subjects: ['Bible', 'Aligned Bible', 'Translation Words'],
    stage: 'prod',
    topic: 'tc-ready'
  });
  console.log(`   ✅ Received ${filteredLanguages.length} languages`);
  console.log(`   📊 Sample:`, filteredLanguages.slice(0, 5));
  console.log();
  
  // Analysis
  const allValid = allLanguages.filter(l => l.code && l.name).length;
  const filteredValid = filteredLanguages.filter(l => l.code && l.name).length;
  
  console.log('📈 Analysis:');
  console.log(`   Without filters: ${allLanguages.length} total, ${allValid} valid (${Math.round(allValid/allLanguages.length*100)}%)`);
  console.log(`   With filters:    ${filteredLanguages.length} total, ${filteredValid} valid (${Math.round(filteredValid/filteredLanguages.length*100)}%)`);
  console.log();
  
  // Show some valid filtered languages
  const validFiltered = filteredLanguages.filter(l => l.code && l.name);
  console.log('✅ Valid filtered languages (first 10):');
  validFiltered.slice(0, 10).forEach(lang => {
    console.log(`   - ${lang.code.padEnd(8)} ${lang.name}`);
  });
  
  if (filteredLanguages.length === 0) {
    console.log('❌ WARNING: No languages returned with filters!');
    console.log('   The API might not support these parameters, or the values might be incorrect.');
    console.log('   Try checking the Door43 API documentation.');
  } else if (filteredLanguages.length === allLanguages.length) {
    console.log('⚠️  WARNING: Same number of languages with and without filters!');
    console.log('   The filters might not be working.');
  } else {
    console.log('\n✅ Filters are working correctly!');
    console.log(`   Reduced results from ${allLanguages.length} to ${filteredLanguages.length} languages`);
  }
}

// Run the test
testLanguageFilters().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
