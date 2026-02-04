/**
 * Workspace Status Component - React Native Version
 * 
 * Displays workspace status and loading progress.
 * Preserves all original features in React Native format.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useWorkspaceSelector } from '../contexts/WorkspaceContext';

interface WorkspaceStatusProps {
  className?: string;
}

export function WorkspaceStatus({ className }: WorkspaceStatusProps) {
  const isLoading = useWorkspaceSelector(state => state.isLoading);
  const loadingProgress = useWorkspaceSelector(state => state.loadingProgress);
  const loadingMessage = useWorkspaceSelector(state => state.loadingMessage);
  const error = useWorkspaceSelector(state => state.error);
  const isInitialized = useWorkspaceSelector(state => state.isInitialized);

  // Don't render if not loading and no error
  if (!isLoading && !error && isInitialized) {
    return null;
  }

  return (
    <View style={[styles.container, className && { className }]}>
      <View style={styles.content}>
        <View style={styles.statusContainer}>
          {/* Loading State */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.loadingText} accessibilityLabel='Loading workspace...'>
                {loadingMessage}
              </Text>
            </View>
          )}

          {/* Error State */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          )}

          {/* Progress Bar */}
          {isLoading && loadingProgress && loadingProgress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${loadingProgress}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(loadingProgress)}%
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  content: {
    maxWidth: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#1e40af',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorIcon: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    width: 80,
    backgroundColor: '#93c5fd',
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '500',
  },
});
