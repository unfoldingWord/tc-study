/**
 * NavigationBar - Bottom navigation component
 * 
 * Displays current navigation state and provides navigation controls
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScriptureNavigator } from './navigation/ScriptureNavigator'
import { NavigationHistory } from './navigation/NavigationHistory'
import { AppLogo } from './shared/AppLogo'
import { NavigationContainer } from './shared/NavigationContainer'

export function NavigationBar() {

  return (
    <NavigationContainer>
      {/* App Logo */}
      <AppLogo />

      {/* Navigation Controls */}
      <View style={styles.navigationControls}>
        {/* Navigation History - Simplified version */}
        <NavigationHistory compact />
        
        {/* Modern Scripture Navigator */}
        <ScriptureNavigator />
      </View>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  navigationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
