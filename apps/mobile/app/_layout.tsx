/**
 * Native platform layout (iOS/Android)
 * Uses SQLite for native platforms
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

// Conditionally import native-only modules
let DatabaseManager: any = null;
let SQLite: any = null;
let useDrizzleStudio: any = null;

if (Platform.OS !== 'web') {
  DatabaseManager = require('@/db/DatabaseManager').DatabaseManager;
  SQLite = require('expo-sqlite');
  try {
    useDrizzleStudio = require('expo-drizzle-studio-plugin').useDrizzleStudio;
  } catch (e) {
    console.warn('Drizzle Studio plugin not available');
  }
}


export const unstable_settings = {
  // Set initial route to workspace instead of tabs
  initialRouteName: 'workspace',
};

function DrizzleProvider({ children }: { children: React.ReactNode }) {
  const db = SQLite?.useSQLiteContext?.();
  const [isReady, setIsReady] = useState(false);
  const [initStatus, setInitStatus] = useState('Initializing database...');
  
  // Only use Drizzle Studio on native platforms
  if (Platform.OS !== 'web' && useDrizzleStudio && db) {
    try {
      useDrizzleStudio(db as any);
    } catch (error) {
      console.warn('Drizzle Studio not available:', error);
    }
  }

  useEffect(() => {
    const initializeApp = async () => {
      // On web, skip database initialization
      if (Platform.OS === 'web') {
        console.log('🌐 Web platform - skipping SQLite initialization');
        setIsReady(true);
        return;
      }
      
      try {
        setInitStatus('Initializing database...');
        
        // Initialize the new unified database (native only)
        if (DatabaseManager && db) {
          const databaseManager = DatabaseManager.getInstance();
          await databaseManager.initialize(db);

          setInitStatus('Preparing resources for offline use...\nThis may take a moment on first launch.');
          
          // Load initial resources from bundled ZIP files
          // This blocks until extraction is complete
          await databaseManager.loadInitialResourcesFromJSON();
        }

        setInitStatus('Ready!');
        setIsReady(true);

        // Run migration from legacy databases if they exist
        // Note: Migration is disabled for new installations to avoid warnings
        // const migration = new DataMigration();
        // await migration.migrateFromLegacyDatabases();

      } catch (error) {
        console.error('Failed to initialize app database:', error);
        setInitStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nApp will continue with network-only mode.`);
        // Still set ready to true to allow app to load even if extraction fails
        setIsReady(true);
      }
    };

    initializeApp();
  }, [db]);

  // Show loading screen while resources are being extracted
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>{initStatus}</Text>
        {initStatus.includes('Extracting') && (
          <Text style={styles.loadingSubtext}>
            Preparing resources for offline use...
          </Text>
        )}
      </View>
    );
  }

  return children;
}

function DatabaseProvider({ children }: { children: React.ReactNode }) {
  // On web, skip SQLite provider entirely
  if (Platform.OS === 'web') {
    return (
      <DrizzleProvider>
        {children}
      </DrizzleProvider>
    );
  }

  // On native, use SQLite provider
  return (
    <SQLite.SQLiteProvider databaseName="app.db">
      <DrizzleProvider>
        {children}
      </DrizzleProvider>
    </SQLite.SQLiteProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  // Enable Drizzle Studio for database inspection (development only)
  // Wrapped in try-catch due to potential version conflicts
 
  return (
    <DatabaseProvider >
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Main workspace routes - matches bt-studio routing */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        
        {/* Legacy tab routes for testing */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
     </DatabaseProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
