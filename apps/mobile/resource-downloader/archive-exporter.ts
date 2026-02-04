#!/usr/bin/env node

/**
 * Two-Pass Archive Exporter
 * 
 * Pass 1: ZIP all individual JSON files in place (keeping directory structure)
 * Pass 2: Create a wrapper ZIP archive of the entire directory structure
 * 
 * Result: A .zip containing .json.zip files for fast extraction and on-demand decompression
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { downloadConfig } from './config.js';

const deflate = promisify(zlib.deflate);

async function findJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findJsonFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to read directory: ${dir}`, error);
  }
  
  return files;
}

async function zipJsonFiles(sourceDir: string): Promise<number> {
  console.log('📦 Pass 1: ZIPping individual JSON files...');
  
  const jsonFiles = await findJsonFiles(sourceDir);
  console.log(`📄 Found ${jsonFiles.length} JSON files`);
  
  let compressed = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  
  for (const jsonFile of jsonFiles) {
    try {
      // Read JSON file
      const content = await fs.readFile(jsonFile, 'utf-8');
      const originalSize = Buffer.byteLength(content, 'utf-8');
      
      // Deflate it (ZIP uses DEFLATE compression)
      const deflated = await deflate(Buffer.from(content, 'utf-8'));
      
      // Write .json.zip file
      const zipFile = `${jsonFile}.zip`;
      await fs.writeFile(zipFile, deflated);
      
      // Delete original .json file
      await fs.unlink(jsonFile);
      
      const compressedSize = deflated.length;
      totalOriginalSize += originalSize;
      totalCompressedSize += compressedSize;
      compressed++;
      
      if (compressed % 100 === 0) {
        console.log(`   ✅ Compressed ${compressed}/${jsonFiles.length} files...`);
      }
    } catch (error) {
      console.warn(`   ❌ Failed to compress ${jsonFile}:`, error);
    }
  }
  
  console.log(`✅ Pass 1 complete: ${compressed} files compressed`);
  console.log(`   Original size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Compressed size: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Savings: ${((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1)}%`);
  
  return compressed;
}

async function createZipArchive(sourceDir: string, outputFile: string): Promise<void> {
  console.log('\n📦 Pass 2: Creating wrapper ZIP archive of directory structure...');
  
  try {
    // Create ZIP archive using PowerShell's Compress-Archive on Windows
    // or zip command on Unix-like systems
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Use PowerShell on Windows
      const command = `powershell -Command "Compress-Archive -Path 'exports/${downloadConfig.outputDir}/*' -DestinationPath '${outputFile.replace('.zip', '')}' -Force"`;
      console.log(`   Running PowerShell Compress-Archive...`);
      execSync(command, { stdio: 'inherit' });
    } else {
      // Use zip command on Unix-like systems
      const command = `cd exports && zip -r "../${outputFile}" "${downloadConfig.outputDir}"`;
      console.log(`   Running: ${command}`);
      execSync(command, { stdio: 'inherit', shell: '/bin/bash' });
    }
    
    // Get file size
    const stats = await fs.stat(outputFile);
    const fileSizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`✅ Pass 2 complete: Archive created`);
    console.log(`   Archive size: ${fileSizeInMB} MB`);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to create ZIP archive:', errorMessage);
    throw error;
  }
}

async function createArchive() {
  console.log('🚀 Two-Pass ZIP Archive Export Starting...\n');
  
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputFile = `${downloadConfig.owner}-${downloadConfig.language}-resources-archive.zip`;
  
  // Check if source directory exists
  try {
    await fs.access(sourceDir);
  } catch {
    console.error('❌ Source directory not found:', sourceDir);
    console.log('💡 Run the downloader first: npm run download');
    process.exit(1);
  }
  
  console.log(`📁 Source: ${sourceDir}`);
  console.log(`💾 Output: ${outputFile}\n`);
  
  try {
    // Pass 1: ZIP all JSON files individually
    const filesCompressed = await zipJsonFiles(sourceDir);
    
    if (filesCompressed === 0) {
      console.error('❌ No files were compressed. Aborting.');
      process.exit(1);
    }
    
    // Pass 2: Create wrapper ZIP archive
    await createZipArchive(sourceDir, outputFile);
    
    // Final summary
    const finalStats = await fs.stat(outputFile);
    const finalSizeInMB = (finalStats.size / 1024 / 1024).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Two-Pass ZIP Archive Export Complete!');
    console.log(`📄 Archive: ${outputFile}`);
    console.log(`📊 Final size: ${finalSizeInMB} MB`);
    console.log(`📁 Contains: ${filesCompressed} pre-compressed .json.zip files`);
    console.log('\n📋 Next steps:');
    console.log(`   1. Copy ${outputFile} to bt-synergy/assets/`);
    console.log('   2. App will extract on first launch to file system');
    console.log('   3. Data loaded on-demand: check DB → unzip .json.zip if needed');
    console.log('   4. No memory issues - each file decompressed individually!');
    console.log('\n🔧 Benefits:');
    console.log('   ✅ Smallest possible bundle size');
    console.log('   ✅ Fast startup with ZIP extraction (faster than tar.gz)');
    console.log('   ✅ Zero memory pressure');
    console.log('   ✅ Progressive loading as needed');
    console.log('   ✅ Random access to individual files without full extraction');
    console.log('='.repeat(60));
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to create archive:', errorMessage);
    console.log('\n💡 Make sure you have ZIP tools installed:');
    console.log('   - Windows: PowerShell Compress-Archive (built-in)');
    console.log('   - macOS/Linux: zip command (pre-installed)');
    process.exit(1);
  }
}

createArchive().catch(console.error);

