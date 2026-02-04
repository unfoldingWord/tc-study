/**
 * Panel layout generation logic
 */

import type { PanelLayout, PanelConfig, ResourceManifestEntry } from './types'

/**
 * Generate panel layout from resource entries
 * @deprecated Panel layout is UI-specific and should not be in manifest
 */
export function generatePanelLayout(
  resourceEntries: ResourceManifestEntry[]
): PanelLayout {
  // Group resources by type for backwards compatibility
  const scriptureResources = resourceEntries.filter(r => r.type === 'scripture' && !['ugnt', 'uhb'].includes(r.resourceId))
  const helpResources = resourceEntries.filter(r => r.type !== 'scripture' || ['tw', 'ta'].includes(r.resourceId))
  const referenceResources = resourceEntries.filter(r => ['ugnt', 'uhb'].includes(r.resourceId))
  
  const panel1Resources = scriptureResources
  const panel2Resources = helpResources
  const panel3Resources = referenceResources
  
  const panels: PanelConfig[] = []
  
  // Panel 1: Scripture
  if (panel1Resources.length > 0) {
    panels.push({
      id: 'panel-1',
      title: 'Scripture',
      description: 'Primary scripture texts',
      resourceIds: panel1Resources.map(r => r.id),
      defaultResourceId: panel1Resources[0].id,
      visible: true,
      closable: false,
      resizable: true,
      minWidth: 300,
      maxWidth: 800,
    })
  }
  
  // Panel 2: Translation Helps
  if (panel2Resources.length > 0) {
    panels.push({
      id: 'panel-2',
      title: 'Translation Helps',
      description: 'Notes, questions, and study materials',
      resourceIds: panel2Resources.map(r => r.id),
      defaultResourceId: panel2Resources[0].id,
      visible: true,
      closable: true,
      resizable: true,
      minWidth: 250,
      maxWidth: 800,
    })
  }
  
  // Panel 3: Original Languages
  if (panel3Resources.length > 0) {
    panels.push({
      id: 'panel-3',
      title: 'Original Languages',
      description: 'Greek and Hebrew texts',
      resourceIds: panel3Resources.map(r => r.id),
      defaultResourceId: panel3Resources[0].id,
      visible: false, // Hidden by default
      closable: true,
      resizable: true,
      minWidth: 300,
      maxWidth: 800,
    })
  }
  
  return {
    panels,
    layoutVersion: '1.0',
  }
}

/**
 * Validate panel layout
 */
export function validatePanelLayout(layout: PanelLayout): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  if (!layout.panels || layout.panels.length === 0) {
    errors.push('Panel layout must have at least one panel')
  }
  
  // Check for duplicate panel IDs
  const panelIds = layout.panels.map(p => p.id)
  const uniqueIds = new Set(panelIds)
  if (panelIds.length !== uniqueIds.size) {
    errors.push('Panel IDs must be unique')
  }
  
  // Check that each panel has resources
  for (const panel of layout.panels) {
    if (!panel.resourceIds || panel.resourceIds.length === 0) {
      errors.push(`Panel ${panel.id} has no resources`)
    }
    
    if (!panel.defaultResourceId) {
      errors.push(`Panel ${panel.id} has no default resource`)
    }
    
    if (panel.defaultResourceId && !panel.resourceIds.includes(panel.defaultResourceId)) {
      errors.push(`Panel ${panel.id} default resource not in resource list`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
