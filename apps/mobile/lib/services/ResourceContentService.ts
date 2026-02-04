/**
 * ResourceContentService - Handles resource fetching and processing
 * 
 * This service layer abstracts the complexity of different resource types
 * and provides a unified interface for the modal to consume.
 */

import { ResourceContent } from '../components/modals/ResourceModalPresentation';
import { AcademyArticle, ResourceType } from '../types/context';

export interface ResourceItem {
  type: 'ta' | 'tw';
  id: string;
  title?: string;
}

export interface ResourceManagerInterface {
  getOrFetchContent(contentKey: string, resourceType: ResourceType): Promise<any>;
}

export interface ResourceConfig {
  metadata?: {
    type?: string;
    id?: string;
  };
  server?: string;
  owner?: string;
  language?: string;
  panelConfig?: {
    icon?: string;
    color?: string;
    backgroundColor?: string;
  };
}

export interface AnchorResource {
  server?: string;
  owner?: string;
  language?: string;
}

export class ResourceContentService {
  constructor(
    private resourceManager: ResourceManagerInterface,
    private processedResourceConfig: ResourceConfig[],
    private anchorResource?: AnchorResource
  ) {}

  /**
   * Get visual configuration for a resource type
   */
  private getVisualConfig(resourceType: 'ta' | 'tw') {
    // Find the resource config that matches the type
    const resourceConfig = this.processedResourceConfig?.find(config => {
      if (resourceType === 'ta') {
        return config.metadata?.id === 'ta' || config.metadata?.type === 'academy';
      } else if (resourceType === 'tw') {
        return config.metadata?.id === 'tw' || config.metadata?.type === 'words';
      }
      return false;
    });

    // Return visual config if found, otherwise fallback to defaults
    if (resourceConfig?.panelConfig) {
      return {
        icon: resourceConfig.panelConfig.icon || (resourceType === 'ta' ? 'academy' : 'book-open'),
        color: resourceConfig.panelConfig.color || '#ffffff',
        backgroundColor: resourceConfig.panelConfig.backgroundColor || (resourceType === 'ta' ? '#059669' : '#3b82f6')
      };
    }

    // Fallback defaults
    return {
      icon: resourceType === 'ta' ? 'academy' : 'book-open',
      color: '#ffffff',
      backgroundColor: resourceType === 'ta' ? '#059669' : '#3b82f6'
    };
  }

  /**
   * Fetch and process content for a resource item
   */
  async fetchContent(resource: ResourceItem): Promise<ResourceContent> {
    

    if (resource.type === 'ta') {
      return this.fetchTranslationAcademyContent(resource);
    } else if (resource.type === 'tw') {
      return this.fetchTranslationWordsContent(resource);
    } else {
      throw new Error(`Unsupported resource type: ${resource.type}`);
    }
  }

  /**
   * Fetch Translation Academy content
   */
  private async fetchTranslationAcademyContent(resource: ResourceItem): Promise<ResourceContent> {
    
    
    // Find TA resource config
    const academyResourceConfig = this.processedResourceConfig?.find((config: any) => 
      config.metadata?.type === 'academy' || config.metadata?.id === 'ta'
    );
    

    if (!academyResourceConfig) {
      console.error('❌ ResourceContentService: No TA resource config found in:', this.processedResourceConfig);
      throw new Error('Translation Academy resource not found');
    }

    // Construct content key
    const server = this.anchorResource?.server || academyResourceConfig.server || 'git.door43.org';
    const owner = this.anchorResource?.owner || academyResourceConfig.owner || 'unfoldingWord';
    const language = this.anchorResource?.language || academyResourceConfig.language || 'en';
    const resourceId = 'ta';
    
    const contentKey = `${server}/${owner}/${language}/${resourceId}/${resource.id}`;
    
    
    // Fetch content
    const content = await this.resourceManager.getOrFetchContent(contentKey, ResourceType.ACADEMY);
    
    
    if (content && 'article' in content) {
      const article = content.article as AcademyArticle;
      
      
      
      const visualConfig = this.getVisualConfig('ta');
      
      return {
        id: resource.id,
        title: article.title || resource.title || resource.id,
        content: article.content || '',
        type: 'ta',
        icon: visualConfig.icon,
        color: visualConfig.color,
        backgroundColor: visualConfig.backgroundColor
      };
    } else {
      console.error('❌ ResourceContentService: Invalid TA content structure:', content);
      throw new Error('No article content received');
    }
  }

  /**
   * Fetch Translation Words content
   */
  private async fetchTranslationWordsContent(resource: ResourceItem): Promise<ResourceContent> {
    
    
    // Find TW resource config
    const twResourceConfig = this.processedResourceConfig?.find((config: any) => 
      config.metadata?.type === 'words' || config.metadata?.id === 'tw'
    );
    

    if (!twResourceConfig) {
      console.error('❌ ResourceContentService: No TW resource config found in:', this.processedResourceConfig);
      throw new Error('Translation Words resource not found');
    }

    // Construct content key
    const server = this.anchorResource?.server || twResourceConfig.server || 'git.door43.org';
    const owner = this.anchorResource?.owner || twResourceConfig.owner || 'unfoldingWord';
    const language = this.anchorResource?.language || twResourceConfig.language || 'en';
    const resourceId = 'tw';
    
    const contentKey = `${server}/${owner}/${language}/${resourceId}/${resource.id}`;
    
    
    // Fetch content
    const content = await this.resourceManager.getOrFetchContent(contentKey, ResourceType.WORDS);
    
    
    if (content && 'word' in content) {
      const word = content.word as any;
      
      
      
      
      // Translation Words uses 'definition' field, not 'content'
      const wordContent = word.definition || word.content || '';
      const wordTitle = word.term || word.title || resource.title || resource.id;
      
      const visualConfig = this.getVisualConfig('tw');
      
      return {
        id: resource.id,
        title: wordTitle,
        content: wordContent,
        type: 'tw',
        icon: visualConfig.icon,
        color: visualConfig.color,
        backgroundColor: visualConfig.backgroundColor
      };
    } else {
      console.error('❌ ResourceContentService: Invalid TW content structure:', content);
      throw new Error('No word content received');
    }
  }
}
