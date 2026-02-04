/**
 * PanelHeader Component
 * Header component for individual panels with resource information and navigation
 */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PANEL_ASSIGNMENTS, getSmartPanelEntries } from '../../config/app-resources';
import type { BookInfo, NavigationReference } from '../../types/context';
import type { ProcessedAppResourceConfig } from '../../types/resource-config';
import { Icon } from '../ui/Icon.native';

export interface PanelHeaderProps {
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

export function PanelHeader({
  panelAssignment,
  current,
  processedResourceConfig,
  currentReference,
  getBookInfo,
  testament,
  toggleResourceModal
}: PanelHeaderProps) {
  // Internal popover state management
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<View>(null);

  const togglePopover = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };
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

  const getPanelTitle = () => {
    
    
    
    
    // Check if current resource is a smart entry
    const availableEntries = getAvailableEntriesForPanel(panelAssignment.panelId);
    const currentEntry = availableEntries.find(entry => entry.id === current.resource?.id);
    
    
    
    if (currentEntry && currentEntry.type === 'smart') {
      
      return currentEntry.title;
    }

    // For regular resources, try to get the actual title from the resource config
    if (current.resource?.id) {
      
      
      const resourceConfig = processedResourceConfig?.find((resource: any) => {
        const matches = resource.panelResourceId === current.resource?.id ||
                       resource.id === current.resource?.id ||
                       resource.metadata?.id === current.resource?.id;

        return matches;
      });
      
      if (resourceConfig) {
       
        const finalTitle = resourceConfig.actualTitle || resourceConfig.metadata?.title || resourceConfig.panelConfig?.title || (current.resource as any)?.title || panelAssignment.title;

        
        return finalTitle;
      } else {
        
        console.warn('🐛 [TITLE_DEBUG] Available resource configs:', processedResourceConfig?.map(r => ({
          panelResourceId: r.panelResourceId,
          id: (r as any).id,
          metadataId: r.metadata?.id
        })));
      }
    } else {
      
    }

    const fallbackTitle = (current.resource as any)?.title || panelAssignment.title;
    
    return fallbackTitle;
  };

  const getPanelDescription = () => {
    // Get dynamic description for smart entries
    const availableEntries = getAvailableEntriesForPanel(panelAssignment.panelId);
    const currentEntry = availableEntries.find(entry => entry.id === current.resource?.id);

    if (currentEntry && currentEntry.type === 'smart') {
      return currentEntry.description;
    }

    // For regular resources, try to get the actual description from the resource config
    if (current.resource?.id) {
      const resourceConfig = processedResourceConfig?.find((resource: any) =>
        resource.panelResourceId === current.resource?.id ||
        resource.id === current.resource?.id ||
        resource.metadata?.id === current.resource?.id
      );
      if (resourceConfig) {
        return resourceConfig.metadata?.description || resourceConfig.panelConfig?.description || (current.resource as any)?.description || panelAssignment.description;
      }
    }

    return (current.resource as any)?.description || panelAssignment.description;
  };

  const hasDescription = getPanelDescription();

  return (
    <View style={styles.panelHeader}>
      <View style={styles.headerContent}>
        <View style={styles.titleContainer}>
          <Text style={styles.panelTitle}>
            {getPanelTitle()}
          </Text>

          {/* Info Icon with Popover */}
          {hasDescription && (
            <View style={styles.infoIconContainer} ref={popoverRef}>
              <Pressable
                onPress={togglePopover}
                style={styles.infoButton}
              >
                <Icon name="info" size={16} color="#6b7280" />
              </Pressable>

              {/* Popover */}
              {isPopoverOpen && (
                <View style={styles.popover}>
                  <View style={styles.popoverContent}>
                    <Text style={styles.popoverText}>
                      {getPanelDescription()}
                    </Text>
                    {/* Arrow */}
                    <View style={styles.popoverArrow} />
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Resource Selection Button */}
        <View style={styles.resourceSelectorContainer}>
          {(() => {
            const availableEntries = getAvailableEntriesForPanel(panelAssignment.panelId);
            if (availableEntries.length <= 1) return null;

            return (
              <View style={styles.resourceSelectorWrapper}>
                <Pressable
                  onPress={toggleResourceModal}
                  style={styles.resourceSelectorButton}
                >
                  <Text style={styles.resourceSelectorIcon}>⋯</Text>
                </Pressable>
              </View>
            );
          })()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelHeader: {
    flexShrink: 0,
    backgroundColor: '#fff', // bg-gray-50
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // border-gray-200
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827', // text-gray-900
    marginRight: 6,
  },
  infoIconContainer: {
    position: 'relative',
  },
  infoButton: {
    padding: 2,
  },
  popover: {
    position: 'absolute',
    top: 30,
    left: -100,
    zIndex: 1000,
    backgroundColor: '#1f2937', // bg-gray-800
    borderRadius: 8,
    padding: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  popoverContent: {
    position: 'relative',
  },
  popoverText: {
    color: '#f9fafb', // text-gray-50
    fontSize: 14,
    lineHeight: 20,
  },
  popoverArrow: {
    position: 'absolute',
    top: -6,
    left: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1f2937', // bg-gray-800
  },
  resourceSelectorContainer: {
    flexShrink: 0,
  },
  resourceSelectorWrapper: {
    marginLeft: 6,
  },
  resourceSelectorButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#f3f4f6', // bg-gray-100
  },
  resourceSelectorIcon: {
    fontSize: 16,
    color: '#6b7280', // text-gray-500
  },
});
