/**
 * USFM Renderer Component
 * Renders processed USFM data with paragraph-based structure
 * Supports verse ranges, cross-chapter rendering, and alignment display
 */

import { useCurrentState, useMessaging, useResourceAPI } from 'linked-panels';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { TokenUnderliningProvider, useTokenUnderlining, type TokenGroup } from '../../contexts/TokenUnderliningContext';
import { useScrollToHighlightedToken } from '../../hooks/useScrollToHighlightedToken';
import { getCrossPanelCommunicationService, type CrossPanelMessage, type OriginalLanguageToken, type TokenHighlightMessage } from '../../services/cross-panel-communication';
import type { OptimizedScripture, OptimizedToken, OptimizedVerse } from '../../services/usfm-processor';
import type { WordAlignment } from '../../types/context';
import type { NoteSelectionBroadcast, NotesTokenGroupsBroadcast, TokenClickBroadcast, VerseReferenceFilterBroadcast } from '../../types/scripture-messages';
import type { TTSWordBoundary } from '../../types/tts';


/**
 * Check if a token should be highlighted for TTS word-by-word reading
 * Uses position-based matching to handle multiple occurrences of the same word
 */
function shouldHighlightTokenForTTS(
  token: OptimizedToken,
  currentTTSWord: TTSWordBoundary | null,
  ttsText: string | undefined,
  allTokensInOrder?: OptimizedToken[]
): boolean {
  if (!currentTTSWord || !ttsText || !allTokensInOrder) {
    return false;
  }

  // Extract the current word from the TTS text at the character position
  const wordAtPosition = ttsText.substring(
    currentTTSWord.charIndex,
    currentTTSWord.charIndex + currentTTSWord.charLength
  ).trim();

  // Clean the words for comparison
  const cleanTokenText = token.text.toLowerCase().trim().replace(/[.,;:!?'"()[\]{}]/g, '');
  const cleanTTSWord = wordAtPosition.toLowerCase().trim().replace(/[.,;:!?'"()[\]{}]/g, '');
  
  // First check if the words match at all
  if (cleanTokenText !== cleanTTSWord || cleanTokenText.length === 0) {
    return false;
  }

  // Find the expected occurrence of this word based on TTS progress
  const expectedOccurrence = findExpectedWordOccurrence(
    cleanTTSWord,
    currentTTSWord.charIndex,
    ttsText,
    allTokensInOrder
  );

  // Find which occurrence this token represents
  const tokenOccurrence = findTokenOccurrence(token, cleanTTSWord, allTokensInOrder);

  // Only highlight if this token matches the expected occurrence
  return tokenOccurrence === expectedOccurrence;
}

/**
 * Find which occurrence of a word should be highlighted based on TTS character position
 */
function findExpectedWordOccurrence(
  cleanWord: string,
  charIndex: number,
  ttsText: string,
  allTokens: OptimizedToken[]
): number {
  // Build a map of TTS text positions to token occurrences
  let ttsPosition = 0;
  let occurrence = 0;
  
  for (const token of allTokens) {
    const cleanTokenText = token.text.toLowerCase().trim().replace(/[.,;:!?'"()[\]{}]/g, '');
    
    if (cleanTokenText === cleanWord) {
      occurrence++;
      // Check if this token's position in TTS text matches our target
      const tokenStartInTTS = ttsText.toLowerCase().indexOf(cleanTokenText, ttsPosition);
      
      if (tokenStartInTTS !== -1 && tokenStartInTTS <= charIndex && 
          charIndex < tokenStartInTTS + cleanTokenText.length) {
        return occurrence;
      }
      
      // Update position for next search
      if (tokenStartInTTS !== -1) {
        ttsPosition = tokenStartInTTS + cleanTokenText.length;
      }
    } else {
      // Update position based on token text length
      const tokenInTTS = ttsText.toLowerCase().indexOf(token.text.toLowerCase(), ttsPosition);
      if (tokenInTTS !== -1) {
        ttsPosition = tokenInTTS + token.text.length;
      }
    }
  }
  
  return occurrence; // Return the last occurrence if no exact match found
}

/**
 * Find which occurrence number this specific token represents
 */
function findTokenOccurrence(
  targetToken: OptimizedToken,
  cleanWord: string,
  allTokens: OptimizedToken[]
): number {
  let occurrence = 0;
  
  for (const token of allTokens) {
    const cleanTokenText = token.text.toLowerCase().trim().replace(/[.,;:!?'"()[\]{}]/g, '');
    
    if (cleanTokenText === cleanWord) {
      occurrence++;
      if (token.id === targetToken.id) {
        return occurrence;
      }
    }
  }
  
  return occurrence;
}

/**
 * Check if a token should be highlighted based on the highlight target
 */
function shouldHighlightToken(
  token: OptimizedToken,
  highlightTarget: OriginalLanguageToken | null,
  language: 'en' | 'el-x-koine' | 'hbo'
): boolean {
  if (!highlightTarget) {
    return false;
  }

  // For original language panels
  if (language === 'el-x-koine' || language === 'hbo') {
    // Direct semantic ID match
    if (token.id === highlightTarget.semanticId) {
      return true;
    }
    
    // Check aligned semantic IDs for group matches (but skip if it's the same as primary)
    if (highlightTarget.alignedSemanticIds) {
      for (const alignedId of highlightTarget.alignedSemanticIds) {
        if (alignedId !== highlightTarget.semanticId && token.id === alignedId) {
          return true;
        }
      }
    }
  } else {
    // For target language panels, check if this token aligns to the highlight target
    if (token.align) {
      // Check if this token aligns to the original language token
      if (token.align.includes(highlightTarget.semanticId)) {
        return true;
      }
      
      // Check aligned semantic IDs for group matches (but skip if it's the same as primary)
      if (highlightTarget.alignedSemanticIds) {
        for (const alignedId of highlightTarget.alignedSemanticIds) {
          if (alignedId !== highlightTarget.semanticId && token.align.includes(alignedId)) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}


/**
 * Get verses to render based on filters and range - optimized version
 */
function getVersesToRenderOptimized(
  scripture: OptimizedScripture,
  options: {
    chapter?: number;
    verseRange?: { start: number; end: number };
    startRef?: { chapter: number; verse: number };
    endRef?: { chapter: number; verse: number };
  }
): OptimizedVerse[] {
  const { chapter, verseRange, startRef, endRef } = options;
  let versesWithChapter: (OptimizedVerse & { chapterNumber: number })[] = [];

  // Debug: Log what we received
  console.log(`🔬 getVersesToRenderOptimized called with:`, {
    scriptureType: typeof scripture,
    hasChapters: !!scripture?.chapters,
    chaptersType: typeof scripture?.chapters,
    isArray: Array.isArray(scripture?.chapters),
    topLevelKeys: scripture ? Object.keys(scripture).join(', ') : 'scripture is null/undefined',
    options
  });

  // Collect all verses from all chapters with chapter context
  for (const chapterData of scripture.chapters) {
    for (const verse of chapterData.verses) {
      versesWithChapter.push({
        ...verse,
        chapterNumber: chapterData.number
      });
    }
  }


  // Apply filters
  if (chapter) {
    versesWithChapter = versesWithChapter.filter(v => v.chapterNumber === chapter);
  }

  if (verseRange) {
    versesWithChapter = versesWithChapter.filter(v => {
      return v.number >= verseRange.start && v.number <= verseRange.end;
    });
  }

  if (startRef && endRef) {
    versesWithChapter = versesWithChapter.filter(v => {
      const chapterNum = v.chapterNumber;
      const verseNum = v.number;
      
      const isAfterStart = chapterNum > startRef.chapter || 
                          (chapterNum === startRef.chapter && verseNum >= startRef.verse);
      const isBeforeEnd = chapterNum < endRef.chapter || 
                         (chapterNum === endRef.chapter && verseNum <= endRef.verse);
      
      return isAfterStart && isBeforeEnd;
    });
  }

  // Sort by chapter and verse
  const sortedVerses = versesWithChapter.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) {
      return a.chapterNumber - b.chapterNumber;
    }
    return a.number - b.number;
  });


  // Return verses without the added chapterNumber property
  return sortedVerses.map(({ chapterNumber, ...verse }) => verse);
}

export interface USFMRendererProps {
  /** Processed scripture data in optimized format */
  scripture: OptimizedScripture;
  /** Resource identifier for cross-panel communication */
  resourceId: string;
  /** Resource type for alignment logic */
  resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
  /** Language code for alignment logic */
  language: 'en' | 'el-x-koine' | 'hbo';
  /** Filter by specific chapter */
  chapter?: number;
  /** Filter by verse range within chapter */
  verseRange?: { start: number; end: number };
  /** Start reference for cross-chapter ranges */
  startRef?: { chapter: number; verse: number };
  /** End reference for cross-chapter ranges */
  endRef?: { chapter: number; verse: number };
  /** Show verse numbers */
  showVerseNumbers?: boolean;
  /** Show chapter headers */
  showChapterNumbers?: boolean;
  /** Show paragraph structure */
  showParagraphs?: boolean;
  /** Show alignment data */
  showAlignments?: boolean;
  /** Highlight specific words */
  highlightWords?: string[];
  /** Callback when word token is clicked */
  onWordClick?: (word: string, verse: OptimizedVerse, alignment?: WordAlignment) => void;
  /** Callback when word token is clicked (enhanced) */
  onTokenClick?: (token: OptimizedToken, verse: OptimizedVerse) => void;
  /** Custom styling */
  className?: string;
  /** Current TTS word being spoken for highlighting */
  currentTTSWord?: TTSWordBoundary | null;
  /** Full TTS text for word matching */
  ttsText?: string;
  /** ScrollView ref for scroll-to-highlight functionality */
  scrollViewRef?: React.RefObject<any>;
}

// Internal component that uses the context
const USFMRendererInternal: React.FC<USFMRendererProps> = ({
  scripture,
  resourceId,
  resourceType,
  language,
  chapter,
  verseRange,
  startRef,
  endRef,
  showVerseNumbers = true,
  showChapterNumbers = true,
  showParagraphs = true,
  showAlignments = false,
  highlightWords = [],
  onWordClick,
  onTokenClick,
  className = '',
  currentTTSWord,
  ttsText,
  scrollViewRef
}) => {
  // Debug: Log what scripture prop we received
  console.log(`📖 USFMRendererInternal received scripture for ${resourceId}:`, {
    scriptureType: typeof scripture,
    isNull: scripture === null,
    isUndefined: scripture === undefined,
    hasChapters: scripture ? !!scripture.chapters : 'N/A',
    topLevelKeys: scripture ? Object.keys(scripture).join(', ') : 'scripture is null/undefined',
    chapter
  });
  
  const { currentReference } = useNavigation();
  const { addTokenGroup, clearTokenGroups, setActiveGroup, activeGroupId } = useTokenUnderlining();
  
  // Linked-panels API for broadcasting token clicks
  const linkedPanelsAPI = useResourceAPI(resourceId || 'default');
  
  // Use ref to avoid dependency issues
  const linkedPanelsAPIRef = useRef(linkedPanelsAPI);
  linkedPanelsAPIRef.current = linkedPanelsAPI;
  
  // Refs for scroll-into-view functionality
  const highlightedTokenRefs = useRef<Map<string, any>>(new Map());
  const activeTokenRefs = useRef<Map<string, any>>(new Map());
  
  // Store token positions for scrolling (keeping for fallback, but will use measure() instead)
  const tokenPositions = useRef<Map<string, { y: number; height: number }>>(new Map());

  // Listen for notes token groups broadcasts
  const notesTokenGroupsBroadcast = useCurrentState<NotesTokenGroupsBroadcast>(
    resourceId || 'default', 
    'current-notes-token-groups'
  );

  // Listen for note selection events to update active group
  useMessaging({ 
    resourceId: resourceId || 'default',
    eventTypes: ['note-selection-broadcast'],
    onEvent: (event) => {
      if (event.type === 'note-selection-broadcast') {
        const noteSelectionEvent = event as NoteSelectionBroadcast;
        
        // Clear any existing token click highlights first to avoid confusion
        // This ensures note selections take priority over token click highlights
        
        getCrossPanelCommunicationService().clearHighlights();

        
        if (noteSelectionEvent.selectedNote === null) {
          // Clear the active group when note selection is cleared
          
          setActiveGroup(null);

        } else {

          setActiveGroup(noteSelectionEvent.selectedNote.tokenGroupId);

        }
      }
    }
  });
  

  // Update token groups when notes broadcast changes
  useEffect(() => {
    
    if (notesTokenGroupsBroadcast && notesTokenGroupsBroadcast.tokenGroups) {
      
      // Check if the broadcast is for the current book - ignore stale broadcasts
      // BUT allow empty token groups for cleanup (book will be empty string)
      const currentBook = currentReference?.book;
      const broadcastBook = notesTokenGroupsBroadcast.reference?.book;
      
      if (currentBook && broadcastBook && currentBook !== broadcastBook) {
        
        return;
      }

      // If token groups is empty, clear all notes groups (cleanup on unmount)
      if (notesTokenGroupsBroadcast.tokenGroups.length === 0) {
        clearTokenGroups('notes');
        return;
      }

      // Add new token groups
      notesTokenGroupsBroadcast.tokenGroups.forEach(noteGroup => {
        const tokenGroup: TokenGroup = {
          id: `notes-${noteGroup.noteId}`,
          sourceType: 'notes',
          sourceId: noteGroup.noteId,
          tokens: noteGroup.tokens,
          label: `${noteGroup.quote} (#${noteGroup.occurrence})`,
          colorIndex: noteGroup.colorIndex // Use the color index from the broadcast
        };
        addTokenGroup(tokenGroup);
      });
    }
  }, [notesTokenGroupsBroadcast, addTokenGroup, clearTokenGroups, currentReference?.book]);

  // Clear token groups when navigating to a different book
  useEffect(() => {
    clearTokenGroups('notes');
    
  }, [currentReference?.book, clearTokenGroups]);

  // Cross-panel communication state - store the original language token to highlight
  const [highlightTarget, setHighlightTarget] = useState<OriginalLanguageToken | null>(null);
  const crossPanelService = getCrossPanelCommunicationService();

  // Initialize scroll hook
  const { scrollToFirstHighlightedToken, scrollToTokenImmediately } = useScrollToHighlightedToken({
    scrollViewRef: scrollViewRef || React.createRef(),
    highlightedTokenRefs,
    activeTokenRefs
  });

  // Scroll highlighted tokens into view when highlight target changes
  useEffect(() => {
   
    if (highlightTarget && scrollViewRef?.current) {
      // Optimized: Reduced delay for faster response
      requestAnimationFrame(() => {
        // Reduced delay from 50ms to 16ms (one frame) for faster response
        setTimeout(() => {
          scrollToFirstHighlightedToken();
        }, 16);
      });
    }
  }, [highlightTarget, scrollViewRef, scrollToFirstHighlightedToken]);

  // Scroll active token group into view when active group changes
  useEffect(() => {
    if (activeGroupId && scrollViewRef?.current) {

      
      // Optimized: Use requestAnimationFrame + minimal delay for faster response
      requestAnimationFrame(() => {
        // Reduced delay from 50ms to 16ms (one frame) for faster response
        setTimeout(() => {
          scrollToFirstHighlightedToken();
        }, 16);
      });
    }
  }, [activeGroupId, scrollViewRef, scrollToFirstHighlightedToken]);

  // Handle highlight messages from all panels (including self-highlighting)
  const handleHighlightMessage = useCallback((message: TokenHighlightMessage) => {
    // Store the original language token - renderer will check alignment during rendering
    setHighlightTarget(message.originalLanguageToken);
    
  }, []);

  // Handle clear highlights messages
  const handleClearHighlights = useCallback((message: CrossPanelMessage) => {
    setHighlightTarget(null);
  }, []);

  // Handle token clicks
  const handleTokenClick = useCallback((token: OptimizedToken, verse: OptimizedVerse) => {
    try {
   
    // Clear active note highlighting when a word is clicked
    setActiveGroup(null);

    
    // Create original language token for the clicked token
    const verseRef = `${resourceType?.toLowerCase() || 'unknown'} ${currentReference?.chapter || 1}:${verse.number}`;
    
    // Broadcast token click via linked-panels as event message
    const tokenClickBroadcast: TokenClickBroadcast = {
      type: 'token-click-broadcast',
      lifecycle: 'event',
      clickedToken: {
        id: token.id,
        content: token.text,
        semanticId: token.id.toString(),
        alignedSemanticIds: token.align ? token.align.map(a => a.toString()) : undefined,
        verseRef: verseRef
      },
      sourceResourceId: resourceId || 'unknown',
      timestamp: Date.now()
    };
    
    
      
      // Safely broadcast the message
      if (linkedPanelsAPIRef.current?.messaging?.sendToAll) {
    linkedPanelsAPIRef.current.messaging.sendToAll(tokenClickBroadcast);
      } else {
        console.warn('⚠️ Linked panels API not available for token click broadcast');
      }

    
    // Also trigger cross-panel communication for highlighting (keep existing functionality)
      if (crossPanelService?.handleTokenClick) {
        crossPanelService.handleTokenClick(token, resourceId);
      } else {
        console.warn('⚠️ Cross panel service not available for token click');
      }
    
    // Call user callback if provided
    if (onTokenClick) {
      onTokenClick(token, verse);
      }
    } catch (error) {
      console.error('❌ Error handling token click:', error);
      // Don't re-throw the error to prevent crashes
    }
  }, [crossPanelService, resourceId, onTokenClick, resourceType, currentReference, setActiveGroup]);

  // Handle verse number clicks to broadcast verse reference filter
  const handleVerseClick = useCallback((verseNumber: number, chapterNumber: number) => {
    if (!currentReference?.book || !linkedPanelsAPIRef.current?.messaging) {
      console.warn('Cannot broadcast verse reference filter: missing book or messaging API');
      return;
    }

    // Create verse reference filter broadcast
    const verseReferenceFilterBroadcast: VerseReferenceFilterBroadcast = {
      type: 'verse-reference-filter-broadcast',
      lifecycle: 'event',
      verseReference: {
        book: currentReference.book,
        chapter: chapterNumber,
        verse: verseNumber
      },
      sourceResourceId: resourceId,
      timestamp: Date.now()
    };

    
    linkedPanelsAPIRef.current.messaging.sendToAll(verseReferenceFilterBroadcast);
  }, [currentReference, resourceId]);

  // Register panel and set up cross-panel communication
  useEffect(() => {
    
    // Register this panel with the cross-panel service
    const panelResource = {
      resourceId,
      resourceType,
      language,
      chapters: scripture.chapters as any, // Legacy property for compatibility
      isOriginalLanguage: language === 'el-x-koine' || language === 'hbo',
      optimizedChapters: scripture.chapters,
      isOptimized: true
    };

    crossPanelService.registerPanel(panelResource);

    // Add message handler for cross-panel highlights
    const unsubscribe = crossPanelService.addMessageHandler((message: CrossPanelMessage) => {

      if (message.type === 'HIGHLIGHT_TOKENS') {
        handleHighlightMessage(message);
      } else if (message.type === 'CLEAR_HIGHLIGHTS') {
        handleClearHighlights(message);
      }
    });

    return () => {
      // Only remove message handler, keep panel registered
      // Panel will be unregistered when component unmounts
      unsubscribe();
    };
  }, [resourceId, resourceType, language, scripture.chapters, crossPanelService, handleHighlightMessage, handleClearHighlights]);

  // Separate effect for component unmount - unregister panel only then
  useEffect(() => {
    return () => {
      crossPanelService.unregisterPanel(resourceId);
    };
  }, [resourceId, crossPanelService]);

  const versesToRender = useMemo(() => 
    getVersesToRender(scripture, { chapter, verseRange, startRef, endRef }),
    [scripture, chapter, verseRange, startRef, endRef]
  );

  // Create ordered token list for TTS highlighting across all verses
  const allTokensInOrder = useMemo(() => 
    versesToRender.flatMap(verse => 
    verse.tokens.filter(token => token.type !== 'paragraph-marker' && token.type !== 'whitespace')
    ),
    [versesToRender]
  );

  if (versesToRender.length === 0) {
    return (
      <View style={styles.noVersesContainer}>
        <Text style={styles.noVersesTitle}>No verses found</Text>
        <Text style={styles.noVersesSubtitle}>No content matches the specified criteria</Text>
      </View>
    );
  }

  // Group verses by paragraphs if showing paragraph structure
  if (showParagraphs) {
    return (
      <View style={styles.usfmRenderer}>
        {renderByParagraphs(versesToRender, scripture, {
          showVerseNumbers,
          showChapterNumbers,
          showAlignments,
          highlightWords,
          highlightTarget,
          onWordClick,
          onTokenClick: handleTokenClick,
          onVerseClick: handleVerseClick,
          resourceType,
          language,
          highlightedTokenRefs,
          activeTokenRefs,
          tokenPositions,
          currentTTSWord,
          ttsText,
          allTokensInOrder,
          scrollToTokenImmediately
        })}
      </View>
    );
  }

  // Determine if this is RTL content
  const isRTL = language === 'hbo'; // Hebrew is RTL
  
  // Render as simple verse list
  return (
    <View style={[
      styles.usfmRenderer,
      isRTL ? styles.rtlContainer : styles.ltrContainer
    ]}>
      {versesToRender.map((verse) => {
        const chapterNumber = getChapterForVerse(verse, scripture);
        return (
        <MemoizedVerseRenderer
            key={`${chapterNumber}:${verse.number}`}
          verse={verse}
            chapterNumber={chapterNumber}
          showVerseNumbers={showVerseNumbers}
          showAlignments={showAlignments}
          highlightWords={highlightWords}
          highlightTarget={highlightTarget}
          onWordClick={onWordClick}
          onTokenClick={handleTokenClick}
          onVerseClick={handleVerseClick}
            resourceType={resourceType}
            language={language}
            highlightedTokenRefs={highlightedTokenRefs}
            activeTokenRefs={activeTokenRefs}
            tokenPositions={tokenPositions}
            currentTTSWord={currentTTSWord}
            ttsText={ttsText}
            allTokensInOrder={allTokensInOrder}
            scrollViewRef={scrollViewRef}
        />
        );
      })}
    </View>
  );
};

// Memoized USFMRendererInternal to prevent unnecessary re-renders
const MemoizedUSFMRendererInternal = memo(USFMRendererInternal);

/**
 * Options interface for rendering functions
 */
interface RenderingOptions {
  showVerseNumbers: boolean;
  showChapterNumbers: boolean;
  showAlignments: boolean;
  highlightWords: string[];
  highlightTarget: OriginalLanguageToken | null;
  onWordClick?: (word: string, verse: OptimizedVerse, alignment?: WordAlignment) => void;
  onTokenClick?: (token: OptimizedToken, verse: OptimizedVerse) => void;
  onVerseClick?: (verseNumber: number, chapterNumber: number) => void;
  resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
  language: 'en' | 'el-x-koine' | 'hbo';
  highlightedTokenRefs: React.MutableRefObject<Map<string, any>>;
  activeTokenRefs: React.MutableRefObject<Map<string, any>>;
  tokenPositions: React.MutableRefObject<Map<string, { y: number; height: number }>>;
  currentTTSWord?: TTSWordBoundary | null;
  ttsText?: string;
  allTokensInOrder?: OptimizedToken[];
  scrollToTokenImmediately?: (element: any, tokenKey: string) => void;
}

/**
 * Render verses grouped by paragraphs with chapter headers
 * Updated to include scroll-into-view refs for highlighted and active tokens
 */
function renderByParagraphs(
  verses: OptimizedVerse[],
  scripture: OptimizedScripture,
  options: RenderingOptions
): React.ReactNode {
  // Group verses by chapter first
  const chapterGroups: { [chapterNum: number]: OptimizedVerse[] } = {};
  
  verses.forEach(verse => {
    const chapterNum = getChapterForVerse(verse, scripture);
    if (!chapterGroups[chapterNum]) {
      chapterGroups[chapterNum] = [];
    }
    chapterGroups[chapterNum].push(verse);
  });

  return Object.keys(chapterGroups)
    .map(Number)
    .sort((a, b) => a - b)
    .map(chapterNum => {
      const chapterVerses = chapterGroups[chapterNum];
      const chapterData = scripture.chapters.find(ch => ch.number === chapterNum);
      

  return (
        <View key={`chapter-${chapterNum}`} style={styles.chapterGroup}>
              {options.showChapterNumbers && (
            <Text style={styles.chapterHeader}>
              {chapterNum}
            </Text>
          )}
          
          {/* Group verses by paragraph within chapter */}
          {renderParagraphsForChapter(chapterVerses, chapterData, chapterNum, options)}
            </View>
          );
    });
}

/**
 * Render paragraphs for a specific chapter using token-based paragraph detection
 * Creates separate <p> elements for each paragraph segment
 */
function renderParagraphsForChapter(
  verses: OptimizedVerse[],
  chapterData: any,
  chapterNumber: number,
  options: {
  showVerseNumbers: boolean;
  showAlignments: boolean;
  highlightWords: string[];
    highlightTarget: OriginalLanguageToken | null;
    onWordClick?: (word: string, verse: OptimizedVerse, alignment?: WordAlignment) => void;
    onTokenClick?: (token: OptimizedToken, verse: OptimizedVerse) => void;
    onVerseClick?: (verseNumber: number, chapterNumber: number) => void;
    resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
    language: 'en' | 'el-x-koine' | 'hbo';
    currentTTSWord?: TTSWordBoundary | null;
    ttsText?: string;
    allTokensInOrder?: OptimizedToken[];
    scrollToTokenImmediately?: (element: any, tokenKey: string) => void;
  }
): React.ReactNode {
  // Create paragraph segments by splitting verses at paragraph marker boundaries
  const paragraphSegments: {
    style: string;
    indentLevel: number;
    type: string;
    content: { verse: OptimizedVerse; tokens: OptimizedToken[]; showVerseNumber: boolean }[];
  }[] = [];
  
  let currentSegment: {
    style: string;
    indentLevel: number;
    type: string;
    content: { verse: OptimizedVerse; tokens: OptimizedToken[]; showVerseNumber: boolean }[];
  } | null = null;
  
  verses.forEach((verse) => {
    const tokens = verse.tokens;
    let currentTokens: OptimizedToken[] = [];
    let isFirstSegmentInVerse = true;
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (token.type === 'paragraph-marker' && token.paragraphMarker?.isNewParagraph) {
        // Save current tokens to current segment if any
        if (currentTokens.length > 0 && currentSegment) {
          currentSegment.content.push({
            verse,
            tokens: [...currentTokens],
            showVerseNumber: isFirstSegmentInVerse
          });
          currentTokens = [];
          isFirstSegmentInVerse = false;
        }
        
        // Close current segment and start new one
        if (currentSegment) {
          paragraphSegments.push(currentSegment);
        }
        
        currentSegment = {
          style: token.paragraphMarker.style,
          indentLevel: token.paragraphMarker.indentLevel,
          type: token.paragraphMarker.type,
          content: []
        };
      } else {
        // Add non-paragraph-marker tokens to current tokens
        currentTokens.push(token);
      }
    }
    
    // Add remaining tokens to current segment
    if (currentTokens.length > 0) {
      if (!currentSegment) {
        // This shouldn't happen if we added default paragraph marker, but just in case
        currentSegment = {
          style: 'p',
          indentLevel: 0,
          type: 'paragraph',
          content: []
        };
      }
      
      currentSegment.content.push({
        verse,
        tokens: currentTokens,
        showVerseNumber: isFirstSegmentInVerse
      });
    }
  });
  
  // Close final segment
  if (currentSegment) {
    paragraphSegments.push(currentSegment);
  }
  
  // Render each paragraph segment as a separate View element
  return paragraphSegments.map((segment, segmentIndex) => (
    <View
      key={`paragraph-segment-${segmentIndex}`}
      style={[
        styles.paragraphSegment,
        segment.indentLevel === 1 && styles.paragraphIndent1,
        segment.indentLevel === 2 && styles.paragraphIndent2,
        segment.indentLevel > 2 && styles.paragraphIndent3,
      ]}
    >
      {segment.content.map((contentItem, contentIndex) => (
        <React.Fragment key={`content-${contentIndex}`}>
          {/* Render verse number and tokens inline */}
          <Text style={[
            styles.paragraphText,
            options.language === 'hbo' ? styles.rtlText : styles.ltrText,
            segment.type === 'quote' && styles.paragraphQuote,
            segment.style === 'q2' && styles.paragraphQ2,
          ]}>
            {/* Show verse number if this is the first content item for this verse */}
            {contentItem.showVerseNumber && options.showVerseNumbers && (
              <View style={styles.verseNumberContainer}>
                <Text 
                  style={styles.verseNumber}
                  onPress={() => options.onVerseClick?.(contentItem.verse.number, chapterNumber)}
                >
                  {contentItem.verse.number}
                </Text>
              </View>
            )}
            
            {contentItem.tokens.map((token, tokenIndex) => {
              // Get next token, considering tokens across content items within the same paragraph
              let nextToken = contentItem.tokens[tokenIndex + 1];
              
              // If this is the last token in this content item, check the first token of the next content item
              if (!nextToken && contentIndex < segment.content.length - 1) {
                const nextContentItem = segment.content[contentIndex + 1];
                if (nextContentItem && nextContentItem.tokens.length > 0) {
                  nextToken = nextContentItem.tokens[0];
                }
              }
              
              // Check if this token should be highlighted
              const isHighlighted = shouldHighlightToken(token, options.highlightTarget, options.language);
              
              // Use the provided ordered tokens for TTS highlighting
              const isTTSHighlighted = shouldHighlightTokenForTTS(token, options.currentTTSWord || null, options.ttsText, options.allTokensInOrder);
              
              return (
                <React.Fragment key={`token-${token.id}`}>
                  <MemoizedWordTokenRenderer
                    token={token}
                    verse={contentItem.verse}
                    isHighlighted={isHighlighted}
                    isTTSHighlighted={isTTSHighlighted}
                    showAlignments={options.showAlignments}
                    onWordClick={options.onWordClick}
                    onTokenClick={options.onTokenClick}
                    isOriginalLanguage={options.language === 'el-x-koine' || options.language === 'hbo'}
                    resourceType={options.resourceType}
                    language={options.language}
                    highlightedTokenRefs={(options as any).highlightedTokenRefs}
                    activeTokenRefs={(options as any).activeTokenRefs}
                    tokenPositions={(options as any).tokenPositions}
                    scrollViewRef={(options as any).scrollViewRef}
                    scrollToTokenImmediately={options.scrollToTokenImmediately}
                  />
                  {shouldAddSpaceAfterToken(token, nextToken, options.language) && <Text> </Text>}
                </React.Fragment>
              );
            })}
          </Text>
          
        </React.Fragment>
      ))}
    </View>
  ));
}

/**
 * Render a single verse with word tokens and alignments (for non-paragraph mode)
 */
const VerseRenderer: React.FC<{
  verse: OptimizedVerse;
  chapterNumber: number;
  showVerseNumbers: boolean;
  showAlignments: boolean;
  highlightWords: string[];
  highlightTarget: OriginalLanguageToken | null;
  onWordClick?: (word: string, verse: OptimizedVerse, alignment?: WordAlignment) => void;
  onTokenClick?: (token: OptimizedToken, verse: OptimizedVerse) => void;
  onVerseClick?: (verseNumber: number, chapterNumber: number) => void;
  resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
  language: 'en' | 'el-x-koine' | 'hbo';
  highlightedTokenRefs: React.MutableRefObject<Map<string, any>>;
  activeTokenRefs: React.MutableRefObject<Map<string, any>>;
  tokenPositions: React.MutableRefObject<Map<string, { y: number; height: number }>>;
  currentTTSWord?: TTSWordBoundary | null;
  ttsText?: string;
  allTokensInOrder?: OptimizedToken[];
  scrollViewRef?: React.RefObject<any>;
  scrollToTokenImmediately?: (element: any, tokenKey: string) => void;
}> = ({
  verse,
  chapterNumber,
  showVerseNumbers,
  showAlignments,
  highlightWords,
  highlightTarget,
  onWordClick,
  onTokenClick,
  onVerseClick,
  resourceType,
  language,
  highlightedTokenRefs,
  activeTokenRefs,
  tokenPositions,
  currentTTSWord,
  ttsText,
  allTokensInOrder,
  scrollViewRef,
  scrollToTokenImmediately
}) => {
  const isOriginalLanguage = language === 'el-x-koine' || language === 'hbo';
  
  return (
    <View style={styles.verseContainer}>
      {showVerseNumbers && (
        <View style={styles.verseNumberContainer}>
          <Text 
            style={styles.verseNumber}
            onPress={() => onVerseClick?.(verse.number, chapterNumber)}
          >
            {verse.number}
          </Text>
        </View>
      )}
      
      <Text style={[
        styles.verseText,
        language === 'hbo' ? styles.rtlText : styles.ltrText
      ]}>
        {verse.tokens
          .filter(token => token.type !== 'whitespace') // Skip whitespace tokens
          .map((token, index, filteredTokens) => {
            const nextToken = filteredTokens[index + 1];
            const isHighlighted = shouldHighlightToken(token, highlightTarget, language);
            
            // Use the provided ordered tokens for TTS highlighting
            const isTTSHighlighted = shouldHighlightTokenForTTS(token, currentTTSWord || null, ttsText, allTokensInOrder);
            
            return (
              <React.Fragment key={`token-${token.id}`}>
                <MemoizedWordTokenRenderer
                  token={token}
          verse={verse}
                  isHighlighted={isHighlighted}
                  isTTSHighlighted={isTTSHighlighted}
          showAlignments={showAlignments}
          onWordClick={onWordClick}
          onTokenClick={onTokenClick}
                  isOriginalLanguage={isOriginalLanguage}
                  resourceType={resourceType}
                  language={language}
                  highlightedTokenRefs={highlightedTokenRefs}
                  activeTokenRefs={activeTokenRefs}
                  tokenPositions={tokenPositions}
                  scrollViewRef={scrollViewRef}
                  scrollToTokenImmediately={scrollToTokenImmediately}
                />
                {shouldAddSpaceAfterToken(token, nextToken, language) && <Text> </Text>}
              </React.Fragment>
            );
          })}
      </Text>
      
      {showAlignments && verse.tokens.some(t => t.align) && (
        <View style={styles.alignmentInfo}>
          <Text style={styles.alignmentTitle}>
            Alignments ({verse.tokens.filter(t => t.align).length})
          </Text>
          <View style={styles.alignmentList}>
            {verse.tokens.filter(t => t.align).map((token, i) => (
              <View key={i} style={styles.alignmentItem}>
                <Text style={styles.alignmentText}>
                  <Text style={styles.alignmentStrong}>{token.text}</Text> → aligned to {token.align?.length} original word(s)
                  {token.strong && <Text style={styles.alignmentStrongRef}> ({token.strong})</Text>}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// Memoized VerseRenderer to prevent unnecessary re-renders
const MemoizedVerseRenderer = memo(VerseRenderer);

/**
 * Determine if a space should be added after a token based on token types and text direction
 */
function shouldAddSpaceAfterToken(
  currentToken: OptimizedToken, 
  nextToken: OptimizedToken | undefined, 
  language: 'en' | 'el-x-koine' | 'hbo'
): boolean {
  // No space if there's no next token
  if (!nextToken) {
    return false;
  }

  // Never add space after or before paragraph markers
  if (currentToken.type === 'paragraph-marker' || nextToken.type === 'paragraph-marker') {
    return false;
  }

  // Determine text direction
  const isRTL = language === 'hbo'; // Hebrew is RTL
  const isLTR = !isRTL; // Greek and English are LTR

  // Get token types
  const currentType = currentToken.type;
  const nextType = nextToken.type;

  // LTR spacing rules (English, Greek, Spanish)
  if (isLTR) {
    // Special case: Hebrew maqaf (־) should never have spaces around it
    if (currentToken.text === '־' || nextToken.text === '־') {
      return false;
    }
    
    // Add space after words (except when followed by punctuation)
    if (currentType === 'word' && nextType !== 'punctuation') {
      return true;
    }
    
    // Add space after numbers (except when followed by punctuation)
    if (currentType === 'number' && nextType !== 'punctuation') {
      return true;
    }
    
    // Handle punctuation spacing more precisely
    if (currentType === 'punctuation') {
      const currentPunct = currentToken.text;
      
      // Opening punctuation: never add space after
      if (/^["''"„«‹([{¿¡]$/.test(currentPunct)) {
        return false;
      }
      
      // Colons: no space after (Spanish style: "dijo:" not "dijo: ")
      if (currentPunct === ':') {
        return false;
      }
      
      // When followed by words or numbers, add space after:
      if (nextType === 'word' || nextType === 'number') {
        // Sentence-ending punctuation
        if (/^[.!?]$/.test(currentPunct)) {
          return true;
        }
        
        // Commas and semicolons
        if (/^[,;]$/.test(currentPunct)) {
          return true;
        }
        
        // Closing punctuation (quotes, brackets, etc.)
        if (/^["''"»›)\]}]$/.test(currentPunct)) {
          return true;
        }
      }
      
      // Default: no space for other punctuation combinations
      return false;
    }
  }

  // RTL spacing rules (Hebrew)
  if (isRTL) {
    // Special case: Hebrew maqaf (־) should never have spaces around it
    if (currentToken.text === '־' || nextToken.text === '־') {
      return false;
    }
    
    // Add space after words (except when followed by punctuation)
    if (currentType === 'word' && nextType !== 'punctuation') {
      return true;
    }
    
    // Add space after numbers (except when followed by punctuation)
    if (currentType === 'number' && nextType !== 'punctuation') {
      return true;
    }
    
    // Handle punctuation spacing (same logic as LTR for now)
    if (currentType === 'punctuation') {
      const currentPunct = currentToken.text;
      
      // Opening punctuation: never add space after
      if (/^["''"„«‹([{¿¡]$/.test(currentPunct)) {
        return false;
      }
      
      // Colons: no space after
      if (currentPunct === ':') {
        return false;
      }
      
      // When followed by words or numbers, add space after:
      if (nextType === 'word' || nextType === 'number') {
        // Sentence-ending punctuation
        if (/^[.!?]$/.test(currentPunct)) {
          return true;
        }
        
        // Commas and semicolons
        if (/^[,;]$/.test(currentPunct)) {
          return true;
        }
        
        // Closing punctuation (quotes, brackets, etc.)
        if (/^["''"»›)\]}]$/.test(currentPunct)) {
          return true;
        }
      }
      
      // Default: no space for other punctuation combinations
      return false;
    }
  }

  return false;
}

/**
 * Render a single word token with highlighting and click handling
 */
const WordTokenRenderer: React.FC<{
  token: OptimizedToken;
  verse: OptimizedVerse;
  isHighlighted: boolean;
  isTTSHighlighted?: boolean;
  showAlignments: boolean;
  onWordClick?: (word: string, verse: OptimizedVerse, alignment?: WordAlignment) => void;
  onTokenClick?: (token: OptimizedToken, verse: OptimizedVerse) => void;
  isOriginalLanguage: boolean;
  resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
  language: 'en' | 'el-x-koine' | 'hbo';
  highlightedTokenRefs: React.MutableRefObject<Map<string, any>>;
  activeTokenRefs: React.MutableRefObject<Map<string, any>>;
  tokenPositions: React.MutableRefObject<Map<string, { y: number; height: number }>>;
  scrollViewRef?: React.RefObject<any>;
  scrollToTokenImmediately?: (element: any, tokenKey: string) => void;
}> = ({
  token,
  verse,
  isHighlighted,
  isTTSHighlighted = false,
  showAlignments,
  onWordClick,
  onTokenClick,
  isOriginalLanguage,
  resourceType,
  language,
  highlightedTokenRefs,
  activeTokenRefs,
  tokenPositions,
  scrollViewRef,
  scrollToTokenImmediately
}) => {
  const { 
    getAllTokenGroupsForAlignedId, 
    getColorClassForGroup,
    activeGroupId 
  } = useTokenUnderlining();
  // Don't render paragraph marker tokens - they're handled by the parent component
  if (token.type === 'paragraph-marker') {
    return null;
  }

  const handleClick = () => {
    try {
    if (onTokenClick) {
              onTokenClick(token, verse);
    } else if (onWordClick) {
      onWordClick(token.text, verse);
      }
    } catch (error) {
      console.error('❌ Error in token click handler:', error);
      // Don't re-throw to prevent crashes
    }
  };

  // Determine if token is clickable
  // Hebrew maqaf (־) should never be clickable
  const isHebrewMaqaf = token.text === '־';
  const isClickable = !isHebrewMaqaf && (isOriginalLanguage || (token.align && token.align.length > 0));
  
  // Use token type from the processor
  const isNumber = token.type === 'number';

  // Helper function to combine multiple underline classes for overlapping groups
  const combineUnderlineClasses = (groups: TokenGroup[]): string => {
    if (groups.length === 0) return '';
    
    if (groups.length === 1) {
      // Single group - use normal styling
      return getColorClassForGroup(groups[0].id);
    }
    
    // Multiple overlapping groups - use priority system for clean underlines
    // Priority: active group gets primary styling, fallback to first group
    const activeGroup = groups.find(g => g.id === activeGroupId);
    const primaryGroup = activeGroup || groups[0];
    
    // Return just the primary underline class (no overlap indicators)
    return getColorClassForGroup(primaryGroup.id);
  };

  // Check if this token should be underlined based on token groups
  let underlineClass = '';
  if (isOriginalLanguage) {
    // For original language tokens, get ALL matching groups for overlap handling
    const matchingGroups = getAllTokenGroupsForAlignedId(token.id);
    if (matchingGroups.length > 0) {
      underlineClass = combineUnderlineClasses(matchingGroups);
    }
  } else if (token.align && token.align.length > 0) {
    // For target language tokens, collect all groups from all aligned IDs
    const allMatchingGroups: TokenGroup[] = [];
    const seenGroupIds = new Set<string>();
    
    for (const alignedId of token.align) {
      const groupsForId = getAllTokenGroupsForAlignedId(alignedId);
      for (const group of groupsForId) {
        if (!seenGroupIds.has(group.id)) {
          allMatchingGroups.push(group);
          seenGroupIds.add(group.id);
        }
      }
    }
    
    if (allMatchingGroups.length > 0) {
      underlineClass = combineUnderlineClasses(allMatchingGroups);
    }
  }

  // Check if this token has an active underline (note was clicked)
  const hasActiveUnderline = underlineClass.includes('bg-') && activeGroupId;
  
  // Prioritize TTS highlighting, then note underlining, then word highlighting
  const shouldShowTTSHighlight = isTTSHighlighted;
  const shouldShowHighlight = isHighlighted && !hasActiveUnderline && !shouldShowTTSHighlight;
  
  // Convert underline class to React Native style
  const getUnderlineStyle = (underlineClass: string) => {
    if (!underlineClass) return null;
    
    // Map COLOR_CLASSES background colors to React Native colors
    const colorMap: Record<string, string> = {
      'bg-blue-100': '#dbeafe',
      'bg-green-100': '#dcfce7', 
      'bg-purple-100': '#f3e8ff',
      'bg-indigo-100': '#e0e7ff',
      'bg-teal-100': '#ccfbf1',
      'bg-cyan-100': '#cffafe',
      'bg-violet-100': '#ede9fe',
      'bg-sky-100': '#e0f2fe',
      'bg-emerald-100': '#d1fae5',
    };
    
    // Check for active background colors (bg-color-100)
    for (const [cssClass, color] of Object.entries(colorMap)) {
      if (underlineClass.includes(cssClass)) {
        // Get the corresponding border color
        const borderColorMap: Record<string, string> = {
          '#dbeafe': '#3b82f6', // blue-100 -> blue-500
          '#dcfce7': '#10b981', // green-100 -> green-500
          '#f3e8ff': '#8b5cf6', // purple-100 -> purple-500
          '#e0e7ff': '#6366f1', // indigo-100 -> indigo-500
          '#ccfbf1': '#14b8a6', // teal-100 -> teal-500
          '#cffafe': '#06b6d4', // cyan-100 -> cyan-500
          '#ede9fe': '#8b5cf6', // violet-100 -> violet-500
          '#e0f2fe': '#0ea5e9', // sky-100 -> sky-500
          '#d1fae5': '#10b981', // emerald-100 -> emerald-500
        };
        
        return { 
          backgroundColor: color,
          borderBottomWidth: 2,
          borderBottomColor: borderColorMap[color] || color,
        };
      }
    }
    
    // Check for inactive dotted borders
    const borderMatch = underlineClass.match(/border-(\w+)-500\/30/);
    if (borderMatch) {
      const [, color] = borderMatch;
      const borderColorMap: Record<string, string> = {
        'blue': '#3b82f6',
        'green': '#10b981',
        'purple': '#8b5cf6',
        'indigo': '#6366f1',
        'teal': '#14b8a6',
        'cyan': '#06b6d4',
        'violet': '#8b5cf6',
        'sky': '#0ea5e9',
        'emerald': '#10b981',
      };
      
      const borderColor = borderColorMap[color];
      if (borderColor) {
        return {
          borderBottomWidth: 2,
          borderBottomColor: borderColor + '4D', // Add 30% opacity
          borderStyle: 'dotted' as any,
        };
      }
    }
    
    return null;
  };
  
  const underlineStyle = getUnderlineStyle(underlineClass);

        return (
          <Pressable
            ref={(element) => {
              const tokenKey = `${token.id}-${verse.number}`;
              
              if (element) {
                // Register element if it should be highlighted or is active
                if (shouldShowHighlight) {
                  highlightedTokenRefs.current.set(tokenKey, element);
                  
                  // Trigger immediate scroll when this token becomes highlighted
                  if (scrollViewRef?.current && scrollToTokenImmediately) {
                    // Use immediate scroll for faster response
                    scrollToTokenImmediately(element, tokenKey);
                  }

                } else {
                  highlightedTokenRefs.current.delete(tokenKey);
                }
                
                if (hasActiveUnderline) {
                  activeTokenRefs.current.set(tokenKey, element);
                  
                  // Trigger immediate scroll when this token becomes active (for notes/translation words)
                  if (scrollViewRef?.current && scrollToTokenImmediately) {
                    // Use immediate scroll for faster response
                    scrollToTokenImmediately(element, tokenKey);
                  }

                } else {
                  activeTokenRefs.current.delete(tokenKey);
                }
              } else {
                // Cleanup when element is unmounted
                highlightedTokenRefs.current.delete(tokenKey);
                activeTokenRefs.current.delete(tokenKey);
                tokenPositions.current.delete(tokenKey);
              }
            }}
            // No longer using onLayout - using measure() instead like your example
            // onLayout events were unreliable in nested ScrollView structures
            style={[
              styles.tokenBase,
              shouldShowTTSHighlight && styles.tokenTTSHighlight,
              shouldShowHighlight && styles.tokenHighlight,
              isClickable && styles.tokenClickable,
              underlineStyle, // Apply note underlining style
            ]}
            onPress={isClickable ? handleClick : undefined}
            disabled={!isClickable}
          >
            <Text style={[
              styles.tokenText,
              isOriginalLanguage && !shouldShowTTSHighlight && styles.tokenOriginalLanguage,
              isNumber && styles.tokenNumber,
            ]}>
              {token.text}
            </Text>
          </Pressable>
  );
};

// Memoized WordTokenRenderer to prevent unnecessary re-renders
const MemoizedWordTokenRenderer = memo(WordTokenRenderer);

/**
 * Get verses to render based on filters and range - wrapper for optimized function
 */
function getVersesToRender(
  scripture: OptimizedScripture,
  options: {
    chapter?: number;
    verseRange?: { start: number; end: number };
    startRef?: { chapter: number; verse: number };
    endRef?: { chapter: number; verse: number };
  }
): OptimizedVerse[] {
  return getVersesToRenderOptimized(scripture, options);
}

/**
 * Get chapter number for a verse
 */
function getChapterForVerse(verse: OptimizedVerse, scripture: OptimizedScripture): number {
  for (const chapter of scripture.chapters) {
    if (chapter.verses.some(v => v.number === verse.number && v.text === verse.text)) {
      return chapter.number;
    }
  }
  return 1; // Fallback
}

// Removed unused functions - paragraph information is now embedded in tokens

// Main component that provides the TokenUnderliningProvider
const styles = StyleSheet.create({
  usfmRenderer: {
    // Base styles for USFM content
    flex: 1,
  },
  rtlContainer: {
    // RTL container styles
    direction: 'rtl',
  },
  ltrContainer: {
    // LTR container styles
    direction: 'ltr'
  },
  noVersesContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  noVersesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280', // text-gray-500
    marginBottom: 8,
  },
  noVersesSubtitle: {
    fontSize: 14,
    color: '#9ca3af', // text-gray-400
  },
  // Verse styles
  verseContainer: {
    marginBottom: 8,
    lineHeight: 24, // leading-relaxed equivalent
  },
  verseNumberContainer: {
    minHeight: 32, // Match token minHeight
    justifyContent: 'center', // Center content vertically
    alignItems: 'center', // Center content horizontally
    marginRight: 4,
    paddingHorizontal: 2,
    paddingVertical: 2, // Match token paddingVertical
    borderRadius: 2,
  },
  verseNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563eb', // text-blue-600
    textAlignVertical: 'center', // Center text vertically
  },
  verseText: {
    flex: 1,
  },
  rtlText: {
    textAlign: 'right',
    direction: 'rtl',
  },
  ltrText: {
    textAlign: 'left',
    direction: 'ltr',
  },
  paragraphText: {
    flex: 1,
  },
  // Alignment styles
  alignmentInfo: {
    marginTop: 8,
  },
  alignmentTitle: {
    fontSize: 12,
    color: '#6b7280', // text-gray-500
    fontWeight: '600',
  },
  alignmentList: {
    marginTop: 4,
    paddingLeft: 16,
  },
  alignmentItem: {
    marginBottom: 4,
  },
  alignmentText: {
    fontSize: 12,
    color: '#6b7280', // text-gray-500
  },
  alignmentStrong: {
    fontWeight: 'bold',
  },
  alignmentStrongRef: {
    color: '#2563eb', // text-blue-600
    marginLeft: 8,
  },
  // Token styles
  tokenBase: {
    borderRadius: 4,
    paddingHorizontal: 1,
    paddingVertical: 2,
    minHeight: 32, // Minimum touch target height
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 0, // Remove horizontal margins
  },
  tokenText: {
    fontSize: 16, // Increased from default
    color: '#1f2937', // text-gray-800
  },
  tokenTTSHighlight: {
    borderBottomWidth: 2,
    borderBottomColor: '#10b981', // border-green-500
    borderStyle: 'dotted',
    backgroundColor: '#dcfce7', // bg-green-100
  },
  tokenHighlight: {
    backgroundColor: '#fef3c7', // bg-yellow-200
    fontWeight: '600',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tokenClickable: {
    // Better touch feedback for clickable tokens
    opacity: 1,
  },
  tokenOriginalLanguage: {
    fontWeight: '500',
  },
  tokenNumber: {
    color: '#6b7280', // text-gray-600
  },
  // Chapter styles
  chapterGroup: {
    marginBottom: 24, // mb-6
  },
  chapterHeader: {
    fontSize: 24, // text-2xl
    fontWeight: 'bold',
    marginBottom: 16, // mb-4
    color: '#1f2937', // text-gray-800
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // border-gray-200
    paddingBottom: 8, // pb-2
  },
  // Paragraph styles
  paragraphSegment: {
    marginBottom: 16,
    lineHeight: 24,
  },
  paragraphIndent1: {
    marginLeft: 8,
  },
  paragraphIndent2: {
    marginLeft: 16,
  },
  paragraphIndent3: {
    marginLeft: 24,
  },
  paragraphQuote: {
    fontStyle: 'italic',
  },
  paragraphQ2: {
    color: '#6b7280',
  },
});

export const USFMRenderer: React.FC<USFMRendererProps> = (props) => {
  return (
    <TokenUnderliningProvider>
      <MemoizedUSFMRendererInternal {...props} />
    </TokenUnderliningProvider>
  );
};

export default USFMRenderer;