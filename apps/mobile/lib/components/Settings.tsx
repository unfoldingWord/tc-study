/**
 * Settings Component - React Native Version
 * 
 * Provides application settings including SQLite database import functionality.
 * Simplified React Native version without complex HTML layouts.
 */

import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWorkspaceStore } from '../contexts/WorkspaceContext';
import { storageService } from '../services/storage/StorageService';
import { JSONImporter } from './JSONImporter';
import { SQLiteImporter } from './SQLiteImporter';
import { Icon } from './ui/Icon.native';

// Conditionally import DatabaseManager only on native platforms
let DatabaseManager: any = null;
if (Platform.OS !== 'web') {
  DatabaseManager = require('../../db/DatabaseManager').DatabaseManager;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'import'>('general');
  const [importFormat, setImportFormat] = useState<'json' | 'sql'>('json');
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const resetWorkspace = useWorkspaceStore(state => state.resetWorkspace);

  const handleFlushAllData = async () => {
    Alert.alert(
      'Flush All Data',
      'This will clear all cached data including metadata, content, and settings. The app will need to re-download everything. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Flush All Data',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsFlushing(true);
              
              
              // Clear all storage data
              await storageService.clearAllData();
              
              
              // Reset workspace state
              resetWorkspace();
              
              
              // Reload storage info
              const info = await storageService.getStorageInfo();
              setStorageInfo(info);
              
              
              Alert.alert(
                'Data Flushed',
                'All data has been cleared. The app will re-download fresh metadata and content on next use.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('❌ [FLUSH_DEBUG] Failed to flush data:', error);
              Alert.alert(
                'Error',
                'Failed to flush data. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setIsFlushing(false);
            }
          },
        },
      ]
    );
  };

  const handleResetAndReloadResources = async () => {
    // Only available on native platforms
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available on Web',
        'This feature is only available on native platforms (iOS/Android).',
        [{ text: 'OK' }]
      );
      return;
    }
    
    Alert.alert(
      'Reset & Reload Resources',
      'This will clear the current database and reload initial resources from the bundled JSON file. This is useful for testing or if the database gets corrupted. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset & Reload',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResetting(true);
              
              // Reset and reload resources from JSON (native only)
              if (DatabaseManager) {
                const databaseManager = DatabaseManager.getInstance();
                await databaseManager.resetAndReloadResources();
              }
              
              // Reload storage info
              const info = await storageService.getStorageInfo();
              setStorageInfo(info);
              
              Alert.alert(
                'Resources Reloaded',
                'Database has been reset and initial resources have been reloaded from the bundled JSON file.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('❌ Failed to reset and reload resources:', error);
              Alert.alert(
                'Error',
                'Failed to reset and reload resources. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    // Load storage information
    const loadStorageInfo = async () => {
      try {
        const info = await storageService.getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.warn('Failed to load storage info:', error);
      }
    };

    if (activeTab === 'general') {
      loadStorageInfo();
    }
  }, [activeTab]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
              <Link 
                href="/"
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>← Back to App</Text>
              </Link>
            <View style={styles.separator} />
            <Text style={styles.title}>
                Settings
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        <View style={styles.contentContainer}>
          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <Pressable
              onPress={() => setActiveTab('general')}
              style={[styles.tab, activeTab === 'general' && styles.activeTab]}
            >
              <Icon
                name="settings"
                size={16}
                color={activeTab === 'general' ? '#2563eb' : '#6b7280'}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.tabText, activeTab === 'general' && styles.activeTabText]}>
                General
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('import')}
              style={[styles.tab, activeTab === 'import' && styles.activeTab]}
            >
              <Icon
                name="upload"
                size={16}
                color={activeTab === 'import' ? '#2563eb' : '#6b7280'}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.tabText, activeTab === 'import' && styles.activeTabText]}>
                Import Database
              </Text>
            </Pressable>
          </View>

          {/* Main Content */}
          <View style={styles.mainContent}>
            {activeTab === 'general' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  General Settings
                </Text>
                <View style={styles.infoContainer}>
                  <Text style={styles.infoLabel}>Application Info</Text>
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoItemLabel}>Version</Text>
                      <Text style={styles.infoItemValue}>1.0.0</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoItemLabel}>Build</Text>
                      <Text style={styles.infoItemValue}>Development</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.infoContainer}>
                  <Text style={styles.infoLabel}>Storage Status</Text>
                      {storageInfo ? (
                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoItemLabel}>Total Size</Text>
                        <Text style={styles.infoItemValue}>
                          {storageInfo.totalSize ? `${(storageInfo.totalSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
                        </Text>
                      </View>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoItemLabel}>Resources</Text>
                        <Text style={styles.infoItemValue}>
                          {storageInfo.resourceCount || 0} resources
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.loadingText}>Loading storage info...</Text>
                  )}
                </View>

                <View style={styles.infoContainer}>
                  <Text style={styles.infoLabel}>Data Management</Text>
                  
                  {/* Reset & Reload Resources */}
                  <View style={styles.flushContainer}>
                    <View style={styles.flushInfo}>
                      <Icon name="refresh-cw" size={16} color="#6b7280" style={{ marginRight: 8 }} />
                      <Text style={styles.flushInfoText}>
                        Reset the database and reload initial resources from the bundled JSON file. Useful for testing or database recovery.
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleResetAndReloadResources}
                      disabled={isResetting}
                      style={[styles.resetButton, isResetting && styles.resetButtonDisabled]}
                    >
                      <Icon 
                        name={isResetting ? "loader" : "refresh-cw"} 
                        size={16} 
                        color={isResetting ? "#9ca3af" : "#2563eb"} 
                        style={{ marginRight: 8 }} 
                      />
                      <Text style={[styles.resetButtonText, isResetting && styles.resetButtonTextDisabled]}>
                        {isResetting ? 'Resetting...' : 'Reset & Reload Resources'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Flush All Data */}
                  <View style={styles.flushContainer}>
                    <View style={styles.flushInfo}>
                      <Icon name="info" size={16} color="#6b7280" style={{ marginRight: 8 }} />
                      <Text style={styles.flushInfoText}>
                        Clear all cached data to force fresh downloads. Useful for debugging metadata issues.
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleFlushAllData}
                      disabled={isFlushing}
                      style={[styles.flushButton, isFlushing && styles.flushButtonDisabled]}
                    >
                      <Icon 
                        name={isFlushing ? "loader" : "trash-2"} 
                        size={16} 
                        color={isFlushing ? "#9ca3af" : "#dc2626"} 
                        style={{ marginRight: 8 }} 
                      />
                      <Text style={[styles.flushButtonText, isFlushing && styles.flushButtonTextDisabled]}>
                        {isFlushing ? 'Flushing...' : 'Flush All Data'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {activeTab === 'import' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    Import Database
                </Text>
                
                <View style={styles.formatContainer}>
                  <Text style={styles.formatLabel}>Import Format:</Text>
                  <View style={styles.radioContainer}>
                    <Pressable
                      onPress={() => setImportFormat('json')}
                      style={[styles.radioOption, importFormat === 'json' && styles.radioOptionActive]}
                    >
                      <Text style={[styles.radioText, importFormat === 'json' && styles.radioTextActive]}>
                        JSON Files
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setImportFormat('sql')}
                      style={[styles.radioOption, importFormat === 'sql' && styles.radioOptionActive]}
                    >
                      <Text style={[styles.radioText, importFormat === 'sql' && styles.radioTextActive]}>
                        SQLite Database
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.instructionsContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon name="list" size={16} color="#1e40af" style={{ marginRight: 8 }} />
                    <Text style={styles.instructionsTitle}>Quick Steps:</Text>
                  </View>
                  <Text style={styles.instructionsText}>1. Select your import format above</Text>
                  <Text style={styles.instructionsText}>2. Use the importer below to upload your files</Text>
                  <Text style={styles.instructionsText}>3. Wait for the import to complete</Text>
                  <Text style={styles.instructionsText}>4. Refresh the app to see your imported data</Text>
                </View>

                {/* Importers */}
                    {importFormat === 'json' ? (
                  <JSONImporter />
                ) : (
                  <SQLiteImporter />
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // border-gray-200
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backLink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  backLinkText: {
    fontSize: 14,
    color: '#6b7280', // text-gray-600
    fontWeight: '500',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#d1d5db', // bg-gray-300
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827', // text-gray-900
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#f3f4f6', // bg-gray-100
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280', // text-gray-600
  },
  activeTabText: {
    color: '#2563eb', // text-blue-700
  },
  mainContent: {
    flex: 1,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827', // text-gray-900
    marginBottom: 16,
  },
  infoContainer: {
    marginBottom: 24,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151', // text-gray-700
    marginBottom: 8,
  },
  infoGrid: {
    backgroundColor: '#f9fafb', // bg-gray-50
    borderRadius: 6,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    flex: 1,
  },
  infoItemLabel: {
    fontSize: 12,
    color: '#6b7280', // text-gray-500
    marginBottom: 4,
  },
  infoItemValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827', // text-gray-900
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280', // text-gray-500
    fontStyle: 'italic',
  },
  formatContainer: {
    marginBottom: 16,
  },
  formatLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151', // text-gray-700
    marginBottom: 8,
  },
  radioContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db', // border-gray-300
  },
  radioOptionActive: {
    backgroundColor: '#dbeafe', // bg-blue-50
    borderColor: '#2563eb', // border-blue-500
  },
  radioText: {
    fontSize: 14,
    color: '#374151', // text-gray-700
  },
  radioTextActive: {
    color: '#2563eb', // text-blue-700
    fontWeight: '500',
  },
  instructionsContainer: {
    backgroundColor: '#dbeafe', // bg-blue-50
    borderWidth: 1,
    borderColor: '#93c5fd', // border-blue-200
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af', // text-blue-900
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 12,
    color: '#1e40af', // text-blue-800
    marginBottom: 2,
  },
  flushContainer: {
    backgroundColor: '#f9fafb', // bg-gray-50
    borderRadius: 6,
    padding: 16,
  },
  flushInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  flushInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280', // text-gray-500
    lineHeight: 16,
  },
  flushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626', // border-red-600
    backgroundColor: '#fef2f2', // bg-red-50
  },
  flushButtonDisabled: {
    borderColor: '#d1d5db', // border-gray-300
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  flushButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#dc2626', // text-red-600
  },
  flushButtonTextDisabled: {
    color: '#9ca3af', // text-gray-400
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2563eb', // border-blue-600
    backgroundColor: '#dbeafe', // bg-blue-50
  },
  resetButtonDisabled: {
    borderColor: '#d1d5db', // border-gray-300
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb', // text-blue-600
  },
  resetButtonTextDisabled: {
    color: '#9ca3af', // text-gray-400
  },
});
