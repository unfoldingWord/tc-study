/**
 * Navigation History Component - React Native Version
 * 
 * Provides back/forward navigation buttons.
 * Uses individual selectors to avoid infinite loop issues.
 * Preserves all original features in React Native format.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigationSelector } from '../../contexts/NavigationContext';
import { Icon } from '../ui/Icon.native';

interface NavigationHistoryProps {
  className?: string;
  compact?: boolean;
}

// Individual stable selectors to avoid object recreation
const selectCanGoBack = (state: any) => state.canGoBack();
const selectCanGoForward = (state: any) => state.canGoForward();
const selectGoBack = (state: any) => state.goBack;
const selectGoForward = (state: any) => state.goForward;
// History length and index selectors removed - not needed

export const NavigationHistory: React.FC<NavigationHistoryProps> = ({
  className = '',
  compact = false
}) => {
  // Use individual selectors to prevent object recreation
  const canBack = useNavigationSelector(selectCanGoBack);
  const canForward = useNavigationSelector(selectCanGoForward);
  const goBack = useNavigationSelector(selectGoBack);
  const goForward = useNavigationSelector(selectGoForward);
  // History length and index removed - not needed for display

  const handleBack = () => {
    if (canBack && goBack) {
      goBack();
    }
  };

  const handleForward = () => {
    if (canForward && goForward) {
      goForward();
    }
  };

  return (
    <View style={[styles.container, className && { className }]}>
      {/* Back Button */}
      <Pressable
        onPress={handleBack}
        disabled={!canBack}
        style={[
          styles.button,
          !canBack && styles.buttonDisabled
        ]}
        accessibilityLabel="Go back"
      >
        <Icon
          name="chevron-left"
          size={compact ? 16 : 20}
          color={canBack ? '#374151' : '#9ca3af'}
        />
      </Pressable>

      {/* Forward Button */}
      <Pressable
        onPress={handleForward}
        disabled={!canForward}
        style={[
          styles.button,
          !canForward && styles.buttonDisabled
        ]}
        accessibilityLabel="Go forward"
      >
        <Icon
          name="chevron-right"
          size={compact ? 16 : 20}
          color={canForward ? '#374151' : '#9ca3af'}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
