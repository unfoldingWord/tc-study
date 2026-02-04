/**
 * CLI Types
 */

export type Platform = 'web' | 'native' | 'both'

export type LocationType = 'external' | 'internal'

export interface CreateCommandOptions {
  name: string
  platforms: Platform[]
  description?: string
  subjects?: string[]
  locationType?: LocationType
  appPath?: string
  skipInstall?: boolean
  skipGit?: boolean
}

export interface TemplateContext {
  packageName: string
  resourceName: string
  resourceNamePascal: string
  resourceNameCamel: string
  description: string
  subjects: string[]
  hasWeb: boolean
  hasNative: boolean
  isExternal: boolean
  year: number
}

