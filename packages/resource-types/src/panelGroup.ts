/**
 * Panel groups — first-class workspace identity (scripture vs OBS).
 * Unused by Read chrome this slice; registered so modes/entries can take groupId.
 */

export interface PanelGroupDefinition {
  id: string
  displayName: string
}

export function definePanelGroup(definition: PanelGroupDefinition): PanelGroupDefinition {
  if (!definition.id) {
    throw new Error('Panel group definition must have an id')
  }
  if (!definition.displayName) {
    throw new Error('Panel group definition must have a displayName')
  }
  return definition
}
