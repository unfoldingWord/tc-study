/**
 * React Context for cross-platform resource actions
 * Works with both React (web) and React Native
 */

import { createContext } from 'react';
import type { ResourceActionsProvider } from './types';

/**
 * Resource actions context
 * Apps provide their implementation via ResourceActionsContext.Provider
 */
export const ResourceActionsContext = createContext<ResourceActionsProvider | null>(null);

ResourceActionsContext.displayName = 'ResourceActionsContext';
