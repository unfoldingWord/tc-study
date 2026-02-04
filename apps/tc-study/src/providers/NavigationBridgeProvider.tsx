/**
 * Navigation Bridge Provider
 * 
 * Bridges @bt-synergy/navigation package interface to tc-study's internal navigation system.
 * This allows external resource packages to navigate using standard interfaces.
 */

import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  NavigationContext,
  type NavigationProvider as BridgeNavigationProvider,
} from '@bt-synergy/navigation';
import { useNavigation as useInternalNavigation } from '../contexts/NavigationContext';

export function NavigationBridgeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const internalNav = useInternalNavigation();
  
  const navigationProvider: BridgeNavigationProvider = {
    // ===== VERSE NAVIGATION =====
    goToVerse: (ref) => {
      internalNav.navigateToReference({
        book: ref.book,
        chapter: ref.chapter,
        verse: ref.verse,
      });
    },
    
    goToVerseRange: (range) => {
      internalNav.navigateToReference({
        book: range.start.book,
        chapter: range.start.chapter,
        verse: range.start.verse,
        endChapter: range.end.chapter,
        endVerse: range.end.verse,
      });
    },
    
    goToChapter: (book, chapter) => {
      internalNav.navigateToReference({
        book,
        chapter,
        verse: 1,
      });
    },
    
    goToBook: (book) => {
      internalNav.navigateToBook(book);
    },
    
    // ===== RESOURCE NAVIGATION =====
    goToResource: (ref) => {
      if (ref.location) {
        if (typeof ref.location === 'object' && 'book' in ref.location) {
          // VerseRef location
          navigate(`/resource/${ref.id}?book=${ref.location.book}&chapter=${ref.location.chapter}&verse=${ref.location.verse}`);
        } else {
          // String location
          navigate(`/resource/${ref.id}?location=${ref.location}`);
        }
      } else {
        navigate(`/resource/${ref.id}`);
      }
    },
    
    openInPanel: (target) => {
      // Navigate to Studio with panel and resource parameters
      const params = new URLSearchParams({
        resource: target.resourceRef.id,
      });
      
      if (target.panelId) {
        params.set('panel', target.panelId);
      }
      
      if (target.createIfNeeded) {
        params.set('create', 'true');
      }
      
      if (target.resourceRef.location) {
        if (typeof target.resourceRef.location === 'object') {
          const loc = target.resourceRef.location;
          params.set('book', loc.book);
          params.set('chapter', String(loc.chapter));
          params.set('verse', String(loc.verse));
        } else {
          params.set('location', target.resourceRef.location);
        }
      }
      
      navigate(`/studio?${params.toString()}`);
    },
    
    openInNewPanel: (ref) => {
      // Open Studio in new window/tab
      const params = new URLSearchParams({
        resource: ref.id,
        newPanel: 'true',
      });
      
      if (ref.location) {
        if (typeof ref.location === 'object') {
          params.set('book', ref.location.book);
          params.set('chapter', String(ref.location.chapter));
          params.set('verse', String(ref.location.verse));
        } else {
          params.set('location', ref.location);
        }
      }
      
      window.open(`/studio?${params.toString()}`, '_blank');
    },
    
    // ===== APP NAVIGATION =====
    goToRoute: (route, params) => {
      navigate(route, { state: params });
    },
    
    openExternal: (options) => {
      const target = options.external ? '_blank' : '_self';
      window.open(options.url, target);
    },
    
    // ===== HISTORY =====
    getHistory: () => ({
      canGoBack: internalNav.canGoBack(),
      canGoForward: internalNav.canGoForward(),
      currentLocation: internalNav.currentReference,
    }),
    
    goBack: () => {
      internalNav.goBack();
    },
    
    goForward: () => {
      internalNav.goForward();
    },
    
    canGoBack: () => internalNav.canGoBack(),
    
    canGoForward: () => internalNav.canGoForward(),
  };
  
  return (
    <NavigationContext.Provider value={navigationProvider}>
      {children}
    </NavigationContext.Provider>
  );
}
