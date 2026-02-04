/**
 * Package manifest validation
 */

import type {
  PackageManifest,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types'

/**
 * Validate a package manifest
 */
export function validateManifest(manifest: PackageManifest): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  // Required fields
  if (!manifest.id) {
    errors.push({
      field: 'id',
      message: 'Package ID is required',
      code: 'MISSING_ID',
    })
  }
  
  if (!manifest.name || manifest.name.trim() === '') {
    errors.push({
      field: 'name',
      message: 'Package name is required',
      code: 'MISSING_NAME',
    })
  }
  
  if (!manifest.version) {
    errors.push({
      field: 'version',
      message: 'Package version is required',
      code: 'MISSING_VERSION',
    })
  }
  
  if (!manifest.formatVersion) {
    errors.push({
      field: 'formatVersion',
      message: 'Format version is required',
      code: 'MISSING_FORMAT_VERSION',
    })
  }
  
  // Resources
  if (!manifest.resources || manifest.resources.length === 0) {
    errors.push({
      field: 'resources',
      message: 'Package must have at least one resource',
      code: 'NO_RESOURCES',
    })
  }
  
  // Validate resource entries
  if (manifest.resources) {
    const resourceIds = new Set<string>()
    
    for (let i = 0; i < manifest.resources.length; i++) {
      const resource = manifest.resources[i]
      
      if (!resource.id) {
        errors.push({
          field: `resources[${i}].id`,
          message: 'Resource ID is required',
          code: 'MISSING_RESOURCE_ID',
        })
      }
      
      if (resourceIds.has(resource.id)) {
        errors.push({
          field: `resources[${i}].id`,
          message: `Duplicate resource ID: ${resource.id}`,
          code: 'DUPLICATE_RESOURCE_ID',
        })
      }
      resourceIds.add(resource.id)
      
      if (!resource.download || !resource.download.url) {
        errors.push({
          field: `resources[${i}].download`,
          message: 'Resource download information is required',
          code: 'MISSING_DOWNLOAD_INFO',
        })
      }
      
      if (!resource.content) {
        errors.push({
          field: `resources[${i}].content`,
          message: 'Resource content metadata is required',
          code: 'MISSING_CONTENT_METADATA',
        })
      }
    }
  }
  
  // Panel layout is optional in the new format (UI-specific)
  
  // Warnings
  if (!manifest.description) {
    warnings.push({
      field: 'description',
      message: 'Package description is recommended',
      code: 'MISSING_DESCRIPTION',
    })
  }
  
  if (manifest.resources.length === 0) {
    warnings.push({
      field: 'resources',
      message: 'Package has no resources',
      code: 'EMPTY_PACKAGE',
    })
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate package name
 */
export function validatePackageName(name: string): {
  valid: boolean
  error?: string
} {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Package name cannot be empty' }
  }
  
  if (name.length < 3) {
    return { valid: false, error: 'Package name must be at least 3 characters' }
  }
  
  if (name.length > 100) {
    return { valid: false, error: 'Package name must be less than 100 characters' }
  }
  
  return { valid: true }
}

/**
 * Validate version string
 */
export function validateVersion(version: string): {
  valid: boolean
  error?: string
} {
  if (!version) {
    return { valid: false, error: 'Version cannot be empty' }
  }
  
  // Simple semver check
  const semverRegex = /^\d+\.\d+\.\d+$/
  if (!semverRegex.test(version)) {
    return { valid: false, error: 'Version must follow semver format (e.g., 1.0.0)' }
  }
  
  return { valid: true }
}
