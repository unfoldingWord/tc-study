/**
 * Translation Notes Viewer Component - React Native Version
 * 
 * Displays Translation Notes (TN) content with filtering and navigation
 * Matches bt-studio functionality with comprehensive broadcasting and quote matching.
 */

import { useCurrentState, useMessaging, useResourceAPI } from 'linked-panels';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useResourceModal } from '../../contexts/ResourceModalContext';
import { COLOR_CLASSES } from '../../contexts/TokenUnderliningContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import {
    createNotesTokenGroupsBroadcast,
    NotesTokenGroupsBroadcast
} from '../../plugins/notes-scripture-plugin';
import { QuoteMatcher, QuoteMatchResult } from '../../services/quote-matcher';
import { OptimizedScripture, OptimizedToken } from '../../services/usfm-processor';
import {
    ProcessedNotes,
    TranslationNote
} from '../../types/processed-content';
import {
    NoteSelectionBroadcast,
    NoteTokenGroup,
    ScriptureTokensBroadcast,
    TokenClickBroadcast,
    VerseReferenceFilterBroadcast
} from '../../types/scripture-messages';
import { isTranslationAcademyLink, parseRcLink } from '../../utils/rc-link-parser';
import { Icon } from '../ui/Icon.native';
import { SimpleMarkdownRenderer } from '../ui/SimpleMarkdownRenderer';

// Types (simplified for React Native)

interface ResourceMetadata {
  id: string;
  language: string;
  languageDirection?: 'ltr' | 'rtl';
  type: string;
  server?: string;
  owner?: string;
}

export interface NotesViewerProps {
  resourceId: string;
  loading?: boolean;
  error?: string;
  notes?: ProcessedNotes;
  currentChapter?: number;
}

export function NotesViewer({ 
  resourceId, 
  loading = false, 
  error, 
  notes: propNotes, 
  currentChapter = 1 
}: NotesViewerProps) {
  
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
  const { currentReference, navigateToReference } = useNavigation();
  
  // Get linked-panels API for broadcasting note token groups
  const linkedPanelsAPI = useResourceAPI<NotesTokenGroupsBroadcast>(resourceId);
  
  // Track the last broadcast state to prevent infinite loops
  const lastBroadcastRef = useRef<string>('');
  
  const [actualNotes, setActualNotes] = useState<ProcessedNotes | null>(propNotes || null);
  const [contentLoading, setContentLoading] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(error || null);
  const [resourceMetadata, setResourceMetadata] = useState<ResourceMetadata | null>(null);
  
  // Original language content for quote matching
  const [originalScripture, setOriginalScripture] = useState<OptimizedScripture | null>(null);
  const [quoteMatches, setQuoteMatches] = useState<Map<string, QuoteMatchResult>>(new Map());
  const [quoteMatcher] = useState(() => new QuoteMatcher());
  
  // Token broadcast reception for building target language quotes
  const [scriptureTokens, setScriptureTokens] = useState<OptimizedToken[]>([]);
  const [tokenBroadcastInfo, setTokenBroadcastInfo] = useState<{
    sourceResourceId: string;
    reference: {
      book: string;
      chapter: number;
      verse: number;
      endChapter?: number;
      endVerse?: number;
    };
    resourceMetadata: {
      id: string;
      language: string;
      languageDirection?: 'ltr' | 'rtl';
      type: string;
    };
    timestamp: number;
  } | null>(null);

  const [targetLanguageQuotes, setTargetLanguageQuotes] = useState<Map<string, {
    quote: string;
    tokens: OptimizedToken[];
    sourceLanguage: string;
  }>>(new Map());
  
  // Token filter state (for filtering notes by clicked tokens)
  const [tokenFilter, setTokenFilter] = useState<{
    originalLanguageToken: {
      semanticId: string;
      content: string;
      alignedSemanticIds?: string[];
      verseRef: string;
    };
    sourceResourceId: string;
    timestamp: number;
  } | null>(null);
  
  // Verse reference filter state (for filtering notes by verse reference)
  const [verseReferenceFilter, setVerseReferenceFilter] = useState<{
    verseReference: {
      book: string;
      chapter: number;
      verse: number;
    };
    sourceResourceId: string;
    timestamp: number;
  } | null>(null);
  
  // Track active note for toggle functionality
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  
  // TA button titles cache for support reference buttons
  const taButtonTitlesRef = useRef<Map<string, string>>(new Map());
  const [taButtonTitles, setTaButtonTitles] = useState<Map<string, string>>(new Map());

  // Listen for scripture token broadcasts using useCurrentState hook
  const scriptureTokensBroadcast = useCurrentState<ScriptureTokensBroadcast>(
    resourceId, 
    'current-scripture-tokens'
  );


  
  // Listen for token clicks via linked-panels events (transient messages)
  useMessaging({ 
    resourceId,
    eventTypes: ['token-click-broadcast'],
    onEvent: (event) => {
      if (event.type === 'token-click-broadcast') {
        const tokenClickEvent = event as TokenClickBroadcast;
        
        
        // Clear verse reference filter when token filter is applied
        setVerseReferenceFilter(null);
        
        // Set token filter based on clicked token
        setTokenFilter({
          originalLanguageToken: {
            semanticId: tokenClickEvent.clickedToken.semanticId,
            content: tokenClickEvent.clickedToken.content,
            alignedSemanticIds: tokenClickEvent.clickedToken.alignedSemanticIds,
            verseRef: tokenClickEvent.clickedToken.verseRef
          },
          sourceResourceId: tokenClickEvent.sourceResourceId,
          timestamp: tokenClickEvent.timestamp
        });
      }
    }
  });

  // Listen for verse reference filter broadcasts via linked-panels events (transient messages)
  useMessaging({ 
    resourceId,
    eventTypes: ['verse-reference-filter-broadcast'],
    onEvent: (event) => {
      if (event.type === 'verse-reference-filter-broadcast') {
        const verseRefEvent = event as VerseReferenceFilterBroadcast;
        
        
        // Clear token filter when verse reference filter is applied
        setTokenFilter(null);
        
        // Set verse reference filter based on clicked verse
        setVerseReferenceFilter({
          verseReference: {
            book: verseRefEvent.verseReference.book,
            chapter: verseRefEvent.verseReference.chapter,
            verse: verseRefEvent.verseReference.verse
          },
          sourceResourceId: verseRefEvent.sourceResourceId,
          timestamp: verseRefEvent.timestamp
        });
      }
    }
  });

  // Clear filters when navigation changes (since messages are immediate/transient)
  useEffect(() => {
    setTokenFilter(null);
    setVerseReferenceFilter(null);
  }, [currentReference.book, currentReference.chapter, currentReference.verse]);

  // Function to handle note selection and broadcast the event
  const handleNoteClick = useCallback((note: TranslationNote) => {
    const noteKey = note.id || `${note.reference}-${note.quote}`;
    const tokenGroupId = `notes-${noteKey}`;
    
    // Toggle logic: if clicking the same note, deactivate it
    const isCurrentlyActive = activeNoteId === noteKey;
    const newActiveId = isCurrentlyActive ? null : noteKey;
    setActiveNoteId(newActiveId);

    // Broadcast note selection event (or clear event if toggling off)
    const noteSelectionBroadcast: NoteSelectionBroadcast = {
      type: 'note-selection-broadcast',
      lifecycle: 'event',
      selectedNote: isCurrentlyActive ? null : {
        noteId: noteKey,
        tokenGroupId: tokenGroupId,
        quote: note.quote,
        reference: note.reference
      },
      sourceResourceId: resourceId,
      timestamp: Date.now()
    };

    // Use the general messaging API instead of the typed one
    (linkedPanelsAPI.messaging as any).sendToAll(noteSelectionBroadcast);
  }, [resourceId, activeNoteId]);

  // Function to check if a note should have color indicator and be clickable
  const shouldNoteHaveColorIndicator = useCallback((note: TranslationNote): boolean => {
    return !!(note.quote && note.quote.trim() && note.occurrence);
  }, []);

  // Testament-specific original language configuration (same as OriginalScriptureViewer)
  const ORIGINAL_LANGUAGE_CONFIG = useMemo(() => ({
    OT: {
      owner: 'unfoldingWord',
      language: 'hbo',
      resourceId: 'uhb',
      title: 'Hebrew Bible'
    },
    NT: {
      owner: 'unfoldingWord', 
      language: 'el-x-koine',
      resourceId: 'ugnt',
      title: 'Greek New Testament'
    }
  } as const), []);

  // Helper function to determine testament from book code
  const getTestamentFromBook = (bookCode: string): 'OT' | 'NT' | null => {
    if (!bookCode) return null;
    
    // Simple testament detection based on book codes
    const ntBooks = ['mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev'];
    
    return ntBooks.includes(bookCode.toLowerCase()) ? 'NT' : 'OT';
  };

  // Function to fetch TA title for support reference buttons
  const fetchTAButtonTitle = useCallback(async (supportReference: string): Promise<string> => {
    if (!resourceManager || !processedResourceConfig) {
      return parseRcLink(supportReference).articleId; // Fallback to articleId
    }

    const parsed = parseRcLink(supportReference);
    if (!parsed.isValid) {
      return supportReference;
    }

    const cacheKey = parsed.fullArticleId;
    
    // Check if already cached in ref (avoid re-render dependency)
    if (taButtonTitlesRef.current.has(cacheKey)) {
      return taButtonTitlesRef.current.get(cacheKey)!;
    }

    try {
      // Find TA resource config
      const taResourceConfig = processedResourceConfig.find((config: any) => 
        config.metadata?.type === 'academy' || config.metadata?.id === 'ta'
      );
      
      if (!taResourceConfig) {
        return parsed.articleId; // Fallback to articleId
      }

      // Construct content key for TA article
      const contentKey = `${taResourceConfig.metadata.server}/${taResourceConfig.metadata.owner}/${taResourceConfig.metadata.language}/${taResourceConfig.metadata.id}/${parsed.fullArticleId}`;
      
      const content = await resourceManager.getOrFetchContent(
        contentKey,
        taResourceConfig.metadata.type as any
      );
      
      if (content && (content as any).article?.title) {
        const title = (content as any).article.title;
        // Update both ref and state cache
        taButtonTitlesRef.current.set(cacheKey, title);
        setTaButtonTitles(prev => new Map(prev).set(cacheKey, title));
        return title;
      }
    } catch (error) {
      console.warn(`Failed to fetch TA title for ${cacheKey}:`, error);
    }

    return parsed.articleId; // Fallback to articleId
  }, [resourceManager, processedResourceConfig]);

  // Component for TA button with fetched title
  const TAButton: React.FC<{ 
    supportReference: string;
    onSupportReferenceClick: (supportReference: string) => void;
  }> = React.memo(({ supportReference, onSupportReferenceClick }) => {
    // Memoize the parsed result to prevent re-renders
    const parsed = useMemo(() => parseRcLink(supportReference), [supportReference]);
    const cacheKey = parsed.fullArticleId;
    
    // Check if we already have the title cached
    const cachedTitle = taButtonTitles.get(cacheKey);
    const [buttonTitle, setButtonTitle] = useState<string>(cachedTitle || parsed.articleId);
    const [isLoading, setIsLoading] = useState(!cachedTitle);

    // Memoize the click handler to prevent re-renders
    const handleClick = useCallback((e: any) => {
      e.preventDefault();
      e.stopPropagation();
      onSupportReferenceClick(supportReference);
    }, [supportReference, onSupportReferenceClick]);

    useEffect(() => {
      // Skip if we already have the title
      if (cachedTitle) {
        setButtonTitle(cachedTitle);
        setIsLoading(false);
        return;
      }

      const loadTitle = async () => {
        try {
          setIsLoading(true);
          const title = await fetchTAButtonTitle(supportReference);
          setButtonTitle(title);
        } catch (error) {
          console.error(`Failed to load TA title for ${supportReference}:`, error);
          setButtonTitle(parsed.articleId); // Fallback
        } finally {
          setIsLoading(false);
        }
      };
      loadTitle();
    }, [supportReference, cachedTitle, parsed.articleId]);

    return (
      <Pressable
        onPress={handleClick}
        style={styles.taButton}
      >
        <Icon name="academy" size={14} />
        <Text style={styles.taButtonText}>
          {isLoading ? '...' : buttonTitle}
        </Text>
      </Pressable>
    );
  });
  
  TAButton.displayName = 'TAButton';
  
  // Listen for token clicks via linked-panels events (transient messages)
  useMessaging({ 
    resourceId,
    eventTypes: ['token-click-broadcast'],
    onEvent: (event) => {
      if (event.type === 'token-click-broadcast') {
        const tokenClickEvent = event as TokenClickBroadcast;
        
        
        // Clear verse reference filter when token filter is applied
        setVerseReferenceFilter(null);
        
        // Set token filter based on clicked token
        setTokenFilter({
          originalLanguageToken: {
            semanticId: tokenClickEvent.clickedToken.semanticId,
            content: tokenClickEvent.clickedToken.content,
            alignedSemanticIds: tokenClickEvent.clickedToken.alignedSemanticIds,
            verseRef: tokenClickEvent.clickedToken.verseRef
          },
          sourceResourceId: tokenClickEvent.sourceResourceId,
          timestamp: tokenClickEvent.timestamp
        });
      }
    }
  });

  // Listen for verse reference filter broadcasts via linked-panels events (transient messages)
  useMessaging({ 
    resourceId,
    eventTypes: ['verse-reference-filter-broadcast'],
    onEvent: (event) => {
      if (event.type === 'verse-reference-filter-broadcast') {
        const verseRefEvent = event as VerseReferenceFilterBroadcast;
        
        
        // Clear token filter when verse reference filter is applied
        setTokenFilter(null);
        
        // Set verse reference filter based on clicked verse
        setVerseReferenceFilter({
          verseReference: {
            book: verseRefEvent.verseReference.book,
            chapter: verseRefEvent.verseReference.chapter,
            verse: verseRefEvent.verseReference.verse
          },
          sourceResourceId: verseRefEvent.sourceResourceId,
          timestamp: verseRefEvent.timestamp
        });
      }
    }
  });

  // Clear filters when navigation changes (since messages are immediate/transient)
  useEffect(() => {
    setTokenFilter(null);
    setVerseReferenceFilter(null);
  }, [currentReference.book, currentReference.chapter, currentReference.verse]);

  // Handle scripture token broadcasts (similar to TranslationWordsLinksViewer)
  useEffect(() => {
    const processTime = Date.now();
    
    if (scriptureTokensBroadcast) {
      // Guard: Ignore broadcasts from non-scripture resources to prevent feedback loops
      if (scriptureTokensBroadcast.sourceResourceId === resourceId) {
        
        return;
      }

      // Check if this is a clear message (empty tokens and empty book)
      const isClearMessage = scriptureTokensBroadcast.tokens.length === 0 && 
                            !scriptureTokensBroadcast.reference.book;
      
      if (isClearMessage) {
        
        // Proper state cleanup - clear local state but don't trigger new broadcasts
        if (scriptureTokens.length > 0 || tokenBroadcastInfo || targetLanguageQuotes.size > 0) {
          setScriptureTokens([]);
          setTokenBroadcastInfo(null);
          setTargetLanguageQuotes(new Map());
        }
        return;
      } else {
        
        const setTokensStartTime = Date.now();
        setScriptureTokens(scriptureTokensBroadcast.tokens);
        setTokenBroadcastInfo({
          sourceResourceId: scriptureTokensBroadcast.sourceResourceId,
          reference: scriptureTokensBroadcast.reference,
          resourceMetadata: scriptureTokensBroadcast.resourceMetadata,
          timestamp: scriptureTokensBroadcast.timestamp
        });
               
      }
    } else {
      
      setScriptureTokens([]);
      setTokenBroadcastInfo(null);
      setTargetLanguageQuotes(new Map());
    }
  }, [scriptureTokensBroadcast]);


  // Fetch content when navigation changes
  useEffect(() => {
    if (!resourceManager || !currentReference.book || propNotes || !processedResourceConfig) return;

    const fetchContent = async () => {
      try {
        setContentLoading(true);
        setDisplayError(null);
        setActualNotes(null); // Clear previous content
        
        // Find the resource config to get the correct adapter resource ID
        const resourceConfig = processedResourceConfig.find((config: { panelResourceId: string }) => config.panelResourceId === resourceId);
        if (!resourceConfig) {
          throw new Error(`Resource config not found for ${resourceId}`);
        }
        
        // Construct the full content key in the same format as ScriptureViewer
        const contentKey = `${resourceConfig.metadata.server}/${resourceConfig.metadata.owner}/${resourceConfig.metadata.language}/${resourceConfig.metadata.id}/${currentReference.book}`;
        
        const content = await resourceManager.getOrFetchContent(
          contentKey, // Full key format: server/owner/language/resourceId/book
          resourceConfig.metadata.type as any // Resource type from metadata
        );
        
        if (content) {
          // Debug: Log the content structure
          console.log(`🔍 NotesViewer received content for ${currentReference.book}:`, {
            contentKeys: Object.keys(content),
            hasNotes: !!(content as any).notes,
            notesType: typeof (content as any).notes,
            notesIsArray: Array.isArray((content as any).notes),
            notesLength: Array.isArray((content as any).notes) ? (content as any).notes.length : 'N/A'
          });
          
          // Handle both wrapped and unwrapped content structures
          const wrappedContent = content as any;
          
          // Check if content is wrapped as { notes: ProcessedNotes }
          if (wrappedContent && wrappedContent.notes && typeof wrappedContent.notes === 'object' && !Array.isArray(wrappedContent.notes)) {
            const processedNotes = wrappedContent.notes as ProcessedNotes;
            if (processedNotes && processedNotes.notes && Array.isArray(processedNotes.notes)) {
              setActualNotes(processedNotes);
            } else {
              setDisplayError(`Invalid notes content structure for ${currentReference.book}`);
            }
          } 
          // Check if content is unwrapped ProcessedNotes directly
          else if (wrappedContent && wrappedContent.notes && Array.isArray(wrappedContent.notes)) {
            // Content is ProcessedNotes directly
            const processedNotes = wrappedContent as ProcessedNotes;
            setActualNotes(processedNotes);
          } else {
            setDisplayError(`Invalid notes content structure for ${currentReference.book}`);
          }
        } else {
          setDisplayError(`No notes found for ${currentReference.book}`);
        }
        
        // Use existing metadata from resource config for language direction
        setResourceMetadata(resourceConfig.metadata);
      } catch (err) {
        setDisplayError(err instanceof Error ? err.message : 'Failed to load notes');
      } finally {
        setContentLoading(false);
      }
    };

    fetchContent();
  }, [resourceManager, resourceId, currentReference.book, propNotes]);

  // Load original language content for quote matching
  useEffect(() => {
    if (!resourceManager || !currentReference.book) {
      
      return;
    }

    const loadOriginalLanguageContent = async () => {
      try {
        
        
        // Determine testament from current book
        const testament = getTestamentFromBook(currentReference.book);
        if (!testament) {
          console.warn(`⚠️ NotesViewer - Cannot determine testament for book: ${currentReference.book}`);
          return;
        }

        // Get configuration for the testament
        const config = ORIGINAL_LANGUAGE_CONFIG[testament];
        
        
        
        // Construct content key for the original language resource (same pattern as OriginalScriptureViewer)
        // Format: server/owner/language/resourceId/book
        const contentKey = `git.door43.org/${config.owner}/${config.language}/${config.resourceId}/${currentReference.book}`;
        
        
        // Try to get content using the resource manager
        const content = await resourceManager.getOrFetchContent(
          contentKey,
          'scripture' as any // Resource type
        );
        
        
        setOriginalScripture(content as OptimizedScripture);
        
      } catch (err) {
        console.error(`❌ NotesViewer - Failed to load original language content:`, err);
        // Don't set error state - quote matching is optional functionality
        setOriginalScripture(null);
      }
    };

    loadOriginalLanguageContent();
  }, [resourceManager, currentReference.book, ORIGINAL_LANGUAGE_CONFIG]);

  const displayNotes = actualNotes || propNotes;
  const isLoading = loading || contentLoading;

  // Filter notes by current navigation range
  const filteredNotesByNavigation = useMemo(() => {
    if (!actualNotes?.notes || !currentReference) {
      return actualNotes?.notes || [];
    }
    
    return actualNotes.notes.filter((note: TranslationNote) => {
      if (!note.reference) return false;
      
      try {
        // Parse chapter and verse from reference (e.g., "1:1" -> chapter: 1, verse: 1)
        const refParts = note.reference.split(':');
        const noteChapter = parseInt(refParts[0] || '1');
        
        // Parse verse part which might be a range (e.g., "3-4" or just "3")
        const versePart = refParts[1] || '1';
        let noteVerse: number;
        
        if (versePart.includes('-')) {
          // For verse ranges, use the start verse for filtering
          noteVerse = parseInt(versePart.split('-')[0] || '1');
        } else {
          // Single verse
          noteVerse = parseInt(versePart);
        }
      
        // Determine the range bounds (default to single verse/chapter if no end specified)
        const startChapter = currentReference.chapter;
        const startVerse = currentReference.verse;
        const endChapter = currentReference.endChapter || currentReference.chapter;
        const endVerse = currentReference.endVerse || currentReference.verse;
        
        // Skip filtering if we don't have valid chapter/verse data
        if (!startChapter || !startVerse) {
          return true;
        }
        
        // Check if note is within the chapter range
        if (noteChapter < startChapter) {
          return false;
        }
        if (endChapter && noteChapter > endChapter) {
          return false;
        }
        
        // Filter by start verse in start chapter
        if (noteChapter === startChapter && noteVerse < startVerse) {
          return false;
        }
        
        // Filter by end verse in end chapter
        if (endChapter && endVerse && noteChapter === endChapter && noteVerse > endVerse) {
          return false;
        }
        
        return true;
      } catch (error) {
        console.warn(`⚠️ NotesViewer - Error parsing note reference ${note.reference}:`, error);
        return false;
      }
    });
  }, [actualNotes, currentReference]);

  // Process quote matches ONLY for navigation-filtered notes
  useEffect(() => {
    if (!originalScripture || !filteredNotesByNavigation.length || !currentReference.book) {
      
      setQuoteMatches(new Map());
      return;
    }

    const processQuoteMatches = async () => {
      try {

        const newQuoteMatches = new Map<string, QuoteMatchResult>();
        let shouldUpdateStorage = false;

        // Process each navigation-filtered note that has a quote
        for (const note of filteredNotesByNavigation) {
          if (!note.quote || !note.reference) {
            continue;
          }

          try {
            // Parse the note reference to get chapter and verse info (supports ranges like "2:3-4")
            const refParts = note.reference.split(':');
            const noteChapter = parseInt(refParts[0] || '1');
            
            // Parse verse part which might be a range (e.g., "3-4" or just "3")
            const versePart = refParts[1] || '1';
            let noteStartVerse: number;
            let noteEndVerse: number;
            
            if (versePart.includes('-')) {
              // Handle verse range (e.g., "3-4")
              const verseParts = versePart.split('-');
              noteStartVerse = parseInt(verseParts[0] || '1');
              noteEndVerse = parseInt(verseParts[1] || noteStartVerse.toString());
            } else {
              // Single verse
              noteStartVerse = parseInt(versePart);
              noteEndVerse = noteStartVerse;
            }
            
            // Validate parsed values
            if (isNaN(noteChapter) || isNaN(noteStartVerse) || isNaN(noteEndVerse) || 
                noteChapter < 1 || noteStartVerse < 1 || noteEndVerse < noteStartVerse) {
              console.warn(`⚠️ NotesViewer - Invalid reference format for note ${note.id}: ${note.reference}`);
              continue;
            }
            
            // Create quote reference for the matcher
            const quoteReference = {
              book: currentReference.book,
              startChapter: noteChapter,
              startVerse: noteStartVerse,
              endChapter: noteChapter, // Same chapter for now (could be extended for multi-chapter ranges)
              endVerse: noteEndVerse
            };

            // Validate quote text (trim whitespace and check for meaningful content)
            const cleanQuote = note.quote.trim();
            if (cleanQuote.length < 2) {
              console.warn(`⚠️ NotesViewer - Quote too short for note ${note.id}: "${cleanQuote}"`);
              continue;
            }

            // Parse occurrence with validation
            const occurrence = Math.max(1, parseInt(note.occurrence || '1'));
            if (isNaN(occurrence)) {
              console.warn(`⚠️ NotesViewer - Invalid occurrence for note ${note.id}: ${note.occurrence}`);
              continue;
            }

            // Use quote matcher to find original tokens (or use cached tokens if available)
            let matchResult;
            if (note.quoteTokens && note.quoteTokens.length > 0) {
              // Use cached tokens
              
              matchResult = {
                success: true,
                totalTokens: note.quoteTokens,
                matches: [], // We don't need the full match details when using cached tokens
                error: undefined
              };
            } else {
              // Calculate tokens using quote matcher
              matchResult = quoteMatcher.findOriginalTokens(
                originalScripture.chapters,
                cleanQuote,
                occurrence,
                quoteReference
              );
              
              // Cache the calculated tokens for future use
              if (matchResult.success && matchResult.totalTokens.length > 0) {
                note.quoteTokens = matchResult.totalTokens;
                
                
                // Mark that we need to save the updated notes back to storage
                shouldUpdateStorage = true;
              }
            }

            const noteKey = note.id || `${note.reference}-${cleanQuote}`;
            
            if (matchResult.success) {
              newQuoteMatches.set(noteKey, matchResult);
            } else {
              console.warn(`⚠️ NotesViewer - No quote match found for note ${note.id}:`, {
                quote: cleanQuote,
                occurrence,
                reference: note.reference,
                error: matchResult.error
              });
              // Store failed match result for UI feedback
              newQuoteMatches.set(noteKey, matchResult);
            }
          } catch (noteError) {
            console.error(`❌ NotesViewer - Error processing note ${note.id}:`, noteError);
            // Continue processing other notes
            continue;
          }
        }

        setQuoteMatches(newQuoteMatches);
        

        // Save updated notes with cached quoteTokens back to storage
        if (shouldUpdateStorage && actualNotes) {
          try {
            
            // Note: For now, we'll just log the intent to save. 
            // The actual saving would need to be implemented through the storage service
            // or by triggering a re-fetch that would cache the updated notes.
            
          } catch (saveError) {
            console.error('❌ NotesViewer - Failed to save updated notes:', saveError);
          }
        }

      } catch (err) {
        console.error('❌ NotesViewer - Failed to process quote matches:', err);
        setQuoteMatches(new Map());
      }
    };

    processQuoteMatches();
  }, [originalScripture, filteredNotesByNavigation, currentReference.book, currentReference.chapter, currentReference.verse, quoteMatcher]);

  // Helper function to get tokens between two IDs from the received tokens
  const getMissingTokensBetween = useCallback((startId: number, endId: number, allTokens: OptimizedToken[]): OptimizedToken[] => {
    return allTokens.filter(token => token.id > startId && token.id < endId);
  }, []);

  // Helper function to check if all tokens are punctuation
  const areAllPunctuation = useCallback((tokens: OptimizedToken[]): boolean => {
    return tokens.every(token => 
      token.type === 'punctuation' || 
      /^[.,;:!?'"()[\]{}\-–—…]+$/.test(token.text.trim())
    );
  }, []);

  // Helper function to build quote with ellipsis for non-contiguous tokens
  const buildQuoteWithEllipsis = useCallback((alignedTokens: OptimizedToken[]): string => {
    if (alignedTokens.length === 0) return '';
    
    // Sort tokens by ID to maintain natural order
    const sortedTokens = alignedTokens.sort((a, b) => a.id - b.id);
    
    if (sortedTokens.length === 1) {
      return sortedTokens[0].text.trim();
    }
    
    const result: string[] = [];
    
    for (let i = 0; i < sortedTokens.length; i++) {
      const currentToken = sortedTokens[i];
      const nextToken = sortedTokens[i + 1];
      
      // Add current token text
      result.push(currentToken.text.trim());
      
      // Check if there's a gap between current and next token
      if (nextToken) {
        const gap = nextToken.id - currentToken.id;
        
        // If gap is more than 1, there are missing tokens in between
        if (gap > 1) {
          // Check if the missing tokens are only punctuation
          const missingTokens = getMissingTokensBetween(currentToken.id, nextToken.id, scriptureTokens);
          
          if (missingTokens.length > 0 && areAllPunctuation(missingTokens)) {
            // Include the punctuation tokens
            missingTokens.forEach(token => {
              result.push(token.text.trim());
            });
          } else {
            // Use ellipsis for non-punctuation gaps
            result.push('...');
          }
        }
      }
    }
    
    return result.join(' ').trim();
  }, [scriptureTokens, getMissingTokensBetween, areAllPunctuation]);

  // Helper function to find received tokens aligned to original language tokens
  const findAlignedTokens = (originalTokens: OptimizedToken[], receivedTokens: OptimizedToken[]): OptimizedToken[] => {
    const alignedTokens: OptimizedToken[] = [];

    for (const originalToken of originalTokens) {
      // Look for received tokens that have alignment to this original token
      const matchingTokens = receivedTokens.filter(receivedToken => {
        // Check if the received token has alignment data pointing to the original token
        if (receivedToken.align && originalToken.id) {
          // The align field contains references to original language token IDs
          return receivedToken.align.includes(originalToken.id);
        }
        return false;
      });

      alignedTokens.push(...matchingTokens);
    }

    // Remove duplicates based on token ID
    const uniqueTokens = alignedTokens.filter((token, index, array) => 
      array.findIndex(t => t.id === token.id) === index
    );

    return uniqueTokens;
  };

  // Process target language quotes when we have both quote matches and received tokens
  useEffect(() => {
    const quoteBuildTime = Date.now();
    
    if (!scriptureTokens.length || !quoteMatches.size || !tokenBroadcastInfo) {
      
      setTargetLanguageQuotes(new Map());
      return;
    }

    const buildTargetLanguageQuotes = () => {
      try {
       
        const newTargetQuotes = new Map<string, {
          quote: string;
          tokens: OptimizedToken[];
          sourceLanguage: string;
        }>();

        // Process each quote match
        for (const [noteKey, quoteMatch] of quoteMatches.entries()) {
          if (!quoteMatch.success || !quoteMatch.totalTokens.length) {
            continue;
          }

          try {
            // Find received tokens that are aligned to the original language tokens
            const alignedTokens = findAlignedTokens(quoteMatch.totalTokens, scriptureTokens);
            
            if (alignedTokens.length > 0) {
              // Build the target language quote from aligned tokens with ellipsis for gaps
              const targetQuote = buildQuoteWithEllipsis(alignedTokens);

              if (targetQuote) {
                newTargetQuotes.set(noteKey, {
                  quote: targetQuote,
                  tokens: alignedTokens,
                  sourceLanguage: tokenBroadcastInfo.resourceMetadata.language
                });

              }
            }
          } catch (err) {
            console.error(`❌ NotesViewer - Error building target quote for ${noteKey}:`, err);
          }
        }

        setTargetLanguageQuotes(newTargetQuotes);
        

      } catch (err) {
        console.error('❌ NotesViewer - Failed to build target language quotes:', err);
        setTargetLanguageQuotes(new Map());
      }
    };

    buildTargetLanguageQuotes();
  }, [scriptureTokens, quoteMatches, tokenBroadcastInfo, buildQuoteWithEllipsis]);

  // Function to get the color for a note using the same cycling logic as token groups
  // Always use the original navigation-filtered notes (before token filter) to maintain consistent colors
  const getNoteColor = useCallback((note: TranslationNote): string => {
    // Use filteredNotesByNavigation (first filter only) to maintain consistent color indices
    // This ensures colors don't change when the second filter (token filter) is applied
    const originalNotesWithColorIndicators = filteredNotesByNavigation.filter(shouldNoteHaveColorIndicator);
    const colorIndicatorIndex = originalNotesWithColorIndicators.findIndex(n => 
      (n.id || `${n.reference}-${n.quote}`) === (note.id || `${note.reference}-${note.quote}`)
    );
    
    // Use the same cycling logic as the token underlining context
    const colorIndex = colorIndicatorIndex % COLOR_CLASSES.length;
    return COLOR_CLASSES[colorIndex].bgColor;
  }, [filteredNotesByNavigation, shouldNoteHaveColorIndicator]);

  // Apply secondary filter (token or verse reference) on top of navigation-filtered notes with fallback
  const { filteredNotes, secondaryFilterCount, secondaryFilterType } = useMemo(() => {
    // If no secondary filter is active, return navigation-filtered notes
    if (!tokenFilter && !verseReferenceFilter) {
      return { 
        filteredNotes: filteredNotesByNavigation, 
        secondaryFilterCount: filteredNotesByNavigation.length,
        secondaryFilterType: 'none' as const
      };
    }

    // Handle token filter (quote-based filtering)
    if (tokenFilter && quoteMatches.size > 0) {


      // Filter notes that have quote matches containing the clicked token
      const tokenFilteredNotes = filteredNotesByNavigation.filter(note => {
        const noteKey = note.id || `${note.reference}-${note.quote}`;
        const quoteMatch = quoteMatches.get(noteKey);
        
        if (!quoteMatch || !quoteMatch.totalTokens.length) {
          return false;
        }

        // Check if any of the note's matched tokens have the same ID as the clicked token
        const hasMatchingToken = quoteMatch.totalTokens.some(token => 
          token.id.toString() === tokenFilter.originalLanguageToken.semanticId ||
          (tokenFilter.originalLanguageToken.alignedSemanticIds && 
           tokenFilter.originalLanguageToken.alignedSemanticIds.includes(token.id.toString()))
        );

        return hasMatchingToken;
      });

      // Fallback: If token filter produces no results, show all navigation-filtered notes
      // but keep the actual filter count (0) for display
      if (tokenFilteredNotes.length === 0) {
        
        return { 
          filteredNotes: filteredNotesByNavigation, 
          secondaryFilterCount: 0,
          secondaryFilterType: 'token' as const
        };
      }

      return { 
        filteredNotes: tokenFilteredNotes, 
        secondaryFilterCount: tokenFilteredNotes.length,
        secondaryFilterType: 'token' as const
      };
    }

    // Handle verse reference filter
    if (verseReferenceFilter) {


      // Filter notes that match the specific verse reference
      const verseFilteredNotes = filteredNotesByNavigation.filter(note => {
        // Parse the note's reference to extract chapter and verse
        const referenceMatch = note.reference.match(/^(\d+):(\d+)$/);
        if (!referenceMatch) {
          return false; // Skip notes with invalid reference format
        }

        const noteChapter = parseInt(referenceMatch[1], 10);
        const noteVerse = parseInt(referenceMatch[2], 10);

        // Check if note matches the verse reference filter
        const matches = noteChapter === verseReferenceFilter.verseReference.chapter &&
                       noteVerse === verseReferenceFilter.verseReference.verse;

        return matches;
      });

      // Apply fallback logic like token filter - if no results, show navigation-filtered notes
      // but keep the actual filter count (0) for display
      if (verseFilteredNotes.length === 0) {
        
        return { 
          filteredNotes: filteredNotesByNavigation, 
          secondaryFilterCount: 0,
          secondaryFilterType: 'verse' as const
        };
      }

      return { 
        filteredNotes: verseFilteredNotes, 
        secondaryFilterCount: verseFilteredNotes.length,
        secondaryFilterType: 'verse' as const
      };
    }

    // Default case (shouldn't reach here)
    return { 
      filteredNotes: filteredNotesByNavigation, 
      secondaryFilterCount: filteredNotesByNavigation.length,
      secondaryFilterType: 'none' as const
    };
  }, [filteredNotesByNavigation, tokenFilter, verseReferenceFilter, quoteMatches]);

  const lastAutoActivatedNoteRef = useRef<string | null>(null);
  const lastAutoActivatedTokenRef = useRef<string | null>(null);
  const lastVerseFilterRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentTokenId = tokenFilter?.originalLanguageToken?.semanticId;
    const currentVerseFilter = verseReferenceFilter ? 
      `${verseReferenceFilter.verseReference.chapter}:${verseReferenceFilter.verseReference.verse}` : null;
    
    // Only auto-activate for token filters, not verse reference filters
    if (tokenFilter && secondaryFilterType === 'token' && secondaryFilterCount > 0 && currentTokenId) {
      const firstNote = filteredNotes[0];
      const noteKey = firstNote.id || `${firstNote.reference}-${firstNote.quote}`;
      
      // Only auto-activate if this is a new token or a different first note
      const isNewToken = lastAutoActivatedTokenRef.current !== currentTokenId;
      const isDifferentFirstNote = lastAutoActivatedNoteRef.current !== noteKey;
      
      if (isNewToken || isDifferentFirstNote) {
        
        
        // Update refs to prevent re-triggering
        lastAutoActivatedTokenRef.current = currentTokenId;
        lastAutoActivatedNoteRef.current = noteKey;
        
        setActiveNoteId(noteKey);
        
        // Broadcast the selection
        const tokenGroupId = `notes-${noteKey}`;
        const noteSelectionBroadcast: NoteSelectionBroadcast = {
          type: 'note-selection-broadcast',
          lifecycle: 'event',
          selectedNote: {
            noteId: noteKey,
            tokenGroupId: tokenGroupId,
            quote: firstNote.quote,
            reference: firstNote.reference
          },
          sourceResourceId: resourceId,
          timestamp: Date.now()
        };
        (linkedPanelsAPI.messaging as any).sendToAll(noteSelectionBroadcast);
      }
    } else if (tokenFilter && secondaryFilterType === 'token' && secondaryFilterCount === 0) {
      // Clear active state when token filter produces no results
      
      lastAutoActivatedTokenRef.current = null;
      lastAutoActivatedNoteRef.current = null;
      setActiveNoteId(null);
    } else if (verseReferenceFilter && secondaryFilterType === 'verse') {
      // Only clear active state when verse reference filter is FIRST applied (not on re-evaluations)
      const isNewVerseFilter = lastVerseFilterRef.current !== currentVerseFilter;
      if (isNewVerseFilter) {
        
        lastAutoActivatedTokenRef.current = null;
        lastAutoActivatedNoteRef.current = null;
        lastVerseFilterRef.current = currentVerseFilter;
        setActiveNoteId(null);
      }
    } else if (!tokenFilter && !verseReferenceFilter) {
      // Clear refs when no filters are active
      lastAutoActivatedTokenRef.current = null;
      lastAutoActivatedNoteRef.current = null;
      lastVerseFilterRef.current = null;
    }
  }, [tokenFilter?.originalLanguageToken?.semanticId, verseReferenceFilter, secondaryFilterType, secondaryFilterCount, filteredNotes, resourceId, linkedPanelsAPI]);

  // Send note token groups when quote matches are updated (with debouncing)
  useEffect(() => {
    // Guard against invalid states that could cause infinite loops
    if (!currentReference.book || !resourceMetadata?.id || isLoading || !processedResourceConfig || !linkedPanelsAPI?.messaging) {
      return; // Early return if invalid state
    }

    // Additional guard: Don't broadcast if we're in a cleanup phase (no notes or no original scripture)
    if (!displayNotes?.notes?.length || !originalScripture) {
      
      return;
    }
    
    // Create a stable hash of the current state to prevent duplicate broadcasts
    const contentHash = `${quoteMatches.size}-${resourceMetadata.id}`;
    const navigationHash = `${currentReference.book}-${currentReference.chapter}-${currentReference.verse}`;
    const stateHash = `${navigationHash}-${contentHash}`;
    
    // Always broadcast when navigation changes, or when content changes
    const navigationChanged = lastBroadcastRef.current && !lastBroadcastRef.current.startsWith(navigationHash);
    const shouldBroadcast = lastBroadcastRef.current !== stateHash || navigationChanged;
    
    if (shouldBroadcast) {
      // Add a small delay to avoid broadcasting during rapid state changes
      const timeoutId = setTimeout(() => {
        try {
          const tokenGroups: NoteTokenGroup[] = [];
          
          // Create a stable snapshot of quoteMatches to avoid reference issues
          const quoteMatchesSnapshot = Array.from(quoteMatches.entries());
          
          // Get the list of notes with color indicators (before token filter) for consistent color indexing
          const notesWithColorIndicators = filteredNotesByNavigation.filter(shouldNoteHaveColorIndicator);
          
          for (const [noteKey, quoteMatch] of quoteMatchesSnapshot) {
            // Find note using the same key construction logic as quote matching
            // IMPORTANT: Use filteredNotes (not filteredNotesByNavigation) so only currently filtered notes get broadcast
            const note = filteredNotes.find(n => {
              const key = n.id || `${n.reference}-${n.quote}`;
              return key === noteKey;
            });
            if (note && quoteMatch.totalTokens.length > 0) {
              // Calculate color index based on position in the original navigation-filtered list
              const colorIndicatorIndex = notesWithColorIndicators.findIndex(n => 
                (n.id || `${n.reference}-${n.quote}`) === (note.id || `${note.reference}-${note.quote}`)
              );
              const colorIndex = colorIndicatorIndex >= 0 ? colorIndicatorIndex % COLOR_CLASSES.length : 0;
              
              tokenGroups.push({
                noteId: note.id || noteKey,
                noteReference: note.reference,
                quote: note.quote,
                occurrence: parseInt(note.occurrence || '1') || 1,
                tokens: quoteMatch.totalTokens,
                colorIndex: colorIndex
              });
            }
          }

          // Always send a broadcast (either with tokens or empty for cleanup)
          const broadcastContent = createNotesTokenGroupsBroadcast(
            resourceId,
            {
              book: currentReference.book,
              chapter: currentReference.chapter || 1,
              verse: currentReference.verse || 1,
              endChapter: currentReference.endChapter,
              endVerse: currentReference.endVerse
            },
            tokenGroups,
            resourceMetadata
          );

          // Send state message - linked-panels will handle deduplication automatically
          linkedPanelsAPI.messaging.sendToAll(broadcastContent);
          
        } catch (error) {
          console.error('❌ Error broadcasting note token groups:', error);
        }
        
        lastBroadcastRef.current = stateHash;
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
    
    // Return empty cleanup function if no broadcast was scheduled
    return undefined;
  }, [currentReference, resourceMetadata, quoteMatches.size, isLoading, processedResourceConfig, linkedPanelsAPI, resourceId, filteredNotes.length, filteredNotes]);

  // Cleanup: Silent cleanup without broadcasts to prevent infinite loops
  // Unmount cleanup pattern from team-review: Send superseding clear state message
  useEffect(() => {
    // Cleanup function to clear all note token groups when component unmounts
    return () => {
      // Send superseding empty state message (following team-review pattern)
      // This works even if component state is stale because we create a minimal clear message
      if (linkedPanelsAPI?.messaging) {
        try {
          const clearBroadcast: NotesTokenGroupsBroadcast = {
            type: 'notes-token-groups-broadcast',
            lifecycle: 'state',
            stateKey: 'current-notes-token-groups',
            sourceResourceId: resourceId,
            reference: { book: '', chapter: 1, verse: 1 }, // Minimal reference for clear message
            tokenGroups: [], // Empty array clears all token groups
            resourceMetadata: { id: 'cleared', language: '', type: 'notes' }, // Special marker
            timestamp: Date.now()
          };

          linkedPanelsAPI.messaging.sendToAll(clearBroadcast);
          
        } catch (error) {
          console.error('❌ Error during NotesViewer unmount cleanup:', error);
        }
      }
    };
  }, []); // Empty dependency array is INTENTIONAL - ensures cleanup only on unmount (team-review pattern)

  // Handle clicking on support reference links
  const { openModal } = useResourceModal();
  
  const handleSupportReferenceClick = useCallback((supportReference: string) => {
    if (!isTranslationAcademyLink(supportReference)) {
      return;
    }

    const parsed = parseRcLink(supportReference);
    
    if (parsed.isValid) {
      
      
      // Open Translation Academy modal
      openModal({
        type: 'ta',
        id: parsed.fullArticleId,
        title: parsed.articleId
      });
    }
  }, [openModal]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading translation notes...</Text>
          {currentReference.book && (
            <Text style={styles.loadingSubtext}>Book: {currentReference.book}</Text>
          )}
        </View>
      </View>
    );
  }

  if (displayError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="warning" size={24} />
          <Text style={styles.errorTitle}>Error loading notes</Text>
          <Text style={styles.errorMessage}>{displayError}</Text>
        </View>
      </View>
    );
  }

  if (!displayNotes) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyText}>No notes available</Text>
          <Text style={styles.emptySubtext}>Resource: {resourceId}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Token Filter Banner */}
      {tokenFilter && (
        <View style={styles.filterBanner}>
          <View style={styles.filterContent}>
            <Icon name="search" size={16} />
            <Text style={styles.filterToken}>
              {tokenFilter.originalLanguageToken.content}
            </Text>
            <Text style={styles.filterCount}>
              ({secondaryFilterCount})
            </Text>
          </View>
          <Pressable
            onPress={() => setTokenFilter(null)}
            style={styles.filterCloseButton}
          >
            <Text style={styles.filterCloseText}>×</Text>
          </Pressable>
        </View>
      )}

      {/* Verse Reference Filter Banner */}
      {verseReferenceFilter && (
        <View style={styles.verseFilterBanner}>
          <View style={styles.filterContent}>
            <Icon name="search" size={16} />
            <Text style={styles.filterToken}>
              {verseReferenceFilter.verseReference.chapter}:{verseReferenceFilter.verseReference.verse}
            </Text>
            <Text style={styles.filterCount}>
              ({secondaryFilterCount})
            </Text>
          </View>
          <Pressable
            onPress={() => setVerseReferenceFilter(null)}
            style={styles.filterCloseButton}
          >
            <Text style={styles.filterCloseText}>×</Text>
          </Pressable>
        </View>
      )}
        
      {/* Notes content */}
      <ScrollView 
        style={[
          styles.notesContent,
          // Apply RTL styling based on metadata
          resourceMetadata?.languageDirection === 'rtl' && styles.rtlContent
        ]}
      >
        {filteredNotes.length === 0 ? (
          <View style={styles.emptyNotesContainer}>
            <Text style={styles.emptyNotesIcon}>📝</Text>
            <Text style={styles.emptyNotesText}>No notes for this selection</Text>
          </View>
        ) : (
          <View style={styles.notesList}>
            {filteredNotes.map((note, index) => (
              <Pressable 
                key={note.id || index} 
                style={[
                  styles.noteCard,
                  shouldNoteHaveColorIndicator(note) && styles.noteCardClickable,
                  shouldNoteHaveColorIndicator(note) && activeNoteId === (note.id || `${note.reference}-${note.quote}`) && styles.noteCardActive
                ]}
                onPress={shouldNoteHaveColorIndicator(note) ? () => handleNoteClick(note) : undefined}
              >
                {/* Note header */}
                <View style={styles.noteHeader}>
                  {/* Color indicator that matches the underlining color - only for notes with quotes and occurrences */}
                  {shouldNoteHaveColorIndicator(note) && (
                    <View 
                      style={[styles.colorIndicator, { backgroundColor: getNoteColor(note) }]}
                    />
                  )}
                  <Text style={styles.noteReference}>
                    {note.reference}
                  </Text>
                </View>

                {/* Quoted text - show target language quote if available, otherwise original */}
                {note.quote && (
                  <View style={styles.quoteContainer}>
                    {(() => {
                      const noteKey = note.id || `${note.reference}-${note.quote}`;
                      const targetQuote = targetLanguageQuotes.get(noteKey);
                      
                      if (targetQuote) {
                        // Show target language quote when available
                        return (
                          <Text style={[styles.quoteText, { color: '#7c3aed', fontWeight: '600' }]}>
                            &ldquo;{targetQuote.quote}&rdquo;
                          </Text>
                        );
                      } else {
                        // Show original language quote when no target quote is built
                        return (
                          <Text style={styles.quoteText}>
                            &ldquo;{note.quote}&rdquo;
                          </Text>
                        );
                      }
                    })()}
                  </View>
                )}

                {/* Note content */}
                <View style={styles.noteContent}>
                  <SimpleMarkdownRenderer 
                    content={note.note}
                  />
                </View>

                {/* Translation Academy button */}
                {note.supportReference && isTranslationAcademyLink(note.supportReference) && (
                  <View style={styles.taButtonContainer}>
                    <TAButton 
                      supportReference={note.supportReference} 
                      onSupportReferenceClick={handleSupportReferenceClick}
                    />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc2626',
    marginTop: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyIcon: {
    fontSize: 24,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  filterBanner: {
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verseFilterBanner: {
    backgroundColor: '#f3e8ff',
    borderBottomWidth: 1,
    borderBottomColor: '#c4b5fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  filterToken: {
    fontSize: 14,
    fontFamily: 'monospace',
    backgroundColor: '#bfdbfe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  filterCount: {
    fontSize: 12,
    color: '#2563eb',
    marginLeft: 8,
  },
  filterCloseButton: {
    padding: 4,
  },
  filterCloseText: {
    fontSize: 18,
    color: '#2563eb',
  },
  notesContent: {
    flex: 1,
    padding: 12,
  },
  rtlContent: {
    // RTL specific styles if needed
  },
  emptyNotesContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyNotesIcon: {
    fontSize: 24,
    marginBottom: 12,
  },
  emptyNotesText: {
    fontSize: 16,
    color: '#6b7280',
  },
  notesList: {
    gap: 12,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  noteCardClickable: {
    // Additional styles for clickable notes
  },
  noteCardActive: {
    borderColor: '#9ca3af',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#9ca3af',
    marginRight: 8,
  },
  noteReference: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  quoteContainer: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#374151',
  },
  noteContent: {
    marginBottom: 8,
  },
  taButtonContainer: {
    marginTop: 8,
  },
  taButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  taButtonText: {
    fontSize: 14,
    color: '#1d4ed8',
    marginLeft: 4,
  },
});