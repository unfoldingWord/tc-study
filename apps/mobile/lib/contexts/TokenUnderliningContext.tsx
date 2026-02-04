/**
 * Token Underlining Context
 * 
 * Provides a context for managing token groups that should be underlined
 * in scripture rendering. Supports multiple sources (notes, translation words, etc.)
 * with different colors for each group.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { OptimizedToken } from '../services/usfm-processor';

export interface TokenGroup {
  id: string;
  sourceType: 'notes' | 'translation-words' | 'other';
  sourceId: string; // e.g., note ID, TW link ID
  tokens: OptimizedToken[];
  label?: string; // Optional display label
  colorIndex?: number; // Optional color index for consistent coloring
}

interface TokenUnderliningContextType {
  tokenGroups: TokenGroup[];
  activeGroupId: string | null;
  addTokenGroup: (group: TokenGroup) => void;
  removeTokenGroup: (groupId: string) => void;
  clearTokenGroups: (sourceType?: TokenGroup['sourceType']) => void;
  setActiveGroup: (groupId: string | null) => void;
  getTokenGroupForAlignedId: (alignedId: number) => TokenGroup | null;
  getAllTokenGroupsForAlignedId: (alignedId: number) => TokenGroup[];
  getColorClassForGroup: (groupId: string, isActive?: boolean) => string;
  getBackgroundColorForGroup: (groupId: string) => string;
  getColorIndexForGroup: (groupId: string) => number;
}

const TokenUnderliningContext = createContext<TokenUnderliningContextType | null>(null);

// Predefined color classes for different groups
// Colors are assigned cyclically using modulo operation: colorIndex = groupCount % COLOR_CLASSES.length
// Each color has active (bright) and inactive (dimmed border only with /20 suffix) variants
export const COLOR_CLASSES = [
  { active: 'border-b-2 border-blue-500 bg-blue-100 font-medium', inactive: 'border-b-2 border-dotted border-blue-500/30', bgColor: 'bg-blue-500' },
  { active: 'border-b-2 border-green-500 bg-green-100 font-medium', inactive: 'border-b-2 border-dotted border-green-500/30', bgColor: 'bg-green-500' },
  { active: 'border-b-2 border-purple-500 bg-purple-100 font-medium', inactive: 'border-b-2 border-dotted border-purple-500/30', bgColor: 'bg-purple-500' },
  { active: 'border-b-2 border-indigo-500 bg-indigo-100 font-medium', inactive: 'border-b-2 border-dotted border-indigo-500/30', bgColor: 'bg-indigo-500' },
  { active: 'border-b-2 border-teal-500 bg-teal-100 font-medium', inactive: 'border-b-2 border-dotted border-teal-500/30', bgColor: 'bg-teal-500' },
  { active: 'border-b-2 border-cyan-500 bg-cyan-100 font-medium', inactive: 'border-b-2 border-dotted border-cyan-500/30', bgColor: 'bg-cyan-500' },
  { active: 'border-b-2 border-violet-500 bg-violet-100 font-medium', inactive: 'border-b-2 border-dotted border-violet-500/30', bgColor: 'bg-violet-500' },
  { active: 'border-b-2 border-sky-500 bg-sky-100 font-medium', inactive: 'border-b-2 border-dotted border-sky-500/30', bgColor: 'bg-sky-500' },
  { active: 'border-b-2 border-emerald-500 bg-emerald-100 font-medium', inactive: 'border-b-2 border-dotted border-emerald-500/30', bgColor: 'bg-emerald-500' },
];

export const TokenUnderliningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tokenGroups, setTokenGroups] = useState<TokenGroup[]>([]);
  const [groupColorMap, setGroupColorMap] = useState<Map<string, number>>(new Map()); // Store color index instead of class
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const addTokenGroup = useCallback((group: TokenGroup) => {
    setTokenGroups(prev => {
      // Remove existing group with same ID if it exists
      const filtered = prev.filter(g => g.id !== group.id);
      return [...filtered, group];
    });

    // Assign color using provided colorIndex or fallback to automatic cycling
    setGroupColorMap(prev => {
      if (!prev.has(group.id)) {
        const newMap = new Map(prev);
        // Use provided colorIndex if available, otherwise use automatic cycling
        const colorIndex = group.colorIndex !== undefined 
          ? group.colorIndex % COLOR_CLASSES.length 
          : prev.size % COLOR_CLASSES.length;
        newMap.set(group.id, colorIndex);
        return newMap;
      }
      return prev;
    });
  }, []);

  const removeTokenGroup = useCallback((groupId: string) => {
    setTokenGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupColorMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(groupId);
      return newMap;
    });
  }, []);

  const clearTokenGroups = useCallback((sourceType?: TokenGroup['sourceType']) => {
    if (sourceType) {
      setTokenGroups(prev => {
        const toRemove = prev.filter(g => g.sourceType === sourceType);
        toRemove.forEach(g => {
          setGroupColorMap(prevMap => {
            const newMap = new Map(prevMap);
            newMap.delete(g.id);
            return newMap;
          });
        });
        return prev.filter(g => g.sourceType !== sourceType);
      });
    } else {
      setTokenGroups([]);
      setGroupColorMap(new Map());
    }
    // Clear active group if it was removed
    setActiveGroupId(null);
  }, []);

  const setActiveGroup = useCallback((groupId: string | null) => {
    setActiveGroupId(groupId);
  }, []);

  const getTokenGroupForAlignedId = useCallback((alignedId: number): TokenGroup | null => {
    for (const group of tokenGroups) {
      for (const token of group.tokens) {
        if (token.id === alignedId) {
          return group;
        }
      }
    }
    return null;
  }, [tokenGroups]);

  // New function to get ALL matching groups for a token ID (for handling overlaps)
  const getAllTokenGroupsForAlignedId = useCallback((alignedId: number): TokenGroup[] => {
    const matchingGroups: TokenGroup[] = [];
    for (const group of tokenGroups) {
      for (const token of group.tokens) {
        if (token.id === alignedId) {
          matchingGroups.push(group);
          break; // Don't add the same group multiple times if it has duplicate token IDs
        }
      }
    }
    return matchingGroups;
  }, [tokenGroups]);

  const getColorClassForGroup = useCallback((groupId: string, isActive?: boolean): string => {
    const colorIndex = groupColorMap.get(groupId) ?? 0;
    const colorSet = COLOR_CLASSES[colorIndex];
    
    // If isActive is explicitly provided, use that; otherwise check if this group is the active one
    const shouldUseActiveColor = isActive !== undefined ? isActive : (activeGroupId === groupId);
    
    return shouldUseActiveColor ? colorSet.active : colorSet.inactive;
  }, [groupColorMap, activeGroupId]);

  const getBackgroundColorForGroup = useCallback((groupId: string): string => {
    const colorIndex = groupColorMap.get(groupId) ?? 0;
    const colorSet = COLOR_CLASSES[colorIndex];
    return colorSet.bgColor;
  }, [groupColorMap]);

  const getColorIndexForGroup = useCallback((groupId: string): number => {
    return groupColorMap.get(groupId) ?? 0;
  }, [groupColorMap]);

  const value: TokenUnderliningContextType = {
    tokenGroups,
    activeGroupId,
    addTokenGroup,
    removeTokenGroup,
    clearTokenGroups,
    setActiveGroup,
    getTokenGroupForAlignedId,
    getAllTokenGroupsForAlignedId,
    getColorClassForGroup,
    getBackgroundColorForGroup,
    getColorIndexForGroup,
  };

  return (
    <TokenUnderliningContext.Provider value={value}>
      {children}
    </TokenUnderliningContext.Provider>
  );
};

export const useTokenUnderlining = (): TokenUnderliningContextType => {
  const context = useContext(TokenUnderliningContext);
  if (!context) {
    throw new Error('useTokenUnderlining must be used within a TokenUnderliningProvider');
  }
  return context;
};
