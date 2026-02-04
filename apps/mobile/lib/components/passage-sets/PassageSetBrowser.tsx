/**
 * Passage Set Browser
 * 
 * Browse and select passage sets (reading plans, curricula, etc.)
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { PassageSet } from '../../types/passage-sets';
import { PackageStorageAdapter } from '../../types/resource-package';
import { Icon } from '../ui/Icon.native';

interface PassageSetBrowserProps {
  storageAdapter: PackageStorageAdapter;
  onSelectSet: (set: PassageSet) => void;
  onImport?: () => void;
}

export function PassageSetBrowser({
  storageAdapter,
  onSelectSet,
  onImport
}: PassageSetBrowserProps) {
  const [loading, setLoading] = useState(true);
  const [passageSets, setPassageSets] = useState<PassageSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    loadPassageSets();
  }, []);
  
  const loadPassageSets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const sets = await storageAdapter.getAllPassageSets();
      setPassageSets(sets);
    } catch (err) {
      console.error('Failed to load passage sets:', err);
      setError('Failed to load passage sets');
    } finally {
      setLoading(false);
    }
  };
  
  const getPassageCount = (set: PassageSet): number => {
    return set.metadata?.passageCount || 0;
  };
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading passage sets...</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color="#dc2626" />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadPassageSets}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Passage Sets</Text>
        <Text style={styles.subtitle}>Select a reading plan or curriculum</Text>
      </View>
      
      <ScrollView style={styles.content}>
        {passageSets.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="book-open" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No passage sets available</Text>
            <Text style={styles.emptySubtext}>Import a passage set to get started</Text>
            
            {onImport && (
              <Pressable style={styles.importButton} onPress={onImport}>
                <Icon name="upload" size={16} color="#3b82f6" />
                <Text style={styles.importButtonText}>Import Passage Set</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {passageSets.map(set => (
              <Pressable
                key={set.id}
                style={styles.setCard}
                onPress={() => onSelectSet(set)}
              >
                <View style={styles.setIcon}>
                  <Icon name="book-open" size={24} color="#3b82f6" />
                </View>
                
                <View style={styles.setInfo}>
                  <Text style={styles.setName}>{set.name}</Text>
                  {set.description && (
                    <Text style={styles.setDescription} numberOfLines={2}>
                      {set.description}
                    </Text>
                  )}
                  
                  <View style={styles.setMeta}>
                    <View style={styles.metaItem}>
                      <Icon name="list" size={12} color="#6b7280" />
                      <Text style={styles.metaText}>
                        {getPassageCount(set)} passages
                      </Text>
                    </View>
                    {set.metadata?.category && (
                      <View style={styles.metaItem}>
                        <Icon name="tag" size={12} color="#6b7280" />
                        <Text style={styles.metaText}>{set.metadata.category}</Text>
                      </View>
                    )}
                  </View>
                </View>
                
                <Icon name="chevron-right" size={20} color="#9ca3af" />
              </Pressable>
            ))}
            
            {onImport && (
              <Pressable style={styles.importButtonAlt} onPress={onImport}>
                <Icon name="plus" size={16} color="#3b82f6" />
                <Text style={styles.importButtonAltText}>Import More Sets</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
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
    padding: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 24,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  setIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setInfo: {
    flex: 1,
  },
  setName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  setDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  setMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  importButtonAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  importButtonAltText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});



