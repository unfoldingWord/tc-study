import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';

export interface TranslationWordsLink {
  reference: string;      // Verse reference (e.g., "1:1")
  id: string;            // Unique link identifier
  tags: string;          // Word categories (kt, names, other)
  origWords: string;     // Original language words
  occurrence: string;    // Which occurrence in verse
  twLink: string;        // Link to Translation Words (rc://*/tw/dict/bible/kt/god)
}

export interface TranslationWordsLinksRendererProps {
  links: TranslationWordsLink[];
  currentReference?: string;
  onLinkPress?: (link: TranslationWordsLink) => void;
  onWordHighlight?: (origWords: string, occurrence: number) => void;
  onTranslationWordPress?: (twLink: string) => void;
  resourceId?: string;
  compact?: boolean;
}

export const TranslationWordsLinksRenderer: React.FC<TranslationWordsLinksRendererProps> = ({
  links,
  currentReference,
  onLinkPress,
  onWordHighlight,
  onTranslationWordPress,
  resourceId = 'translation-words-links',
  compact = false
}) => {
  const [expandedLinks, setExpandedLinks] = useState<Set<string>>(new Set());
  const [selectedLink, setSelectedLink] = useState<TranslationWordsLink | null>(null);
  const [showLinkDetail, setShowLinkDetail] = useState(false);

  // Filter links for current reference if provided
  const filteredLinks = currentReference 
    ? links.filter(link => link.reference === currentReference)
    : links;

  const toggleLinkExpansion = (linkId: string) => {
    const newExpanded = new Set(expandedLinks);
    if (newExpanded.has(linkId)) {
      newExpanded.delete(linkId);
    } else {
      newExpanded.add(linkId);
    }
    setExpandedLinks(newExpanded);
  };

  const handleLinkPress = (link: TranslationWordsLink) => {
    if (onLinkPress) {
      onLinkPress(link);
    }
    
    if (!compact) {
      setSelectedLink(link);
      setShowLinkDetail(true);
    }
  };

  const handleWordPress = (link: TranslationWordsLink) => {
    if (onWordHighlight) {
      onWordHighlight(link.origWords, parseInt(link.occurrence) || 1);
    }
  };

  const handleTranslationWordPress = (twLink: string) => {
    if (onTranslationWordPress) {
      onTranslationWordPress(twLink);
    }
  };

  const parseTWLink = (twLink: string) => {
    // Parse rc://*/tw/dict/bible/kt/god format
    const match = twLink.match(/rc:\/\/\*\/tw\/dict\/bible\/([^\/]+)\/(.+)$/);
    if (match) {
      return {
        category: match[1], // kt, names, other
        term: match[2]      // god, abraham, bread
      };
    }
    return { category: 'unknown', term: twLink };
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'kt': return '#2563eb'; // Blue for key terms
      case 'names': return '#059669'; // Green for names
      case 'other': return '#7c3aed'; // Purple for other terms
      default: return '#64748b'; // Gray for unknown
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'kt': return 'Key Term';
      case 'names': return 'Name';
      case 'other': return 'Other';
      default: return 'Term';
    }
  };

  const renderOriginalWords = (origWords: string) => {
    // Check if it contains Hebrew or Greek characters
    const hasHebrew = /[\u0590-\u05FF]/.test(origWords);
    const hasGreek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(origWords);
    
    return (
      <Text style={[
        styles.originalWord,
        hasHebrew && styles.hebrewText,
        hasGreek && styles.greekText
      ]}>
        {origWords}
      </Text>
    );
  };

  const renderLinkContent = (link: TranslationWordsLink, isExpanded: boolean) => {
    const twInfo = parseTWLink(link.twLink);
    const categoryColor = getCategoryColor(twInfo.category);

    return (
      <View style={styles.linkContent}>
        <View style={styles.linkHeader}>
          <View style={styles.linkHeaderLeft}>
            <Text style={styles.linkReference}>{link.reference}</Text>
            {link.origWords && (
              <Pressable
                style={styles.originalWordButton}
                onPress={() => handleWordPress(link)}
              >
                {renderOriginalWords(link.origWords)}
              </Pressable>
            )}
          </View>
          
          {parseInt(link.occurrence) > 1 && (
            <View style={styles.occurrenceBadge}>
              <Text style={styles.occurrenceText}>{link.occurrence}</Text>
            </View>
          )}
        </View>

        <View style={styles.categoryContainer}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Text style={styles.categoryText}>{getCategoryLabel(twInfo.category)}</Text>
          </View>
        </View>

        <Pressable
          style={styles.translationWordButton}
          onPress={() => handleTranslationWordPress(link.twLink)}
        >
          <Text style={styles.translationWordText}>
            📖 {twInfo.term.replace(/[-_]/g, ' ')}
          </Text>
          <Text style={styles.translationWordSubtext}>
            Tap to view definition
          </Text>
        </Pressable>

        {link.tags && (
          <View style={styles.tagsContainer}>
            <Text style={styles.tagsLabel}>Tags:</Text>
            <Text style={styles.tagsText}>{link.tags}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderLink = (link: TranslationWordsLink, index: number) => {
    const isExpanded = expandedLinks.has(link.id);
    const twInfo = parseTWLink(link.twLink);

    return (
      <Pressable
        key={link.id}
        style={[styles.linkCard, compact && styles.compactLinkCard]}
        onPress={() => handleLinkPress(link)}
      >
        {renderLinkContent(link, isExpanded)}
      </Pressable>
    );
  };

  const renderLinkDetailModal = () => {
    if (!selectedLink) return null;

    const twInfo = parseTWLink(selectedLink.twLink);
    const categoryColor = getCategoryColor(twInfo.category);

    return (
      <Modal
        visible={showLinkDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLinkDetail(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Translation Words Link</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => setShowLinkDetail(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.linkDetailHeader}>
              <Text style={styles.linkDetailReference}>{selectedLink.reference}</Text>
              {selectedLink.origWords && (
                <Pressable
                  style={styles.linkDetailOriginalWord}
                  onPress={() => handleWordPress(selectedLink)}
                >
                  {renderOriginalWords(selectedLink.origWords)}
                </Pressable>
              )}
            </View>

            <View style={styles.linkDetailCategory}>
              <View style={[styles.linkDetailCategoryBadge, { backgroundColor: categoryColor }]}>
                <Text style={styles.linkDetailCategoryText}>{getCategoryLabel(twInfo.category)}</Text>
              </View>
            </View>

            <View style={styles.linkDetailTranslationWord}>
              <Text style={styles.linkDetailTranslationWordLabel}>Translation Word:</Text>
              <Pressable
                style={styles.linkDetailTranslationWordButton}
                onPress={() => handleTranslationWordPress(selectedLink.twLink)}
              >
                <Text style={styles.linkDetailTranslationWordText}>
                  📖 {twInfo.term.replace(/[-_]/g, ' ')}
                </Text>
                <Text style={styles.linkDetailTranslationWordSubtext}>
                  Tap to view full definition
                </Text>
              </Pressable>
            </View>

            {selectedLink.tags && (
              <View style={styles.linkDetailTags}>
                <Text style={styles.linkDetailTagsLabel}>Tags:</Text>
                <Text style={styles.linkDetailTagsText}>{selectedLink.tags}</Text>
              </View>
            )}

            <View style={styles.linkDetailInfo}>
              <Text style={styles.linkDetailInfoLabel}>Link Information:</Text>
              <Text style={styles.linkDetailInfoText}>ID: {selectedLink.id}</Text>
              <Text style={styles.linkDetailInfoText}>Occurrence: {selectedLink.occurrence}</Text>
              <Text style={styles.linkDetailInfoText}>Link: {selectedLink.twLink}</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (filteredLinks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyIcon}>❌</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Translation Words Links</Text>
            <Text style={styles.count}>{filteredLinks.length} links</Text>
          </View>
          
          {filteredLinks.map((link, index) => renderLink(link, index))}
        </View>
      </ScrollView>
      
      {renderLinkDetailModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  count: {
    fontSize: 14,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  linkCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  compactLinkCard: {
    padding: 12,
    marginBottom: 8,
  },
  linkContent: {
    gap: 12,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  linkHeaderLeft: {
    flex: 1,
    gap: 8,
  },
  linkReference: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  originalWordButton: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  originalWord: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0c4a6e',
  },
  hebrewText: {
    fontFamily: 'System', // Hebrew font
    textAlign: 'right',
  },
  greekText: {
    fontFamily: 'System', // Greek font
  },
  occurrenceBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  occurrenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  categoryContainer: {
    flexDirection: 'row',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  translationWordButton: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  translationWordText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  translationWordSubtext: {
    fontSize: 12,
    color: '#065f46',
    fontStyle: 'italic',
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tagsText: {
    fontSize: 12,
    color: '#475569',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 24,
    color: '#9ca3af',
    textAlign: 'center',
    marginVertical: 4,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#64748b',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  linkDetailHeader: {
    marginBottom: 20,
    gap: 12,
  },
  linkDetailReference: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2563eb',
  },
  linkDetailOriginalWord: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  linkDetailCategory: {
    marginBottom: 20,
  },
  linkDetailCategoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  linkDetailCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  linkDetailTranslationWord: {
    marginBottom: 20,
  },
  linkDetailTranslationWordLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  linkDetailTranslationWordButton: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  linkDetailTranslationWordText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  linkDetailTranslationWordSubtext: {
    fontSize: 14,
    color: '#065f46',
    fontStyle: 'italic',
  },
  linkDetailTags: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  linkDetailTagsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  linkDetailTagsText: {
    fontSize: 14,
    color: '#64748b',
  },
  linkDetailInfo: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  linkDetailInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  linkDetailInfoText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});

export default TranslationWordsLinksRenderer;
