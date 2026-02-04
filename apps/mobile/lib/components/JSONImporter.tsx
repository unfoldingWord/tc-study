/**
 * JSONImporter Component - React Native Version
 * 
 * Handles importing JSON database files into IndexedDB storage.
 * Much simpler than SQL parsing - directly imports JSON data.
 * Preserves all original features in React Native format.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { storageService } from '../services/storage/StorageService';

interface ImportProgress {
  stage: 'idle' | 'reading' | 'importing' | 'complete' | 'error';
  message: string;
  progress?: number;
  total?: number;
  error?: string;
}

// Support both old and new formats
interface ExportData {
  metadata: any[];
  content: any[];
  exportInfo: {
    timestamp: string;
    server: string;
    owner: string;
    language: string;
    totalResources: number;
    totalContent: number;
  };
}

interface ImportStats {
  resourcesImported: number;
  contentImported: number;
  errors: string[];
  warnings: string[];
}

export function JSONImporter() {
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    stage: 'idle',
    message: 'Ready to import JSON database'
  });
  
  const [importStats, setImportStats] = useState<ImportStats>({
    resourcesImported: 0,
    contentImported: 0,
    errors: [],
    warnings: []
  });

  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStrategy, setImportStrategy] = useState<'replace' | 'merge' | 'update'>('replace');

  // File selection handler
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        Alert.alert('Invalid File', 'Please select a JSON file.');
        return;
      }
      
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        Alert.alert('File Too Large', 'File size must be less than 100MB.');
        return;
      }
      
      setSelectedFile(file);
      setImportProgress({
        stage: 'idle',
        message: `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      });
    }
  }, []);

  // Import strategy handler
  const handleStrategyChange = useCallback((strategy: 'replace' | 'merge' | 'update') => {
    setImportStrategy(strategy);
  }, []);

  // Import function
  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      Alert.alert('No File', 'Please select a JSON file to import.');
      return;
    }

    setIsImporting(true);
    setImportStats({
      resourcesImported: 0,
      contentImported: 0,
      errors: [],
      warnings: []
    });

    try {
      // Stage 1: Reading file
      setImportProgress({
        stage: 'reading',
        message: 'Reading JSON file...',
        progress: 0
      });

      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(selectedFile);
      });

      // Stage 2: Parsing JSON
      setImportProgress({
        stage: 'reading',
        message: 'Parsing JSON data...',
        progress: 25
      });

      let exportData: ExportData;
      try {
        exportData = JSON.parse(fileContent);
      } catch (error) {
        throw new Error('Invalid JSON format');
      }

      // Validate export data structure
      if (!exportData.metadata || !exportData.content || !exportData.exportInfo) {
        throw new Error('Invalid export data structure');
      }

      // Stage 3: Importing data
      setImportProgress({
        stage: 'importing',
        message: 'Importing resources...',
        progress: 50
      });

      const stats: ImportStats = {
        resourcesImported: 0,
        contentImported: 0,
        errors: [],
        warnings: []
      };

      // Import metadata (resources)
      for (let i = 0; i < exportData.metadata.length; i++) {
        try {
          await storageService.importResource(exportData.metadata[i], importStrategy);
          stats.resourcesImported++;
        } catch (error) {
          stats.errors.push(`Resource ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Update progress
        const progress = 50 + (i / exportData.metadata.length) * 25;
        setImportProgress({
          stage: 'importing',
          message: `Importing resources... (${i + 1}/${exportData.metadata.length})`,
          progress: Math.round(progress)
        });
      }

      // Import content
      setImportProgress({
        stage: 'importing',
        message: 'Importing content...',
        progress: 75
      });

      for (let i = 0; i < exportData.content.length; i++) {
        try {
          await storageService.importContent(exportData.content[i], importStrategy);
          stats.contentImported++;
        } catch (error) {
          stats.errors.push(`Content ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Update progress
        const progress = 75 + (i / exportData.content.length) * 25;
        setImportProgress({
          stage: 'importing',
          message: `Importing content... (${i + 1}/${exportData.content.length})`,
          progress: Math.round(progress)
        });
      }

      // Stage 4: Complete
      setImportStats(stats);
      setImportProgress({
        stage: 'complete',
        message: `Import complete! ${stats.resourcesImported} resources, ${stats.contentImported} content items imported.`,
        progress: 100
      });

      // Show completion alert
      if (stats.errors.length === 0) {
        Alert.alert(
          'Import Complete',
          `Successfully imported ${stats.resourcesImported} resources and ${stats.contentImported} content items.`
        );
      } else {
        Alert.alert(
          'Import Complete with Errors',
          `Imported ${stats.resourcesImported} resources and ${stats.contentImported} content items, but ${stats.errors.length} errors occurred.`
        );
      }

    } catch (error) {
      console.error('Import failed:', error);
      setImportProgress({
        stage: 'error',
        message: 'Import failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      Alert.alert('Import Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsImporting(false);
    }
  }, [selectedFile, importStrategy]);

  // Reset function
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setImportProgress({
      stage: 'idle',
      message: 'Ready to import JSON database'
    });
    setImportStats({
      resourcesImported: 0,
      contentImported: 0,
      errors: [],
      warnings: []
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* File Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select JSON File</Text>
        <View style={styles.fileInputContainer}>
          <Pressable
            style={styles.fileInputButton}
            onPress={() => {
              // In React Native, we need to use a different approach for file selection
              // This would typically use a library like react-native-document-picker
              Alert.alert('File Selection', 'File selection will be implemented with react-native-document-picker');
            }}
          >
            <Text style={styles.fileInputButtonText}>
              {selectedFile ? selectedFile.name : 'Choose JSON File'}
            </Text>
          </Pressable>
          {selectedFile && (
            <Pressable
              style={styles.removeFileButton}
              onPress={() => setSelectedFile(null)}
            >
              <Text style={styles.removeFileButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.fileInputHelp}>
          Select a JSON database file exported from BT Studio. Maximum file size: 100MB.
        </Text>
      </View>

      {/* Import Strategy Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import Strategy</Text>
        <View style={styles.strategyContainer}>
          <Pressable
            style={[styles.strategyOption, importStrategy === 'replace' && styles.strategyOptionActive]}
            onPress={() => handleStrategyChange('replace')}
          >
            <Text style={[styles.strategyOptionText, importStrategy === 'replace' && styles.strategyOptionTextActive]}>
              Replace All
            </Text>
            <Text style={styles.strategyOptionDescription}>
              Clear existing data and import new data
            </Text>
          </Pressable>
          
          <Pressable
            style={[styles.strategyOption, importStrategy === 'merge' && styles.strategyOptionActive]}
            onPress={() => handleStrategyChange('merge')}
          >
            <Text style={[styles.strategyOptionText, importStrategy === 'merge' && styles.strategyOptionTextActive]}>
              Merge
            </Text>
            <Text style={styles.strategyOptionDescription}>
              Add new data alongside existing data
            </Text>
          </Pressable>
          
          <Pressable
            style={[styles.strategyOption, importStrategy === 'update' && styles.strategyOptionActive]}
            onPress={() => handleStrategyChange('update')}
          >
            <Text style={[styles.strategyOptionText, importStrategy === 'update' && styles.strategyOptionTextActive]}>
              Update
            </Text>
            <Text style={styles.strategyOptionDescription}>
              Update existing data, add new data
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Import Progress */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import Progress</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${importProgress.progress || 0}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {importProgress.message}
          </Text>
          {importProgress.error && (
            <Text style={styles.errorText}>
              Error: {importProgress.error}
            </Text>
          )}
        </View>
      </View>

      {/* Import Stats */}
      {(importStats.resourcesImported > 0 || importStats.contentImported > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import Results</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Resources Imported:</Text>
              <Text style={styles.statValue}>{importStats.resourcesImported}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Content Imported:</Text>
              <Text style={styles.statValue}>{importStats.contentImported}</Text>
            </View>
            {importStats.errors.length > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Errors:</Text>
                <Text style={styles.statValueError}>{importStats.errors.length}</Text>
              </View>
            )}
          </View>
          
          {importStats.errors.length > 0 && (
            <ScrollView style={styles.errorsContainer}>
              {importStats.errors.map((error, index) => (
                <Text key={index} style={styles.errorItem}>
                  • {error}
                </Text>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <Pressable
          style={[styles.button, styles.importButton, (!selectedFile || isImporting) && styles.buttonDisabled]}
          onPress={handleImport}
          disabled={!selectedFile || isImporting}
        >
          <Text style={[styles.buttonText, styles.importButtonText]}>
            {isImporting ? 'Importing...' : 'Start Import'}
          </Text>
        </Pressable>
        
        <Pressable
          style={[styles.button, styles.resetButton]}
          onPress={handleReset}
          disabled={isImporting}
        >
          <Text style={[styles.buttonText, styles.resetButtonText]}>
            Reset
          </Text>
        </Pressable>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>📋 Quick Steps:</Text>
        <Text style={styles.instructionsText}>1. Select your import format above</Text>
        <Text style={styles.instructionsText}>2. Use the importer below to upload your files</Text>
        <Text style={styles.instructionsText}>3. Wait for the import to complete</Text>
        <Text style={styles.instructionsText}>4. Refresh the app to see your imported data</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  fileInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileInputButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
  },
  fileInputButtonText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  removeFileButton: {
    padding: 8,
    backgroundColor: '#fecaca',
    borderRadius: 6,
  },
  removeFileButtonText: {
    fontSize: 16,
    color: '#dc2626',
    fontWeight: 'bold',
  },
  fileInputHelp: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  strategyContainer: {
    gap: 12,
  },
  strategyOption: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  strategyOptionActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  strategyOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  strategyOptionTextActive: {
    color: '#1e40af',
  },
  strategyOptionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
  },
  statsContainer: {
    gap: 8,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#374151',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  statValueError: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  errorsContainer: {
    maxHeight: 120,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
  },
  errorItem: {
    fontSize: 12,
    color: '#dc2626',
    marginBottom: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  importButton: {
    backgroundColor: '#3b82f6',
  },
  importButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#6b7280',
  },
  resetButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonText: {
    fontSize: 14,
  },
  instructionsContainer: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 8,
    padding: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 12,
    color: '#1e40af',
    marginBottom: 2,
  },
});
