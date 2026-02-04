#!/usr/bin/env node

/**
 * Two-Pass ZIP Exporter
 * 
 * Pass 1: Decompress any .json.gz files back to .json
 * Pass 2: Create a ZIP archive of the entire directory structure
 * 
 * Result: A ZIP containing .json files (ZIP handles compression natively)
 * 
 * Note: ZIP compression is MUCH faster to extract than tar.gz because:
 * - Native code extraction (not JavaScript)
 * - Streams directly to disk (no memory spike)
 * - Can extract individual files on-demand
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { downloadConfig } from './config.js';

const gunzip = promisify(zlib.gunzip);

async function findGzipFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findGzipFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.json.gz')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to read directory: ${dir}`, error);
  }
  
  return files;
}

async function findExistingGzFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findExistingGzFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.json.gz')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to read directory: ${dir}`, error);
  }
  
  return files;
}

async function decompressGzipFiles(sourceDir: string): Promise<number> {
  console.log('📦 Pass 1: Decompressing .json.gz files back to .json...');
  
  const gzipFiles = await findGzipFiles(sourceDir);
  console.log(`📄 Found ${gzipFiles.length} .json.gz files`);
  
  let decompressed = 0;
  let totalCompressedSize = 0;
  let totalDecompressedSize = 0;
  
  for (const gzipFile of gzipFiles) {
    try {
      // Read .json.gz file
      const compressed = await fs.readFile(gzipFile);
      const compressedSize = compressed.length;
      
      // Decompress it
      const decompressedBuffer = await gunzip(compressed);
      const decompressedSize = decompressedBuffer.length;
      
      // Write .json file (remove .gz extension)
      const jsonFile = gzipFile.slice(0, -3); // Remove '.gz'
      await fs.writeFile(jsonFile, decompressedBuffer);
      
      // Delete .json.gz file
      await fs.unlink(gzipFile);
      
      totalCompressedSize += compressedSize;
      totalDecompressedSize += decompressedSize;
      decompressed++;
      
      if (decompressed % 100 === 0) {
        console.log(`   ✅ Decompressed ${decompressed}/${gzipFiles.length} files...`);
      }
    } catch (error) {
      console.warn(`   ❌ Failed to decompress ${gzipFile}:`, error);
    }
  }
  
  console.log(`✅ Pass 1 complete: ${decompressed} files decompressed`);
  console.log(`   Compressed size: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Decompressed size: ${(totalDecompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Expansion: ${((totalDecompressedSize / totalCompressedSize) * 100).toFixed(1)}%`);
  
  return decompressed;
}

async function createZipArchive(sourceDir: string, outputFile: string): Promise<void> {
  console.log('\n📦 Pass 2: Creating ZIP archive of directory structure...');
  
  try {
    // Determine which zip command to use
    let command: string;
    
    if (process.platform === 'win32') {
      // Windows: Use PowerShell's Compress-Archive
      const sourcePath = path.resolve(sourceDir);
      const outputPath = path.resolve(outputFile);
      command = `powershell -Command "Compress-Archive -Path '${sourcePath}\\*' -DestinationPath '${outputPath}' -Force"`;
    } else {
      // Unix-like: Use zip command
      // -r: recursive, -9: maximum compression
      command = `cd exports && zip -r -9 "../${outputFile}" "${downloadConfig.outputDir}"`;
    }
    
    console.log(`   Running: ${command}`);
    execSync(command, { stdio: 'inherit', maxBuffer: 1024 * 1024 * 100 });
    
    // Get file size
    const stats = await fs.stat(outputFile);
    const fileSizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`✅ Pass 2 complete: Archive created`);
    console.log(`   Archive size: ${fileSizeInMB} MB`);
    
  } catch (error: any) {
    console.error('❌ Failed to create ZIP archive:', error.message);
    throw error;
  }
}

async function createArchive() {
  console.log('🚀 Two-Pass ZIP Export Starting...\n');
  
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputFile = `${downloadConfig.owner}-${downloadConfig.language}-resources-archive.zip`;
  
  // Check if source directory exists
  try {
    await fs.access(sourceDir);
  } catch (error) {
    console.error('❌ Source directory not found:', sourceDir);
    console.log('💡 Run the downloader first: npm run download');
    process.exit(1);
  }
  
  console.log(`📁 Source: ${sourceDir}`);
  console.log(`💾 Output: ${outputFile}\n`);
  
  try {
    // Pass 1: Decompress any .json.gz files back to .json
    const filesDecompressed = await decompressGzipFiles(sourceDir);
    
    if (filesDecompressed === 0) {
      console.warn('⚠️  No .json.gz files found to decompress.');
      console.log('💡 Make sure you have JSON files in the directory.');
    }
    
    // Pass 2: Create ZIP archive (ZIP will compress the .json files)
    await createZipArchive(sourceDir, outputFile);
    
    // Final summary
    const finalStats = await fs.stat(outputFile);
    const finalSizeInMB = (finalStats.size / 1024 / 1024).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Two-Pass ZIP Export Complete!');
    console.log(`📄 Archive: ${outputFile}`);
    console.log(`📊 Final size: ${finalSizeInMB} MB`);
    console.log(`📁 Contains: ${filesDecompressed} .json files (compressed by ZIP)`);
    console.log('\n📋 Next steps:');
    console.log(`   1. Copy ${outputFile} to bt-synergy/assets/`);
    console.log('   2. App will extract on first launch using NATIVE code (FAST!)');
    console.log('   3. Data loaded on-demand: check DB → read .json file if needed');
    console.log('   4. No memory issues - JSON parsed individually as needed!');
    console.log('\n🔧 Benefits:');
    console.log('   ✅ Native ZIP extraction (10-50x faster than JS TAR)');
    console.log('   ✅ Streams directly to disk (no memory spike)');
    console.log('   ✅ Random file access (no need to process entire archive)');
    console.log('   ✅ No additional decompression needed (ZIP handles it)');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('❌ Failed to create archive:', error.message);
    console.log('\n💡 Make sure you have zip installed:');
    console.log('   - Windows 10+: Built-in PowerShell Compress-Archive');
    console.log('   - macOS/Linux: zip command (install via package manager)');
    process.exit(1);
  }
}

createArchive().catch(console.error);

