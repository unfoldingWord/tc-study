/**
 * Organization Package Generator
 * 
 * Dynamically generates resource packages based on organizations and languages,
 * rather than predefined templates.
 */

import { ResourceType } from '../../types/context';
import {
  PackageStatus,
  PanelConfig,
  PanelLayout,
  ResourceRole,
  ResourceStatus
} from '../../types/resource-package';
import {
  ResourcePackageManifest,
  ResourceManifestEntry,
  ResourceLocation,
  ResourceMetadataUncompressed
} from '../../types/resource-package-manifest';
import { IResourceDiscoveryService } from '../discovery/ResourceDiscoveryService';
import { getDoor43ApiClient, Door43Resource } from '@bt-synergy/door43-api';
import { API_FILTERS } from '../../config/resource-subjects';

export interface OrganizationPackageConfig {
  languages: string[];
  organizations: string[];
  selectedResources?: Door43Resource[];
  includeGreek?: boolean;
  includeHebrew?: boolean;
  packageName?: string;
  packageDescription?: string;
}

export class OrganizationPackageGenerator {
  private discoveryService: IResourceDiscoveryService;
  
  constructor(discoveryService: IResourceDiscoveryService) {
    this.discoveryService = discoveryService;
  }
  
  /**
   * Generate a package from organization-based configuration
   */
  async generatePackage(config: OrganizationPackageConfig): Promise<ResourcePackageManifest> {
    console.log('🔧 Generating organization-based package...');
    console.log('  Languages:', config.languages);
    console.log('  Organizations:', config.organizations);
    
    const client = getDoor43ApiClient();
    const allResources: Door43Resource[] = [];
    
    // Collect resources
    if (config.selectedResources && config.selectedResources.length > 0) {
      // Use provided resources
      allResources.push(...config.selectedResources);
    } else {
      console.log('📋 Using API filters for resources:', API_FILTERS);
      
      // Fetch resources for each language/organization combination
      for (const lang of config.languages) {
        for (const org of config.organizations) {
          try {
            const resources = await client.getResourcesByOrgAndLanguage(org, lang, API_FILTERS);
            allResources.push(...resources);
          } catch (error) {
            console.warn(`Failed to fetch resources for ${org}/${lang}:`, error);
          }
        }
      }
    }
    
    // Check if we have Aligned Bible resources
    const hasAlignedBible = allResources.some(r => r.subject === 'Aligned Bible');
    
    // Add Greek and Hebrew if requested and Aligned Bible resources exist
    if (hasAlignedBible) {
      if (config.includeGreek !== false) {
        try {
          const greekRes = await client.getResourcesByOrgAndLanguage('unfoldingWord', 'el-x-koine', API_FILTERS);
          const ugnt = greekRes.find(r => r.id === 'ugnt');
          if (ugnt && !allResources.some(r => r.id === 'ugnt' && r.language === 'el-x-koine')) {
            allResources.push(ugnt);
          }
        } catch (error) {
          console.warn('Failed to include Greek NT:', error);
        }
      }
      
      if (config.includeHebrew !== false) {
        try {
          const hebrewRes = await client.getResourcesByOrgAndLanguage('unfoldingWord', 'hbo', API_FILTERS);
          const uhb = hebrewRes.find(r => r.id === 'uhb');
          if (uhb && !allResources.some(r => r.id === 'uhb' && r.language === 'hbo')) {
            allResources.push(uhb);
          }
        } catch (error) {
          console.warn('Failed to include Hebrew Bible:', error);
        }
      }
    }
    
    console.log(`✅ Collected ${allResources.length} total resources`);
    
    // Generate manifest
    const packageId = this.generatePackageId(config);
    const packageName = config.packageName || this.generatePackageName(config);
    
    // Convert Door43 resources to manifest entries
    const manifestEntries = this.convertToManifestEntries(allResources);
    
    // Generate panel layout
    const panelLayout = this.generatePanelLayout(manifestEntries);
    
    // Calculate statistics
    const stats = this.calculateStats(allResources);
    
    const manifest: ResourcePackageManifest = {
      formatVersion: '2.0.0',
      id: packageId,
      name: packageName,
      description: config.packageDescription,
      version: '1.0.0',
      primaryOrganization: config.organizations[0],
      primaryLanguage: config.languages[0],
      createdAt: new Date(),
      updatedAt: new Date(),
      resources: manifestEntries,
      panelLayout,
      passageSetIds: [],
      config: {
        defaultServer: 'https://git.door43.org',
        offlineEnabled: true,
        autoUpdate: true
      },
      metadata: {
        category: this.inferCategory(allResources)
      },
      stats,
      status: PackageStatus.READY
    };
    
    return manifest;
  }
  
  /**
   * Convert Door43 resources to manifest entries
   */
  private convertToManifestEntries(resources: Door43Resource[]): ResourceManifestEntry[] {
    return resources.map((resource, index) => {
      // Determine panel assignment based on resource type
      const panelId = this.assignPanelId(resource, index);
      const role = this.inferResourceRole(resource);
      
      const metadata: ResourceMetadataUncompressed = {
        id: resource.id,
        type: resource.subject || 'Unknown',
        subjects: resource.subject ? [resource.subject] : [],
        version: resource.release?.tag_name || resource.commit_sha?.substring(0, 7) || 'latest',
        size: 0, // Will be filled when resource is downloaded
        lastUpdated: resource.released ? new Date(resource.released) : new Date(),
        owner: resource.owner,
        language: resource.language,
        languageName: resource.language_title,
        format: resource.format,
        description: resource.title,
        sourceUrl: resource.html_url,
        releaseUrl: resource.release?.zipball_url,
        commitSha: resource.commit_sha
      };
      
      const location: ResourceLocation = {
        type: 'url',
        path: resource.release?.zipball_url || resource.html_url || '',
        format: 'compressed'
      };
      
      return {
        id: `${resource.owner}_${resource.language}_${resource.id}`,
        type: this.mapSubjectToResourceType(resource.subject),
        metadata,
        contentLocation: location,
        status: ResourceStatus.AVAILABLE,
        role,
        panelId,
        order: index
      };
    });
  }
  
  /**
   * Assign panel ID based on resource type and index
   */
  private assignPanelId(resource: Door43Resource, index: number): string {
    // Bible resources go to panel-1
    if (resource.subject === 'Bible' || resource.subject === 'Aligned Bible') {
      return 'panel-1';
    }
    
    // Notes, Questions, Words go to panel-2
    if (resource.subject?.includes('Translation Notes') || 
        resource.subject?.includes('Translation Questions') ||
        resource.subject?.includes('Translation Words')) {
      return 'panel-2';
    }
    
    // Everything else to panel-3
    return 'panel-3';
  }
  
  /**
   * Infer resource role based on type
   */
  private inferResourceRole(resource: Door43Resource): ResourceRole {
    if (resource.subject === 'Aligned Bible' || resource.subject === 'Bible') {
      if (['ugnt', 'uhb'].includes(resource.id)) {
        return ResourceRole.ORIGINAL_LANGUAGE;
      }
      return ResourceRole.PRIMARY_TRANSLATION;
    }
    
    if (resource.subject?.includes('Translation Notes')) {
      return ResourceRole.NOTES;
    }
    
    if (resource.subject?.includes('Translation Questions')) {
      return ResourceRole.QUESTIONS;
    }
    
    if (resource.subject?.includes('Translation Words')) {
      return ResourceRole.DICTIONARY;
    }
    
    return ResourceRole.SUPPLEMENTARY;
  }
  
  /**
   * Map Door43 subject to ResourceType
   */
  private mapSubjectToResourceType(subject?: string): ResourceType {
    if (!subject) return ResourceType.BIBLE;
    
    if (subject.includes('Bible')) return ResourceType.BIBLE;
    if (subject.includes('Translation Notes')) return ResourceType.NOTES;
    if (subject.includes('Translation Questions')) return ResourceType.QUESTIONS;
    if (subject.includes('Translation Words')) return ResourceType.WORDS;
    if (subject.includes('Translation Academy')) return ResourceType.ACADEMY;
    
    return ResourceType.BIBLE;
  }
  
  /**
   * Generate panel layout for manifest
   */
  private generatePanelLayout(entries: ResourceManifestEntry[]): PanelLayout {
    const panel1Resources = entries.filter(e => e.panelId === 'panel-1');
    const panel2Resources = entries.filter(e => e.panelId === 'panel-2');
    const panel3Resources = entries.filter(e => e.panelId === 'panel-3');
    
    const panels: PanelConfig[] = [];
    
    if (panel1Resources.length > 0) {
      panels.push({
        id: 'panel-1',
        title: 'Scripture',
        description: 'Bible translations and original languages',
        resourceIds: panel1Resources.map(r => r.id),
        defaultResourceId: panel1Resources[0].id,
        visible: true,
        closable: false,
        resizable: true,
        minWidth: 300,
        maxWidth: 800
      });
    }
    
    if (panel2Resources.length > 0) {
      panels.push({
        id: 'panel-2',
        title: 'Helps',
        description: 'Translation notes, questions, and words',
        resourceIds: panel2Resources.map(r => r.id),
        defaultResourceId: panel2Resources[0].id,
        visible: true,
        closable: true,
        resizable: true,
        minWidth: 300,
        maxWidth: 800
      });
    }
    
    if (panel3Resources.length > 0) {
      panels.push({
        id: 'panel-3',
        title: 'Resources',
        description: 'Additional resources',
        resourceIds: panel3Resources.map(r => r.id),
        defaultResourceId: panel3Resources[0].id,
        visible: true,
        closable: true,
        resizable: true,
        minWidth: 300,
        maxWidth: 800
      });
    }
    
    return {
      panels,
      layoutVersion: '1.0'
    };
  }
  
  /**
   * Calculate package statistics
   */
  private calculateStats(resources: Door43Resource[]) {
    const languages = new Set(resources.map(r => r.language));
    const organizations = new Set(resources.map(r => r.owner));
    const subjects = new Set(resources.map(r => r.subject).filter(Boolean));
    
    return {
      totalSize: 0, // Will be calculated when resources are downloaded
      downloadedSize: 0,
      resourceCount: resources.length,
      organizations: Array.from(organizations),
      languages: Array.from(languages),
      subjects: Array.from(subjects) as string[]
    };
  }
  
  /**
   * Generate package ID
   */
  private generatePackageId(config: OrganizationPackageConfig): string {
    const timestamp = Date.now();
    const langCode = config.languages[0] || 'multi';
    const orgCode = config.organizations[0] || 'custom';
    return `pkg-${orgCode}-${langCode}-${timestamp}`;
  }
  
  /**
   * Generate package name
   */
  private generatePackageName(config: OrganizationPackageConfig): string {
    if (config.languages.length === 1 && config.organizations.length === 1) {
      return `${config.organizations[0]} - ${config.languages[0]}`;
    } else if (config.languages.length === 1) {
      return `${config.languages[0]} - Multiple Organizations`;
    } else if (config.organizations.length === 1) {
      return `${config.organizations[0]} - Multiple Languages`;
    } else {
      return `Multi-Language Package (${config.languages.length} languages, ${config.organizations.length} organizations)`;
    }
  }
  
  /**
   * Infer package category from resources
   */
  private inferCategory(resources: Door43Resource[]): string {
    const hasBible = resources.some(r => r.subject?.includes('Bible'));
    const hasNotes = resources.some(r => r.subject?.includes('Translation Notes'));
    const hasQuestions = resources.some(r => r.subject?.includes('Translation Questions'));
    
    if (hasBible && hasNotes && hasQuestions) {
      return 'complete';
    } else if (hasBible) {
      return 'bible';
    } else if (hasNotes || hasQuestions) {
      return 'helps';
    }
    
    return 'custom';
  }
}

/**
 * Factory function
 */
export function createOrganizationPackageGenerator(
  discoveryService: IResourceDiscoveryService
): OrganizationPackageGenerator {
  return new OrganizationPackageGenerator(discoveryService);
}

