/**
 * ResourcePanel Component
 * Individual panel component that renders a single resource with its own ScrollView ref
 */

import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BookInfo, NavigationReference } from '../../types/context';
import type { ProcessedAppResourceConfig } from '../../types/resource-config';
import { PanelHeader } from './PanelHeader';

export interface ResourcePanelProps {
  panelAssignment: any; // PanelAssignment - using any to avoid circular import
  current: {
    resource?: {
      id: string;
      component: React.ComponentType<any>;
    };
  };
  processedResourceConfig: ProcessedAppResourceConfig[];
  currentReference: NavigationReference;
  getBookInfo: (bookCode: string) => BookInfo | undefined;
  testament?: string;
  toggleResourceModal: () => void;
}

export function ResourcePanel({
  panelAssignment,
  current,
  processedResourceConfig,
  currentReference,
  getBookInfo,
  testament,
  toggleResourceModal
}: ResourcePanelProps) {
  // Each panel gets its own exclusive ScrollView ref
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <View style={styles.panelContent}>
      {/* Panel Header with Resource Navigation - Now at bottom for all panels */}
      <PanelHeader
        panelAssignment={panelAssignment}
        current={current}
        processedResourceConfig={processedResourceConfig}
        currentReference={currentReference}
        getBookInfo={getBookInfo}
        testament={testament || undefined}
        toggleResourceModal={toggleResourceModal}
      />
      
      {/* Panel Content - Now at top */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.panelContentScroll}
      >
        {current.resource?.component ? (
          (() => {
            return React.createElement(current.resource.component as unknown as React.ComponentType<any>, {
              // Pass the panel resource ID (e.g., 'tn-notes', 'ult-scripture')
              resourceId: current.resource.id,
              loading: false,
              error: undefined,
              scripture: undefined, // Will be loaded by the component
              currentChapter: 1,
              // Pass ScrollView ref for scroll-to-highlight functionality
              scrollViewRef: scrollViewRef
            });
          })()
        ) : (
          <View style={styles.noResourceContainer}>
            <View style={styles.noResourceContent}>
              <Text style={styles.noResourceIcon}>📖</Text>
              <Text style={styles.noResourceText}>No resource selected</Text>
              <Text style={styles.noResourceSubtext}>Panel: {panelAssignment.panelId}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panelContent: {
    flex: 1,
    flexDirection: 'column',
  },
  panelContentScroll: {
    flex: 1,
  },
  noResourceContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  noResourceContent: {
    alignItems: 'center',
  },
  noResourceIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noResourceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  noResourceSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
});
