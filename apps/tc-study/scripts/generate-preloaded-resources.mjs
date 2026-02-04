/**
 * Generate Preloaded Resources Metadata
 * 
 * This script fetches metadata for core scripture resources from Door43 API
 * and bundles them with the application for immediate availability at startup.
 * 
 * Usage: node scripts/generate-preloaded-resources.mjs
 * 
 * Output:
 * - public/preloaded/manifest.json - List of preloaded resources
 * - public/preloaded/*.json - Individual resource metadata files
 * 
 * Note: Only metadata is bundled. Content is downloaded on-demand when accessed.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_API = 'https://git.door43.org/api/v1/catalog';

const TARGET_RESOURCES = [
  { repoName: 'el-x-koine_ugnt', title: 'Greek New Testament' },
  { repoName: 'hbo_uhb', title: 'Hebrew Bible' },
  { repoName: 'en_ult', title: 'Literal Text' },
  { repoName: 'en_ust', title: 'Simplified Text' },
];

async function enrichMetadata(resource) {
  const enriched = { license: null, readme: null };
  
  if (!resource.metadata_url) {
    return enriched;
  }
  
  // Fetch manifest.yaml for license
  try {
    console.log(`   📄 Fetching manifest.yaml...`);
    const manifestResponse = await fetch(resource.metadata_url);
    if (manifestResponse.ok) {
      const manifestText = await manifestResponse.text();
      const rightsMatch = manifestText.match(/rights:\s*['"]?([^'";\n]+)['"]?/i);
      if (rightsMatch) {
        enriched.license = rightsMatch[1].trim();
        console.log(`   ✅ License: ${enriched.license}`);
      }
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to fetch manifest:`, error.message);
  }
  
  // Fetch README.md
  try {
    const readmeUrl = resource.metadata_url.replace('manifest.yaml', 'README.md');
    console.log(`   📖 Fetching README.md...`);
    const readmeResponse = await fetch(readmeUrl);
    if (readmeResponse.ok) {
      enriched.readme = await readmeResponse.text();
      console.log(`   ✅ README: ${enriched.readme.length} characters`);
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to fetch README:`, error.message);
  }
  
  return enriched;
}

async function searchAndFetchResource(repoName) {
  // Search for resources from unfoldingWord
  const searchUrl = `${CATALOG_API}/search?owner=unfoldingWord&stage=prod&metadataType=rc&sort=released&order=desc&limit=100`;
  console.log(`🔍 Searching unfoldingWord resources...`);
  
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error(`Search failed: HTTP ${searchResponse.status}`);
  }
  
  const searchData = await searchResponse.json();
  
  if (!searchData.ok || !searchData.data) {
    throw new Error('Search returned no data');
  }
  
  // Find the specific resource by matching repo name
  const resource = searchData.data.find(r => r.name === repoName);
  
  if (!resource) {
    throw new Error(`Resource '${repoName}' not found in results`);
  }
  
  console.log(`   ✓ Found: ${resource.title} (${resource.released})`);
  
  // Fetch full metadata from the catalog entry URL
  console.log(`📡 Fetching: ${resource.url}`);
  const metadataResponse = await fetch(resource.url);
  
  if (!metadataResponse.ok) {
    throw new Error(`Metadata fetch failed: HTTP ${metadataResponse.status}`);
  }
  
  const data = await metadataResponse.json();
  
  // Enrich with README and LICENSE
  const enrichedData = await enrichMetadata(data);
  data.readme = enrichedData.readme;
  data.license = enrichedData.license;
  
  return data;
}

async function main() {
  console.log('🚀 Generating preloaded resource metadata...\n');
  
  const outputDir = path.join(__dirname, '..', 'public', 'preloaded');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    resources: [],
    totalResources: 0,
  };
  
  for (const { repoName, title } of TARGET_RESOURCES) {
    try {
      console.log(`\n📥 Processing: ${title} (${repoName})`);
      
      // Search and fetch resource metadata
      const data = await searchAndFetchResource(repoName);
      
      console.log(`   ✅ Title: ${data.title}`);
      console.log(`   📚 Ingredients: ${data.ingredients?.length || 0} books`);
      console.log(`   🔖 Version: ${data.version || data.released}`);
      
      // Extract resourceId from repo name (e.g., "el-x-koine_ugnt" → "ugnt")
      // The repo name format is: "language_resourceId"
      const resourceId = data.name.substring(data.language.length + 1); // +1 for underscore
      console.log(`   🔑 ResourceId: ${resourceId} (extracted from ${data.name})`);
      
      // Save metadata file
      const filename = `unfoldingWord_${data.language}_${data.name}.json`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`   💾 Saved: ${filename}`);
      
      // Add to manifest
      manifest.resources.push({
        resourceKey: `unfoldingWord/${data.language}/${resourceId}`,
        name: data.title || title,
        filename,
      });
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  manifest.totalResources = manifest.resources.length;
  
  // Save manifest
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`\n🎉 Successfully generated ${manifest.totalResources} preloaded resources!`);
  console.log(`\n📦 Resources:`);
  manifest.resources.forEach(r => console.log(`   - ${r.name} (${r.resourceKey})`));
  console.log(`\n✨ Metadata is bundled with the app. Content will be downloaded on-demand.`);
}

main().catch(console.error);
