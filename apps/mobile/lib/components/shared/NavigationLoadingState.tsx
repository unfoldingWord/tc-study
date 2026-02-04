/**
 * NavigationLoadingState - Loading placeholder for navigation controls
 * 
 * Shows skeleton loading state that matches the shape of actual navigation controls
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function NavigationLoadingState() {
  return (
    <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <View style={styles.loadingItem1} />
        <View style={styles.loadingItem2} />
        <View style={styles.loadingItem3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingItem1: {
    height: 32,
    width: 128,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  loadingItem2: {
    height: 32,
    width: 64,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  loadingItem3: {
    height: 32,
    width: 64,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
});
