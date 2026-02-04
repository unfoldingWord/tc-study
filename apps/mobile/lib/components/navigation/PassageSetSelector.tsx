/**
 * Passage Set Selector Component for React Native
 * 
 * Provides a hierarchical navigation interface for passage sets with:
 * - Expandable/collapsible groups
 * - Search functionality
 * - Passage selection with metadata display
 * - Loading and error states
 */

import React, { useCallback, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import {
    Passage,
    PassageGroup,
    PassageLeaf,
    PassageSet,
    PassageSetNode
} from '../../types/passage-sets';
import { Icon } from '../ui/Icon.native';

interface PassageSetSelectorProps {
  passageSet: PassageSet | null;
  error: string | null;
  onPassageSelect: (passage: Passage) => void;
  getBookInfo?: (bookCode: string) => { name: string; code: string } | null;
}

export function PassageSetSelector({ 
  passageSet, 
  error, 
  onPassageSelect,
  getBookInfo 
}: PassageSetSelectorProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(groupId)) {
        newExpanded.delete(groupId);
      } else {
        newExpanded.add(groupId);
      }
      return newExpanded;
    });
  }, []);

  // Helper function to check if a node matches the search term
  const nodeMatchesSearch = useCallback((node: PassageSetNode): boolean => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    
    if (node.type === 'group') {
      const group = node as PassageGroup;
      // Check if group label or description matches
      if (group.label.toLowerCase().includes(searchLower) ||
          group.description?.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Check if any child matches
      return group.children.some(child => nodeMatchesSearch(child));
    } else {
      const leaf = node as PassageLeaf;
      // Check if leaf label matches
      if (leaf.label.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Check if any passage matches
      return leaf.passages.some(passage => {
        const bookInfo = getBookInfo?.(passage.bookCode);
        const bookName = bookInfo?.name || passage.bookCode;
        
        return passage.label?.toLowerCase().includes(searchLower) ||
               passage.metadata?.title?.toLowerCase().includes(searchLower) ||
               passage.bookCode.toLowerCase().includes(searchLower) ||
               bookName.toLowerCase().includes(searchLower);
      });
    }
  }, [searchTerm, getBookInfo]);

  const renderPassageSetNode = useCallback((node: PassageSetNode, depth = 0): React.ReactNode => {
    // Filter out nodes that don't match the search
    if (!nodeMatchesSearch(node)) {
      return null;
    }

    const indentStyle = depth > 0 ? { marginLeft: depth * 16 } : {};
    
    if (node.type === 'group') {
      const group = node as PassageGroup;
      // Auto-expand groups when searching to show matching results
      const isExpanded = searchTerm ? true : expandedGroups.has(group.id);
      
      return (
        <View key={group.id} style={[styles.nodeContainer, indentStyle]}>
          <Pressable
            onPress={() => toggleGroup(group.id)}
            style={styles.groupButton}
          >
            <View style={styles.groupHeader}>
              <Icon 
                name={isExpanded ? "chevron-down" : "chevron-right"} 
                size={16} 
                color="#6b7280" 
              />
              <View style={styles.groupContent}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {group.description && (
                  <Text style={styles.groupDescription}>{group.description}</Text>
                )}
                {group.metadata?.totalVerses && (
                  <Text style={styles.groupMeta}>
                    {group.metadata.totalVerses} verses
                  </Text>
                )}
              </View>
            </View>
            {group.metadata?.difficulty && (
              <View style={styles.difficultyIndicator}>
                {Array.from({ length: 5 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.difficultyDot,
                      i < (group.metadata?.difficulty || 0)
                        ? styles.difficultyDotActive 
                        : styles.difficultyDotInactive
                    ]}
                  />
                ))}
              </View>
            )}
          </Pressable>
          
          {isExpanded && (
            <View style={styles.childrenContainer}>
              {group.children.map(child => renderPassageSetNode(child, depth + 1))}
            </View>
          )}
        </View>
      );
    } else {
      const leaf = node as PassageLeaf;
      
      return (
        <View key={leaf.id} style={[styles.nodeContainer, indentStyle]}>
          <View style={styles.leafContainer}>
            <Text style={styles.leafLabel}>{leaf.label}</Text>
            <View style={styles.passagesContainer}>
              {leaf.passages.map((passage, index) => {
                // Always calculate bookName and bookInfo for use in rendering
                const bookInfo = getBookInfo?.(passage.bookCode);
                const bookName = bookInfo?.name || passage.bookCode;
                
                // If there's a search term, only show passages that match
                if (searchTerm) {
                  const searchLower = searchTerm.toLowerCase();
                  
                  const passageMatches = passage.label?.toLowerCase().includes(searchLower) ||
                                       passage.metadata?.title?.toLowerCase().includes(searchLower) ||
                                       passage.bookCode.toLowerCase().includes(searchLower) ||
                                       bookName.toLowerCase().includes(searchLower);
                  
                  if (!passageMatches) {
                    return null;
                  }
                }

                const refString = typeof passage.ref === 'string' 
                  ? passage.ref 
                  : `${passage.ref.startChapter}:${passage.ref.startVerse}${
                      passage.ref.endVerse ? `-${passage.ref.endVerse}` : ''
                    }${passage.ref.endChapter && passage.ref.endChapter !== passage.ref.startChapter 
                      ? `-${passage.ref.endChapter}:${passage.ref.endVerse}` : ''}`;

                return (
                  <Pressable
                    key={`${leaf.id}-${index}`}
                    onPress={() => onPassageSelect(passage)}
                    style={styles.passageButton}
                  >
                    <View style={styles.passageContent}>
                      <View style={styles.passageHeader}>
                        <View style={styles.passageRef}>
                          <Text style={styles.passageRefText}>
                            {passage.bookCode.toUpperCase()} {refString}
                          </Text>
                        </View>
                        {passage.metadata?.difficulty && (
                          <View style={styles.passageDifficulty}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <View
                                key={i}
                                style={[
                                  styles.passageDifficultyDot,
                                  i < (passage.metadata?.difficulty || 0)
                                    ? styles.passageDifficultyDotActive 
                                    : styles.passageDifficultyDotInactive
                                ]}
                              />
                            ))}
                          </View>
                        )}
                      </View>
                      <Text style={styles.passageTitle}>
                        {passage.metadata?.title || passage.label}
                      </Text>
                      {passage.metadata?.theme && (
                        <Text style={styles.passageTheme}>
                          Theme: {passage.metadata.theme}
                        </Text>
                      )}
                    </View>
                    {passage.metadata?.estimatedTime && (
                      <Text style={styles.passageTime}>
                        ~{passage.metadata.estimatedTime}min
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      );
    }
  }, [expandedGroups, searchTerm, nodeMatchesSearch, toggleGroup, onPassageSelect, getBookInfo]);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={24} color="#dc2626" />
        <Text style={styles.errorText}>Failed to load passage sets</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (!passageSet) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingSpinner}>⟳</Text>
        <Text style={styles.loadingText}>Loading passage sets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon 
          name="search" 
          size={16} 
          color="#6b7280"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search passages..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholderTextColor="#9ca3af"
        />
      </View>

      {/* Passage Set Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>{passageSet.name}</Text>
        {passageSet.description && (
          <Text style={styles.infoDescription}>{passageSet.description}</Text>
        )}
        {passageSet.metadata && (
          <View style={styles.infoMeta}>
            {passageSet.metadata.passageCount && (
              <Text style={styles.infoMetaText}>
                {passageSet.metadata.passageCount} passages
              </Text>
            )}
            {passageSet.metadata.totalTime && (
              <Text style={styles.infoMetaText}>
                ~{passageSet.metadata.totalTime}min total
              </Text>
            )}
            {passageSet.metadata.difficulty && (
              <View style={styles.infoDifficulty}>
                <Text style={styles.infoMetaText}>Difficulty:</Text>
                {Array.from({ length: 5 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.infoDifficultyDot,
                      i < (passageSet.metadata?.difficulty || 0)
                        ? styles.infoDifficultyDotActive 
                        : styles.infoDifficultyDotInactive
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Passage Set Navigation */}
      <ScrollView style={styles.navigationContainer}>
        {passageSet.root.map(node => renderPassageSetNode(node))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  infoContainer: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    color: '#1d4ed8',
    marginBottom: 8,
  },
  infoMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoMetaText: {
    fontSize: 12,
    color: '#1e40af',
  },
  infoDifficulty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoDifficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  infoDifficultyDotActive: {
    backgroundColor: '#1e40af',
  },
  infoDifficultyDotInactive: {
    backgroundColor: '#93c5fd',
  },
  navigationContainer: {
    flex: 1,
  },
  nodeContainer: {
    marginBottom: 8,
  },
  groupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupContent: {
    marginLeft: 8,
    flex: 1,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  groupDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  groupMeta: {
    fontSize: 12,
    color: '#3b82f6',
  },
  difficultyIndicator: {
    flexDirection: 'row',
    gap: 2,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyDotActive: {
    backgroundColor: '#f59e0b',
  },
  difficultyDotInactive: {
    backgroundColor: '#e5e7eb',
  },
  childrenContainer: {
    marginTop: 8,
    marginLeft: 16,
  },
  leafContainer: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  leafLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  passagesContainer: {
    gap: 8,
  },
  passageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  passageContent: {
    flex: 1,
  },
  passageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  passageRef: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  passageRefText: {
    fontSize: 12,
    color: '#1e40af',
    fontFamily: 'monospace',
  },
  passageDifficulty: {
    flexDirection: 'row',
    gap: 2,
  },
  passageDifficultyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  passageDifficultyDotActive: {
    backgroundColor: '#f59e0b',
  },
  passageDifficultyDotInactive: {
    backgroundColor: '#e5e7eb',
  },
  passageTitle: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 2,
  },
  passageTheme: {
    fontSize: 12,
    color: '#6b7280',
  },
  passageTime: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  loadingSpinner: {
    fontSize: 24,
    color: '#3b82f6',
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#dc2626',
    marginTop: 8,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
