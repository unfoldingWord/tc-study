const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .zip files as assets
config.resolver.assetExts.push('zip');

// Ensure these files are treated as assets, not source files
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => ext !== 'zip'
);

// Note: Large assets (55MB+) may timeout in development mode with Metro.
// Use release build for reliable testing: npx expo run:android --variant release

module.exports = config;

