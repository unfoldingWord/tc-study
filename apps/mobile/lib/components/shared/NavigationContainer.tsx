/**
 * NavigationContainer - Shared navigation container component
 * 
 * Provides consistent layout and spacing for navigation bars
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

interface NavigationContainerProps {
  children: React.ReactNode
}

export function NavigationContainer({ children }: NavigationContainerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 12,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
});
