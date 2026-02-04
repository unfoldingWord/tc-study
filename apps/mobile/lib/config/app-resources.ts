/**
 * Application Resource Configuration
 * 
 * This file defines which resources the bt-studio app should load,
 * how they should be configured, and how they should be rendered.
 * 
 * This is the single source of truth for app configuration including:
 * - Global server/owner/language defaults
 * - Resource-specific overrides
 * - Panel assignments and mappings
 */

import {
  AcademyAdapterConfig,
  AdapterType,
  AppResourceConfig,
  NotesAdapterConfig,
  PanelCategory,
  ResourceUsageMode,
  ScriptureAdapterConfig,
  SmartPanelEntry,
  TranslationWordsAdapterConfig,
  TranslationWordsLinksAdapterConfig
} from '../types/resource-config';

// Import resource components
import { AcademyViewer } from '../components/resources/AcademyViewer';
import { NotesViewer } from '../components/resources/NotesViewer';
import { OriginalScriptureViewer } from '../components/resources/OriginalScriptureViewer';
import { QuestionsViewer } from '../components/resources/QuestionsViewer';
import { ScriptureViewer } from '../components/resources/ScriptureViewer';
import { TranslationWordsLinksViewer } from '../components/resources/TranslationWordsLinksViewer';

// Import global config (without circular dependencies)
export { getAppConfig, GLOBAL_APP_CONFIG, resolveResourceParams } from './global-config';

// ============================================================================
// GLOBAL APP CONFIGURATION
// ============================================================================
// Moved to global-config.ts to avoid circular dependencies
// TODO: Import other components when adapters are implemented
// import { WordsViewer } from '../components/resources/WordsViewer';

// TODO: Create proper resource component wrappers
// For now, use type assertion to bypass component prop mismatch
 
const ScriptureResourceComponent = ScriptureViewer as any;
 
const NotesResourceComponent = NotesViewer as any;
 
const QuestionsResourceComponent = QuestionsViewer as any;
 
const OriginalScriptureResourceComponent = OriginalScriptureViewer as any;
 
const AcademyResourceComponent = AcademyViewer as any;
 
const TranslationWordsResourceComponent = AcademyViewer as any; // Reuse AcademyViewer for now
 
const TranslationWordsLinksResourceComponent = TranslationWordsLinksViewer as any;

/**
 * Panel Resource Assignment
 * 
 * Defines which resources belong to which panels and their behavior.
 * Resources can be:
 * - 'panel': Dedicated panel resources with dropdown navigation
 * - 'on-demand': Available for popups, modals, or contextual display
 * - 'background': Used internally but not directly user-accessible
 */
export interface PanelResourceAssignment {
  panelId: string;
  title: string;
  description: string;
  category: PanelCategory;
  icon: string;
  
  // Panel behavior
  defaultVisible: boolean;
  resizable: boolean;
  closable: boolean;
  
  // Layout
  preferredWidth: number;
  minWidth: number;
  maxWidth: number;
  
  // Resources assigned to this panel
  resources?: string[]; // Array of panelResourceIds (optional)
  smartEntries?: string[]; // Array of smart panel entry IDs (optional)
  defaultResource?: string; // Which resource to show by default
}


/**
 * Default application resource configuration
 * 
 * The first resource becomes the anchor resource unless explicitly marked otherwise.
 * The anchor resource is used for navigation and initial content loading.
 */
export const APP_RESOURCES: AppResourceConfig[] = [
  
  // ============================================================================
  // ANCHOR RESOURCE: ULT Scripture (with GLT, ULB fallback)
  // ============================================================================
  {
    panelResourceId: 'ult-scripture',
    adapterType: AdapterType.DOOR43_SCRIPTURE,
    adapterConfig: {
      // Priority fallback: ULT → GLT → ULB
      resourceIds: ['ult', 'glt', 'ulb'],
      
      // Processing options
      includeAlignments: true,
      includeSections: true,
      usfmVersion: '3.0',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as ScriptureAdapterConfig,
    panelConfig: {
      title: 'Literal Text',
      description: 'Unfoldingword Literal Text with fallback support',
      category: PanelCategory.SCRIPTURE,
      component: ScriptureResourceComponent,
      icon: 'book-open'
    },
    usageMode: ResourceUsageMode.PANEL,
    isAnchor: true,
    loadPriority: 1
  },
  
  // ============================================================================
  // UST Scripture (with GST fallback)
  // ============================================================================
  {
    panelResourceId: 'ust-scripture',
    adapterType: AdapterType.DOOR43_SCRIPTURE,
    adapterConfig: {
      // Priority fallback: UST → GST
      resourceIds: ['ust', 'gst'],
      
      // Processing options (simplified text doesn't need alignments)
      includeAlignments: false,
      includeSections: true,
      usfmVersion: '3.0',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      validateContent: true
    } as ScriptureAdapterConfig,
    panelConfig: {
      title: 'Simplified Text',
      description: 'Unfoldingword Simplified Text for clear understanding',
      category: PanelCategory.SCRIPTURE,
      component: ScriptureResourceComponent,
      icon: 'book'
    },
    usageMode: ResourceUsageMode.PANEL,
    loadPriority: 2
  },

  // ============================================================================
  // Translation Notes (TN)
  // ============================================================================
  {
    panelResourceId: 'tn-notes',
    adapterType: AdapterType.DOOR43_NOTES,
    adapterConfig: {
      // Resource configuration
      resourceId: 'tn',
      
      // Processing options
      markdownProcessor: 'basic',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as NotesAdapterConfig,
    panelConfig: {
      title: 'Translation Notes',
      description: 'Contextual translation guidance and explanations',
      category: PanelCategory.NOTES,
      component: NotesResourceComponent,
      icon: 'sticky-note'
    },
    usageMode: ResourceUsageMode.PANEL,
    loadPriority: 3
  },

  // ============================================================================
  // Translation Questions (TQ)
  // ============================================================================
  {
    panelResourceId: 'tq-questions',
    adapterType: AdapterType.DOOR43_QUESTIONS,
    adapterConfig: {
      // Resource configuration
      resourceId: 'tq',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as NotesAdapterConfig,
    panelConfig: {
      title: 'Translation Questions',
      description: 'Quality assurance questions for Bible translation',
      category: PanelCategory.NOTES,
      component: QuestionsResourceComponent,
      icon: 'question-mark-circle'
    },
    usageMode: ResourceUsageMode.PANEL,
    loadPriority: 4
  },

  // ============================================================================
  // Translation Words Links (TWL)
  // ============================================================================
  {
    panelResourceId: 'twl-links',
    adapterType: AdapterType.DOOR43_WORDS_LINKS,
    adapterConfig: {
      // Resource configuration
      resourceId: 'twl',
      
      // Processing options
      categories: ['kt', 'names', 'other'], // All categories
      includeOriginalWords: true,
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as TranslationWordsLinksAdapterConfig,
    panelConfig: {
      title: 'Translation Words Links',
      description: 'Cross-reference links between Bible words and Translation Words definitions',
      category: PanelCategory.NOTES,
      component: TranslationWordsLinksResourceComponent,
      icon: 'link'
    },
    usageMode: ResourceUsageMode.PANEL,
    loadPriority: 5
  }
];

// ============================================================================
// GLOBAL RESOURCES (Available to smart components, not tied to specific panels)
// ============================================================================
export const GLOBAL_RESOURCES: AppResourceConfig[] = [
  
  // Hebrew Bible - Always loads from unfoldingWord/hbo
  {
    panelResourceId: 'hebrew-bible-global',
    adapterType: AdapterType.DOOR43_SCRIPTURE,
    adapterConfig: {
      resourceIds: ['uhb'],
      
      // Processing options
      includeAlignments: true,
      includeSections: true,
      usfmVersion: '3.0',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as ScriptureAdapterConfig,
    panelConfig: {
      title: 'Hebrew Bible',
      description: 'unfoldingWord® Hebrew Bible (UHB)',
      category: PanelCategory.SCRIPTURE,
      component: ScriptureResourceComponent,
      icon: 'languages'
    },
    usageMode: ResourceUsageMode.GLOBAL,
    loadPriority: 5,
    // Resource-specific parameters
    server: 'git.door43.org',
    owner: 'unfoldingWord',
    language: 'hbo'
  },
  
  // Greek New Testament - Always loads from unfoldingWord/el-x-koine
  {
    panelResourceId: 'greek-nt-global',
    adapterType: AdapterType.DOOR43_SCRIPTURE,
    adapterConfig: {
      resourceIds: ['ugnt'],
      
      // Processing options
      includeAlignments: true,
      includeSections: true,
      usfmVersion: '3.0',
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as ScriptureAdapterConfig,
    panelConfig: {
      title: 'Greek New Testament',
      description: 'unfoldingWord® Greek New Testament (UGNT)',
      category: PanelCategory.SCRIPTURE,
      component: ScriptureResourceComponent,
      icon: 'languages'
    },
    usageMode: ResourceUsageMode.GLOBAL,
    loadPriority: 6,
    // Resource-specific parameters
    server: 'git.door43.org',
    owner: 'unfoldingWord',
    language: 'el-x-koine'
  },
  
  // Translation Academy - Always loads from unfoldingWord (language context-dependent)
  {
    panelResourceId: 'translation-academy-global',
    adapterType: AdapterType.DOOR43_ACADEMY,
    adapterConfig: {
      resourceId: 'ta',
      
      // Processing options
      categories: ['translate', 'checking', 'intro'], // All categories
      includeImages: true,
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as AcademyAdapterConfig,
    panelConfig: {
      title: 'Translation Academy',
      description: 'Translation methodology and training materials',
      category: PanelCategory.REFERENCE,
      component: AcademyResourceComponent,
      icon: 'academy',
      color: '#ffffff',
      backgroundColor: '#059669'
    },
    usageMode: ResourceUsageMode.GLOBAL,
    loadPriority: 7
    // Note: No resource-specific server/owner/language - uses app context
  },

  // ============================================================================
  // TRANSLATION WORDS GLOBAL RESOURCE
  // ============================================================================
  {
    panelResourceId: 'translation-words-global',
    adapterType: AdapterType.DOOR43_WORDS,
    adapterConfig: {
      resourceId: 'tw',
      
      // Processing options
      categories: ['keyTerm', 'properName', 'generalTerm'], // All categories
      includeStrongsNumbers: true,
      
      // Performance options
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    } as TranslationWordsAdapterConfig,
    panelConfig: {
      title: 'Translation Words',
      description: 'Biblical term definitions and explanations',
      category: PanelCategory.REFERENCE,
      component: TranslationWordsResourceComponent,
      icon: 'book-open',
      color: '#ffffff',
      backgroundColor: '#3b82f6'
    },
    usageMode: ResourceUsageMode.GLOBAL,
    loadPriority: 8
    // Note: No resource-specific server/owner/language - uses app context
  }
];

// ============================================================================
// SMART PANEL ENTRIES (Dynamic entries that can access global resources)
// ============================================================================
export const SMART_PANEL_ENTRIES: SmartPanelEntry[] = [
  
  {
    panelEntryId: 'original-languages-smart',
    component: OriginalScriptureResourceComponent,
    getDynamicConfig: ({ testament }) => ({
      title: testament === 'OT' 
        ? 'unfoldingWord® Hebrew Bible'
        : 'unfoldingWord® Greek New Testament',
      description: testament === 'OT' 
        ? 'unfoldingWord® Hebrew Bible (UHB)'
        : 'unfoldingWord® Greek New Testament (UGNT)',
      icon: 'languages'
    }),
    accessibleResources: ['hebrew-bible-global', 'greek-nt-global'],
    category: PanelCategory.SCRIPTURE,
    usageMode: ResourceUsageMode.PANEL,
    loadPriority: 4
  }

  // ============================================================================
  // ON-DEMAND RESOURCES (for popups, modals, contextual display)
  // ============================================================================
  
  // Translation Words - Available on-demand for word studies
  // {
  //   panelResourceId: 'tw-words',
  //   adapterType: AdapterType.DOOR43_WORDS,
  //   adapterConfig: { resourceId: 'tw', markdownProcessor: 'basic' } as NotesAdapterConfig,
  //   panelConfig: {
  //     title: 'Translation Words',
  //     description: 'Key term definitions and explanations',
  //     category: PanelCategory.REFERENCE,
  //     component: WordsViewer,
  //     icon: 'book-open-text'
  //   },
  //   usageMode: ResourceUsageMode.ON_DEMAND,
  //   loadPriority: 4
  // }
  
  // ============================================================================
  // BACKGROUND RESOURCES (used internally, not directly user-accessible)
  // ============================================================================
  
  // Original Language Texts - Used for word alignment data
  // {
  //   panelResourceId: 'ugnt-greek',
  //   adapterType: AdapterType.DOOR43_SCRIPTURE,
  //   adapterConfig: { resourceIds: ['ugnt'], includeAlignments: true } as ScriptureAdapterConfig,
  //   panelConfig: {
  //     title: 'Greek New Testament',
  //     description: 'Original Greek text for alignment',
  //     category: PanelCategory.SCRIPTURE,
  //     component: ScriptureResourceComponent,
  //     icon: 'language'
  //   },
  //   usageMode: ResourceUsageMode.BACKGROUND,
  //   loadPriority: 10
  // }
];

/**
 * Panel Resource Assignments
 * 
 * Defines which resources belong to which panels and how panels behave.
 * This allows multiple resources per panel with dropdown navigation.
 */
export const PANEL_ASSIGNMENTS: PanelResourceAssignment[] = [
  // ============================================================================
  // PANEL 1 - Literal & Simplified Text with dropdown navigation
  // ============================================================================
  {
    panelId: 'panel-1',
    title: 'Scripture Text',
    description:
      'Primary scripture reading with literal and simplified options',
    category: PanelCategory.SCRIPTURE,
    icon: 'book-open',

    // Panel behavior
    defaultVisible: true,
    resizable: true,
    closable: false, // Primary panel cannot be closed

    // Layout
    preferredWidth: 500,
    minWidth: 350,
    maxWidth: 800,

    // Resources available in this panel (ULT, UST, and Original Languages)
    resources: ['ult-scripture', 'ust-scripture'],
    smartEntries: ['original-languages-smart'],
    defaultResource: 'ult-scripture', // ULT as default
  },

  // ============================================================================
  // PANEL 2 - Translation Helps (UST + Translation Notes)
  // ============================================================================
  {
    panelId: 'panel-2',
    title: 'Translation Helps',
    description: 'Simplified text and translation guidance',
    category: PanelCategory.NOTES,
    icon: 'help-circle',

    // Panel behavior
    defaultVisible: true,
    resizable: true,
    closable: true,

    // Layout
    preferredWidth: 450,
    minWidth: 300,
    maxWidth: 700,

    // Resources available in this panel (UST + Translation Notes + Translation Questions + Translation Words Links)
    resources: ['ust-scripture', 'tn-notes', 'tq-questions', 'twl-links'],
    smartEntries: ['original-languages-smart'],
    defaultResource: 'ust-scripture', // UST as default, can switch to notes or questions
  },

  // ============================================================================
  // FUTURE PANELS - Examples of additional panel types
  // ============================================================================

  // Translation Helps Panel
  // {
  //   panelId: 'translation-helps',
  //   title: 'Translation Helps',
  //   description: 'Notes, words, and questions for translation assistance',
  //   category: PanelCategory.NOTES,
  //   icon: 'help-circle',
  //
  //   defaultVisible: false,
  //   resizable: true,
  //   closable: true,
  //
  //   preferredWidth: 400,
  //   minWidth: 300,
  //   maxWidth: 600,
  //
  //   resources: ['tn-notes', 'tw-words', 'tq-questions'],
  //   defaultResource: 'tn-notes'
  // },

  // Original Languages Panel
  // {
  //   panelId: 'original-languages',
  //   title: 'Original Languages',
  //   description: 'Hebrew and Greek source texts with alignments',
  //   category: PanelCategory.SCRIPTURE,
  //   icon: 'language',
  //
  //   defaultVisible: false,
  //   resizable: true,
  //   closable: true,
  //
  //   preferredWidth: 450,
  //   minWidth: 350,
  //   maxWidth: 700,
  //
  //   resources: ['uhb-hebrew', 'ugnt-greek'],
  //   defaultResource: 'ugnt-greek'
  // }
];

/**
 * Helper Functions for Resource and Panel Management
 */

/**
 * Get resources by usage mode
 */
export function getResourcesByUsageMode(mode: ResourceUsageMode): AppResourceConfig[] {
  return APP_RESOURCES.filter(resource => resource.usageMode === mode);
}

/**
 * Get panel resources (resources that appear in dedicated panels)
 */
export function getPanelResources(): AppResourceConfig[] {
  return getResourcesByUsageMode(ResourceUsageMode.PANEL);
}

/**
 * Get on-demand resources (available for popups/modals)
 */
export function getOnDemandResources(): AppResourceConfig[] {
  return getResourcesByUsageMode(ResourceUsageMode.ON_DEMAND);
}

/**
 * Get background resources (used internally)
 */
export function getBackgroundResources(): AppResourceConfig[] {
  return getResourcesByUsageMode(ResourceUsageMode.BACKGROUND);
}

/**
 * Get resources assigned to a specific panel
 */
export function getResourcesForPanel(panelId: string): AppResourceConfig[] {
  const panelAssignment = PANEL_ASSIGNMENTS.find(panel => panel.panelId === panelId);
  if (!panelAssignment) return [];
  
  return APP_RESOURCES.filter(resource => 
    panelAssignment.resources?.includes(resource.panelResourceId)
  );
}

/**
 * Get the default resource for a panel
 */
export function getDefaultResourceForPanel(panelId: string): AppResourceConfig | null {
  const panelAssignment = PANEL_ASSIGNMENTS.find(panel => panel.panelId === panelId);
  if (!panelAssignment?.defaultResource) return null;
  
  return APP_RESOURCES.find(resource => 
    resource.panelResourceId === panelAssignment.defaultResource
  ) || null;
}

/**
 * Alternative configuration for different use cases
 */
export const MINIMAL_APP_RESOURCES: AppResourceConfig[] = [
  // Just ULT and UST for basic translation work
  APP_RESOURCES[0], // ULT (anchor)
  APP_RESOURCES[1]  // UST
];

export const COMPREHENSIVE_APP_RESOURCES: AppResourceConfig[] = [
  // All resources for full translation environment
  ...APP_RESOURCES,
  
  // Additional resources could be added here:
  // - Translation Questions
  // - Audio Bible
  // - Video content
  // - Custom tools
];

/**
 * Configuration selector based on user preferences or environment
 */
export function getAppResourceConfig(mode: 'minimal' | 'default' | 'comprehensive' = 'default'): AppResourceConfig[] {
  switch (mode) {
    case 'minimal':
      return MINIMAL_APP_RESOURCES;
    case 'comprehensive':
      return [...COMPREHENSIVE_APP_RESOURCES, ...GLOBAL_RESOURCES];
    case 'default':
    default:
      return [...APP_RESOURCES, ...GLOBAL_RESOURCES];
  }
}

/**
 * Get all smart panel entries
 */
export function getSmartPanelEntries(): SmartPanelEntry[] {
  return SMART_PANEL_ENTRIES;
}

/**
 * Get global resources
 */
export function getGlobalResources(): AppResourceConfig[] {
  return GLOBAL_RESOURCES;
}
