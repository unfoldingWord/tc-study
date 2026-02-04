import {
    createDefaultPluginRegistry,
    LinkedPanel,
    LinkedPanelsContainer,
    StatePersistenceOptions
} from 'linked-panels';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AsyncStorageAdapter } from '../../adapters/AsyncStorageAdapter';
import { useWorkspacePanels } from '../../contexts/WorkspaceContext';

export function PanelSystem() {
  
  
  // Get panel configuration from workspace context
  const panelConfig = useWorkspacePanels();
  
  // Create plugin registry (memoized to prevent recreation)
  const plugins = useMemo(() => {
    const pluginRegistry = createDefaultPluginRegistry();
    
    return pluginRegistry;
  }, []);

  // Configure persistence (memoized to prevent recreation)
  const persistenceOptions = useMemo(() => {
    const options: StatePersistenceOptions = {
      storageAdapter: new AsyncStorageAdapter('bt-studio-panels-state'),
      storageKey: 'bt-studio-panels-state',
      autoSave: true,
      autoSaveDebounce: 1000,
      stateTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    
    return options;
  }, []);

  // Check if panel configuration is available
  if (!panelConfig) {
    
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Text style={styles.loadingSpinner}>⟳</Text>
          <Text style={styles.loadingText}>Loading panel configuration...</Text>
        </View>
      </View>
    );
  }

  

  return (
    <View style={styles.container}>
      <LinkedPanelsContainer 
        config={panelConfig} 
        plugins={plugins}
        persistence={persistenceOptions}
      >
        <View style={styles.panelsContainer}>
          {/* ULT Panel (Left) */}
          <View style={styles.panelWrapper}>
            <LinkedPanel id="ult-scripture-panel">
              {({ current, navigate }) => (
                <View style={styles.panelContainer}>
                  {/* Panel Header */}
                  <View style={styles.panelHeader}>
                    <View style={styles.panelHeaderContent}>
                      <Text style={styles.panelTitle}>
                        {current.resource?.title || 'ULT Panel'}
                      </Text>
                    </View>
                    {current.resource?.description && (
                      <View style={styles.descriptionContainer}>
                        <Text style={styles.descriptionText}>
                          {current.resource.description}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Panel Content */}
                  <View style={styles.panelContent}>
                    {current.resource?.component ? (
                      React.createElement(current.resource.component as unknown as React.ComponentType<any>, {
                        // Pass resource identification for content fetching
                        resourceId: 'ult-scripture', // ULT panel should fetch ULT content
                        loading: false,
                        error: undefined,
                        scripture: undefined, // Will be loaded by the component
                        currentChapter: 1
                      })
                    ) : (
                      <View style={styles.noResourceContainer}>
                        <Text style={styles.noResourceText}>
                          No resource selected
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </LinkedPanel>
          </View>

          {/* UST Panel (Right) */}
          <View style={styles.panelWrapper}>
            <LinkedPanel id="ust-scripture-panel">
              {({ current, navigate }) => (
                <View style={styles.panelContainer}>
                  {/* Panel Header */}
                  <View style={styles.panelHeader}>
                    <View style={styles.panelHeaderContent}>
                      <Text style={styles.panelTitle}>
                        {current.resource?.title || 'UST Panel'}
                      </Text>
                    </View>
                    {current.resource?.description && (
                      <View style={styles.descriptionContainer}>
                        <Text style={styles.descriptionText}>
                          {current.resource.description}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Panel Content */}
                  <View style={styles.panelContent}>
                    {current.resource?.component ? (
                      React.createElement(current.resource.component as unknown as React.ComponentType<any>, {
                        // Pass resource identification for content fetching
                        resourceId: 'ust-scripture', // UST panel should fetch UST content
                        loading: false,
                        error: undefined,
                        scripture: undefined, // Will be loaded by the component
                        currentChapter: 1
                      })
                    ) : (
                      <View style={styles.noResourceContainer}>
                        <Text style={styles.noResourceText}>
                          No resource selected
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </LinkedPanel>
          </View>
        </View>
      </LinkedPanelsContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    flex: 1,
  },
  panelsContainer: {
    height: '100%',
    flexDirection: 'row',
    gap: 16,
  },
  panelWrapper: {
    flex: 1,
  },
  loadingContainer: {
    height: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingSpinner: {
    fontSize: 32,
    color: '#3b82f6',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  panelContainer: {
    height: '100%',
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  panelHeader: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  panelHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  descriptionContainer: {
    marginTop: 4,
  },
  descriptionText: {
    fontSize: 12,
    color: '#6b7280',
  },
  panelContent: {
    flex: 1,
    overflow: 'hidden',
  },
  noResourceContainer: {
    height: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResourceText: {
    fontSize: 14,
    color: '#6b7280',
  },
});