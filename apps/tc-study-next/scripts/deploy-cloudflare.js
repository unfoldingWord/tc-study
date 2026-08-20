#!/usr/bin/env node

/**
 * Deploy tc-study-next to Cloudflare Pages (not production tc-study).
 * Usage: node scripts/deploy-cloudflare.js [--project-name=PROJECT_NAME]
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
let projectName = 'tc-study-next';

for (const arg of args) {
  if (arg.startsWith('--project-name=')) {
    projectName = arg.split('=')[1];
  }
}

console.log('🚀 Deploying tc-study-next to Cloudflare Pages...');
console.log(`📦 Project name: ${projectName}`);

// Check if wrangler is installed
try {
  execSync('wrangler --version', { stdio: 'ignore' });
} catch (error) {
  console.log('❌ Wrangler CLI not found. Installing...');
  execSync('npm install -g wrangler', { stdio: 'inherit' });
}

// Build the app if dist doesn't exist or is empty
const distDir = join(appDir, 'dist');
if (!existsSync(distDir) || readdirSync(distDir).length === 0) {
  console.log('📦 Building the app...');
  execSync('bun run vite build', { 
    cwd: appDir, 
    stdio: 'inherit' 
  });
}

// Deploy to Cloudflare Pages
console.log('🌐 Deploying to Cloudflare Pages...');
try {
  execSync(`wrangler pages deploy dist --project-name="${projectName}" --branch=master`, {
    cwd: appDir,
    stdio: 'inherit'
  });
  console.log('✅ Deployment complete!');
  console.log('🔗 Check your Cloudflare dashboard for the deployment URL');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
