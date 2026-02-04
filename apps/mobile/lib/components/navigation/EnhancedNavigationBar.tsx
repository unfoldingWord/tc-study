/**
 * Enhanced Navigation Bar for BT Synergy
 * 
 * This navigation bar:
 * 1. Depends on anchor resource metadata and content loading
 * 2. Positions itself between panels (not at bottom)
 * 3. Uses memoization to prevent unnecessary re-renders
 * 4. Shows loading states while waiting for anchor resource
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { AppLogo } from '../shared/AppLogo';
import { EnhancedScriptureNavigator } from './EnhancedScriptureNavigator';
import { NavigationHistory } from './NavigationHistory';

interface EnhancedNavigationBarProps {
  style?: any;
}

export const EnhancedNavigationBar = memo<EnhancedNavigationBarProps>(({ style }) => {
  // Only subscribe to the specific state we need to prevent unnecessary re-renders
  const appReady = useWorkspaceSelector(state => state.appReady);
  const anchorResource = useWorkspaceSelector(state => state.anchorResource);

  return (
    <View style={[styles.container, style]}>
      {/* App Logo */}
      <View style={styles.logoContainer}>
        <AppLogo />
      </View>

      {/* Navigation Controls */}
      <View style={styles.navigationControls}>
        {/* Navigation History - Simplified version */}
        <NavigationHistory compact />
        
        {/* Enhanced Scripture Navigator - waits for anchor resource */}
        <EnhancedScriptureNavigator />
      </View>
    </View>
  );
});

EnhancedNavigationBar.displayName = 'EnhancedNavigationBar';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff', // Match panel headers
    borderColor: '#eee',
    shadowColor: '#000',
    borderTopWidth: 1,
    shadowOffset: {
      width: 0,
      height: 0, // Centered shadow for middle position
    },
    shadowOpacity: 0.01,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10, // Ensure it stays above panels
  },
  logoContainer: {
    flex: 1,
  },
  navigationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 2,
    justifyContent: 'flex-end',
  },
});
