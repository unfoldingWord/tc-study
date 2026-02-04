/**
 * Resource utility functions
 */

import type { Door43Resource } from '@bt-synergy/door43-api'

export function inferResourceType(resource: Door43Resource): string {
  // TODO: Implement resource type inference
  return resource.subject || 'unknown'
}

export function inferResourceRole(_resource: Door43Resource): string {
  // TODO: Implement resource role inference
  return 'primary'
}

export function mapSubjectToResourceType(subject: string): string {
  // TODO: Implement subject to resource type mapping
  return subject
}

export function assignPanelId(): string {
  // TODO: Implement panel ID assignment
  return 'panel-1'
}

export function sortResources(resources: Door43Resource[]): Door43Resource[] {
  // TODO: Implement resource sorting
  return resources
}

export function isOriginalLanguage(resource: Door43Resource): boolean {
  return resource.language === 'hbo' || resource.language === 'el-x-koine'
}

export function isAlignedBible(resource: Door43Resource): boolean {
  return resource.subject === 'Aligned Bible'
}

export function getResourceKey(resource: Door43Resource): string {
  return `${resource.owner}/${resource.language}/${resource.id}`
}

export { }

