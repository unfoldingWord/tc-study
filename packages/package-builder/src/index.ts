/**
 * @bt-synergy/package-builder
 * 
 * Core business logic for building Bible translation resource packages.
 * Platform-agnostic code that can be used in web, mobile, or CLI applications.
 */

// Main class
export { PackageBuilder } from './package-builder'

// Types
export type {
  PackageManifest,
  ResourceManifestEntry,
  ResourceDownload,
  ResourceSource,
  ResourceContent,
  ResourceIngredient,
  ResourceLocation,
  PanelLayout,
  PanelConfig,
  PackageConfig,
  PackageMetadata,
  PackageStats,
  LanguageInfo,
  PackageStatus,
  ResourceStatus,
  ResourceRole,
  ResourceType,
  PackageBuilderState,
  PackageBuilderConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types'

// Configuration
export {
  DEFAULT_SUBJECTS,
  DEFAULT_API_FILTERS,
  DEFAULT_PACKAGE_CONFIG,
  ORIGINAL_LANGUAGE_RESOURCES,
  type ResourceSubject,
} from './config'

// Utilities
export {
  inferResourceType,
  inferResourceRole,
  mapSubjectToResourceType,
  assignPanelId,
  sortResources,
  isOriginalLanguage,
  isAlignedBible,
  getResourceKey,
} from './resource-utils'

// Manifest generation
export {
  generateManifest,
  createResourceEntry,
  generatePackageId,
  generatePackageName,
  inferPackageCategory,
  type ManifestGeneratorOptions,
} from './manifest-generator'

// Panel layout
export {
  generatePanelLayout,
  validatePanelLayout,
} from './panel-layout'

// Statistics
export {
  calculatePackageStats,
  getMostCommon,
} from './statistics'

// Dependencies
export {
  getDependencies,
  sortByDependencies,
} from './dependencies'

// Validation
export {
  validateManifest,
  validatePackageName,
  validateVersion,
} from './validation'

// URL Verification
export {
  verifyUrl,
  verifyUrls,
  verifyDocumentationUrls,
  getRepoContents,
  buildVerifiedDocUrls,
  type UrlVerificationResult,
} from './url-verification'
