/**
 * Route Parameter and AsyncStorage Management for React Native
 * 
 * Expo Router equivalent of bt-studio's urlParams.ts
 * Handles the fallback hierarchy:
 * 1. Route path parameters /workspace/[owner]/[language]/[book] (highest priority)  
 * 2. Route query parameters ?ref=... (for reference)
 * 3. AsyncStorage (user's last used params)
 * 4. Hardcoded defaults (lowest priority)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export interface AppParams {
  owner: string;
  language: string;
  book: string;
  ref: string;
}

export interface RouteParams {
  owner?: string;
  language?: string;
  book?: string;
  ref?: string;
}

export const DEFAULT_PARAMS: AppParams = {
  owner: 'unfoldingWord',
  language: 'en',
  book: 'tit',
  ref: '1:1'
};

const STORAGE_KEY = 'bt-synergy-last-params';

/**
 * Get parameters from AsyncStorage
 */
export async function getStoredParams(): Promise<Partial<AppParams> | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to parse stored params:', error);
    return null;
  }
}

/**
 * Save parameters to AsyncStorage
 */
export async function storeParams(params: Partial<AppParams>): Promise<void> {
  try {
    const current = await getStoredParams() || {};
    const updated = { ...current, ...params };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
  } catch (error) {
    console.warn('Failed to store params:', error);
  }
}

/**
 * Get parameters from Expo Router params
 */
export function getRouteParams(routeParams: Record<string, string | string[]>): Partial<AppParams> {
  
  
  const params: Partial<AppParams> = {};
  
  // Path parameters take priority
  if (typeof routeParams.owner === 'string') {
    params.owner = routeParams.owner;
    
  }
  if (typeof routeParams.language === 'string') {
    params.language = routeParams.language;
    
  }
  if (typeof routeParams.book === 'string') {
    params.book = routeParams.book;
    
  }
  if (typeof routeParams.ref === 'string') {
    params.ref = routeParams.ref;
    
  }
  
  
  return params;
}

// Global flag to prevent route updates during initialization
let isInitializing = true;

/**
 * Set initialization state to prevent infinite loops
 */
export function setInitializationComplete(): void {
  isInitializing = false;
  
}

/**
 * Update route with new parameters using Expo Router
 */
export function updateRouteParams(newParams: AppParams): void {
  // Prevent route updates during initialization to avoid infinite loops
  if (isInitializing) {
    
    return;
  }
  // Build path-based route: /workspace/[owner]/[language]/[book]
  let path = `/workspace/${newParams.owner}/${newParams.language}/${newParams.book}`;
  
  // Add reference as query parameter if not default
  if (newParams.ref && newParams.ref !== '1:1') {
    path += `?ref=${encodeURIComponent(newParams.ref)}`;
  }
  
  router.push(path as any);
  
}

/**
 * Resolve final parameters using fallback hierarchy
 */
export async function resolveAppParams(routeParams: Record<string, string | string[]>): Promise<AppParams> {
  const urlParams = getRouteParams(routeParams);
  const storedParams = await getStoredParams() || {};
  
  const resolved: AppParams = {
    owner: urlParams.owner || storedParams.owner || DEFAULT_PARAMS.owner,
    language: urlParams.language || storedParams.language || DEFAULT_PARAMS.language,
    book: urlParams.book || storedParams.book || DEFAULT_PARAMS.book,
    ref: urlParams.ref || storedParams.ref || DEFAULT_PARAMS.ref
  };

  
  return resolved;
}

/**
 * Check if route has any app parameters
 */
export function hasRouteParams(routeParams: Record<string, string | string[]>): boolean {
  return !!(routeParams.owner || routeParams.language || routeParams.book || routeParams.ref);
}
