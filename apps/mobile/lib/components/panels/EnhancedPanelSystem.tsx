/**
 * Enhanced Panel System with Resource Navigation
 * 
 * Supports multiple resources per panel with dropdown navigation.
 * Each panel can only show/mount one resource at a time.
 */

import {
  LinkedPanel,
  LinkedPanelsContainer,
  createDefaultPluginRegistry
} from 'linked-panels';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PANEL_ASSIGNMENTS, getSmartPanelEntries } from '../../config/app-resources';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspacePanels, useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { notesScripturePlugin } from '../../plugins/notes-scripture-plugin';
import { scripturePlugin } from '../../plugins/scripture-plugin';
import { EnhancedNavigationBar } from '../navigation/EnhancedNavigationBar';
import { ResourcePanel } from './ResourcePanel';

interface ResourceModalState {
  [panelId: string]: boolean; // panelId -> is resource modal open
}

// Popover state moved to individual PanelHeader components

// PanelHeader interface moved to ResourcePanel.tsx

// PanelHeader function moved to ResourcePanel.tsx

export function EnhancedPanelSystem() {
  const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
  const panelConfig = useWorkspacePanels();
  const appReady = useWorkspaceSelector(state => state.appReady);
  const workspaceReady = useWorkspaceSelector(state => state.workspaceReady);
  const navigationReady = useWorkspaceSelector(state => state.navigationReady);
  const { currentReference, getBookInfo } = useNavigation();
  const [resourceModalState, setResourceModalState] = useState<ResourceModalState>({});
  
  // ScrollView refs are now managed individually by each ResourcePanel component


  // Get testament info for smart entries
  const currentBookInfo = getBookInfo(currentReference.book);
  const testament = currentBookInfo?.testament;

  // Helper function to get all available entries for a panel (resources + smart entries)
  const getAvailableEntriesForPanel = (panelId: string) => {
    const panelAssignment = PANEL_ASSIGNMENTS.find(panel => panel.panelId === panelId);
    if (!panelAssignment) return [];

    const entries: {
      id: string;
      type: 'resource' | 'smart';
      title: string;
      description: string;
      component: any;
      icon: string;
    }[] = [];

    // Add traditional resources
    if (panelAssignment.resources) {
      const availableResources = processedResourceConfig?.filter((resource: any) => 
        panelAssignment.resources!.includes(resource.panelResourceId)
      ) || [];

      availableResources.forEach((resource: any) => {
        
        entries.push({
          id: resource.panelResourceId,
          type: 'resource',
          title: resource.actualTitle || resource.metadata?.title || resource.panelConfig?.title,
          description: resource.metadata?.description || resource.panelConfig?.description,
          component: resource.panelConfig?.component,
          icon: resource.panelConfig?.icon
        });
      });
    }

    // Add smart entries
    if (panelAssignment.smartEntries) {
      const smartPanelEntries = getSmartPanelEntries();
      
      panelAssignment.smartEntries.forEach(entryId => {
        const smartEntry = smartPanelEntries.find(entry => entry.panelEntryId === entryId);
        if (smartEntry) {
          const dynamicConfig = smartEntry.getDynamicConfig({
            testament: testament as 'OT' | 'NT' | undefined,
            currentBook: currentReference.book,
            navigation: { currentReference, getBookInfo }
          });

          entries.push({
            id: smartEntry.panelEntryId,
            type: 'smart',
            title: dynamicConfig.title,
            description: dynamicConfig.description,
            component: smartEntry.component,
            icon: dynamicConfig.icon
          });
        }
      });
    }

    return entries;
  };

  // Note: Panel resource state synchronization is now handled by LinkedPanel's own state management
  // The currentResourceIds ref is updated directly in the render function when LinkedPanel provides the current resource

  // Create plugin registry (memoized to prevent recreation)
  const plugins = useMemo(() => {
    const pluginRegistry = createDefaultPluginRegistry();
    
    // Register our scripture plugin for token broadcasting
    pluginRegistry.register(scripturePlugin);
    
    // Register our notes-scripture communication plugin
    pluginRegistry.register(notesScripturePlugin);
    
    // Plugins created and registered
    return pluginRegistry;
  }, []);

  // Configure persistence (memoized to prevent recreation)
  const persistenceOptions = useMemo(() => {
    // Disable persistence completely to avoid storage adapter issues in React Native
    return undefined;
  }, []);

  // Note: Panel initialization is now handled by LinkedPanel's own state management
  // No need to manually initialize panel resource state

  // Store navigate functions for each panel
  const navigateFunctions = useRef<{ [panelId: string]: any }>({});

  // Handle resource selection change within a panel
  const handleResourceChange = (panelId: string, entryId: string) => {
    // Use LinkedPanel's navigate function to actually switch resources
    const navigateFunction = navigateFunctions.current[panelId];
    if (navigateFunction) {
      // Find the index of the entry in all available entries for this panel
      const availableEntries = getAvailableEntriesForPanel(panelId);
      const entryIndex = availableEntries.findIndex(entry => entry.id === entryId);
      
      if (entryIndex >= 0) {
        navigateFunction.toIndex(entryIndex);
      }
    }
    
    // Close modal after selection
    setResourceModalState(prev => ({
      ...prev,
      [panelId]: false
    }));
    
  };

  // Toggle resource modal open/close
  const toggleResourceModal = (panelId: string) => {
    setResourceModalState(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }));
  };

  // Popover functionality moved to individual PanelHeader components

  // Navigate to previous resource in panel (commented out in original)
  // const navigateToPrevResource = (panelId: string) => {
  //   const navigateFunction = navigateFunctions.current[panelId];
  //   if (navigateFunction) {
  //     navigateFunction.previous();
  //   }
  // };

  // Navigate to next resource in panel (commented out in original)
  // const navigateToNextResource = (panelId: string) => {
  //   const navigateFunction = navigateFunctions.current[panelId];
  //   if (navigateFunction) {
  //     navigateFunction.next();
  //   }
  // };

  // Note: In React Native, we don't have document events
  // We'll handle dropdown/popover closing through explicit actions or navigation
  // TODO: Implement React Native equivalent (e.g., using gesture handlers or modal behavior)

  // Note: We now use current.resource from LinkedPanel instead of getCurrentResourceConfig
  // Resource selector is now handled inline within the PanelHeader component

  // Render resource selection modal
  const renderResourceModal = (panelId: string, currentResourceId?: string) => {
    const availableEntries = getAvailableEntriesForPanel(panelId);
    const isOpen = resourceModalState[panelId] || false;

    if (availableEntries.length <= 1) return null;

    return (
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => toggleResourceModal(panelId)}
        key={panelId}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Resource</Text>
            <Pressable
              onPress={() => toggleResourceModal(panelId)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {availableEntries.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => {
                  handleResourceChange(panelId, entry.id);
                  // Modal is closed by handleResourceChange, no need to call toggleResourceModal
                }}
                style={[
                  styles.modalResourceItem,
                  currentResourceId === entry.id && styles.modalResourceItemActive
                ]}
              >
                <View style={styles.modalResourceContent}>
                  <Text style={styles.modalResourceIcon}>
                    {entry.type === 'smart' ? '🏛️' : '📖'}
                  </Text>
                  <View style={styles.modalResourceTextContainer}>
                    <Text style={[
                      styles.modalResourceTitle,
                      currentResourceId === entry.id && styles.modalResourceTitleActive
                    ]}>
                      {entry.title}
                    </Text>
                    {entry.description && (
                      <Text style={[
                        styles.modalResourceDescription,
                        currentResourceId === entry.id && styles.modalResourceDescriptionActive
                      ]}>
                        {entry.description}
                      </Text>
                    )}
                  </View>
                </View>
                {currentResourceId === entry.id && (
                  <Text style={styles.modalResourceCheck}>✓</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // Wait for app to be fully ready (workspace + navigation + anchor content)
  if (!appReady || !processedResourceConfig || !panelConfig) {
     return (
       <View style={styles.loadingContainer}>
         <View style={styles.loadingContent}>
           <ActivityIndicator size="large" color="#0000ff" />
           <Text style={styles.loadingText} accessibilityLabel={!workspaceReady ? 'Loading workspace...' : 
            !navigationReady ? 'Initializing navigation...' : 
            'Preparing resources...'}>
             ...
           </Text>
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
        {/* Mobile Layout: Stacked vertically (top and bottom) */}
        <View style={styles.panelsContainer}>
          {PANEL_ASSIGNMENTS.map((panelAssignment, index) => {
            // Insert navigation bar between first and second panel
            const isFirstPanel = index === 0;
            const shouldShowNavBarAfter = isFirstPanel && PANEL_ASSIGNMENTS.length > 1;
            
            return (
              <React.Fragment key={`panel-group-${panelAssignment.panelId}`}>
                {/* Panel */}
                <View style={styles.panelWrapper}>
                  <LinkedPanel id={panelAssignment.panelId}>
                {({ current, navigate }) => {
                  // Store the navigate function for this panel
                  navigateFunctions.current[panelAssignment.panelId] = navigate;
                      
                  return (
                  <ResourcePanel
                    panelAssignment={panelAssignment}
                    current={{
                      resource: current.resource ? {
                        id: current.resource.id,
                        component: current.resource.component as unknown as React.ComponentType<any>
                      } : undefined
                    }}
                    processedResourceConfig={processedResourceConfig}
                    currentReference={currentReference}
                    getBookInfo={(bookCode: string) => getBookInfo(bookCode) || undefined}
                    testament={testament}
                    toggleResourceModal={() => toggleResourceModal(panelAssignment.panelId)}
                  />
                  );
                  }}
                </LinkedPanel>
              </View>
              
              {/* Navigation Bar - Insert between first and second panel */}
              {shouldShowNavBarAfter && (
                <EnhancedNavigationBar style={styles.navigationBar} />
              )}
            </React.Fragment>
            );
          })}
        </View>
      </LinkedPanelsContainer>
      
      {/* Resource Selection Modals */}
      {PANEL_ASSIGNMENTS.map((panelAssignment) => 
        renderResourceModal(panelAssignment.panelId, undefined)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#f9fafb', // bg-gray-50
  },
  panelsContainer: {
    flex: 1,
    width: '100%',
    flexDirection: 'column', // Stacked layout for mobile (top and bottom)
  },
  navigationBar: {
    // Navigation bar positioned between panels
    flexShrink: 0,
  },
  panelWrapper: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  // panelContent styles moved to ResourcePanel component

  panelHeader: {
    flexShrink: 0,
    backgroundColor: '#fff', // bg-gray-50
  },
  panelHeaderBottom: {
    flexShrink: 0,
    backgroundColor: '#fff', // bg-gray-50
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 40,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827', // text-gray-900
  },
  infoIconContainer: {
    position: 'relative',
    marginLeft: 8,
  },
  infoButton: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popover: {
    position: 'absolute',
    left: 0,
    top: '100%',
    marginTop: 4,
    backgroundColor: '#111827', // bg-gray-900
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: 200,
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  popoverContent: {
    position: 'relative',
  },
  popoverText: {
    color: '#ffffff',
    fontSize: 12,
  },
  popoverArrow: {
    position: 'absolute',
    bottom: '100%',
    left: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#111827',
  },
  resourceSelectorContainer: {
    flexShrink: 0,
  },
  // Panel content styles moved to ResourcePanel component
  // Loading styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingSpinner: {
    fontSize: 32,
    color: '#2563eb', // text-blue-600
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  // Dropdown styles
  dropdownWrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  dropdownButtonContainer: {
    position: 'relative',
  },
  dropdownButton: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#6b7280',
  },
  dropdownIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  dropdownMenu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    paddingVertical: 4,
    minWidth: 256,
    maxWidth: 320,
    zIndex: 30,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownItemSelected: {
    backgroundColor: '#eff6ff', // bg-blue-50
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownItemIcon: {
    fontSize: 12,
    marginRight: 8,
  },
  dropdownItemText: {
    flex: 1,
    minWidth: 0,
  },
  dropdownItemTitle: {
    fontSize: 14,
    color: '#374151', // text-gray-700
  },
  dropdownItemTitleSelected: {
    color: '#1d4ed8', // text-blue-700
    fontWeight: '500',
  },
  dropdownItemDescription: {
    fontSize: 12,
    color: '#6b7280', // text-gray-500
    marginTop: 2,
  },
  // Navigation button styles (commented out in original)
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: '100%',
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  navIcon: {
    fontSize: 12,
    color: '#6b7280',
  },
  
  // Resource Selector styles
  resourceSelectorWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceSelectorButton: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  resourceSelectorIcon: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalResourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modalResourceItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  modalResourceContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalResourceIcon: {
    fontSize: 20,
  },
  modalResourceTextContainer: {
    flex: 1,
  },
  modalResourceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  modalResourceTitleActive: {
    color: '#1d4ed8',
  },
  modalResourceDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  modalResourceDescriptionActive: {
    color: '#3730a3',
  },
  modalResourceCheck: {
    fontSize: 18,
    color: '#3b82f6',
    fontWeight: 'bold',
  },
});

export default EnhancedPanelSystem;
