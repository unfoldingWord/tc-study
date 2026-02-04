/**
 * Original Scripture Viewer Component - React Native Version
 * 
 * Displays Hebrew Bible (OT) or Greek New Testament (NT) based on current testament.
 * Always loads from unfoldingWord organization with fixed language codes:
 * - Hebrew Bible (OT): hbo_uhb (Ancient Hebrew)
 * - Greek New Testament (NT): el-x-koine_ugnt (Koine Greek)
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { OptimizedScripture } from '../../services/usfm-processor';
import { USFMRenderer } from './USFMRenderer';

export interface OriginalScriptureViewerProps {
  scripture?: OptimizedScripture;
  loading?: boolean;
  error?: string;
  currentChapter?: number;
  onChapterChange?: (chapter: number) => void;
  resourceId?: string; // ID to identify which resource this viewer should display
  scrollViewRef?: React.RefObject<any>; // ScrollView ref for scroll-to-highlight functionality
}

// Testament-specific resource configuration
const ORIGINAL_LANGUAGE_CONFIG = {
  OT: {
    owner: 'unfoldingWord',
    language: 'hbo',
    resourceId: 'uhb',
    repoName: 'hbo_uhb',
    title: 'Hebrew Bible',
    description: 'unfoldingWord® Hebrew Bible (UHB)',
    url: 'https://git.door43.org/unfoldingWord/hbo_uhb'
  },
  NT: {
    owner: 'unfoldingWord', 
    language: 'el-x-koine',
    resourceId: 'ugnt',
    repoName: 'el-x-koine_ugnt',
    title: 'Greek New Testament',
    description: 'unfoldingWord® Greek New Testament (UGNT)',
    url: 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt'
  }
} as const;

export function OriginalScriptureViewer({ 
  scripture, 
  loading = false, 
  error, 
  currentChapter = 1,
  onChapterChange,
  resourceId,
  scrollViewRef
}: OriginalScriptureViewerProps) {
  
  // Get current navigation reference and testament info
  const { currentReference, getBookInfo } = useNavigation();
  const currentBookInfo = getBookInfo(currentReference.book);
  const testament = currentBookInfo?.testament;
  
  // Access workspace context to get resource manager
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  
  // State for actual scripture content
  const [actualScripture, setActualScripture] = useState<OptimizedScripture | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [currentLanguageConfig, setCurrentLanguageConfig] = useState<typeof ORIGINAL_LANGUAGE_CONFIG.OT | typeof ORIGINAL_LANGUAGE_CONFIG.NT | null>(null);
  const [resourceMetadata, setResourceMetadata] = useState<any>(null);
  
  // Use actual loaded content if available, otherwise fall back to prop
  const displayScripture = actualScripture || scripture;
  const isLoading = loading || contentLoading;
  const displayError = error || contentError;
  
  // Debug logging
  
  
  
  
  // Load content when testament or navigation changes
  useEffect(() => {
    if (!resourceManager || !currentReference.book || !testament) {
      
      return;
    }
    
    const loadContent = async () => {
      try {
        setContentLoading(true);
        setContentError(null);
        setActualScripture(null); // Clear previous content
        setLoadingProgress('Determining language...');
        
        // Select configuration based on testament
        const config = ORIGINAL_LANGUAGE_CONFIG[testament];
        setCurrentLanguageConfig(config);
        
        
        setLoadingProgress(`Loading ${config.title}...`);
        
        // Construct content key for the original language resource
        // Format: server/owner/language/resourceId/book
        const contentKey = `git.door43.org/${config.owner}/${config.language}/${config.resourceId}/${currentReference.book}`;
        
        
        setLoadingProgress(`Fetching ${config.resourceId.toUpperCase()} content...`);
        
        // Try to get content using the resource manager
        const content = await resourceManager.getOrFetchContent(
          contentKey,
          'scripture' as any // Resource type
        );
        
        
        setActualScripture(content as OptimizedScripture);
        
        // Set language direction based on the language (Hebrew = RTL, Greek = LTR)
        const mockMetadata = {
          languageDirection: config.language === 'hbo' ? 'rtl' as const : 'ltr' as const,
          languageTitle: config.language === 'hbo' ? 'Hebrew' : 'Greek',
          languageIsGL: false
        };
        
        setResourceMetadata(mockMetadata);
        
      } catch (err) {
        console.error(`❌ OriginalScriptureViewer - Failed to load ${testament} content:`, err);
        setContentError(err instanceof Error ? err.message : `Failed to load ${testament} content`);
      } finally {
        setContentLoading(false);
        setLoadingProgress('');
      }
    };
    
    loadContent();
  }, [resourceManager, currentReference.book, testament]);
  
  // Helper function to format the navigation reference range
  const formatNavigationRange = () => {
    if (!currentReference || !currentReference.chapter || !currentReference.verse) {
      return `No navigation reference`;
    }
    
    const start = `${currentReference.chapter}:${currentReference.verse}`;
    
    if (currentReference.endChapter && currentReference.endVerse) {
      // Handle range display
      if (currentReference.chapter === currentReference.endChapter) {
        // Same chapter: "1:1-6"
        return `${start}-${currentReference.endVerse}`;
      } else {
        // Different chapters: "1:1-2:6"
        return `${start}-${currentReference.endChapter}:${currentReference.endVerse}`;
      }
    }
    
    return start; // Single verse
  };
  
  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#2563eb" style={styles.spinner} />
          <Text style={styles.loadingText}>
            {loadingProgress || 'Loading original language text...'}
          </Text>
          {testament && currentLanguageConfig && (
            <Text style={styles.loadingDetailsText}>
              Book: {currentReference.book}
            </Text>
          )}
          {contentLoading && (
            <View style={styles.loadingSourceInfo}>
              <Text style={styles.loadingSourceText}>
                Loading from {currentLanguageConfig?.url}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Error state
  if (displayError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>⚠️</Text>
          </View>
          <Text style={styles.errorTitle}>Failed to Load Original Text</Text>
          <Text style={styles.errorMessage}>{displayError}</Text>
          {currentLanguageConfig && (
            <View style={styles.errorDetails}>
              <Text style={styles.errorDetailsText}>
                Attempted to load: {currentLanguageConfig.title}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // No testament detected
  if (!testament) {
    return (
      <View style={styles.noTestamentContainer}>
        <View style={styles.noTestamentContent}>
          <View style={styles.noTestamentIcon}>
            <Text style={styles.noTestamentIconText}>🏛️</Text>
          </View>
          <Text style={styles.noTestamentMessage}>Cannot determine testament for current book</Text>
          <View style={styles.noTestamentDetails}>
            <Text style={styles.noTestamentDetailsText}>
              Book: {currentReference.book || 'Not selected'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // No scripture data
  if (!displayScripture && !isLoading) {
    return (
      <View style={styles.noDataContainer}>
        <View style={styles.noDataContent}>
          <View style={styles.noDataIcon}>
            <Text style={styles.noDataIconText}>🏛️</Text>
          </View>
          <Text style={styles.noDataMessage}>No original language content available</Text>
          
          {/* Resource Information Display */}
          <View style={styles.resourceInfoContainer}>
            <View style={styles.resourceInfoItem}>
              <Text style={styles.resourceInfoLabel}>Testament:</Text>
              <Text style={styles.resourceInfoValue}>{testament} ({testament === 'OT' ? 'Hebrew' : 'Greek'})</Text>
            </View>
            
            {currentLanguageConfig && (
              <View style={styles.resourceInfoItem}>
                <Text style={styles.resourceInfoLabel}>Resource:</Text>
                <Text style={styles.resourceInfoValue}>{currentLanguageConfig.title}</Text>
              </View>
            )}
            
            <View style={styles.resourceInfoItem}>
              <Text style={styles.resourceInfoLabel}>Resource Manager:</Text>
              <Text style={styles.resourceInfoValue}>{resourceManager ? '✅ Available' : '❌ Not available'}</Text>
            </View>
          </View>
          
          {/* Navigation Reference Display */}
          <View style={styles.navigationInfo}>
            <Text style={styles.navigationText}>
              📍 Navigation: {formatNavigationRange()}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Scripture Content using USFMRenderer */}
      <View style={styles.contentContainer}>
        <View style={styles.contentWrapper}>
          {displayScripture && (
            <View 
              style={[
                styles.scriptureContent,
                // Apply RTL styling based on metadata or fallback to language detection
                resourceMetadata?.languageDirection === 'rtl' || 
                (currentLanguageConfig?.language === 'hbo') 
                  ? styles.rtlContent 
                  : styles.ltrContent
              ]}
            >
              <USFMRenderer
                scripture={displayScripture}
                resourceId={
                  resourceId || 
                  (currentLanguageConfig?.language === 'hbo' ? 'hebrew-bible-global' : 'greek-nt-global')
                }
                resourceType={currentLanguageConfig?.language === 'hbo' ? 'UHB' : 'UGNT'}
                language={currentLanguageConfig?.language === 'hbo' ? 'hbo' : 'el-x-koine'}
                startRef={
                  currentReference.chapter && currentReference.verse
                    ? { chapter: currentReference.chapter, verse: currentReference.verse }
                    : undefined
                }
                endRef={
                  currentReference.endChapter && currentReference.endVerse
                    ? { chapter: currentReference.endChapter, verse: currentReference.endVerse }
                    : currentReference.chapter && currentReference.verse
                    ? { chapter: currentReference.chapter, verse: currentReference.verse }
                    : undefined
                }
                showVerseNumbers={true}
                showChapterNumbers={true}
                showParagraphs={true}
                showAlignments={false}
                scrollViewRef={scrollViewRef}
                className="original-scripture-content"
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Loading styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  loadingContent: {
    alignItems: 'center',
  },
  spinner: {
    marginBottom: 16,
  },
  loadingText: {
    color: '#4b5563', // text-gray-600
    fontSize: 16,
    textAlign: 'center',
  },
  loadingDetailsText: {
    color: '#6b7280', // text-gray-500
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  loadingSourceInfo: {
    marginTop: 12,
  },
  loadingSourceText: {
    color: '#9ca3af', // text-gray-400
    fontSize: 12,
    textAlign: 'center',
  },
  
  // Error styles
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2', // bg-red-50
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  errorIcon: {
    marginBottom: 8,
  },
  errorIconText: {
    fontSize: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#7f1d1d', // text-red-900
    marginBottom: 8,
  },
  errorMessage: {
    color: '#b91c1c', // text-red-700
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorDetails: {
    backgroundColor: '#f3f4f6', // bg-gray-100
    borderRadius: 6,
    padding: 8,
  },
  errorDetailsText: {
    color: '#6b7280', // text-gray-600
    fontSize: 12,
  },
  
  // No testament styles
  noTestamentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  noTestamentContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  noTestamentIcon: {
    marginBottom: 8,
  },
  noTestamentIconText: {
    fontSize: 20,
  },
  noTestamentMessage: {
    color: '#4b5563', // text-gray-600
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  noTestamentDetails: {
    marginTop: 8,
  },
  noTestamentDetailsText: {
    color: '#6b7280', // text-gray-500
    fontSize: 14,
  },
  
  // No data styles
  noDataContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  noDataContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  noDataIcon: {
    marginBottom: 8,
  },
  noDataIconText: {
    fontSize: 20,
  },
  noDataMessage: {
    color: '#4b5563', // text-gray-600
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  resourceInfoContainer: {
    width: '100%',
  },
  resourceInfoItem: {
    backgroundColor: '#dbeafe', // bg-blue-100
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  resourceInfoLabel: {
    fontWeight: '600',
    color: '#1e40af', // text-blue-800
    fontSize: 14,
  },
  resourceInfoValue: {
    color: '#1e40af', // text-blue-800
    fontSize: 14,
    marginTop: 2,
  },
  navigationInfo: {
    marginTop: 16,
    backgroundColor: '#dbeafe', // bg-blue-100
    borderRadius: 6,
    padding: 12,
    alignSelf: 'flex-start',
  },
  navigationText: {
    color: '#1e40af', // text-blue-800
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Main container styles
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    flex: 1,
    minHeight: 0,
  },
  contentWrapper: {
    padding: 24, // p-6
    maxWidth: 896, // max-w-4xl
    alignSelf: 'center',
    width: '100%',
  },
  scriptureContent: {
    flex: 1,
  },
  rtlContent: {
    // RTL styling will be handled by USFMRenderer
  },
  ltrContent: {
    // LTR styling will be handled by USFMRenderer
  },
});