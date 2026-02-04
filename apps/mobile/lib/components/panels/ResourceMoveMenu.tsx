/**
 * Resource Move Menu
 * 
 * Provides UI for moving resources between panels.
 * Shown in resource dropdown/selector.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { Icon } from '../ui/Icon.native';

interface ResourceMoveMenuProps {
  currentResourceId: string;
  currentPanelId: string;
  onMoveToPanel: (resourceId: string, targetPanelId: string) => void;
  onClose?: () => void;
}

export function ResourceMoveMenu({
  currentResourceId,
  currentPanelId,
  onMoveToPanel,
  onClose
}: ResourceMoveMenuProps) {
  const panelLayout = useWorkspaceSelector(state => 
    state.customPanelLayout || state.activePackage?.panelLayout
  );
  
  if (!panelLayout) {
    return null;
  }
  
  // Get all panels except the current one
  const otherPanels = panelLayout.panels.filter(p => p.id !== currentPanelId);
  
  if (otherPanels.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No other panels available</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="move" size={14} color="#6b7280" />
        <Text style={styles.headerText}>Move to Panel</Text>
      </View>
      
      {otherPanels.map(panel => (
        <Pressable
          key={panel.id}
          style={styles.menuItem}
          onPress={() => {
            onMoveToPanel(currentResourceId, panel.id);
            if (onClose) onClose();
          }}
        >
          <Icon name="arrow-right" size={14} color="#3b82f6" />
          <Text style={styles.menuItemText}>{panel.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
    minWidth: 180,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 4,
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 12,
  },
});



