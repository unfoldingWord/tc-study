/**
 * Import Passage Set Screen
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PassageSetImporter } from '@/lib/components/passage-sets/PassageSetImporter';
import { createPassageSetLoader } from '@/lib/services/passage-sets/PassageSetLoader';
import { createPackageStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';
import { PassageSet } from '@/lib/types/passage-sets';
import { IPassageSetLoader } from '@/lib/services/passage-sets/PassageSetLoader';

export default function ImportPassageSetScreen() {
  const router = useRouter();
  const [loader, setLoader] = useState<IPassageSetLoader | null>(null);
  
  useEffect(() => {
    const initLoader = async () => {
      const storageAdapter = createPackageStorageAdapter();
      await storageAdapter.initialize?.();
      const passageSetLoader = createPassageSetLoader(storageAdapter);
      setLoader(passageSetLoader);
    };
    
    initLoader();
  }, []);
  
  const handleImportComplete = (set: PassageSet) => {
    console.log('Import complete:', set.name);
    router.back();
  };
  
  const handleCancel = () => {
    router.back();
  };
  
  if (!loader) {
    return <View style={{ flex: 1 }} />;
  }
  
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PassageSetImporter
        passageSetLoader={loader}
        onImportComplete={handleImportComplete}
        onCancel={handleCancel}
      />
    </SafeAreaView>
  );
}



