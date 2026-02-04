/**
 * Translation Words Links Viewer Component - React Native Version
 * 
 * Displays Translation Words Links (TWL) content in the bt-synergy application.
 * Shows cross-reference links between Bible words and Translation Words definitions.
 * Preserves all original features in React Native format.
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
  NoteSelectionBroadcast,
  NoteTokenGroup
} from '../../types/scripture-messages';
import { Icon } from '../ui/Icon.native';

export interface TranslationWordsLinksViewerProps {
  resourceId: string;
  loading?: boolean;
  error?: string;
  links?: any;
  currentChapter?: number;
  onLinkPress?: (link: any) => void;
  onWordHighlight?: (origWords: string, occurrence: number) => void;
  onTranslationWordPress?: (twLink: string) => void;
  onLinksFiltered?: (
    loadTranslationWordsContent: () => Promise<
      {
        link: any;
        articleId: string;
        title: string;
        content: unknown;
      }[]
    >
  ) => void;
  compact?: boolean;
  className?: string;
}

export const TranslationWordsLinksViewer: React.FC<
  TranslationWordsLinksViewerProps
> = ({
  resourceId,
  loading = false,
  error,
  links: propLinks,
  currentChapter = 1,
  onLinkPress,
  onWordHighlight,
  onTranslationWordPress,
  onLinksFiltered,
  compact = false,
  className = '',
}) => {
    const resourceManager = useWorkspaceSelector(state => state.resourceManager);
    const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
    const { currentReference } = useNavigation();

    // Get linked-panels API for broadcasting TWL token groups
    const linkedPanelsAPI = useResourceAPI<any>(resourceId);

    // Use ref to avoid dependency issues
    const linkedPanelsAPIRef = useRef(linkedPanelsAPI);
    linkedPanelsAPIRef.current = linkedPanelsAPI;

    // Track the last broadcast state to prevent infinite loops
    const lastBroadcastRef = useRef<string>('');

    const [actualLinks, setActualLinks] = useState<any>(
      propLinks || null
    );
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

    // Original language content for quote matching
    const [originalScripture, setOriginalScripture] = useState<OptimizedScripture | null>(null);
    const [quoteMatches, setQuoteMatches] = useState<Map<string, QuoteMatchResult>>(new Map());
    const [quoteMatcher] = useState(() => new QuoteMatcher());

    // Target language quotes built from received tokens
    const [targetLanguageQuotes, setTargetLanguageQuotes] = useState<
      Map<
        string,
        {
          quote: string;
          tokens: OptimizedToken[];
          sourceLanguage: string;
        }
      >
    >(new Map());
    const [contentLoading, setContentLoading] = useState(false);
    const [displayError, setDisplayError] = useState<string | null>(
      error || null
    );
    const [resourceMetadata, setResourceMetadata] =
      useState<any>(null);

    // Token filter state (for filtering links by clicked tokens)
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

    // Verse reference filter state (for filtering links by verse reference)
    const [verseReferenceFilter, setVerseReferenceFilter] = useState<{
      verseReference: {
        book: string;
        chapter: number;
        verse: number;
      };
      sourceResourceId: string;
      timestamp: number;
    } | null>(null);

    // Track active link for toggle functionality
    const [activeLinkId, setActiveLinkId] = useState<string | null>(null);

    // TW button titles cache for TW links - using ref to avoid re-render issues
    const twButtonTitlesRef = useRef<Map<string, string>>(new Map());
    const [twButtonTitles, setTwButtonTitles] = useState<Map<string, string>>(
      new Map()
    );

    // Function to parse TW link
    const parseTWLink = (twLink: string) => {
      // Parse rc://*/tw/dict/bible/kt/god format
      const match = twLink.match(/rc:\/\/\*\/tw\/dict\/bible\/([^/]+)\/(.+)$/);
      if (match) {
        return {
          category: match[1], // kt, names, other
          term: match[2], // god, abraham, bread
        };
      }
      return { category: 'unknown', term: twLink };
    };

    // Function to fetch TW title for TW link buttons
    const fetchTWButtonTitle = useCallback(
      async (twLink: string): Promise<string> => {
        if (!resourceManager || !processedResourceConfig) {
          const twInfo = parseTWLink(twLink);
          return twInfo.term; // Fallback to term
        }

        const twInfo = parseTWLink(twLink);
        const cacheKey = `${twInfo.category}/${twInfo.term}`;

        // Check if already cached in ref (avoid re-render dependency)
        if (twButtonTitlesRef.current.has(cacheKey)) {
          return twButtonTitlesRef.current.get(cacheKey)!;
        }

        try {
          // Find TW resource config
          const twResourceConfig = processedResourceConfig.find(
            (config: any) =>
              config.metadata?.type === 'words' || config.metadata?.id === 'tw'
          );

          if (!twResourceConfig) {
            return twInfo.term; // Fallback to term
          }

          // Construct content key for TW article
          const articleId = `bible/${twInfo.category}/${twInfo.term}`;
          const contentKey = `${twResourceConfig.metadata.server}/${twResourceConfig.metadata.owner}/${twResourceConfig.metadata.language}/${twResourceConfig.metadata.id}/${articleId}`;

          const content = await resourceManager.getOrFetchContent(
            contentKey,
            twResourceConfig.metadata.type
          );

          if (content && (content as any).word?.term) {
            const title = (content as any).word.term;
            // Update both ref and state cache
            twButtonTitlesRef.current.set(cacheKey, title);
            setTwButtonTitles((prev) => new Map(prev).set(cacheKey, title));
            return title;
          }
        } catch (error) {
          console.warn(`Failed to fetch TW title for ${cacheKey}:`, error);
        }

        return twInfo.term; // Fallback to term
      },
      [resourceManager, processedResourceConfig]
    );

    // Component for TW button with fetched title
    const TWButton: React.FC<{
      twLink: string;
      onTWLinkClick: (twLink: string) => void;
    }> = React.memo(({ twLink, onTWLinkClick }) => {
      // Memoize the parsed result to prevent re-renders
      const twInfo = useMemo(() => parseTWLink(twLink), [twLink]);
      const cacheKey = `${twInfo.category}/${twInfo.term}`;

      // Check if we already have the title cached
      const cachedTitle = twButtonTitles.get(cacheKey);
      const [buttonTitle, setButtonTitle] = useState<string>(
        cachedTitle || twInfo.term
      );
      const [isLoading, setIsLoading] = useState(!cachedTitle);

      // Memoize the click handler to prevent re-renders
      const handleClick = useCallback(() => {
        onTWLinkClick(twLink);
      }, [twLink, onTWLinkClick]);

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
            const title = await fetchTWButtonTitle(twLink);
            setButtonTitle(title);
          } catch (error) {
            console.error(`Failed to load TW title for ${twLink}:`, error);
            setButtonTitle(twInfo.term); // Fallback
          } finally {
            setIsLoading(false);
          }
        };
        loadTitle();
      }, [twLink, cachedTitle, twInfo.term, fetchTWButtonTitle]);

      return (
        <Pressable
          onPress={handleClick}
          style={styles.twButton}
        >
          <Icon name="book-open" size={14} />
          <Text style={styles.twButtonText}>
            {isLoading ? '...' : buttonTitle}
          </Text>
        </Pressable>
      );
    });

    TWButton.displayName = 'TWButton';

    // Listen for scripture token broadcasts using useCurrentState hook
    const scriptureTokensBroadcast = useCurrentState<any>(
      resourceId,
      'current-scripture-tokens'
    );

    // Handle scripture token broadcasts (similar to NotesViewer)
    useEffect(() => {
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

    // Listen for token clicks via linked-panels events (transient messages)
    useMessaging({
      resourceId,
      eventTypes: ['token-click-broadcast'],
      onEvent: (event) => {
        if (event.type === 'token-click-broadcast') {
          const tokenClickEvent = event as any;


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
          const verseRefEvent = event as any;


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

    // Clear filters when navigation changes
    useEffect(() => {
      setTokenFilter(null);
      setVerseReferenceFilter(null);
    }, [currentReference.book, currentReference.chapter, currentReference.verse]);

    // Function to handle link selection and broadcast the event
    const handleLinkClick = useCallback((link: any) => {
      const linkKey = link.id || `${link.reference}-${link.origWords?.trim()}`;
      const tokenGroupId = `notes-${linkKey}`; // Use same format as USFMRenderer creates token groups

      // Toggle logic: if clicking the same link, deactivate it
      const isCurrentlyActive = activeLinkId === linkKey;
      const newActiveId = isCurrentlyActive ? null : linkKey;
      setActiveLinkId(newActiveId);


      // Broadcast link selection event (or clear event if toggling off)
      const linkSelectionBroadcast = {
        type: 'note-selection-broadcast',
        lifecycle: 'event',
        selectedNote: isCurrentlyActive ? null : {
          noteId: linkKey,
          tokenGroupId: tokenGroupId,
          quote: link.origWords,
          reference: `${currentReference.chapter}:${currentReference.verse}`
        },
        sourceResourceId: resourceId,
        timestamp: Date.now()
      };

      // Use the general messaging API
      (linkedPanelsAPIRef.current.messaging as any).sendToAll(linkSelectionBroadcast);
    }, [resourceId, activeLinkId, currentReference]);

    // Function to check if a link should have color indicator and be clickable
    const shouldLinkHaveColorIndicator = useCallback((link: any): boolean => {
      return !!(link.origWords && link.origWords.trim() && link.occurrence);
    }, []);

    // Testament-specific original language configuration (same as NotesViewer)
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


    // Handle clicking on TW links
    const { openModal } = useResourceModal();

    const handleTWLinkClick = useCallback((twLink: string) => {


      // Parse the TW link to get category and term
      const twInfo = parseTWLink(twLink);
      const wordId = `bible/${twInfo.category}/${twInfo.term}`;

      // Open Translation Words modal
      openModal({
        type: 'tw',
        id: wordId,
        title: twInfo.term
      });

      // Also call the optional prop if provided
      if (onTranslationWordPress) {
        onTranslationWordPress(twLink);
      }
    }, [openModal, onTranslationWordPress]);

    // Fetch content when navigation changes
    useEffect(() => {
      if (!resourceManager || !currentReference.book || propLinks || !processedResourceConfig) return;

      const fetchContent = async () => {
        try {
          setContentLoading(true);
          setDisplayError(null);
          setActualLinks(null);

          // Find the resource config
          const resourceConfig = processedResourceConfig.find((config: { panelResourceId: string }) => config.panelResourceId === resourceId);
          if (!resourceConfig) {
            throw new Error(`Resource config not found for ${resourceId}`);
          }

          // Construct the full content key
          const contentKey = `${resourceConfig.metadata.server}/${resourceConfig.metadata.owner}/${resourceConfig.metadata.language}/${resourceConfig.metadata.id}/${currentReference.book}`;

          const content = await resourceManager.getOrFetchContent(
            contentKey,
            resourceConfig.metadata.type
          );

          if (content) {
            // Handle both wrapped and unwrapped content structures
            const wrappedContent = content as any;

            // Check if content is wrapped as { wordsLinks: ProcessedWordsLinks }
            if (wrappedContent && wrappedContent.wordsLinks) {
              const processedLinks = wrappedContent.wordsLinks as any;
              if (processedLinks && processedLinks.links && Array.isArray(processedLinks.links)) {
                setActualLinks(processedLinks);
              } else {
                setDisplayError(`Invalid links content structure for ${currentReference.book}`);
              }
            }
            // Check if content is unwrapped ProcessedWordsLinks directly
            else if (wrappedContent && wrappedContent.links && Array.isArray(wrappedContent.links)) {
              // Content is ProcessedWordsLinks directly
              const processedLinks = wrappedContent as any;
              setActualLinks(processedLinks);
            } else {
              setDisplayError(`Invalid links content structure for ${currentReference.book}`);
            }
          } else {
            setDisplayError(`No links found for ${currentReference.book}`);
          }

          setResourceMetadata(resourceConfig.metadata);
        } catch (err) {
          setDisplayError(err instanceof Error ? err.message : 'Failed to load links');
        } finally {
          setContentLoading(false);
        }
      };

      fetchContent();
    }, [resourceManager, resourceId, currentReference.book, propLinks, processedResourceConfig]);

    // Load original language content for quote matching
    useEffect(() => {
      if (!resourceManager || !currentReference.book) {
        return;
      }

      const loadOriginalLanguageContent = async () => {
        try {


          const testament = getTestamentFromBook(currentReference.book);
          if (!testament) {
            console.warn(`⚠️ TWL - Cannot determine testament for book: ${currentReference.book}`);
            return;
          }

          const config = ORIGINAL_LANGUAGE_CONFIG[testament];

          const contentKey = `git.door43.org/${config.owner}/${config.language}/${config.resourceId}/${currentReference.book}`;

          const content = await resourceManager.getOrFetchContent(
            contentKey,
            'scripture' as any
          );


          setOriginalScripture(content as OptimizedScripture);

        } catch (err) {
          console.error(`❌ TWL - Failed to load original language content:`, err);
          setOriginalScripture(null);
        }
      };

      loadOriginalLanguageContent();
    }, [resourceManager, currentReference.book, ORIGINAL_LANGUAGE_CONFIG]);


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
          for (const [linkKey, quoteMatch] of quoteMatches.entries()) {
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
                  newTargetQuotes.set(linkKey, {
                    quote: targetQuote,
                    tokens: alignedTokens,
                    sourceLanguage: tokenBroadcastInfo.resourceMetadata.language
                  });

                }
              }
            } catch (err) {
              console.error(`❌ TWL - Error building target quote for ${linkKey}:`, err);
            }
          }

          setTargetLanguageQuotes(newTargetQuotes);


        } catch (err) {
          console.error('❌ TWL - Failed to build target language quotes:', err);
          setTargetLanguageQuotes(new Map());
        }
      };

      buildTargetLanguageQuotes();
    }, [scriptureTokens, quoteMatches, tokenBroadcastInfo, buildQuoteWithEllipsis]);

    const displayLinks = actualLinks || propLinks;
    const isLoading = loading || contentLoading;

    // Filter links by current navigation range (matching NotesViewer logic)
    const filteredLinksByNavigation = useMemo(() => {
      if (!displayLinks?.links || !currentReference) {
        return displayLinks?.links || [];
      }

      return displayLinks.links.filter((link: any) => {
        // Parse chapter and verse from reference (e.g., "1:1" -> chapter: 1, verse: 1)
        const refParts = link.reference.split(':');
        const linkChapter = parseInt(refParts[0] || '1');
        const linkVerse = parseInt(refParts[1] || '1');

        // Determine the range bounds (default to single verse/chapter if no end specified)
        const startChapter = currentReference.chapter;
        const startVerse = currentReference.verse;
        const endChapter = currentReference.endChapter || currentReference.chapter;
        const endVerse = currentReference.endVerse || currentReference.verse;

        // Skip filtering if we don't have valid chapter/verse data
        if (!startChapter || !startVerse) {
          return true;
        }

        // Check if link is within the chapter range
        if (linkChapter < startChapter) {
          return false;
        }
        if (endChapter && linkChapter > endChapter) {
          return false;
        }

        // Filter by start verse in start chapter
        if (linkChapter === startChapter && linkVerse < startVerse) {
          return false;
        }

        // Filter by end verse in end chapter
        if (endChapter && endVerse && linkChapter === endChapter && linkVerse > endVerse) {
          return false;
        }

        return true;
      });
    }, [displayLinks?.links, currentReference]);

    // Process quote matches ONLY for navigation-filtered links
    useEffect(() => {
      if (!originalScripture || !filteredLinksByNavigation.length || !currentReference.book) {

        setQuoteMatches(new Map());
        return;
      }

      const processQuoteMatches = async () => {
        try {

          const newQuoteMatches = new Map<string, QuoteMatchResult>();
          let shouldUpdateStorage = false;

          // Process each navigation-filtered link that has origWords
          for (const link of filteredLinksByNavigation) {
            if (!link.origWords || !link.reference) {
              continue;
            }

            try {
              // Parse the link reference to get chapter and verse info
              const refParts = link.reference.split(':');
              const linkChapter = parseInt(refParts[0] || '1');

              // Parse verse part which might be a range (e.g., "3-4" or just "3")
              const versePart = refParts[1] || '1';
              let linkStartVerse: number;
              let linkEndVerse: number;

              if (versePart.includes('-')) {
                // Handle verse range (e.g., "3-4")
                const verseParts = versePart.split('-');
                linkStartVerse = parseInt(verseParts[0] || '1');
                linkEndVerse = parseInt(verseParts[1] || linkStartVerse.toString());
              } else {
                // Single verse
                linkStartVerse = parseInt(versePart);
                linkEndVerse = linkStartVerse;
              }

              // Validate parsed values
              if (isNaN(linkChapter) || isNaN(linkStartVerse) || isNaN(linkEndVerse) ||
                linkChapter < 1 || linkStartVerse < 1 || linkEndVerse < linkStartVerse) {
                console.warn(`⚠️ TWL - Invalid reference format for link ${link.id}: ${link.reference}`);
                continue;
              }

              // Create quote reference for the matcher
              const quoteReference = {
                book: currentReference.book,
                startChapter: linkChapter,
                startVerse: linkStartVerse,
                endChapter: linkChapter, // Same chapter for now
                endVerse: linkEndVerse
              };

              // Validate quote text (trim whitespace and check for meaningful content)
              const cleanQuote = link.origWords.trim();
              if (cleanQuote.length < 1) {
                console.warn(`⚠️ TWL - Quote too short for link ${link.id}: "${cleanQuote}"`);
                continue;
              }

              // Parse occurrence with validation
              const occurrence = Math.max(1, parseInt(link.occurrence || '1'));
              if (isNaN(occurrence)) {
                console.warn(`⚠️ TWL - Invalid occurrence for link ${link.id}: ${link.occurrence}`);
                continue;
              }

              // Use quote matcher to find original tokens (or use cached tokens if available)
              let matchResult;
              if (link.quoteTokens && link.quoteTokens.length > 0) {
                // Use cached tokens

                matchResult = {
                  success: true,
                  totalTokens: link.quoteTokens,
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
                  link.quoteTokens = matchResult.totalTokens;


                  // Mark that we need to save the updated links back to storage
                  shouldUpdateStorage = true;
                }
              }

              const linkKey = link.id || `${link.reference}-${link.origWords?.trim()}`;

              if (matchResult.success) {

                newQuoteMatches.set(linkKey, matchResult);
              } else {
                console.warn(`⚠️ TWL - No quote match found for link ${link.id}:`, {
                  quote: cleanQuote,
                  occurrence,
                  reference: link.reference,
                  error: matchResult.error
                });
                // Store failed match result for UI feedback
                newQuoteMatches.set(linkKey, matchResult);
              }
            } catch (linkError) {
              console.error(`❌ TWL - Error processing link ${link.id}:`, linkError);
              // Continue processing other links
              continue;
            }
          }

          setQuoteMatches(newQuoteMatches);


          // Save updated links with cached quoteTokens back to storage
          if (shouldUpdateStorage && actualLinks) {
            try {

              // Note: For now, we'll just log the intent to save. 
              // The actual saving would need to be implemented through the storage service
              // or by triggering a re-fetch that would cache the updated links.

            } catch (saveError) {
              console.error('❌ TWL - Failed to save updated links:', saveError);
            }
          }

        } catch (err) {
          console.error('❌ TWL - Failed to process quote matches:', err);
          setQuoteMatches(new Map());
        }
      };

      processQuoteMatches();
    }, [originalScripture, filteredLinksByNavigation, currentReference.book, currentReference.chapter, currentReference.verse, quoteMatcher]);

    // Apply secondary filter (token or verse reference) on top of navigation-filtered links
    const { filteredLinks, secondaryFilterCount, secondaryFilterType } = useMemo(() => {
      if (!tokenFilter && !verseReferenceFilter) {
        return {
          filteredLinks: filteredLinksByNavigation,
          secondaryFilterCount: filteredLinksByNavigation.length,
          secondaryFilterType: 'none' as const
        };
      }

      // Handle token filter
      if (tokenFilter && quoteMatches.size > 0) {
        const tokenFilteredLinks = filteredLinksByNavigation.filter((link: any) => {
          const linkKey = link.id || `${link.reference}-${link.origWords?.trim()}`;
          const quoteMatch = quoteMatches.get(linkKey);

          if (!quoteMatch || !quoteMatch.totalTokens.length) {
            return false;
          }

          const hasMatchingToken = quoteMatch.totalTokens.some((token: any) =>
            token.id.toString() === tokenFilter.originalLanguageToken.semanticId ||
            (tokenFilter.originalLanguageToken.alignedSemanticIds &&
              tokenFilter.originalLanguageToken.alignedSemanticIds.includes(token.id.toString()))
          );

          return hasMatchingToken;
        });

        if (tokenFilteredLinks.length === 0) {
          return {
            filteredLinks: filteredLinksByNavigation,
            secondaryFilterCount: 0,
            secondaryFilterType: 'token' as const
          };
        }

        return {
          filteredLinks: tokenFilteredLinks,
          secondaryFilterCount: tokenFilteredLinks.length,
          secondaryFilterType: 'token' as const
        };
      }

      // Handle verse reference filter
      if (verseReferenceFilter) {
        const verseFilteredLinks = filteredLinksByNavigation.filter((link: any) => {
          // For TWL, we don't have specific verse references like notes
          // So we show all links when verse filter is applied
          return true;
        });

        return {
          filteredLinks: verseFilteredLinks,
          secondaryFilterCount: verseFilteredLinks.length,
          secondaryFilterType: 'verse' as const
        };
      }

      return {
        filteredLinks: filteredLinksByNavigation,
        secondaryFilterCount: filteredLinksByNavigation.length,
        secondaryFilterType: 'none' as const
      };
    }, [filteredLinksByNavigation, tokenFilter, verseReferenceFilter, quoteMatches]);

    // Auto-activate first item when token filter produces results (but NOT for verse reference filters)
    const lastAutoActivatedTokenRef = useRef<string | null>(null);
    const lastAutoActivatedLinkRef = useRef<string | null>(null);
    const lastVerseFilterRef = useRef<string | null>(null);

    useEffect(() => {
      const currentTokenId = tokenFilter?.originalLanguageToken?.semanticId;
      const currentVerseFilter = verseReferenceFilter ?
        `${verseReferenceFilter.verseReference.chapter}:${verseReferenceFilter.verseReference.verse}` : null;

      // Only auto-activate for token filters, not verse reference filters
      if (tokenFilter && secondaryFilterType === 'token' && secondaryFilterCount > 0 && currentTokenId) {
        const firstLink = filteredLinks[0];
        const linkKey = firstLink.id || `${firstLink.reference}-${firstLink.origWords?.trim()}`;

        // Only auto-activate if this is a new token or a different first link
        const isNewToken = lastAutoActivatedTokenRef.current !== currentTokenId;
        const isDifferentFirstLink = lastAutoActivatedLinkRef.current !== linkKey;

        if (isNewToken || isDifferentFirstLink) {


          // Update refs to prevent re-triggering
          lastAutoActivatedTokenRef.current = currentTokenId;
          lastAutoActivatedLinkRef.current = linkKey;

          setActiveLinkId(linkKey);

          // Broadcast the selection
          const tokenGroupId = `notes-${linkKey}`; // Use same format as USFMRenderer creates token groups
          const linkSelectionBroadcast: NoteSelectionBroadcast = {
            type: 'note-selection-broadcast',
            lifecycle: 'event',
            selectedNote: {
              noteId: linkKey,
              tokenGroupId: tokenGroupId,
              quote: firstLink.origWords || '',
              reference: firstLink.reference
            },
            sourceResourceId: resourceId,
            timestamp: Date.now()
          };
          (linkedPanelsAPI.messaging as any).sendToAll(linkSelectionBroadcast);
        }
      } else if (tokenFilter && secondaryFilterType === 'token' && secondaryFilterCount === 0) {
        // Clear active state when token filter produces no results

        lastAutoActivatedTokenRef.current = null;
        lastAutoActivatedLinkRef.current = null;
        setActiveLinkId(null);
      } else if (verseReferenceFilter && secondaryFilterType === 'verse') {
        // Only clear active state when verse reference filter is FIRST applied (not on re-evaluations)
        const isNewVerseFilter = lastVerseFilterRef.current !== currentVerseFilter;
        if (isNewVerseFilter) {

          lastAutoActivatedTokenRef.current = null;
          lastAutoActivatedLinkRef.current = null;
          lastVerseFilterRef.current = currentVerseFilter;
          setActiveLinkId(null);
        }
      } else if (!tokenFilter && !verseReferenceFilter) {
        // Clear refs when no filters are active
        lastAutoActivatedTokenRef.current = null;
        lastAutoActivatedLinkRef.current = null;
        lastVerseFilterRef.current = null;
      }
    }, [tokenFilter?.originalLanguageToken?.semanticId, verseReferenceFilter, secondaryFilterType, secondaryFilterCount, filteredLinks, resourceId, linkedPanelsAPI]);

    // Function to get the color for a link using the same cycling logic as token groups
    // Always use the original navigation-filtered links (before token filter) to maintain consistent colors
    const getLinkColor = useCallback((link: any): string => {
      // Use filteredLinksByNavigation (first filter only) to maintain consistent color indices
      // This ensures colors don't change when the second filter (token filter) is applied
      const originalLinksWithColorIndicators = filteredLinksByNavigation.filter(shouldLinkHaveColorIndicator);
      const colorIndicatorIndex = originalLinksWithColorIndicators.findIndex((l: any) =>
        (l.id || `${l.reference}-${l.origWords?.trim()}`) === (link.id || `${link.reference}-${link.origWords?.trim()}`)
      );

      // Use the same cycling logic as the token underlining context
      const colorIndex = colorIndicatorIndex % COLOR_CLASSES.length;

      // Convert COLOR_CLASSES bgColor to React Native color values
      const colorMap: Record<string, string> = {
        'bg-blue-500': '#3b82f6',
        'bg-green-500': '#10b981',
        'bg-purple-500': '#8b5cf6',
        'bg-indigo-500': '#6366f1',
        'bg-teal-500': '#14b8a6',
        'bg-cyan-500': '#06b6d4',
        'bg-violet-500': '#8b5cf6',
        'bg-sky-500': '#0ea5e9',
        'bg-emerald-500': '#10b981',
      };

      const bgColorClass = COLOR_CLASSES[colorIndex].bgColor;
      return colorMap[bgColorClass] || '#3b82f6'; // Default to blue if not found
    }, [filteredLinksByNavigation, shouldLinkHaveColorIndicator]);

    // Send TWL token groups when quote matches are updated (with debouncing)
    useEffect(() => {
      // Guard against invalid states that could cause infinite loops
      if (!currentReference.book || !resourceMetadata?.id || isLoading || !processedResourceConfig || !linkedPanelsAPI?.messaging) {
        return; // Early return if invalid state
      }

      // Additional guard: Don't broadcast if we're in a cleanup phase (no links or no original scripture)
      if (!displayLinks?.links?.length || !originalScripture) {

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

            // Get the list of links with color indicators (before token filter) for consistent color indexing
            const linksWithColorIndicators = filteredLinksByNavigation.filter(shouldLinkHaveColorIndicator);

            for (const [linkKey, quoteMatch] of quoteMatchesSnapshot) {
              // Find link using the same key construction logic as quote matching
              // IMPORTANT: Use displayLinks.links (not filteredLinks) so ALL links with quote matches get broadcast
              const link = displayLinks?.links?.find((l: any) => {
                const key = l.id || `${l.reference}-${l.origWords?.trim()}`;
                return key === linkKey;
              });
              if (link && quoteMatch.totalTokens.length > 0) {
                // Calculate color index based on position in the original navigation-filtered list
                const colorIndicatorIndex = linksWithColorIndicators.findIndex((l: any) =>
                  (l.id || `${l.reference}-${l.origWords?.trim()}`) === (link.id || `${link.reference}-${link.origWords?.trim()}`)
                );
                const colorIndex = colorIndicatorIndex >= 0 ? colorIndicatorIndex % COLOR_CLASSES.length : 0;

                tokenGroups.push({
                  noteId: link.id || linkKey,
                  noteReference: link.reference,
                  quote: link.origWords || '',
                  occurrence: parseInt(link.occurrence) || 1,
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
            console.error('❌ Error broadcasting TWL token groups:', error);
          }

          lastBroadcastRef.current = stateHash;
        }, 500);

        return () => clearTimeout(timeoutId);
      }

      // Return empty cleanup function if no broadcast was scheduled
      return undefined;
    }, [currentReference, resourceMetadata, quoteMatches.size, isLoading, processedResourceConfig, linkedPanelsAPI, resourceId, displayLinks?.links?.length]);

    // Cleanup: Silent cleanup without broadcasts to prevent infinite loops
    useEffect(() => {
      // Cleanup function to clear all TWL token groups when component unmounts
      return () => {
        if (linkedPanelsAPI?.messaging) {
          try {
            const clearBroadcast: NotesTokenGroupsBroadcast = {
              type: 'notes-token-groups-broadcast',
              lifecycle: 'state',
              stateKey: 'current-notes-token-groups',
              sourceResourceId: resourceId,
              reference: { book: '', chapter: 1, verse: 1 }, // Minimal reference for clear message
              tokenGroups: [], // Empty array clears all token groups
              resourceMetadata: { id: 'cleared', language: '', type: 'twl' }, // Special marker
              timestamp: Date.now()
            };

            linkedPanelsAPI.messaging.sendToAll(clearBroadcast);

          } catch (error) {
            console.error('❌ Error during TWL unmount cleanup:', error);
          }
        }
      };
    }, []); // Empty dependency array is INTENTIONAL - ensures cleanup only on unmount

    if (isLoading) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading translation words links...</Text>
            {currentReference.book && (
              <Text style={styles.loadingDetailsText}>Book: {currentReference.book}</Text>
            )}
          </View>
        </View>
      );
    }

    if (displayError) {
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Error loading links</Text>
            <Text style={styles.errorMessage}>{displayError}</Text>
          </View>
        </View>
      );
    }

    if (!displayLinks) {
      return (
        <View style={styles.container}>
          <View style={styles.noContentContainer}>
            <Text style={styles.noContentIcon}>🔗</Text>
            <Text style={styles.noContentTitle}>No links available</Text>
            <Text style={styles.noContentMessage}>Resource: {resourceId}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {/* Token Filter Banner */}
        {tokenFilter && (
          <View style={styles.filterBanner}>
            <View style={styles.filterBannerLeft}>
              <Icon name="search" size={16} color="#3b82f6" />
              <Text style={styles.filterBannerText}>
                {tokenFilter.originalLanguageToken.content}
              </Text>
              <Text style={styles.filterBannerCount}>
                ({secondaryFilterCount})
              </Text>
            </View>
            <Pressable
              onPress={() => setTokenFilter(null)}
              style={styles.filterBannerClose}
            >
              <Text style={styles.filterBannerCloseText}>×</Text>
            </Pressable>
          </View>
        )}

        {/* Verse Reference Filter Banner */}
        {verseReferenceFilter && (
          <View style={[styles.filterBanner, { backgroundColor: '#f3e8ff', borderColor: '#c084fc' }]}>
            <View style={styles.filterBannerLeft}>
              <Icon name="search" size={16} color="#8b5cf6" />
              <Text style={[styles.filterBannerText, { color: '#6b21a8' }]}>
                {verseReferenceFilter.verseReference.chapter}:{verseReferenceFilter.verseReference.verse}
              </Text>
              <Text style={[styles.filterBannerCount, { color: '#8b5cf6' }]}>
                ({secondaryFilterCount})
              </Text>
            </View>
            <Pressable
              onPress={() => setVerseReferenceFilter(null)}
              style={styles.filterBannerClose}
            >
              <Text style={styles.filterBannerCloseText}>×</Text>
            </Pressable>
          </View>
        )}

        {/* Links content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {filteredLinks.length === 0 ? (
            <View style={styles.noLinksContainer}>
              <Text style={styles.noLinksIcon}>🔗</Text>
              <Text style={styles.noLinksText}>No links for this selection</Text>
            </View>
          ) : (
            <View style={styles.linksList}>
              {filteredLinks.map((link: any, index: number) => (
                <View
                  key={link.id || index}
                  style={[
                    styles.linkItem,
                    shouldLinkHaveColorIndicator(link) && activeLinkId === (link.id || `${link.reference}-${link.origWords?.trim()}`)
                      ? styles.linkItemActive
                      : styles.linkItemInactive
                  ]}
                >
                  <Pressable
                    onPress={shouldLinkHaveColorIndicator(link) ? () => handleLinkClick(link) : undefined}
                    style={styles.linkPressable}
                  >
                    {/* Link header */}
                    <View style={styles.linkHeader}>
                      {/* Color indicator */}
                      {shouldLinkHaveColorIndicator(link) && (
                        <View
                          style={[styles.colorIndicator, { backgroundColor: getLinkColor(link) }]}
                        />
                      )}
                      {(() => {
                        const linkKey = link.id || `${link.reference}-${link.origWords?.trim()}`;
                        const targetQuote = targetLanguageQuotes.get(linkKey);

                        if (targetQuote) {
                          // Show target language quote when available
                          return (
                            <Text style={[styles.linkOrigWords, { color: '#7c3aed', fontWeight: '600' }]}>
                              {targetQuote.quote}
                            </Text>
                          );
                        } else {
                          // Show original language words when no target quote is built
                          return (
                            <Text style={styles.linkOrigWords}>
                              {link.origWords}
                            </Text>
                          );
                        }
                      })()}
                      {link.occurrence && (
                        <Text style={styles.linkOccurrence}>
                          ({link.occurrence})
                        </Text>
                      )}
                    </View>

                    {/* Translation Words button */}
                    {link.twLink && (
                      <View style={styles.twLinksContainer}>
                        <TWButton
                          twLink={link.twLink}
                          onTWLinkClick={handleTWLinkClick}
                        />
                      </View>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    marginTop: 16,
  },
  loadingDetailsText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorIcon: {
    fontSize: 24,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  noContentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  noContentIcon: {
    fontSize: 24,
    marginBottom: 16,
  },
  noContentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  noContentMessage: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  filterBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e40af',
  },
  filterBannerCount: {
    fontSize: 12,
    color: '#3b82f6',
  },
  filterBannerClose: {
    padding: 4,
  },
  filterBannerCloseText: {
    fontSize: 18,
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  noLinksContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  noLinksIcon: {
    fontSize: 24,
    marginBottom: 16,
  },
  noLinksText: {
    fontSize: 16,
    color: '#6b7280',
  },
  linksList: {
    padding: 12,
    gap: 12,
  },
  linkItem: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  linkItemActive: {
    borderColor: '#a7c7e7', // pastel blue
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 0,
  },
  linkItemInactive: {
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  linkPressable: {
    padding: 12,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  linkOrigWords: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  linkOccurrence: {
    fontSize: 12,
    color: '#6b7280',
  },
  linkContent: {
    marginBottom: 8,
  },
  linkContentText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  twLinksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  twButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    gap: 4,
  },
  twButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
});


