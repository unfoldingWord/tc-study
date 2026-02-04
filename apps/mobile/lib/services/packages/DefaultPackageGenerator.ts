/**
 * Default Package Generator
 * 
 * Automatically generates default resource packages by matching templates
 * against available resources in the Door43 catalog.
 */

import { DEFAULT_PACKAGE_TEMPLATES, formatTemplateName } from '../../config/default-packages';
import { ResourceType } from '../../types/context';
import {
  DiscoveredResource,
  LanguageInfo,
  PackageResource,
  PackageStatus,
  PackageTemplate,
  PanelConfig,
  PanelLayout,
  ResourceIdentifier,
  ResourcePackage,
  ResourceRole,
  ResourceStatus
} from '../../types/resource-package';
import { IResourceDiscoveryService } from '../discovery/ResourceDiscoveryService';

interface GeneratedResourceInfo {
  resourceId: string;
  language: string;
  type: ResourceType;
  role: ResourceRole;
  panelId: string;
  owner: string;
  server: string;
  version: string;
  available: DiscoveredResource;
}

export class DefaultPackageGenerator {
  private discoveryService: IResourceDiscoveryService;
  private templates: PackageTemplate[];
  
  constructor(
    discoveryService: IResourceDiscoveryService,
    templates: PackageTemplate[] = DEFAULT_PACKAGE_TEMPLATES
  ) {
    this.discoveryService = discoveryService;
    this.templates = templates;
  }
  
  /**
   * Generate all possible default packages
   */
  async generateDefaultPackages(): Promise<ResourcePackage[]> {
    console.log('🔍 Generating default packages from templates...');
    
    try {
      // Get all available languages
      const languages = await this.discoveryService.getAvailableLanguages();
      console.log(`📚 Found ${languages.length} languages`);
      
      const packages: ResourcePackage[] = [];
      
      // For each language, try each template
      for (const language of languages) {
        for (const template of this.templates) {
          try {
            const pkg = await this.tryGeneratePackage(template, language);
            if (pkg) {
              packages.push(pkg);
              console.log(`✅ Generated: ${pkg.name}`);
            }
          } catch (error) {
            console.warn(`⚠️ Could not generate ${template.id} for ${language.name}:`, error);
          }
        }
      }
      
      console.log(`✅ Generated ${packages.length} default packages`);
      return packages;
      
    } catch (error) {
      console.error('❌ Failed to generate default packages:', error);
      return [];
    }
  }
  
  /**
   * Get default packages for a specific language
   */
  async getPackagesForLanguage(languageCode: string): Promise<ResourcePackage[]> {
    console.log(`🔍 Generating packages for language: ${languageCode}`);
    
    try {
      const languages = await this.discoveryService.getAvailableLanguages();
      const language = languages.find(l => l.code === languageCode);
      
      if (!language) {
        console.warn(`⚠️ Language not found: ${languageCode}`);
        return [];
      }
      
      const packages: ResourcePackage[] = [];
      
      for (const template of this.templates) {
        const pkg = await this.tryGeneratePackage(template, language);
        if (pkg) {
          packages.push(pkg);
        }
      }
      
      return packages;
      
    } catch (error) {
      console.error('❌ Failed to generate packages for language:', error);
      return [];
    }
  }
  
  /**
   * Try to generate a package from a template for a specific language
   */
  private async tryGeneratePackage(
    template: PackageTemplate,
    language: LanguageInfo
  ): Promise<ResourcePackage | null> {
    const generatedResources: GeneratedResourceInfo[] = [];
    
    // Check each resource requirement
    for (const req of template.requirements.resources) {
      const targetLanguage = req.languageOverride || language.code;
      
      // Try each resource ID in priority order
      let found: DiscoveredResource | null = null;
      
      for (const resourceId of req.resourceIds) {
        for (const owner of template.requirements.owners) {
          const identifier: ResourceIdentifier = {
            server: 'git.door43.org',
            owner,
            language: targetLanguage,
            resourceId
          };
          
          try {
            const availability = await this.discoveryService.checkResourceAvailable(identifier);
            
            if (availability.available) {
              // Get full resource details
              const resource = await this.discoveryService.getResourceDetails(identifier);
              found = resource;
              break;
            }
          } catch (error) {
            // Resource not available, try next
            continue;
          }
        }
        
        if (found) break;
      }
      
      // If required resource not found, template doesn't apply to this language
      if (!found && req.required) {
        console.log(`⏭️ Skipping ${template.id} for ${language.name}: required ${req.type} not found`);
        return null;
      }
      
      // Add to generated resources if found
      if (found) {
        generatedResources.push({
          resourceId: found.id,
          language: found.language,
          type: found.type,
          role: req.role,
          panelId: req.panelId,
          owner: found.owner,
          server: found.server,
          version: found.version,
          available: found
        });
      }
    }
    
    // All required resources found - generate package
    const packageId = `default-${template.id}-${language.code}`;
    const packageName = formatTemplateName(template, language.name);
    
    // Create panel layout from template
    const panelLayout = this.generatePanelLayout(template, generatedResources);
    
    // Create package resources
    const packageResources: PackageResource[] = generatedResources.map((r, index) => ({
      resourceId: r.resourceId,
      resourceType: r.type,
      server: r.server,
      owner: r.owner,
      language: r.language,
      version: r.version,
      role: r.role,
      panelId: r.panelId,
      order: index,
      status: ResourceStatus.AVAILABLE
    }));
    
    const pkg: ResourcePackage = {
      id: packageId,
      name: packageName,
      description: template.description,
      version: '1.0.0',
      source: 'default',
      createdAt: new Date(),
      updatedAt: new Date(),
      config: {
        defaultServer: template.config.defaultServer || 'git.door43.org',
        defaultOwner: template.requirements.owners[0],
        defaultLanguage: language.code,
        offlineEnabled: template.config.offlineEnabled ?? true,
        autoUpdate: template.config.autoUpdate ?? true,
        updateFrequency: template.config.updateFrequency
      },
      resources: packageResources,
      panelLayout,
      passageSetIds: [],
      status: PackageStatus.READY,
      metadata: {
        category: template.category,
        tags: [language.code, template.category]
      }
    };
    
    return pkg;
  }
  
  /**
   * Generate panel layout from template
   */
  private generatePanelLayout(
    template: PackageTemplate,
    resources: GeneratedResourceInfo[]
  ): PanelLayout {
    const panels: PanelConfig[] = template.panelLayoutTemplate.map(panelTemplate => {
      // Find resources that belong to this panel
      const panelResources = resources.filter(r => r.panelId === panelTemplate.panelId);
      
      // Find default resource (by role)
      const defaultResource = panelResources.find(r => r.role === panelTemplate.defaultRole);
      
      return {
        id: panelTemplate.panelId,
        title: panelTemplate.title,
        description: panelTemplate.description,
        resourceIds: panelResources.map(r => `${r.resourceId}-${r.language}`),
        defaultResourceId: defaultResource 
          ? `${defaultResource.resourceId}-${defaultResource.language}`
          : (panelResources[0] ? `${panelResources[0].resourceId}-${panelResources[0].language}` : ''),
        visible: true,
        closable: panelTemplate.panelId !== 'panel-1', // First panel not closable
        resizable: true,
        minWidth: 300,
        maxWidth: 800
      };
    });
    
    return {
      panels,
      layoutVersion: '1.0'
    };
  }
}

/**
 * Factory function
 */
export function createDefaultPackageGenerator(
  discoveryService: IResourceDiscoveryService,
  templates?: PackageTemplate[]
): DefaultPackageGenerator {
  return new DefaultPackageGenerator(discoveryService, templates);
}



