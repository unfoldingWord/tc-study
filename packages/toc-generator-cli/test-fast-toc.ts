/**
 * Test script for fast TOC generation using zipball
 * 
 * Usage:
 *   bun test-fast-toc.ts
 *   node test-fast-toc.ts (if compiled)
 */

import { generateFastToc } from './src/fast-toc-generator.js';
import { TranslationWordsTocBuilder } from './src/generators/translation-words.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try parent directory
  const parentEnvPath = join(__dirname, '..', '.env');
  if (existsSync(parentEnvPath)) {
    dotenv.config({ path: parentEnvPath });
  }
}

async function main() {
  const server = process.env.DOOR43_SERVER || 'https://git.door43.org';
  const token = process.env.DOOR43_TOKEN;
  const owner = process.env.DOOR43_OWNER || 'es-419_gl';
  const language = process.env.DOOR43_LANGUAGE || 'es-419';
  const resourceId = process.env.DOOR43_RESOURCE_ID || 'tw';
  const ref = process.env.DOOR43_REF || 'v37'; // Release tag

  if (!token) {
    console.error('❌ Error: DOOR43_TOKEN not found in environment variables');
    console.error('   Please set DOOR43_TOKEN in your .env file or environment');
    process.exit(1);
  }

  console.log('🚀 Fast TOC Generator Test');
  console.log('===========================');
  console.log(`Server: ${server}`);
  console.log(`Repository: ${owner}/${language}_${resourceId}`);
  console.log(`Ref: ${ref}`);
  console.log('');

  try {
    const startTime = Date.now();
    
    const result = await generateFastToc({
      server,
      owner,
      language,
      resourceId,
      ref,
      tocBuilder: new TranslationWordsTocBuilder(),
      token,
      debug: true,
    });

    const totalTime = Date.now() - startTime;

    console.log('');
    console.log('✅ Success!');
    console.log('===========================');
    console.log(`Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`Files processed: ${result.fileCount}`);
    console.log(`Ingredients generated: ${result.ingredients.length}`);
    console.log('');
    
    // Show sample ingredients
    console.log('Sample ingredients (first 10):');
    result.ingredients.slice(0, 10).forEach((ing, idx) => {
      console.log(`  ${idx + 1}. ${ing.identifier} - "${ing.title}"`);
    });
    
    if (result.ingredients.length > 10) {
      console.log(`  ... and ${result.ingredients.length - 10} more`);
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
    }
    process.exit(1);
  }
}

main();
