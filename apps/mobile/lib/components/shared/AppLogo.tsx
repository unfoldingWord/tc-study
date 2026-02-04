/**
 * AppLogo - Shared app logo component
 * 
 * Displays the consistent FBT branding with gradient styling
 * Now clickable to open settings
 */

import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../ui/Icon.native';


export function AppLogo() {
  const handleLogoClick = () => {
    router.push('/settings');
  };

  return (
    <Pressable 
      onPress={handleLogoClick}
      style={styles.container}
    >
      {/* Logo Icon */}
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <Icon name="book-open" size={16} color="white" />
        </View>
        {/* Subtle glow effect */}
        <View style={styles.glowEffect} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    position: 'relative',
  },
  logoIcon: {
    width: 32,
    height: 32,
    backgroundColor: '#2563eb', // blue-600
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  glowEffect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    backgroundColor: '#60a5fa', // blue-400
    borderRadius: 8,
    opacity: 0.2,
  },
  titleContainer: {
    flexDirection: 'column',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563eb', // blue-600
    lineHeight: 24,
  },
});
