#!/usr/bin/env node

/**
 * Create Database Asset
 * 
 * Creates a SQLite database file from the generated SQL file
 * This avoids the Node.js version compatibility issues with better-sqlite3
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function createDatabaseAsset() {
  console.log('🔄 Creating database asset from SQL file...');
  
  const sqlFile = 'unfoldingWord-en-app-database.sql';
  const dbFile = 'unfoldingWord-en-app-database.db';
  const appDbFile = '../../bt-synergy/assets/app.db';
  
  // Check if SQL file exists
  if (!fs.existsSync(sqlFile)) {
    console.error('❌ SQL file not found:', sqlFile);
    console.log('💡 Run the converter first to generate the SQL file');
    process.exit(1);
  }
  
  try {
    // Create a temporary SQLite database
    console.log('📝 Creating SQLite database...');
    execSync(`sqlite3 "${dbFile}" < "${sqlFile}"`, { stdio: 'inherit' });
    
    // Copy to app assets
    console.log('📁 Copying to app assets...');
    fs.copyFileSync(dbFile, appDbFile);
    
    // Get file size
    const stats = fs.statSync(appDbFile);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Database asset created successfully!');
    console.log(`📄 Source: ${sqlFile}`);
    console.log(`💾 Database: ${dbFile}`);
    console.log(`📱 App Asset: ${appDbFile}`);
    console.log(`📊 Size: ${fileSizeInMB} MB`);
    console.log('\n📋 The database is now ready to be bundled with your app!');
    
    // Clean up temporary file
    fs.unlinkSync(dbFile);
    console.log('🧹 Cleaned up temporary files');
    
  } catch (error) {
    console.error('❌ Failed to create database asset:', error.message);
    console.log('\n💡 Make sure you have sqlite3 installed:');
    console.log('   - Windows: Download from https://sqlite.org/download.html');
    console.log('   - macOS: brew install sqlite3');
    console.log('   - Linux: sudo apt-get install sqlite3');
    process.exit(1);
  }
}

createDatabaseAsset().catch(console.error);












