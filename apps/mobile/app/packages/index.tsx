/**
 * Package Selection Screen
 * 
 * Main screen for selecting or creating resource packages
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PackageSelector } from '@/lib/components/packages/PackageSelector';
import { createPackageManager } from '@/lib/services/packages/PackageManager';
import { createPackageStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';
import { ResourcePackage } from '@/lib/types/resource-package';

export default function PackagesScreen() {
  const router = useRouter();
  
  const handlePackageSelect = async (pkg: ResourcePackage) => {
    try {
      const storageAdapter = createPackageStorageAdapter();
      const packageManager = createPackageManager(storageAdapter);
      
      await packageManager.initialize();
      
      // Save and activate the package
      await packageManager.savePackage(pkg);
      await packageManager.setActivePackage(pkg.id);
      
      // Navigate to main app
      router.replace('/');
    } catch (error) {
      console.error('Failed to activate package:', error);
    }
  };
  
  const handleCreateCustom = () => {
    router.push('/packages/new');
  };
  
  const handleImport = () => {
    router.push('/packages/import');
  };
  
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PackageSelector
        onPackageSelect={handlePackageSelect}
        onCreateCustom={handleCreateCustom}
        onImport={handleImport}
      />
    </SafeAreaView>
  );
}



