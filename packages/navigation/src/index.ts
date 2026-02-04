/**
 * @bt-synergy/navigation
 * 
 * Cross-platform navigation interfaces and hooks for BT Synergy apps.
 * Works with both React (web) and React Native.
 * 
 * @packageDocumentation
 */

// Types
export type {
  NavigationProvider,
  PartialNavigationProvider,
  VerseRef,
  VerseRange,
  ResourceRef,
  PanelTarget,
  ExternalLinkOptions,
  NavigationHistory,
} from './types';

// Context
export { NavigationContext } from './context';

// Hooks
export {
  useNavigation,
  useHasNavigation,
  useVerseNavigation,
  useResourceNavigation,
  useNavigationHistory,
} from './hooks';
