/**
 * React Context for cross-platform UI controls
 * Works with both React (web) and React Native
 */

import { createContext } from 'react';
import type { UIControlsProvider } from './types';

/**
 * UI controls context
 * Apps provide their implementation via UIControlsContext.Provider
 */
export const UIControlsContext = createContext<UIControlsProvider | null>(null);

UIControlsContext.displayName = 'UIControlsContext';
