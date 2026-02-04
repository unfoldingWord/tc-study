/**
 * Passage Set Importer
 * 
 * Import passage sets from JSON files or DCS repositories
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { PassageSet } from '../../types/passage-sets';
import { DCSRepoParams } from '../../types/resource-package';
import { IPassageSetLoader } from '../../services/passage-sets/PassageSetLoader';
import { Icon } from '../ui/Icon.native';

interface PassageSetImporterProps {
  passageSetLoader: IPassageSetLoader;
  onImportComplete: (set: PassageSet) => void;
  onCancel?: () => void;
}

export function PassageSetImporter({
  passageSetLoader,
  onImportComplete,
  onCancel
}: PassageSetImporterProps) {
  const [importMethod, setImportMethod] = useState<'json' | 'dcs'>('json');
  const [loading, setLoading] = useState(false);
  
  // JSON import state
  const [jsonContent, setJsonContent] = useState('');
  
  // DCS import state
  const [dcsServer, setDcsServer] = useState('git.door43.org');
  const [dcsOwner, setDcsOwner] = useState('');
  const [dcsRepo, setDcsRepo] = useState('');
  const [dcsPath, setDcsPath] = useState('passage-set.json');
  
  const handleImportJSON = async () => {
    if (!jsonContent.trim()) {
      Alert.alert('Error', 'Please paste JSON content');
      return;
    }
    
    setLoading(true);
    
    try {
      const passageSet = await passageSetLoader.loadFromJSON(jsonContent);
      await passageSetLoader.savePassageSet(passageSet);
      Alert.alert('Success', `Imported: ${passageSet.name}`);
      onImportComplete(passageSet);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to import');
    } finally {
      setLoading(false);
    }
  };
  
  const handleImportDCS = async () => {
    if (!dcsOwner.trim() || !dcsRepo.trim()) {
      Alert.alert('Error', 'Please enter owner and repository');
      return;
    }
    
    setLoading(true);
    
    try {
      const repoParams: DCSRepoParams = {
        server: dcsServer,
        owner: dcsOwner.trim(),
        repo: dcsRepo.trim(),
        path: dcsPath.trim() || 'passage-set.json'
      };
      
      const passageSet = await passageSetLoader.loadFromDCS(repoParams);
      await passageSetLoader.savePassageSet(passageSet);
      Alert.alert('Success', `Imported: ${passageSet.name}`);
      onImportComplete(passageSet);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to import from DCS');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Import Passage Set</Text>
        {onCancel && (
          <Pressable onPress={onCancel} style={styles.closeButton}>
            <Icon name="x" size={20} color="#6b7280" />
          </Pressable>
        )}
      </View>
      
      {/* Import Method Selector */}
      <View style={styles.methodSelector}>
        <Pressable
          style={[styles.methodButton, importMethod === 'json' && styles.methodButtonActive]}
          onPress={() => setImportMethod('json')}
        >
          <Icon name="file-text" size={16} color={importMethod === 'json' ? '#3b82f6' : '#6b7280'} />
          <Text style={[styles.methodText, importMethod === 'json' && styles.methodTextActive]}>
            JSON File
          </Text>
        </Pressable>
        
        <Pressable
          style={[styles.methodButton, importMethod === 'dcs' && styles.methodButtonActive]}
          onPress={() => setImportMethod('dcs')}
        >
          <Icon name="git-branch" size={16} color={importMethod === 'dcs' ? '#3b82f6' : '#6b7280'} />
          <Text style={[styles.methodText, importMethod === 'dcs' && styles.methodTextActive]}>
            DCS Repository
          </Text>
        </Pressable>
      </View>
      
      {/* Import Form */}
      <ScrollView style={styles.content}>
        {importMethod === 'json' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Paste JSON Content</Text>
            <TextInput
              style={styles.textArea}
              value={jsonContent}
              onChangeText={setJsonContent}
              placeholder='{"id": "my-passage-set", "name": "My Set", ...}'
              multiline
              numberOfLines={15}
              placeholderTextColor="#9ca3af"
            />
            
            <View style={styles.helpBox}>
              <Icon name="info" size={14} color="#3b82f6" />
              <Text style={styles.helpText}>
                Paste the content of a passage set JSON file here, or use file picker on native platforms.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>DCS Repository Details</Text>
            
            <TextInput
              style={styles.input}
              value={dcsServer}
              onChangeText={setDcsServer}
              placeholder="git.door43.org"
              placeholderTextColor="#9ca3af"
            />
            
            <TextInput
              style={styles.input}
              value={dcsOwner}
              onChangeText={setDcsOwner}
              placeholder="Repository owner (e.g., unfoldingWord)"
              placeholderTextColor="#9ca3af"
            />
            
            <TextInput
              style={styles.input}
              value={dcsRepo}
              onChangeText={setDcsRepo}
              placeholder="Repository name (e.g., en_passage_sets)"
              placeholderTextColor="#9ca3af"
            />
            
            <TextInput
              style={styles.input}
              value={dcsPath}
              onChangeText={setDcsPath}
              placeholder="File path (e.g., passage-set.json)"
              placeholderTextColor="#9ca3af"
            />
            
            <View style={styles.helpBox}>
              <Icon name="info" size={14} color="#3b82f6" />
              <Text style={styles.helpText}>
                Enter the DCS repository details. The passage set will be loaded from the specified file.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
      
      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {onCancel && (
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        )}
        
        <Pressable
          style={[styles.importActionButton, loading && styles.buttonDisabled]}
          onPress={importMethod === 'json' ? handleImportJSON : handleImportDCS}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Icon name="download" size={16} color="#ffffff" />
          )}
          <Text style={styles.importActionText}>
            {loading ? 'Importing...' : 'Import'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    marginBottom: 24,
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  methodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  methodTextActive: {
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 12,
    color: '#111827',
    fontFamily: 'monospace',
    minHeight: 200,
    textAlignVertical: 'top',
  },
  helpBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    marginTop: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 16,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  importActionButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  importActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});



