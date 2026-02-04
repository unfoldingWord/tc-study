/**
 * Platform Storage Factory
 * 
 * Creates the appropriate storage adapter based on the current platform:
 * - Web: IndexedDB (native browser storage)
 * - Native (iOS/Android): SQLite via expo-sqlite
 */

import { Platform } from 'react-native';
import { StorageAdapter } from '../../types/context';
import { PackageStorageAdapter } from '../../types/resource-package';
import { IndexedDBStorageAdapter } from './IndexedDBStorageAdapter';
import { IndexedDBPackageStorageAdapter } from './IndexedDBPackageStorageAdapter';

// Native-only imports - use require to avoid bundling on web
// These modules use drizzle-orm which has import.meta that breaks web bundles
let SimplifiedDrizzleStorageAdapter: any = null;
let SQLitePackageStorageAdapter: any = null;

if (Platform.OS !== 'web') {
  SimplifiedDrizzleStorageAdapter = require('./SimplifiedDrizzleStorageAdapter').SimplifiedDrizzleStorageAdapter;
  SQLitePackageStorageAdapter = require('./SQLitePackageStorageAdapter').SQLitePackageStorageAdapter;
}

/**
 * Create a storage adapter for the current platform
 */
export function createPlatformStorageAdapter(): StorageAdapter {
  if (Platform.OS === 'web') {
    console.log('🌐 Using IndexedDB storage adapter for web');
    return new IndexedDBStorageAdapter('bt-synergy-resources');
  } else {
    console.log('📱 Using SQLite storage adapter for native');
    return new SimplifiedDrizzleStorageAdapter();
  }
}

/**
 * Check if the current platform is web
 */
export function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}

/**
 * Check if the current platform is native (iOS/Android)
 */
export function isNativePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Create a package storage adapter for the current platform
 * Handles resource packages, panel layouts, and passage sets
 */
export function createPackageStorageAdapter(): PackageStorageAdapter {
  if (Platform.OS === 'web') {
    console.log('🌐 Using IndexedDB package storage adapter for web');
    return new IndexedDBPackageStorageAdapter();
  } else {
    console.log('📱 Using SQLite package storage adapter for native');
    // Lazy load on first use if not already loaded
    if (!SQLitePackageStorageAdapter) {
      SQLitePackageStorageAdapter = require('./SQLitePackageStorageAdapter').SQLitePackageStorageAdapter;
    }
    return new SQLitePackageStorageAdapter();
  }
}

