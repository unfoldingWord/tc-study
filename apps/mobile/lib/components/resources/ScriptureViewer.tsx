/**
 * Scripture Viewer Component - React Native Version
 * Displays OptimizedScripture content with chapters, verses, and paragraphs
 */

import { useCurrentState, useResourceAPI } from 'linked-panels';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { OptimizedScripture } from '../../services/usfm-processor';
import { NotesTokenGroupsBroadcast, ScriptureTokensBroadcast } from '../../types/scripture-messages';
import { TTSWordBoundary } from '../../types/tts';
import { extractTokensFromVerseRange } from '../../utils/scripture-token-utils';
import { Icon } from '../ui/Icon.native';
import { ScriptureSkeleton } from '../ui/ScriptureSkeleton';
import { TTSControl } from '../ui/TTSControl';
import { USFMRenderer } from './USFMRenderer';

export interface ScriptureViewerProps {
  scripture?: OptimizedScripture;
  loading?: boolean;
  error?: string;
  currentChapter?: number;
  onChapterChange?: (chapter: number) => void;
  resourceId?: string; // ID to identify which resource this viewer should display
  scrollViewRef?: React.RefObject<any>; // ScrollView ref for scroll-to-highlight functionality
}

export function ScriptureViewer({ 
  scripture, 
  loading = false, 
  error, 
  currentChapter = 1,
  onChapterChange,
  resourceId,
  scrollViewRef
}: ScriptureViewerProps) {
  
  // Get current navigation reference and initialization state
  const { currentReference, isInitialized } = useNavigation();
  
  // Access workspace context to get resource manager and adapters
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
  
  // Get linked-panels API for broadcasting tokens (only if resourceId is provided)
  const linkedPanelsAPI = useResourceAPI<ScriptureTokensBroadcast>(resourceId || 'default');
  
  // Generate unique controlId based on available context
  const generateControlId = useCallback(() => {
    if (!resourceId) return 'scripture-viewer-default';
    
    // Get resource configuration for additional context
    const resourceConfig = processedResourceConfig?.find((config: any) => 
      config.panelResourceId === resourceId
    );
    
    // Build a unique identifier using available context
    const parts = ['scripture-viewer'];
    
    // Add resource ID
    parts.push(resourceId);
    
    // Add resource type if available
    if (resourceConfig?.metadata?.type) {
      parts.push(resourceConfig.metadata.type);
    }
    
    // Add language if available
    if (resourceConfig?.metadata?.language) {
      parts.push(resourceConfig.metadata.language);
    }
    
    // Add server/owner if available for global resources
    if (resourceConfig?.metadata?.server) {
      parts.push(resourceConfig.metadata.server.split('.')[0]); // Just the domain name
    }
    
    return parts.join('-');
  }, [resourceId, processedResourceConfig]); // Include full object for proper dependency tracking
  
  const controlId = generateControlId();
  
  // Use ref to avoid dependency issues
  const linkedPanelsAPIRef = useRef(linkedPanelsAPI);
  linkedPanelsAPIRef.current = linkedPanelsAPI;
  
  // State for actual scripture content
  const [actualScripture, setActualScripture] = useState<OptimizedScripture | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [resourceMetadata, setResourceMetadata] = useState<any>(null);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [lastLoadedContentKey, setLastLoadedContentKey] = useState<string | null>(null);
  
  // State for TTS word highlighting
  const [currentTTSWord, setCurrentTTSWord] = useState<TTSWordBoundary | null>(null);

  // Extract text content for TTS from current scripture display
  const ttsText = useMemo(() => {
    const displayScripture = scripture || actualScripture;
    if (!displayScripture?.chapters) return '';
    
    try {
      // Get the current chapter content
      const chapterNumber = currentReference.chapter;
      if (!chapterNumber) return '';
      
      // Find the chapter in the chapters array
      const currentChapterData = displayScripture.chapters.find(ch => ch.number === chapterNumber);
      if (!currentChapterData) return '';
      
      // If we have a specific verse range, extract just that
      if (currentReference.verse) {
        const startVerse = currentReference.verse;
        const endVerse = currentReference.endVerse || startVerse;
        
        let text = '';
        for (let v = startVerse; v <= endVerse; v++) {
          const verseData = currentChapterData.verses?.find(verse => verse.number === v);
          if (verseData?.text) {
            text += verseData.text + ' ';
          }
        }
        return text.trim();
      } else {
        // Extract all verses from the chapter
        return currentChapterData.verses
          ?.map(verse => verse.text || '')
          .join(' ')
          .trim() || '';
      }
    } catch (error) {
      console.warn('Failed to extract TTS text:', error);
      return '';
    }
  }, [scripture, actualScripture, currentReference]);
  
  // TTS word boundary callback for word-by-word highlighting
  const handleTTSWordBoundary = useCallback((wordBoundary: TTSWordBoundary) => {
    
    // Clear highlighting if word is empty (indicates pause/stop/end)
    if (!wordBoundary.word || wordBoundary.word.trim() === '') {
      setCurrentTTSWord(null);
    } else {
      setCurrentTTSWord(wordBoundary);
    }
  }, []);
  
  // Clear TTS highlighting when TTS stops or pauses
  const handleTTSStateChange = useCallback((isPlaying: boolean) => {
    if (!isPlaying) {
      
      setCurrentTTSWord(null);
    }
  }, []);
  
  // Listen for notes token groups broadcasts using the plugin system
  // Note: NotesTokenGroupsBroadcast is handled by USFMRenderer via TokenUnderliningContext
  // const notesTokenGroupsBroadcast = useCurrentState<NotesTokenGroupsBroadcast>(
  //   resourceId || 'default',
  //   'current-notes-token-groups'
  // );
  
  // Use actual loaded content if available, otherwise fall back to prop
  const displayScripture = useMemo(() => actualScripture || scripture, [actualScripture, scripture]);
  
  // Improved loading state logic to prevent flashing
  const isLoading = useMemo(() => {
    // Always show loading if explicitly set via props
    if (loading) return true;
    
    // Show loading if we're actively loading content
    if (contentLoading) return true;
    
    // Only show loading if we don't have content AND we have all the required dependencies
    // This prevents showing loading when we already have the right content
    if (!hasInitiallyLoaded && resourceManager && currentReference.book && resourceId && isInitialized) {
      return true;
    }
    
    return false;
  }, [loading, contentLoading, hasInitiallyLoaded, resourceManager, currentReference.book, resourceId, isInitialized]);
  const displayError = error || contentError;
  

  
  // Load actual content when component mounts or navigation changes
  useEffect(() => {
    // Check basic dependencies
    if (!resourceManager || !currentReference.book || !resourceId) {

      return;
    }
    
    // Only wait for initialization on the first load (when hasInitiallyLoaded is false)
    if (!hasInitiallyLoaded && !isInitialized) {
      
      return;
    }
    
    // Check if we already have the right content loaded
    const resourceConfig = processedResourceConfig?.find((config: any) => 
      config.panelResourceId === resourceId
    );
    
    if (resourceConfig && hasInitiallyLoaded && actualScripture) {
      const expectedContentKey = `${resourceConfig.metadata.server}/${resourceConfig.metadata.owner}/${resourceConfig.metadata.language}/${resourceConfig.metadata.id}/${currentReference.book}`;
      
      if (lastLoadedContentKey === expectedContentKey) {
        
        return;
      }
    }
    
    
    
    const loadContent = async () => {
      try {
        // Set loading state immediately to prevent flashing
        setContentLoading(true);
        setContentError(null);
        
        // Only clear content if we don't have the right content already
        // Check if we need to load new content by comparing the expected content key
        const resourceConfig = processedResourceConfig?.find((config: any) => 
          config.panelResourceId === resourceId
        );
        
        if (resourceConfig) {
          // Only clear if we don't have content or if the content key has changed
          if (!actualScripture || !hasInitiallyLoaded) {
            setActualScripture(null);
            setHasInitiallyLoaded(false);
          }
        } else {
          // Fallback: clear content if no resource config
          setActualScripture(null);
          setHasInitiallyLoaded(false);
        }
        
        // Use the resource config we already found
        if (!resourceConfig) {
          throw new Error(`Resource configuration not found for ${resourceId}`);
        }
        
        // Construct the full content key in the same format as WorkspaceContext
        const contentKey = `${resourceConfig.metadata.server}/${resourceConfig.metadata.owner}/${resourceConfig.metadata.language}/${resourceConfig.metadata.id}/${currentReference.book}`;
        
        // Try to get content using the resource manager
        
        
        
        const content = await resourceManager.getOrFetchContent(
          contentKey, // Full key format: server/owner/language/resourceId/book
          resourceConfig.metadata.type as any // Resource type from metadata
        );
        
             
        
        setActualScripture(content as OptimizedScripture); // Optimized format
        
        // Use existing metadata from resource config for language direction
        setResourceMetadata(resourceConfig.metadata);
        setHasInitiallyLoaded(true);
        setLastLoadedContentKey(contentKey); // Track what content we loaded
        
        
      } catch (err) {
        console.error(`❌ ScriptureViewer - Failed to load content for ${resourceId}:`, err);
        setContentError(err instanceof Error ? err.message : 'Failed to load content');
        setHasInitiallyLoaded(true); // Mark as loaded even on error to prevent infinite loading
      } finally {
        setContentLoading(false);
      }
    };
    
    loadContent();
  }, [
    resourceManager, 
    currentReference, // Include full object for proper dependency tracking
    resourceId, 
    processedResourceConfig, // Include full object for proper dependency tracking
    isInitialized, 
    hasInitiallyLoaded,
    lastLoadedContentKey,
    actualScripture
  ]);
  
  // Listen for notes token groups broadcasts and respond with scripture tokens
  const notesTokenGroupsBroadcast = useCurrentState<NotesTokenGroupsBroadcast>(
    resourceId || 'default',
    'current-notes-token-groups'
  );

  // Reactive scripture token broadcasting - only when notes request them
  useEffect(() => {
    // Only respond to notes broadcasts that have token groups (not cleanup messages)
    if (
      !notesTokenGroupsBroadcast ||
      !notesTokenGroupsBroadcast.tokenGroups ||
      notesTokenGroupsBroadcast.tokenGroups.length === 0 ||
      !linkedPanelsAPIRef.current?.messaging ||
      !resourceId ||
      !displayScripture ||
      !currentReference.book ||
      !resourceMetadata
    ) {
  
      return;
    }

    // Check if the notes broadcast is for the current book - ignore stale broadcasts
    const currentBook = currentReference?.book;
    const broadcastBook = notesTokenGroupsBroadcast.reference?.book;
    
    if (currentBook && broadcastBook && currentBook !== broadcastBook) {
      
      return;
    }

    

    // Debounce to prevent excessive broadcasts during rapid changes
    const timeoutId = setTimeout(() => {
      try {
        // Extract tokens from the current verse range
        const tokens = extractTokensFromVerseRange(displayScripture, {
          book: currentReference.book,
          chapter: currentReference.chapter || 1,
          verse: currentReference.verse || 1,
          endChapter: currentReference.endChapter,
          endVerse: currentReference.endVerse
        });

        // Create the broadcast message
        const broadcast: ScriptureTokensBroadcast = {
          type: 'scripture-tokens-broadcast',
          lifecycle: 'state',
          stateKey: 'current-scripture-tokens',
          sourceResourceId: resourceId,
          reference: {
            book: currentReference.book,
            chapter: currentReference.chapter || 1,
            verse: currentReference.verse || 1,
            endChapter: currentReference.endChapter,
            endVerse: currentReference.endVerse
          },
          tokens,
          resourceMetadata: {
            id: resourceMetadata?.id || resourceId,
            language: resourceMetadata?.language || 'en',
            languageDirection: resourceMetadata?.languageDirection,
            type: resourceMetadata?.type || 'scripture'
          },
          timestamp: Date.now()
        };

        // Send to the requesting notes resource specifically
        const targetResourceId = notesTokenGroupsBroadcast.sourceResourceId;
        
        
        
        if (linkedPanelsAPIRef.current.messaging.send(targetResourceId, broadcast)) {
          
        } else {
          console.warn(`❌ Failed to send reactive broadcast to ${targetResourceId} - send returned false`);
        }

      } catch (err) {
        console.error('❌ Failed to send reactive scripture token broadcast:', err);
      }
    }, 100); // Shorter debounce for reactive responses

    return () => clearTimeout(timeoutId);
  }, [
    notesTokenGroupsBroadcast,
    resourceId, 
    currentReference.book,
    currentReference.chapter,
    currentReference.verse,
    currentReference.endChapter,
    currentReference.endVerse,
    displayScripture,
    resourceMetadata
  ]);

  // Note: No cleanup needed for reactive broadcasting since we only respond to requests
  
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
  
  // Loading state - show skeleton instead of spinner
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScriptureSkeleton verseCount={8} />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <View style={styles.errorIcon}>
            <Icon name="warning" size={16} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>Failed to Load Scripture</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      </View>
    );
  }

  // No scripture data - only show when we're sure there's no content and not loading
  if (!displayScripture && !isLoading && hasInitiallyLoaded) {
    return (
      <View style={styles.noDataContainer}>
        <View style={styles.noDataContent}>
          <View style={styles.noDataIcon}>
            <Icon name="book-open" size={16} color="#6b7280" />
          </View>
          <Text style={styles.noDataMessage}>No scripture content available</Text>
          
          {/* Resource Information Display */}
          <View style={styles.resourceInfoContainer}>
            <View style={styles.resourceInfoItem}>
              <Text style={styles.resourceInfoLabel}>Resource ID:</Text>
              <Text style={styles.resourceInfoValue}>{resourceId || 'Not specified'}</Text>
            </View>
            
            <View style={styles.resourceInfoItem}>
              <Text style={styles.resourceInfoLabel}>Resource Manager:</Text>
              <Text style={styles.resourceInfoValue}>{resourceManager ? '✅ Available' : '❌ Not available'}</Text>
            </View>
            
            <View style={styles.resourceInfoItem}>
              <Text style={styles.resourceInfoLabel}>Config:</Text>
              <Text style={styles.resourceInfoValue}>{processedResourceConfig ? '✅ Available' : '❌ Not available'}</Text>
            </View>
            
            {displayError && (
              <View style={styles.errorInfoItem}>
                <Text style={styles.errorInfoLabel}>Error:</Text>
                <Text style={styles.errorInfoValue}>{displayError}</Text>
              </View>
            )}
          </View>
          
          {/* Navigation Reference Display for testing */}
          <View style={styles.navigationInfo}>
            <View style={styles.navigationContent}>
              <Icon name="search" size={14} color="#1e40af" />
              <Text style={styles.navigationText}> Navigation: {formatNavigationRange()}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }


  return (
    <View style={styles.container}>
      {/* Floating TTS Control - positioned absolutely in top-right corner */}
      {ttsText && (
        <View style={styles.ttsContainer}>
          <TTSControl
            text={ttsText}
            compact={true}
            title={`Read ${formatNavigationRange()} aloud`}
            className="shadow-sm"
            controlId={controlId}
            onWordBoundary={handleTTSWordBoundary}
            onStateChange={handleTTSStateChange}
          />
        </View>
      )}
      {/* Debug: Show TTS text status */}
      {(() => {

        return null;
      })()}

      {/* Scripture Content using USFMRenderer */}
      <View style={styles.contentContainer}>
        <View style={styles.contentWrapper}>
          {displayScripture && (
            <View 
              style={[
                styles.scriptureContent,
                // Apply RTL styling based on metadata or fallback to language detection
                resourceMetadata?.languageDirection === 'rtl'
                  ? styles.rtlContent 
                  : styles.ltrContent
              ]}
            >
              <USFMRenderer
                scripture={displayScripture}
                resourceId={resourceId || 'unknown-resource'}
                resourceType={getResourceType(resourceMetadata?.id)}
                language={getLanguageCode(resourceMetadata?.language)}
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
                scrollViewRef={scrollViewRef}
                showAlignments={false}
                className="scripture-content"
                currentTTSWord={currentTTSWord}
                ttsText={ttsText}
              />
            </View>
          )}
        </View>
      </View>

      
    </View>
  );
}

/**
 * Helper function to map resource ID to resource type
 */
function getResourceType(resourceId?: string): 'ULT' | 'UST' | 'UGNT' | 'UHB' {
  if (!resourceId) return 'ULT'; // Default fallback
  
  const id = resourceId.toLowerCase();
  if (id.includes('ult')) return 'ULT';
  if (id.includes('ust')) return 'UST';
  if (id.includes('ugnt')) return 'UGNT';
  if (id.includes('uhb')) return 'UHB';
  
  // Default fallback
  return 'ULT';
}

/**
 * Helper function to map language to language code
 */
function getLanguageCode(language?: string): 'en' | 'el-x-koine' | 'hbo' {
  if (!language) return 'en'; // Default fallback
  
  const lang = language.toLowerCase();
  if (lang.includes('el-x-koine') || lang.includes('greek')) return 'el-x-koine';
  if (lang.includes('hbo') || lang.includes('hebrew')) return 'hbo';
  
  // Default to English for most cases
  return 'en';
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
  resourceInfo: {
    color: '#6b7280', // text-gray-500
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  additionalInfo: {
    marginTop: 12,
  },
  additionalInfoText: {
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
    backgroundColor: '#f3f4f6', // bg-gray-100
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  resourceInfoLabel: {
    fontWeight: '600',
    color: '#374151', // text-gray-700
    fontSize: 14,
  },
  resourceInfoValue: {
    color: '#374151', // text-gray-700
    fontSize: 14,
    marginTop: 2,
  },
  errorInfoItem: {
    backgroundColor: '#fee2e2', // bg-red-100
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorInfoLabel: {
    fontWeight: '600',
    color: '#b91c1c', // text-red-700
    fontSize: 14,
  },
  errorInfoValue: {
    color: '#b91c1c', // text-red-700
    fontSize: 14,
    marginTop: 2,
  },
  navigationInfo: {
    marginTop: 16,
    backgroundColor: '#dbeafe', // bg-blue-100
    borderRadius: 8,
    padding: 12,
    alignSelf: 'flex-start',
  },
  navigationContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
    position: 'relative',
  },
  ttsContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  contentContainer: {
    flex: 1,
    minHeight: 0,
  },
  contentWrapper: {
    padding: 16,
    maxWidth: 896, // max-w-4xl equivalent
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