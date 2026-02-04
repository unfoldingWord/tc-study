#!/usr/bin/env node

/**
 * Copy Resources to Assets
 * 
 * Copies the gzipped resources directory to the app assets folder.
 * The app will copy this to the file system on first launch for on-demand loading.
 */

const fs = require('fs');
const path = require('path');

function copyDirectory(src, dest) {
  // Create destination if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getDirectorySize(dir) {
  let size = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += fs.statSync(filePath).size;
    }
  }
  
  return size;
}

async function main() {
  console.log('📦 Copying gzipped resources to app assets...');
  
  const sourceDir = path.join('exports', 'uw-translation-resources');
  const destDir = path.join('..', '..', 'bt-synergy', 'assets', 'uw-translation-resources');
  
  if (!fs.existsSync(sourceDir)) {
    console.error('❌ Source directory not found:', sourceDir);
    console.log('💡 Run the archive export first: npm run export-archive');
    process.exit(1);
  }
  
  console.log(`📁 Source: ${sourceDir}`);
  console.log(`📁 Destination: ${destDir}`);
  
  // Remove existing destination
  if (fs.existsSync(destDir)) {
    console.log('🗑️  Removing existing assets...');
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  
  // Copy directory
  console.log('📋 Copying files...');
  copyDirectory(sourceDir, destDir);
  
  // Calculate size
  const totalSize = getDirectorySize(destDir);
  
  // Count files
  function countFiles(dir) {
    let count = 0;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        count += countFiles(filePath);
      } else if (file.name.endsWith('.json.gz')) {
        count++;
      }
    }
    
    return count;
  }
  
  const fileCount = countFiles(destDir);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Resources copied to assets successfully!');
  console.log(`📊 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📄 Total .json.gz files: ${fileCount}`);
  console.log('\n📋 Next steps:');
  console.log('   1. Resources are now in assets/uw-translation-resources/');
  console.log('   2. Metro bundler will include them in the app');
  console.log('   3. App will load data on-demand from .json.gz files');
  console.log('   4. No memory issues - each file decompressed individually!');
  console.log('='.repeat(60));
}

main().catch(console.error);








