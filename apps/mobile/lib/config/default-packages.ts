/**
 * Default Package Templates
 * 
 * Defines templates for auto-generating resource packages for different
 * languages and use cases. Templates are matched against available resources
 * in the Door43 catalog to generate default packages.
 */

import { ResourceType } from '../types/context';
import {
  PackageCategory,
  PackageTemplate,
  ResourceRole
} from '../types/resource-package';

// ============================================================================
// DEFAULT PACKAGE TEMPLATES
// ============================================================================

export const DEFAULT_PACKAGE_TEMPLATES: PackageTemplate[] = [
  
  // ============================================================================
  // BIBLE STUDY PACKAGE (Standard - Most Common)
  // ============================================================================
  {
    id: 'bible-study-standard',
    name: '{language} Bible Study Pack',
    description: 'Complete Bible study package with literal text, simplified text, and translation helps',
    category: PackageCategory.BIBLE_STUDY,
    
    requirements: {
      resources: [
        // Literal Scripture (required, anchor)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ult', 'glt', 'ulb'],  // Try in priority order
          role: ResourceRole.ANCHOR,
          required: true,
          panelId: 'panel-1'
        },
        // Simplified Scripture (recommended)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ust', 'gst'],
          role: ResourceRole.PRIMARY,
          required: false,
          panelId: 'panel-1'
        },
        // Translation Notes (optional)
        {
          type: ResourceType.NOTES,
          resourceIds: ['tn'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          panelId: 'panel-2'
        },
        // Translation Words Links (optional)
        {
          type: ResourceType.WORDS_LINKS,
          resourceIds: ['twl'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          panelId: 'panel-2'
        }
      ],
      owners: ['unfoldingWord'],
      subjects: ['Bible', 'Aligned Bible', 'Translation']
    },
    
    config: {
      defaultServer: 'git.door43.org',
      offlineEnabled: true,
      autoUpdate: true,
      updateFrequency: 'weekly'
    },
    
    panelLayoutTemplate: [
      {
        panelId: 'panel-1',
        title: 'Scripture',
        description: 'Primary scripture reading',
        resourceRoles: [ResourceRole.ANCHOR, ResourceRole.PRIMARY],
        defaultRole: ResourceRole.ANCHOR
      },
      {
        panelId: 'panel-2',
        title: 'Translation Helps',
        description: 'Notes and reference materials',
        resourceRoles: [ResourceRole.SUPPLEMENTARY],
        defaultRole: ResourceRole.SUPPLEMENTARY
      }
    ]
  },
  
  // ============================================================================
  // TRANSLATION PACKAGE (Comprehensive)
  // ============================================================================
  {
    id: 'translation-comprehensive',
    name: '{language} Translation Pack',
    description: 'Full translation toolkit with all helps and original languages',
    category: PackageCategory.TRANSLATION,
    
    requirements: {
      resources: [
        // Literal Scripture (required)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ult', 'glt', 'ulb'],
          role: ResourceRole.ANCHOR,
          required: true,
          panelId: 'panel-1'
        },
        // Simplified Scripture (required for translation)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ust', 'gst'],
          role: ResourceRole.PRIMARY,
          required: true,
          panelId: 'panel-1'
        },
        // Translation Notes (required)
        {
          type: ResourceType.NOTES,
          resourceIds: ['tn'],
          role: ResourceRole.SUPPLEMENTARY,
          required: true,
          panelId: 'panel-2'
        },
        // Translation Questions (recommended)
        {
          type: ResourceType.QUESTIONS,
          resourceIds: ['tq'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          panelId: 'panel-2'
        },
        // Translation Words Links
        {
          type: ResourceType.WORDS_LINKS,
          resourceIds: ['twl'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          panelId: 'panel-2'
        },
        // Hebrew Bible (for OT reference)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['uhb'],
          role: ResourceRole.REFERENCE,
          required: false,
          languageOverride: 'hbo',
          panelId: 'panel-1'
        },
        // Greek NT (for NT reference)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ugnt'],
          role: ResourceRole.REFERENCE,
          required: false,
          languageOverride: 'el-x-koine',
          panelId: 'panel-1'
        }
      ],
      owners: ['unfoldingWord'],
      subjects: ['Bible', 'Aligned Bible', 'Translation Notes', 'Translation Questions']
    },
    
    config: {
      defaultServer: 'git.door43.org',
      offlineEnabled: true,
      autoUpdate: true,
      updateFrequency: 'weekly'
    },
    
    panelLayoutTemplate: [
      {
        panelId: 'panel-1',
        title: 'Scripture',
        description: 'Target and original language texts',
        resourceRoles: [ResourceRole.ANCHOR, ResourceRole.PRIMARY, ResourceRole.REFERENCE],
        defaultRole: ResourceRole.ANCHOR
      },
      {
        panelId: 'panel-2',
        title: 'Translation Helps',
        description: 'Notes, questions, and reference materials',
        resourceRoles: [ResourceRole.SUPPLEMENTARY],
        defaultRole: ResourceRole.SUPPLEMENTARY
      }
    ]
  },
  
  // ============================================================================
  // MINIMAL PACKAGE (Basic Bible Reading)
  // ============================================================================
  {
    id: 'minimal-reading',
    name: '{language} Basic Bible',
    description: 'Minimal package for basic Bible reading - scripture only',
    category: PackageCategory.MINIMAL,
    
    requirements: {
      resources: [
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ult', 'glt', 'ulb', 'ust', 'gst'],  // Any scripture
          role: ResourceRole.ANCHOR,
          required: true,
          panelId: 'panel-1'
        }
      ],
      owners: ['unfoldingWord', 'Door43-Catalog'],
      subjects: ['Bible']
    },
    
    config: {
      defaultServer: 'git.door43.org',
      offlineEnabled: true,
      autoUpdate: false
    },
    
    panelLayoutTemplate: [
      {
        panelId: 'panel-1',
        title: 'Scripture',
        description: 'Bible text',
        resourceRoles: [ResourceRole.ANCHOR],
        defaultRole: ResourceRole.ANCHOR
      }
    ]
  },
  
  // ============================================================================
  // RESEARCH PACKAGE (Multi-Language Reference)
  // ============================================================================
  {
    id: 'research-multilang',
    name: '{language} Research Pack',
    description: 'Research package with original languages and English reference materials',
    category: PackageCategory.REFERENCE,
    
    requirements: {
      resources: [
        // Target language scripture (anchor)
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ult', 'glt', 'ulb'],
          role: ResourceRole.ANCHOR,
          required: true,
          panelId: 'panel-1'
        },
        // English Translation Notes (always English)
        {
          type: ResourceType.NOTES,
          resourceIds: ['tn'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          languageOverride: 'en',
          panelId: 'panel-2'
        },
        // English Translation Words (always English)
        {
          type: ResourceType.WORDS,
          resourceIds: ['tw'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          languageOverride: 'en',
          panelId: 'panel-2'
        },
        // English Translation Academy (always English)
        {
          type: ResourceType.ACADEMY,
          resourceIds: ['ta'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          languageOverride: 'en',
          panelId: 'panel-2'
        },
        // Hebrew Bible
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['uhb'],
          role: ResourceRole.REFERENCE,
          required: false,
          languageOverride: 'hbo',
          panelId: 'panel-1'
        },
        // Greek NT
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ugnt'],
          role: ResourceRole.REFERENCE,
          required: false,
          languageOverride: 'el-x-koine',
          panelId: 'panel-1'
        }
      ],
      owners: ['unfoldingWord'],
      subjects: ['Bible', 'Aligned Bible']
    },
    
    config: {
      defaultServer: 'git.door43.org',
      offlineEnabled: true,
      autoUpdate: true,
      updateFrequency: 'monthly'
    },
    
    panelLayoutTemplate: [
      {
        panelId: 'panel-1',
        title: 'Scripture Texts',
        description: 'Target language and original languages',
        resourceRoles: [ResourceRole.ANCHOR, ResourceRole.REFERENCE],
        defaultRole: ResourceRole.ANCHOR
      },
      {
        panelId: 'panel-2',
        title: 'Reference Materials',
        description: 'English notes, words, and academy',
        resourceRoles: [ResourceRole.SUPPLEMENTARY],
        defaultRole: ResourceRole.SUPPLEMENTARY
      }
    ]
  },
  
  // ============================================================================
  // BILINGUAL PACKAGE (Two Languages Side-by-Side)
  // ============================================================================
  {
    id: 'bilingual-study',
    name: '{language} + English Bilingual Pack',
    description: 'Target language scripture with English translation helps',
    category: PackageCategory.BIBLE_STUDY,
    
    requirements: {
      resources: [
        // Target language scripture
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ult', 'glt', 'ulb'],
          role: ResourceRole.ANCHOR,
          required: true,
          panelId: 'panel-1'
        },
        // Target language simplified
        {
          type: ResourceType.SCRIPTURE,
          resourceIds: ['ust', 'gst'],
          role: ResourceRole.PRIMARY,
          required: false,
          panelId: 'panel-2'
        },
        // English notes (always English)
        {
          type: ResourceType.NOTES,
          resourceIds: ['tn'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          languageOverride: 'en',
          panelId: 'panel-2'
        },
        // English words (always English)
        {
          type: ResourceType.WORDS,
          resourceIds: ['tw'],
          role: ResourceRole.SUPPLEMENTARY,
          required: false,
          languageOverride: 'en',
          panelId: 'panel-2'
        }
      ],
      owners: ['unfoldingWord'],
      subjects: ['Bible']
    },
    
    config: {
      defaultServer: 'git.door43.org',
      offlineEnabled: true,
      autoUpdate: true,
      updateFrequency: 'weekly'
    },
    
    panelLayoutTemplate: [
      {
        panelId: 'panel-1',
        title: 'Primary Text',
        description: 'Target language scripture',
        resourceRoles: [ResourceRole.ANCHOR],
        defaultRole: ResourceRole.ANCHOR
      },
      {
        panelId: 'panel-2',
        title: 'Helps & Reference',
        description: 'Simplified text and English helps',
        resourceRoles: [ResourceRole.PRIMARY, ResourceRole.SUPPLEMENTARY],
        defaultRole: ResourceRole.PRIMARY
      }
    ]
  }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get template by ID
 */
export function getTemplateById(id: string): PackageTemplate | undefined {
  return DEFAULT_PACKAGE_TEMPLATES.find(template => template.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: PackageCategory): PackageTemplate[] {
  return DEFAULT_PACKAGE_TEMPLATES.filter(template => template.category === category);
}

/**
 * Get all template IDs
 */
export function getAllTemplateIds(): string[] {
  return DEFAULT_PACKAGE_TEMPLATES.map(template => template.id);
}

/**
 * Format template name with language
 */
export function formatTemplateName(template: PackageTemplate, languageName: string): string {
  return template.name.replace('{language}', languageName);
}



