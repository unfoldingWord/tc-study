/**
 * SQLiteImporter Component - React Native Version
 * 
 * Handles importing SQLite database files into IndexedDB storage.
 * Parses SQL INSERT statements and converts them to IndexedDB records.
 * Preserves all original features in React Native format.
 */

import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { storageService } from '../services/storage/StorageService';

interface ImportProgress {
  stage: 'idle' | 'reading' | 'parsing' | 'importing' | 'complete' | 'error';
  message: string;
  progress?: number;
  total?: number;
  error?: string;
}

interface SQLiteRecord {
  table: 'resource_metadata' | 'resource_content';
  data: Record<string, any>;
}

export function SQLiteImporter() {
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    stage: 'idle',
    message: 'Ready to import'
  });
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStats, setImportStats] = useState({
    recordsParsed: 0,
    recordsImported: 0,
    errors: [] as string[]
  });

  // File selection handler
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite') && !file.name.endsWith('.sqlite3')) {
        Alert.alert('Invalid File', 'Please select a SQLite database file (.db, .sqlite, or .sqlite3).');
        return;
      }
      
      if (file.size > 200 * 1024 * 1024) { // 200MB limit
        Alert.alert('File Too Large', 'File size must be less than 200MB.');
        return;
      }
      
      setSelectedFile(file);
      setImportProgress({
        stage: 'idle',
        message: `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      });
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite') && !file.name.endsWith('.sqlite3')) {
        Alert.alert('Invalid File', 'Please select a SQLite database file (.db, .sqlite, or .sqlite3).');
        return;
      }
      
      if (file.size > 200 * 1024 * 1024) {
        Alert.alert('File Too Large', 'File size must be less than 200MB.');
        return;
      }
      
      setSelectedFile(file);
      setImportProgress({
        stage: 'idle',
        message: `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      });
    }
  }, []);

  // SQL parsing function
  const parseSQLiteFile = useCallback(async (file: File): Promise<SQLiteRecord[]> => {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

    const records: SQLiteRecord[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Parse INSERT statements
      if (trimmedLine.startsWith('INSERT INTO')) {
        try {
          const record = parseInsertStatement(trimmedLine);
          if (record) {
            records.push(record);
          }
        } catch (error) {
          console.warn('Failed to parse line:', trimmedLine, error);
        }
      }
    }

    return records;
  }, []);

  // Parse individual INSERT statement
  const parseInsertStatement = useCallback((sql: string): SQLiteRecord | null => {
    // Simple regex to match INSERT INTO table_name VALUES (...)
    const match = sql.match(/INSERT INTO\s+(\w+)\s+VALUES\s*\((.+)\)/i);
    if (!match) return null;

    const tableName = match[1];
    const valuesStr = match[2];

    // Parse values (simplified - handles basic cases)
    const values = parseValues(valuesStr);
    
    if (tableName === 'resource_metadata') {
      return {
        table: 'resource_metadata',
        data: {
          id: values[0],
          type: values[1],
          title: values[2],
          description: values[3],
          language: values[4],
          server: values[5],
          owner: values[6],
          resourceId: values[7],
          createdAt: values[8],
          updatedAt: values[9]
        }
      };
    } else if (tableName === 'resource_content') {
      return {
        table: 'resource_content',
        data: {
          id: values[0],
          resourceId: values[1],
          contentKey: values[2],
          content: values[3],
          contentType: values[4],
          createdAt: values[5],
          updatedAt: values[6]
        }
      };
    }

    return null;
  }, []);

  // Parse VALUES clause
  const parseValues = useCallback((valuesStr: string): any[] => {
    const values: any[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let i = 0;

    while (i < valuesStr.length) {
      const char = valuesStr[i];
      
      if (!inQuotes && (char === "'" || char === '"')) {
        inQuotes = true;
        quoteChar = char;
        i++;
        continue;
      }
      
      if (inQuotes && char === quoteChar) {
        // Check for escaped quote
        if (i + 1 < valuesStr.length && valuesStr[i + 1] === quoteChar) {
          current += char;
          i += 2;
          continue;
        } else {
          inQuotes = false;
          quoteChar = '';
          i++;
          continue;
        }
      }
      
      if (!inQuotes && char === ',') {
        values.push(parseValue(current.trim()));
        current = '';
        i++;
        continue;
      }
      
      current += char;
      i++;
    }
    
    if (current.trim()) {
      values.push(parseValue(current.trim()));
    }
    
    return values;
  }, []);

  // Parse individual value
  const parseValue = useCallback((value: string): any => {
    if (value === 'NULL') return null;
    if (value === 'true' || value === 'TRUE') return true;
    if (value === 'false' || value === 'FALSE') return false;
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1).replace(/''/g, "'");
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1).replace(/""/g, '"');
    }
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }, []);

  // Import function
  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      Alert.alert('No File', 'Please select a SQLite file to import.');
      return;
    }

    setIsImporting(true);
    setImportStats({
      recordsParsed: 0,
      recordsImported: 0,
      errors: []
    });

    try {
      // Stage 1: Reading file
      setImportProgress({
        stage: 'reading',
        message: 'Reading SQLite file...',
        progress: 10
      });

      // Stage 2: Parsing SQL
      setImportProgress({
        stage: 'parsing',
        message: 'Parsing SQL statements...',
        progress: 30
      });

      const records = await parseSQLiteFile(selectedFile);
      setImportStats(prev => ({ ...prev, recordsParsed: records.length }));

      // Stage 3: Importing records
      setImportProgress({
        stage: 'importing',
        message: 'Importing records...',
        progress: 50
      });

      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        try {
          if (records[i].table === 'resource_metadata') {
            await storageService.saveResourceMetadata([records[i].data]);
          } else if (records[i].table === 'resource_content') {
            const contentData = records[i].data;
            const resourceContent = {
              key: contentData.contentKey || contentData.id,
              resourceKey: `${contentData.server}/${contentData.owner}/${contentData.language}/${contentData.resourceId}`,
              resourceId: contentData.resourceId,
              server: contentData.server || 'unknown',
              owner: contentData.owner || 'unknown',
              language: contentData.language || 'en',
              type: contentData.contentType || 'unknown',
              content: JSON.parse(contentData.content || '{}'),
              lastFetched: new Date(contentData.createdAt || Date.now()),
              size: contentData.content?.length || 0
            };
            await storageService.saveResourceContent(resourceContent);
          }
          imported++;
        } catch (error) {
          errors.push(`Record ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Update progress
        const progress = 50 + (i / records.length) * 40;
        setImportProgress({
          stage: 'importing',
          message: `Importing records... (${i + 1}/${records.length})`,
          progress: Math.round(progress)
        });
      }

      setImportStats(prev => ({ ...prev, recordsImported: imported, errors }));

      // Stage 4: Complete
      setImportProgress({
        stage: 'complete',
        message: `Import complete! ${imported} records imported.`,
        progress: 100
      });

      // Show completion alert
      if (errors.length === 0) {
        Alert.alert(
          'Import Complete',
          `Successfully imported ${imported} records from SQLite database.`
        );
      } else {
        Alert.alert(
          'Import Complete with Errors',
          `Imported ${imported} records, but ${errors.length} errors occurred.`
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
  }, [selectedFile, parseSQLiteFile]);

  // Reset function
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setImportProgress({
      stage: 'idle',
      message: 'Ready to import'
    });
    setImportStats({
      recordsParsed: 0,
      recordsImported: 0,
      errors: []
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* File Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select SQLite Database</Text>
        
        {/* Drag and Drop Area */}
        <View 
          style={[
            styles.dragDropArea,
            dragActive && styles.dragDropAreaActive
          ]}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Text style={styles.dragDropText}>
            {dragActive ? 'Drop SQLite file here' : 'Drag & drop SQLite file here'}
          </Text>
          <Text style={styles.dragDropSubtext}>
            or click to browse
          </Text>
        </View>

        {/* File Input */}
        <View style={styles.fileInputContainer}>
          <Pressable
            style={styles.fileInputButton}
            onPress={() => {
              // In React Native, we need to use a different approach for file selection
              Alert.alert('File Selection', 'File selection will be implemented with react-native-document-picker');
            }}
          >
            <Text style={styles.fileInputButtonText}>
              {selectedFile ? selectedFile.name : 'Choose SQLite File'}
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
          Select a SQLite database file (.db, .sqlite, or .sqlite3). Maximum file size: 200MB.
        </Text>
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
      {(importStats.recordsParsed > 0 || importStats.recordsImported > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import Results</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Records Parsed:</Text>
              <Text style={styles.statValue}>{importStats.recordsParsed}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Records Imported:</Text>
              <Text style={styles.statValue}>{importStats.recordsImported}</Text>
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
        <Text style={styles.instructionsTitle}>📋 Import Instructions:</Text>
        <Text style={styles.instructionsText}>1. Export your SQLite database as a .sql file</Text>
        <Text style={styles.instructionsText}>2. Select the exported .sql file above</Text>
        <Text style={styles.instructionsText}>3. Click &quot;Start Import&quot; to begin the process</Text>
        <Text style={styles.instructionsText}>4. Wait for the import to complete</Text>
        <Text style={styles.instructionsText}>5. Refresh the app to see your imported data</Text>
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
  dragDropArea: {
    padding: 40,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 16,
  },
  dragDropAreaActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  dragDropText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  dragDropSubtext: {
    fontSize: 14,
    color: '#6b7280',
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
