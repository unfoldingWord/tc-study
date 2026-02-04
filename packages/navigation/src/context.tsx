/**
 * React Context for cross-platform navigation
 * Works with both React (web) and React Native
 */

import { createContext } from 'react';
import type { NavigationProvider } from './types';

/**
 * Navigation context
 * Apps provide their implementation via NavigationContext.Provider
 */
export const NavigationContext = createContext<NavigationProvider | null>(null);

NavigationContext.displayName = 'NavigationContext';
