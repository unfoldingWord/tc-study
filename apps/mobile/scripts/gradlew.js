#!/usr/bin/env node

const { execSync } = require('child_process');

// Detect platform
const isWindows = process.platform === 'win32';

// Choose the appropriate gradlew command
const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';

// Get arguments passed to this script
const args = process.argv.slice(2).join(' ');

// Execute the gradlew command
try {
  execSync(`${gradlewCmd} ${args}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (error) {
  process.exit(error.status || 1);
}
