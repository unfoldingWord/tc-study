/**
 * Global Application Configuration
 * 
 * This file contains the basic app configuration without any dependencies
 * to avoid circular dependency issues.
 */

/**
 * Global app configuration - can be overridden by workspace settings
 */
export const GLOBAL_APP_CONFIG = {
  defaultServer: 'git.door43.org',
  defaultOwner: 'unfoldingWord',
  defaultLanguage: 'en',
  defaultBook: 'tit',
  cacheExpiryHours: 24,
  resourceMode: 'default' as 'minimal' | 'default' | 'comprehensive'
};

/**
 * Get the current app configuration
 * In the future, this could be extended to load from user settings
 */
export function getAppConfig() {
  // TODO: Load from user settings/preferences
  // For now, return global configuration
  return GLOBAL_APP_CONFIG;
}

/**
 * Resolve server, owner, and language for a resource
 * Priority: Resource-specific config > Workspace state > Global defaults
 */
export function resolveResourceParams(
  resourceConfig: { server?: string; owner?: string; language?: string },
  workspaceParams?: { server?: string; owner?: string; language?: string }
): { server: string; owner: string; language: string } {
  const globalConfig = getAppConfig();
  
  return {
    // Resource-specific overrides take highest priority
    server: resourceConfig.server || workspaceParams?.server || globalConfig.defaultServer,
    owner: resourceConfig.owner || workspaceParams?.owner || globalConfig.defaultOwner,
    language: resourceConfig.language || workspaceParams?.language || globalConfig.defaultLanguage
  };
}

