/**
 * Passage Sets Screen
 * 
 * Browse and manage passage sets
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PassageSetBrowser } from '@/lib/components/passage-sets/PassageSetBrowser';
import { createPackageStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';
import { PassageSet } from '@/lib/types/passage-sets';
import { PackageStorageAdapter } from '@/lib/types/resource-package';

export default function PassageSetsScreen() {
  const router = useRouter();
  const [storageAdapter, setStorageAdapter] = useState<PackageStorageAdapter | null>(null);
  
  useEffect(() => {
    const initAdapter = async () => {
      const adapter = createPackageStorageAdapter();
      await adapter.initialize?.();
      setStorageAdapter(adapter);
    };
    
    initAdapter();
  }, []);
  
  const handleSelectSet = (set: PassageSet) => {
    console.log('Selected passage set:', set.name);
    // TODO: Navigate to passage set view or update navigation context
  };
  
  const handleImport = () => {
    router.push('/passage-sets/import');
  };
  
  if (!storageAdapter) {
    return <View style={{ flex: 1 }} />;
  }
  
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PassageSetBrowser
        storageAdapter={storageAdapter}
        onSelectSet={handleSelectSet}
        onImport={handleImport}
      />
    </SafeAreaView>
  );
}



