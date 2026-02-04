#!/usr/bin/env tsx

/**
 * Simple Tarball Example
 * 
 * Demonstrates how to use the tarball approach to download and process resources
 */

import { JSONExporter } from '../core/exporters/JSONExporter';
import { SQLiteExporter } from '../core/exporters/SQLiteExporter';
import { UW_ULT_Resource } from '../resources/uw_ult';
import { UW_ULT_Fetcher } from '../resources/uw_ult/fetcher';
import { UW_ULT_RawProcessor } from '../resources/uw_ult/raw-processor';
import { Door43Server } from '../servers/door43';

async function main() {
  console.log('🚀 Simple Tarball Example');
  console.log('========================\n');

  try {
    // 1. Initialize server and resource
    const server = new Door43Server({
      owner: 'unfoldingWord',
      language: 'en',
      version: 'v86',
      stage: 'prod'
    });

    const ultResource = new UW_ULT_Resource();
    const fetcher = new UW_ULT_Fetcher(server);
    const processor = new UW_ULT_RawProcessor();

    // 2. Fetch resource using tarball
    console.log('📦 Fetching ULT resource...');
    const fetchedResource = await fetcher.fetchResource({
      owner: 'unfoldingWord',
      language: 'en',
      version: 'v86',
      stage: 'prod',
      maxBooks: 3 // Limit to 3 books for demo
    });

    console.log(`✅ Fetched ${fetchedResource.extractedFiles.size} USFM files`);

    // 3. Process the raw content
    console.log('\n🔄 Processing USFM content...');
    const processedScripture = await processor.processRawContent(
      fetchedResource.extractedFiles,
      {
        resourceId: 'uw_ult',
        language: 'en',
        version: 'v86'
      }
    );

    console.log(`✅ Processed ${processedScripture.books.length} books`);
    console.log(`   Total chapters: ${processedScripture.statistics.totalChapters}`);
    console.log(`   Total verses: ${processedScripture.statistics.totalVerses}`);

    // 4. Export to SQLite
    console.log('\n📊 Exporting to SQLite...');
    const sqliteExporter = new SQLiteExporter({
      outputDir: 'outputs/simple-example',
      databaseName: 'ult-example.db'
    });

    const dbPath = await sqliteExporter.exportResources([processedScripture]);
    console.log(`✅ SQLite exported to: ${dbPath}`);

    // 5. Export to JSON
    console.log('\n📄 Exporting to JSON...');
    const jsonExporter = new JSONExporter({
      outputDir: 'outputs/simple-example',
      fileName: 'ult-example.json',
      compress: true
    });

    const jsonPath = await jsonExporter.exportResources([processedScripture]);
    console.log(`✅ JSON exported to: ${jsonPath}`);

    // 6. Show statistics
    const stats = await sqliteExporter.getStatistics();
    console.log('\n📈 Final Statistics:');
    console.log(`   Metadata records: ${stats.metadataCount}`);
    console.log(`   Content records: ${stats.contentCount}`);
    console.log(`   Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n🎉 Example completed successfully!');

  } catch (error: any) {
    console.error('❌ Example failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the example
main();
















