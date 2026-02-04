/**
 * Hook for scrolling to highlighted tokens in ScrollView
 * Provides accurate positioning using UIManager.measureLayout
 */

import { useCallback } from 'react';
import { UIManager, findNodeHandle } from 'react-native';

interface ScrollToHighlightedTokenOptions {
  scrollViewRef: React.RefObject<any>;
  highlightedTokenRefs: React.MutableRefObject<Map<string, any>>;
  activeTokenRefs?: React.MutableRefObject<Map<string, any>>;
  fallbackEstimation?: boolean;
}

export const useScrollToHighlightedToken = ({
  scrollViewRef,
  highlightedTokenRefs,
  activeTokenRefs,
  fallbackEstimation = true
}: ScrollToHighlightedTokenOptions) => {
  
  const performFallbackScroll = useCallback((tokenKey: string) => {
    
    try {
      // Extract verse number from token key (format: "tokenId-verseNumber")
      const verseMatch = tokenKey.match(/-(\d+)$/);
      const verseNumber = verseMatch ? parseInt(verseMatch[1]) : 1;
      
      // More accurate estimation: 120px per verse (adjusted for better accuracy)
      const estimatedY = Math.max(0, (verseNumber - 1) * 120);
      
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ 
          x: 0, 
          y: estimatedY, 
          animated: true 
        });
        
      }
    } catch (fallbackError) {
      console.error('❌ Estimation scroll failed:', fallbackError);
    }
  }, [scrollViewRef]);

  const scrollToFirstHighlightedToken = useCallback(() => {
    const scrollExecutionTime = Date.now();
    if (!scrollViewRef.current) {
      console.warn('⚠️ ScrollView ref not available for scroll');
      return;
    }

    // Check both highlighted tokens (cross-panel) and active tokens (notes/translation words)
    const highlightedElements = Array.from(highlightedTokenRefs.current.values());
    const highlightedKeys = Array.from(highlightedTokenRefs.current.keys());
    const activeElements = activeTokenRefs ? Array.from(activeTokenRefs.current.values()) : [];
    const activeKeys = activeTokenRefs ? Array.from(activeTokenRefs.current.keys()) : [];
    
    // Prioritize active tokens (from notes/translation words) over highlighted tokens (cross-panel)
    const elementsToUse = activeElements.length > 0 ? activeElements : highlightedElements;
    const keysToUse = activeElements.length > 0 ? activeKeys : highlightedKeys;    
    if (elementsToUse.length === 0) {
      console.warn('⚠️ No highlighted or active elements found for scroll');
      return;
    }

    // Get the first token's key and element (prioritizing active tokens)
    const firstTokenKey = keysToUse[0];
    const firstTokenElement = elementsToUse[0];
    
    
    
    
    if (!firstTokenElement) {
      console.warn('⚠️ First token element not available');
      return;
    }

    try {
      const tokenNode = findNodeHandle(firstTokenElement);
      const scrollViewNode = findNodeHandle(scrollViewRef.current);
      
      if (!tokenNode || !scrollViewNode) {
        console.error('❌ Could not find node handles for measurement');
        if (fallbackEstimation) {
          performFallbackScroll(firstTokenKey);
        }
        return;
      }

      UIManager.measureLayout(
        tokenNode,
        scrollViewNode,
        () => {
          console.error('❌ Measurement error');
          if (fallbackEstimation) {
            performFallbackScroll(firstTokenKey);
          }
        },
        (x, y, width, height) => {
          
          // Get ScrollView dimensions to calculate center position
          scrollViewRef.current.measure((scrollX: number, scrollY: number, scrollWidth: number, scrollHeight: number) => {
            
            // Calculate the center of the ScrollView
            const scrollViewCenter = scrollHeight / 2;
            
            // Calculate target scroll position to center the token
            // y is the token's position relative to the ScrollView content
            // We want the token to be in the center of the visible area
            const targetScrollY = Math.max(0, y - scrollViewCenter + (height / 2));
                       
            scrollViewRef.current.scrollTo({ 
              x: 0, 
              y: targetScrollY, 
              animated: true 
            });
          });
        }
      );
    } catch (measureError) {
      console.error('❌ Error during UIManager.measureLayout:', measureError);
      if (fallbackEstimation) {
        performFallbackScroll(firstTokenKey);
      }
    }
  }, [scrollViewRef, highlightedTokenRefs, fallbackEstimation, performFallbackScroll]);

  const scrollToTokenImmediately = useCallback((element: any, tokenKey: string) => {
    const immediateScrollStartTime = Date.now();
    if (!scrollViewRef.current || !element) {
      console.warn('⚠️ ScrollView ref or element not available for immediate scroll');
      return;
    }    
    // Optimized: Use direct measurement without requestAnimationFrame for faster response
    try {
      const tokenNode = findNodeHandle(element);
      const scrollViewNode = findNodeHandle(scrollViewRef.current);
      
      if (!tokenNode || !scrollViewNode) {
        console.error('❌ Could not find node handles for immediate measurement');
        if (fallbackEstimation) {
          performFallbackScroll(tokenKey);
        }
        return;
      }

      UIManager.measureLayout(
        tokenNode,
        scrollViewNode,
        () => {
          console.error('❌ Immediate measurement error');
          if (fallbackEstimation) {
            performFallbackScroll(tokenKey);
          }
        },
        (x, y, width, height) => {
         
          // Get ScrollView dimensions to calculate center position
          scrollViewRef.current.measure((scrollX: number, scrollY: number, scrollWidth: number, scrollHeight: number) => {
            // Calculate the center of the ScrollView
            const scrollViewCenter = scrollHeight / 2;
            
            // Calculate target scroll position to center the token
            const targetScrollY = Math.max(0, y - scrollViewCenter + (height / 2));
            
            scrollViewRef.current.scrollTo({ 
              x: 0, 
              y: targetScrollY, 
              animated: true 
            });
          });
        }
      );
    } catch (error) {
      console.error('❌ Immediate scroll failed:', error);
      if (fallbackEstimation) {
        performFallbackScroll(tokenKey);
      }
    }
  }, [scrollViewRef, fallbackEstimation, performFallbackScroll]);

  return {
    scrollToFirstHighlightedToken,
    scrollToTokenImmediately,
    performFallbackScroll
  };
};
