import type { SidebarDisplayMode } from './types';

export const MIN_WIDTH = 48;
export const MAX_WIDTH = 480;
export const COMPACT_THRESHOLD = 100;
export const MEDIUM_THRESHOLD = 180;
export const EXPANDED_THRESHOLD = 260;
export const DEFAULT_SIDEBAR_WIDTH = 288;

export function getSidebarDisplayMode(width: number): SidebarDisplayMode {
  return {
    isExpanded: width > EXPANDED_THRESHOLD,
    isMedium: width > MEDIUM_THRESHOLD && width <= EXPANDED_THRESHOLD,
    isCompact: width > COMPACT_THRESHOLD && width <= MEDIUM_THRESHOLD,
    isMinimal: width <= COMPACT_THRESHOLD,
  };
}
