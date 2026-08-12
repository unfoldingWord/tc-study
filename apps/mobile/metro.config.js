const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch workspace packages (@usfm-tools/* from npm via usj-processor)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Add .zip files as assets
config.resolver.assetExts.push('zip');

// Ensure these files are treated as assets, not source files
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => ext !== 'zip'
);

// Note: Large assets (55MB+) may timeout in development mode with Metro.
// Use release build for reliable testing: npx expo run:android --variant release

module.exports = config;
