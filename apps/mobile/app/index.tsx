/**
 * Root Index - Package-Aware Workspace Initialization
 * 
 * Implements the correct workflow:
 * 1. Check for active package
 * 2. If no package, redirect to package selector
 * 3. If package exists, resolve workspace parameters from package
 * 4. Initialize workspace with package resources
 * 5. Wait for anchor resource and navigation to be ready
 * 6. Load enhanced panels
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import contexts and components
import { EnhancedPanelSystem } from '@/lib/components/panels/EnhancedPanelSystem';
import { getAppConfig } from '@/lib/config/app-resources';
import { AppContexts } from '@/lib/contexts/AppContexts';
import { createPackageManager } from '@/lib/services/packages/PackageManager';
import { createPackageStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';
import { ResourcePackage } from '@/lib/types/resource-package';

// Workspace parameter persistence
const WORKSPACE_PARAMS_KEY = 'bt-synergy-workspace-params';
const WORKSPACE_PARAMS_VERSION = '1.0.0';

interface PersistedWorkspaceParams {
  version: string;
  owner: string;
  language: string;
  server: string;
  lastUpdated: string;
}

interface WorkspaceParams {
  owner: string;
  language: string;
  server: string;
  book: string;
}

export default function RootIndex() {
  const router = useRouter();
  const [workspaceParams, setWorkspaceParams] = useState<WorkspaceParams | null>(null);
  const [activePackage, setActivePackage] = useState<ResourcePackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingPackage, setCheckingPackage] = useState(true);

  useEffect(() => {
    const initializeWorkspace = async () => {
      try {
        
        
        // Step 1: Check for active package
        const packageCheck = await checkActivePackage();
        
        if (!packageCheck.hasPackage) {
          // No active package - redirect to package selector
          console.log('📦 No active package found, redirecting to package selector');
          setCheckingPackage(false);
          router.replace('/packages');
          return;
        }
        
        setActivePackage(packageCheck.package);
        setCheckingPackage(false);
        
        // Step 2: Resolve workspace parameters from package or persisted state
        const params = await resolveWorkspaceParams(packageCheck.package);
        
        
        setWorkspaceParams(params);
        setIsLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to initialize workspace:', error);
        
        // Fallback to default parameters
        const config = getAppConfig();
        const fallbackParams: WorkspaceParams = {
          owner: config.defaultOwner,
          language: config.defaultLanguage,
          server: config.defaultServer,
          book: config.defaultBook
        };
        
        
        setWorkspaceParams(fallbackParams);
        setCheckingPackage(false);
        setIsLoading(false);
      }
    };

    initializeWorkspace();
  }, []);

  // Check for active package
  const checkActivePackage = async (): Promise<{ hasPackage: boolean; package: ResourcePackage | null }> => {
    try {
      const storageAdapter = createPackageStorageAdapter();
      await storageAdapter.initialize?.();
      
      const packageManager = createPackageManager(storageAdapter);
      await packageManager.initialize();
      
      const activePackage = await packageManager.getActivePackage();
      
      return {
        hasPackage: activePackage !== null,
        package: activePackage
      };
    } catch (error) {
      console.warn('❌ Failed to check active package:', error);
      return { hasPackage: false, package: null };
    }
  };

  // Resolve workspace parameters from package or persisted state
  const resolveWorkspaceParams = async (pkg?: ResourcePackage | null): Promise<WorkspaceParams> => {
    // If package provided, use package configuration
    if (pkg) {
      const anchorResource = pkg.resources.find(r => r.role === 'anchor');
      
      return {
        owner: anchorResource?.owner || pkg.config.defaultOwner || 'unfoldingWord',
        language: anchorResource?.language || pkg.config.defaultLanguage || 'en',
        server: pkg.config.defaultServer || 'git.door43.org',
        book: 'tit' // Will be overridden by navigation persistence
      };
    }
    
    // Otherwise try to load from persisted state
    try {
      const stored = await AsyncStorage.getItem(WORKSPACE_PARAMS_KEY);
      
      if (stored) {
        const persistedParams = JSON.parse(stored) as PersistedWorkspaceParams;
        
        if (persistedParams.version === WORKSPACE_PARAMS_VERSION &&
            persistedParams.owner && 
            persistedParams.language && 
            persistedParams.server) {
          return {
            owner: persistedParams.owner,
            language: persistedParams.language,
            server: persistedParams.server,
            book: 'tit'
          };
        }
      }
    } catch (error) {
      console.warn('❌ Failed to load persisted workspace parameters:', error);
    }
    
    // Fallback parameters
    const config = getAppConfig();
    return {
      owner: config.defaultOwner,
      language: config.defaultLanguage, 
      server: config.defaultServer,
      book: config.defaultBook
    };
  };

  // Save workspace parameters for future use
  const saveWorkspaceParams = async (params: WorkspaceParams) => {
    try {
      const persistedParams: PersistedWorkspaceParams = {
        version: WORKSPACE_PARAMS_VERSION,
        owner: params.owner,
        language: params.language,
        server: params.server,
        lastUpdated: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(WORKSPACE_PARAMS_KEY, JSON.stringify(persistedParams));
      
    } catch (error) {
      console.warn('❌ Failed to save workspace parameters:', error);
    }
  };

  // Save parameters when they change
  useEffect(() => {
    if (workspaceParams) {
      saveWorkspaceParams(workspaceParams);
    }
  }, [workspaceParams]);

  // Show loading while checking for package
  if (checkingPackage || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>
            {checkingPackage ? 'Checking for packages...' : 'Initializing workspace...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!workspaceParams) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to initialize workspace</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppContexts
        initialOwner={workspaceParams.owner}
        initialLanguage={workspaceParams.language}
        initialServer={workspaceParams.server}
        initialBook={workspaceParams.book}
      >
        <EnhancedPanelSystem />
      </AppContexts>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    fontWeight: '500',
  },
});
