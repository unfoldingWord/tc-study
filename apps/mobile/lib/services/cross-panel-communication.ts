/**
 * Cross-Panel Communication Service for Token-Based Scripture Alignment
 * 
 * This service enables precise word-to-word highlighting across aligned scripture resources
 * using token IDs rather than Strong's numbers for maximum precision.
 */

// import { QuoteMatcher } from './quote-matcher';
import { generateSemanticId } from '../utils/semantic-id-generator';
import type { OptimizedChapter, OptimizedToken, ProcessedChapter, ProcessedVerse, WordToken } from './usfm-processor';

// Original Language Token - the common reference for all cross-panel communication
// Updated for optimized format with semantic IDs
export interface OriginalLanguageToken {
  semanticId: number; // Semantic ID for cross-panel matching
  content: string; // The actual Greek/Hebrew word (or combined words for groups)
  verseRef: string;
  strong?: string;
  lemma?: string;
  morph?: string;
  // Enhanced for nested alignments
  sourceWords?: string[]; // Multiple source words for nested alignments
  alignedSemanticIds?: number[]; // All semantic IDs this token represents
}

// Message types for cross-panel communication
export interface TokenHighlightMessage {
  type: 'HIGHLIGHT_TOKENS';
  sourceTokenId: number | string; // The clicked token ID (semantic ID or legacy string)
  sourceContent: string; // The clicked word content (for debugging)
  sourceVerseRef: string;
  originalLanguageToken: OriginalLanguageToken; // The original language token that everything aligns to
  sourceResourceId: string;
  timestamp: number;
}

export interface ClearHighlightsMessage {
  type: 'CLEAR_HIGHLIGHTS';
  sourceResourceId?: string;
  timestamp: number;
}

export interface TokenFilterMessage {
  type: 'FILTER_BY_TOKEN';
  originalLanguageToken: OriginalLanguageToken;
  sourceResourceId: string;
  timestamp: number;
}

export interface ClearTokenFilterMessage {
  type: 'CLEAR_TOKEN_FILTER';
  sourceResourceId?: string;
  timestamp: number;
}

export type CrossPanelMessage = TokenHighlightMessage | ClearHighlightsMessage | TokenFilterMessage | ClearTokenFilterMessage;

// Panel resource configuration
export interface PanelResource {
  resourceId: string;
  resourceType: 'ULT' | 'UST' | 'UGNT' | 'UHB';
  language: 'en' | 'el-x-koine' | 'hbo';
  chapters: ProcessedChapter[];
  isOriginalLanguage: boolean;
  // Support for optimized format
  optimizedChapters?: OptimizedChapter[];
  isOptimized?: boolean;
}

// Cross-panel communication service
export class CrossPanelCommunicationService {
  // private quoteMatcher: QuoteMatcher;
  private registeredPanels = new Map<string, PanelResource>();
  private activePanels = new Set<string>(); // Track which panels are currently mounted
  private messageHandlers = new Set<(message: CrossPanelMessage) => void>();
  
  constructor() {
    // this.quoteMatcher = new QuoteMatcher();
  }

  /**
   * Register a panel resource for cross-panel communication
   */
  registerPanel(panelResource: PanelResource): void {
    this.registeredPanels.set(panelResource.resourceId, panelResource);
    this.activePanels.add(panelResource.resourceId);
    
  }

  /**
   * Mark a panel as inactive (but keep it registered for cross-panel communication)
   */
  unregisterPanel(resourceId: string): void {
    // Only mark as inactive, don't remove from registry
    this.activePanels.delete(resourceId);
    
  }

  /**
   * Completely remove a panel from the registry (for cleanup)
   */
  removePanel(resourceId: string): void {
    this.registeredPanels.delete(resourceId);
    this.activePanels.delete(resourceId);
    
  }

  /**
   * Add a message handler for cross-panel communication
   */
  addMessageHandler(handler: (message: CrossPanelMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Handle token click - supports both legacy WordToken and optimized OptimizedToken
   */
  handleTokenClick(
    clickedToken: WordToken | OptimizedToken,
    sourceResourceId: string
  ): void {

    let originalLanguageToken: OriginalLanguageToken | null = null;

    // Check if this is an optimized token
    if ('id' in clickedToken && typeof clickedToken.id === 'number') {
      originalLanguageToken = this.createUnifiedOriginalLanguageTokenOptimized(
        clickedToken as OptimizedToken,
        sourceResourceId
      );
    } else {
      // Legacy WordToken handling
      originalLanguageToken = this.createUnifiedOriginalLanguageToken(
        clickedToken as WordToken,
        sourceResourceId
      );
    }

    if (!originalLanguageToken) {
      console.warn('❌ Could not create original language token for clicked token');
      return;
    }

    // Broadcast the highlight message
    const highlightMessage: TokenHighlightMessage = {
      type: 'HIGHLIGHT_TOKENS',
      sourceTokenId: 'id' in clickedToken ? clickedToken.id : clickedToken.uniqueId,
      sourceContent: 'text' in clickedToken ? clickedToken.text : clickedToken.content,
      sourceVerseRef: originalLanguageToken.verseRef,
      originalLanguageToken,
      sourceResourceId,
      timestamp: Date.now()
    };

    this.broadcastMessage(highlightMessage);
    

    // Also broadcast token filter message for notes filtering
    const filterMessage: TokenFilterMessage = {
      type: 'FILTER_BY_TOKEN',
      originalLanguageToken,
      sourceResourceId,
      timestamp: Date.now()
    };

    
    this.broadcastMessage(filterMessage);
  }

  /**
   * Create unified original language token for optimized format
   */
  private createUnifiedOriginalLanguageTokenOptimized(
    clickedToken: OptimizedToken,
    sourceResourceId: string
  ): OriginalLanguageToken | null {
    const sourcePanel = this.registeredPanels.get(sourceResourceId);
    
    if (sourcePanel?.isOriginalLanguage) {
      // Original language panel: clicked token IS the original language token
      
      
      return {
        semanticId: clickedToken.id,
        content: clickedToken.text,
        verseRef: this.extractVerseRefFromOptimizedPanel(sourcePanel, clickedToken),
        strong: clickedToken.strong,
        lemma: clickedToken.lemma,
        morph: clickedToken.morph
      };
    } else {
      // Target language panel: use align array for cross-panel communication
      
      
      if (clickedToken.align && clickedToken.align.length > 0) {
        // For nested alignments, create a token that represents all aligned semantic IDs
        const primarySemanticId = clickedToken.align[0];
        
        // Find the original language token details from registered original language panels
        const originalTokenDetails = this.findOriginalTokenBySemanticId(primarySemanticId);
        
        return {
          semanticId: primarySemanticId,
          content: originalTokenDetails?.text || clickedToken.text,
          verseRef: sourcePanel ? this.extractVerseRefFromOptimizedPanel(sourcePanel, clickedToken) : 'unknown',
          strong: originalTokenDetails?.strong,
          lemma: originalTokenDetails?.lemma,
          morph: originalTokenDetails?.morph,
          alignedSemanticIds: clickedToken.align // Include all aligned IDs for multi-word highlighting
        };
      }
    }
    
    return null;
  }

  /**
   * Find original language token details by semantic ID
   */
  private findOriginalTokenBySemanticId(semanticId: number): OptimizedToken | null {
    for (const [, panelData] of this.registeredPanels.entries()) {
      if (panelData.isOriginalLanguage && panelData.optimizedChapters) {
        for (const chapter of panelData.optimizedChapters) {
          for (const verse of chapter.verses) {
            for (const token of verse.tokens) {
              if (token.id === semanticId) {
                return token;
              }
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Extract verse reference from optimized panel structure
   */
  private extractVerseRefFromOptimizedPanel(panel: PanelResource, token: OptimizedToken): string {
    if (panel.optimizedChapters) {
      for (const chapter of panel.optimizedChapters) {
        for (const verse of chapter.verses) {
          if (verse.tokens.includes(token)) {
            // Assuming bookCode is available in panel metadata
            const bookCode = panel.resourceId.split('-')[0] || 'unknown';
            return `${bookCode} ${chapter.number}:${verse.number}`;
          }
        }
      }
    }
    return 'unknown';
  }

  /**
   * Create unified original language token - same output shape regardless of source panel type
   * Now uses alignment groups to handle nested alignments properly
   * LEGACY METHOD - for backward compatibility with WordToken
   */
  private createUnifiedOriginalLanguageToken(
    clickedToken: WordToken,
    sourceResourceId: string
  ): OriginalLanguageToken | null {
    const sourcePanel = this.registeredPanels.get(sourceResourceId);
    
    if (sourcePanel?.isOriginalLanguage) {
      // Original language panel: clicked token IS the original language token
      
      
      // For original language words, try to get Strong's number from alignment data
      // If not available, create a fallback based on the token content
      let strong = clickedToken.alignment?.strong;
      const lemma = clickedToken.alignment?.lemma || clickedToken.content;
      const morph = clickedToken.alignment?.morph;
      
      // Fallback for original language tokens without alignment data
      if (!strong) {
        // Create a pseudo-strong number based on content and position for consistency
        strong = `${clickedToken.verseRef}:${clickedToken.content}:${clickedToken.occurrence}`;
        
      }

      // For original language clicks, find if this word is part of any alignment group
      let alignmentGroupId: string | undefined;
      
      // Look through all registered panels to find alignment groups containing this word
      for (const [, panelData] of this.registeredPanels.entries()) {
        if (panelData.resourceType === 'ULT' || panelData.resourceType === 'UST') {
          // Check target language panels for alignment groups
          for (const chapter of panelData.chapters) {
            for (const verse of chapter.verses) {
              if (verse.reference !== clickedToken.verseRef) continue;
              if (!verse.alignmentGroups) continue;
              // Find alignment group that contains this source word
              for (const group of verse.alignmentGroups) {
                if (group.sourceWords.includes(clickedToken.content)) {
                  alignmentGroupId = group.id;
                  break;
                }
              }
              if (alignmentGroupId) break;
            }
            if (alignmentGroupId) break;
          }
        }
        if (alignmentGroupId) break;
      }

      // Convert legacy token to optimized format using semantic ID
      const semanticId = generateSemanticId(
        clickedToken.content,
        clickedToken.verseRef,
        clickedToken.occurrence
      );

      return {
        semanticId: semanticId,
        content: clickedToken.content,
        verseRef: clickedToken.verseRef,
        strong: strong,
        lemma: lemma,
        morph: morph
      };
    } else {
      // Target language panel: use alignedOriginalWordIds for direct lookup
      
      
      // Use the new alignedOriginalWordIds array for simpler lookup
      if (clickedToken.alignedOriginalWordIds && clickedToken.alignedOriginalWordIds.length > 0) {
        // For nested alignments, we want to highlight all aligned words
        // So we create a token that represents all the aligned original words
        const primaryOriginalWordId = clickedToken.alignedOriginalWordIds[0];
        
        // Parse the primary original word ID to get the content
        const parts = primaryOriginalWordId.split(':');
        if (parts.length >= 3) {
          const verseRef = `${parts[0]} ${parts[1]}`;
          const content = parts[2];
          
          // Convert legacy aligned token to optimized format
          // Parse occurrence from the original word ID (format: "verseRef:content:occurrence")
          const occurrence = parts.length >= 4 ? parseInt(parts[3]) || 1 : 1;
          const semanticId = generateSemanticId(
            content,
            verseRef,
            occurrence
          );

          // Generate semantic IDs for all aligned words
          const alignedSemanticIds = clickedToken.alignedOriginalWordIds.map(id => {
            const idParts = id.split(':');
            if (idParts.length >= 3) {
              const wordContent = idParts[2];
              const wordOccurrence = idParts.length >= 4 ? parseInt(idParts[3]) || 1 : 1;
              const wordVerseRef = `${idParts[0]} ${idParts[1]}`;
              return generateSemanticId(wordContent, wordVerseRef, wordOccurrence);
            }
            return semanticId; // Fallback
          });

          return {
            semanticId: semanticId,
            content: content,
            verseRef: verseRef,
            strong: clickedToken.alignment?.strong || '',
            lemma: clickedToken.alignment?.lemma || content,
            morph: clickedToken.alignment?.morph || '',
            sourceWords: clickedToken.alignedOriginalWordIds.map(id => {
              const idParts = id.split(':');
              return idParts.length >= 3 ? idParts[2] : '';
            }).filter(word => word),
            alignedSemanticIds: alignedSemanticIds
          };
        }
      }
      
      // Fallback to individual alignment (backward compatibility)
      const alignmentToken = this.createOriginalLanguageToken(
        clickedToken.alignment,
        clickedToken.verseRef
      );
      
      // Note: Position is no longer used in optimized format
      
      return alignmentToken;
    }
  }

  /**
   * Create original language token from alignment group (handles nested alignments)
   */
  private createOriginalLanguageTokenFromGroup(
    clickedToken: WordToken,
    sourceResourceId: string
  ): OriginalLanguageToken | null {
    const sourcePanel = this.registeredPanels.get(sourceResourceId);
    if (!sourcePanel) return null;
    
    // Find the verse containing this token
    for (const chapter of sourcePanel.chapters) {
      for (const verse of chapter.verses) {
        if (verse.reference !== clickedToken.verseRef) continue;
        if (!verse.alignmentGroups) continue;
        
        // Find the alignment group for this token
        const alignmentGroup = verse.alignmentGroups.find(
          group => group.id === clickedToken.alignmentGroupId
        );
        
        if (alignmentGroup) {
          
          
          // Create a combined original language token from all source words
          const combinedContent = alignmentGroup.sourceWords.join(' ');
          const primaryAlignment = alignmentGroup.alignmentData[0]; // Use first alignment as primary
          
        // Use the first source word for semantic ID generation
        const firstSourceWord = alignmentGroup.sourceWords[0];
          
          // Convert to optimized format
          // For alignment groups, use the first source word with occurrence 1
          const semanticId = generateSemanticId(
            firstSourceWord || combinedContent,
            clickedToken.verseRef,
            1
          );

          return {
            semanticId: semanticId,
            content: combinedContent,
            verseRef: clickedToken.verseRef,
            strong: primaryAlignment.strong,
            lemma: primaryAlignment.lemma,
            morph: primaryAlignment.morph,
            sourceWords: alignmentGroup.sourceWords
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Find the position of an original language token from registered original language panels
   */
  private findOriginalLanguagePosition(
    originalToken: OriginalLanguageToken
  ): { start: number; end: number; } | undefined {
    // Search through original language panels for the actual position
    for (const [, panel] of this.registeredPanels) {
      if (!panel.isOriginalLanguage) continue;

      for (const chapter of panel.chapters) {
        for (const verse of chapter.verses) {
          if (verse.reference !== originalToken.verseRef) continue;
          if (!verse.wordTokens) continue;

          // Look for the token with matching semantic ID (converted from legacy uniqueId)
          const matchingToken = verse.wordTokens.find(
            token => {
              const tokenSemanticId = generateSemanticId(
                token.content,
                token.verseRef,
                token.occurrence
              );
              return tokenSemanticId === originalToken.semanticId;
            }
          );

          if (matchingToken?.position) {
            return matchingToken.position;
          }
        }
      }
    }

    return undefined; // Position not found
  }

  /**
   * Create an original language token from alignment data
   */
  private createOriginalLanguageToken(
    alignment: WordToken['alignment'],
    verseRef: string,
    originalContent?: string
  ): OriginalLanguageToken | null {
    if (!alignment || !alignment.strong) {
      return null;
    }

    // Extract content and occurrence from sourceWordId format: "book chapter:verse:content:occurrence"
    let sourceContent = alignment.sourceContent || alignment.lemma || alignment.strong;
    let occurrence = 1;
    
    if (alignment.sourceWordId) {
      const parts = alignment.sourceWordId.split(':');
      if (parts.length >= 4) {
        // Format: "book chapter:verse:content:occurrence" -> ['book', 'chapter', 'verse', 'content', 'occurrence']
        // The content is the second-to-last part, occurrence is the last part
        sourceContent = parts[parts.length - 2]; // Second to last is the content
        occurrence = parseInt(parts[parts.length - 1]) || 1; // Last is occurrence
      }
    }

        // Note: uniqueId no longer used in optimized format

    // Convert to optimized format
    const semanticId = generateSemanticId(
      originalContent || sourceContent,
      verseRef,
      occurrence
    );

    return {
      semanticId: semanticId,
      content: originalContent || sourceContent, // Use actual original language word
      verseRef,
      strong: alignment.strong,
      lemma: alignment.lemma,
      morph: alignment.morph
    };
  }

  /**
   * Handle word click - create uniform signal regardless of source panel type
   * LEGACY METHOD - use handleTokenClick for new implementations
   */
  async handleWordClick(
    clickedToken: WordToken,
    sourceResourceId: string,
    verse: ProcessedVerse
  ): Promise<void> {
    
    
    // Delegate to the new unified method
    this.handleTokenClick(clickedToken, sourceResourceId);
  }

  /**
   * Clear all highlights
   */
  clearHighlights(sourceResourceId?: string): void {
    const message: ClearHighlightsMessage = {
      type: 'CLEAR_HIGHLIGHTS',
      sourceResourceId,
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  /**
   * Broadcast token filter message (for notes filtering)
   */
  filterByToken(originalLanguageToken: OriginalLanguageToken, sourceResourceId: string): void {
    const message: TokenFilterMessage = {
      type: 'FILTER_BY_TOKEN',
      originalLanguageToken,
      sourceResourceId,
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  /**
   * Clear token filter
   */
  clearTokenFilter(sourceResourceId?: string): void {
    const message: ClearTokenFilterMessage = {
      type: 'CLEAR_TOKEN_FILTER',
      sourceResourceId,
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  /**
   * Broadcast a message to all registered handlers
   */
  private broadcastMessage(message: CrossPanelMessage): void {
    
    
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('❌ Error in message handler:', error);
      }
    }
  }


  /**
   * Get statistics about registered panels
   */
  getStatistics(): {
    totalPanels: number;
    originalLanguagePanels: number;
    targetLanguagePanels: number;
    panelsByType: Record<string, number>;
  } {
    const stats = {
      totalPanels: this.registeredPanels.size,
      originalLanguagePanels: 0,
      targetLanguagePanels: 0,
      panelsByType: {} as Record<string, number>
    };

    for (const panel of this.registeredPanels.values()) {
      if (panel.isOriginalLanguage) {
        stats.originalLanguagePanels++;
      } else {
        stats.targetLanguagePanels++;
      }

      stats.panelsByType[panel.resourceType] = (stats.panelsByType[panel.resourceType] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
let crossPanelService: CrossPanelCommunicationService | null = null;

/**
 * Get the global cross-panel communication service instance
 */
export function getCrossPanelCommunicationService(): CrossPanelCommunicationService {
  if (!crossPanelService) {
    crossPanelService = new CrossPanelCommunicationService();
  }
  return crossPanelService;
}

/**
 * Reset the service (useful for testing)
 */
export function resetCrossPanelCommunicationService(): void {
  crossPanelService = null;
}
