/**
 * Package Editor Component
 * 
 * Allows users to edit package configuration, add/remove resources,
 * and configure panel layouts.
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { PackageManager } from '../../services/packages/PackageManager';
import {
  DiscoveredResource,
  PackageResource,
  ResourcePackage,
  ResourceRole
} from '../../types/resource-package';
import { Icon } from '../ui/Icon.native';

interface PackageEditorProps {
  package: ResourcePackage;
  packageManager: PackageManager;
  onPackageUpdated?: (pkg: ResourcePackage) => void;
  onClose?: () => void;
  onAddResource?: () => void;  // Opens resource finder
  onExport?: () => void;
}

export function PackageEditor({
  package: pkg,
  packageManager,
  onPackageUpdated,
  onClose,
  onAddResource,
  onExport
}: PackageEditorProps) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description || '');
  
  const handleSaveName = async () => {
    if (name.trim() !== pkg.name) {
      try {
        const updated = await packageManager.updatePackage(pkg.id, {
          name: name.trim(),
          description: description.trim()
        });
        if (onPackageUpdated) onPackageUpdated(updated);
      } catch (error) {
        Alert.alert('Error', 'Failed to update package name');
      }
    }
    setEditingName(false);
  };
  
  const handleRemoveResource = async (resourceId: string) => {
    Alert.alert(
      'Remove Resource',
      'Are you sure you want to remove this resource from the package?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await packageManager.removeResource(pkg.id, resourceId);
              const updated = await packageManager.getPackage(pkg.id);
              if (updated && onPackageUpdated) onPackageUpdated(updated);
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to remove resource');
            }
          }
        }
      ]
    );
  };
  
  const getRoleIcon = (role: ResourceRole): string => {
    switch (role) {
      case ResourceRole.ANCHOR: return 'anchor';
      case ResourceRole.PRIMARY: return 'book-open';
      case ResourceRole.SUPPLEMENTARY: return 'help-circle';
      case ResourceRole.REFERENCE: return 'library';
      case ResourceRole.BACKGROUND: return 'layers';
      default: return 'file';
    }
  };
  
  const getRoleColor = (role: ResourceRole): string => {
    switch (role) {
      case ResourceRole.ANCHOR: return '#3b82f6';
      case ResourceRole.PRIMARY: return '#059669';
      case ResourceRole.SUPPLEMENTARY: return '#f59e0b';
      case ResourceRole.REFERENCE: return '#8b5cf6';
      case ResourceRole.BACKGROUND: return '#6b7280';
      default: return '#374151';
    }
  };
  
  const getPanelTitle = (panelId: string): string => {
    const panel = pkg.panelLayout.panels.find(p => p.id === panelId);
    return panel?.title || panelId;
  };
  
  // Group resources by panel
  const resourcesByPanel = pkg.resources.reduce((acc, resource) => {
    if (!acc[resource.panelId]) {
      acc[resource.panelId] = [];
    }
    acc[resource.panelId].push(resource);
    return acc;
  }, {} as Record<string, PackageResource[]>);
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {editingName ? (
          <View style={styles.nameEditContainer}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Package name"
            />
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              multiline
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditingName(false)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveName} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.headerContent}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{pkg.name}</Text>
              {pkg.description && (
                <Text style={styles.subtitle}>{pkg.description}</Text>
              )}
            </View>
            <Pressable onPress={() => setEditingName(true)} style={styles.editButton}>
              <Icon name="edit-2" size={16} color="#6b7280" />
            </Pressable>
          </View>
        )}
        
        {onClose && (
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Icon name="x" size={20} color="#6b7280" />
          </Pressable>
        )}
      </View>
      
      {/* Content */}
      <ScrollView style={styles.content}>
        {/* Package Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Package Info</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{pkg.version}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Resources</Text>
              <Text style={styles.infoValue}>{pkg.resources.length}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Source</Text>
              <Text style={styles.infoValue}>{pkg.source}</Text>
            </View>
          </View>
        </View>
        
        {/* Resources by Panel */}
        {Object.entries(resourcesByPanel).map(([panelId, resources]) => (
          <View key={panelId} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{getPanelTitle(panelId)}</Text>
              <Text style={styles.sectionCount}>{resources.length} resources</Text>
            </View>
            
            {resources
              .sort((a, b) => a.order - b.order)
              .map(resource => (
              <View key={`${resource.resourceId}-${resource.language}`} style={styles.resourceItem}>
                <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(resource.role) }]} />
                
                <View style={styles.resourceInfo}>
                  <Text style={styles.resourceName}>
                    {resource.resourceId.toUpperCase()} ({resource.language})
                  </Text>
                  <View style={styles.resourceMeta}>
                    <Icon name={getRoleIcon(resource.role)} size={12} color="#6b7280" />
                    <Text style={styles.resourceMetaText}>{resource.role}</Text>
                    <Text style={styles.resourceMetaText}>•</Text>
                    <Text style={styles.resourceMetaText}>{resource.owner}</Text>
                  </View>
                </View>
                
                <Pressable
                  onPress={() => handleRemoveResource(`${resource.resourceId}-${resource.language}`)}
                  style={styles.removeButton}
                >
                  <Icon name="x" size={16} color="#dc2626" />
                </Pressable>
              </View>
            ))}
          </View>
        ))}
        
        {/* Add Resource */}
        <Pressable style={styles.addResourceButton} onPress={onAddResource}>
          <Icon name="plus" size={20} color="#3b82f6" />
          <Text style={styles.addResourceText}>Add Resource</Text>
        </Pressable>
      </ScrollView>
      
      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Pressable style={styles.actionButton} onPress={onExport}>
          <Icon name="download" size={16} color="#ffffff" />
          <Text style={styles.actionButtonText}>Export Package</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  editButton: {
    padding: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  nameEditContainer: {
    gap: 12,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  descriptionInput: {
    fontSize: 14,
    color: '#374151',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 60,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sectionCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  roleIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  resourceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resourceMetaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  removeButton: {
    padding: 6,
  },
  addResourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
  },
  addResourceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  bottomActions: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});



