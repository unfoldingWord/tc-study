/**
 * MinimizedResourceButton - Floating button for minimized resource modal
 * 
 * This component renders a floating button that doesn't block user interactions
 * with the rest of the app. It's rendered at the app level as an overlay.
 */

import React from 'react';
import {
    Pressable,
    StyleSheet,
    View
} from 'react-native';
import { Icon } from '../ui/Icon.native';
import { ResourceContent } from './ResourceModalPresentation';

interface MinimizedResourceButtonProps {
  isVisible: boolean;
  content?: ResourceContent;
  onRestore: () => void;
}

export const MinimizedResourceButton: React.FC<MinimizedResourceButtonProps> = ({
  isVisible,
  content,
  onRestore,
}) => {
  if (!isVisible) {
    return null;
  }


  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={onRestore}
        style={[
          styles.button,
          { backgroundColor: content?.backgroundColor || '#3b82f6' }
        ]}
      >
        <Icon
          name={content?.icon || 'book-open'}
          size={20}
          color={content?.color || 'white'}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 20,
    paddingRight: 20,
    zIndex: 1000,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
