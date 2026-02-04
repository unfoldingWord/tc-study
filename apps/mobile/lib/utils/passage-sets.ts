/**
 * Utility Functions for Hierarchical Passage Sets
 * 
 * Provides parsing, validation, manipulation, and traversal functions
 * for working with hierarchical passage sets.
 */

import {
    AudioContent,
    FlatPassageList,
    ImageContent,
    MediaContentType,
    MediaType,
    MultimediaLabel,
    Passage,
    PassageFilter,
    PassageGroup,
    PassageLeaf,
    PassageMetadata,
    PassageSet,
    PassageSetBuilder,
    PassageSetNode,
    RefRange,
    SimpleRef,
    TextContent,
    VideoContent
} from '../types/passage-sets';

// ============================================================================
// Reference Parsing and Validation
// ============================================================================

/**
 * Parse a simple reference string into a RefRange object
 * Examples: "1:5-8" -> {startChapter: 1, startVerse: 5, endVerse: 8}
 *          "2:1-3:15" -> {startChapter: 2, startVerse: 1, endChapter: 3, endVerse: 15}
 *          "4" -> {startChapter: 4}
 */
export function parseSimpleRef(ref: SimpleRef): RefRange {
  // Handle chapter only (e.g., "4")
  if (/^\d+$/.test(ref)) {
    return { startChapter: parseInt(ref, 10) };
  }
  
  // Handle chapter:verse patterns
  const chapterVersePattern = /^(\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/;
  const match = ref.match(chapterVersePattern);
  
  if (!match) {
    throw new Error(`Invalid reference format: ${ref}`);
  }
  
  const [, startChapter, startVerse, endChapter, endVerse] = match;
  
  const result: RefRange = {
    startChapter: parseInt(startChapter, 10)
  };
  
  if (startVerse) {
    result.startVerse = parseInt(startVerse, 10);
  }
  
  if (endChapter) {
    result.endChapter = parseInt(endChapter, 10);
  }
  
  if (endVerse) {
    result.endVerse = parseInt(endVerse, 10);
  }
  
  return result;
}

/**
 * Convert a RefRange back to a simple reference string
 */
export function refRangeToString(ref: RefRange): string {
  let result = ref.startChapter.toString();
  
  if (ref.startVerse !== undefined) {
    result += `:${ref.startVerse}`;
    
    if (ref.endChapter !== undefined && ref.endChapter !== ref.startChapter) {
      result += `-${ref.endChapter}:${ref.endVerse || ''}`;
    } else if (ref.endVerse !== undefined && ref.endVerse !== ref.startVerse) {
      result += `-${ref.endVerse}`;
    }
  }
  
  return result;
}

/**
 * Validate a book code (biblical book abbreviations)
 */
export function validateBookCode(bookCode: string): boolean {
  // All biblical book codes used in our passage sets (case-insensitive)
  const validBookCodes = new Set([
    // Old Testament
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', 
    '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 
    'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN',
    'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
    
    // New Testament  
    'MAT', 'MAR', 'LUK', 'JOH', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', 
    '1JN', '2JN', '3JN', 'JUD', 'REV'
  ]);
  
  const upperBookCode = bookCode.toUpperCase();
  return validBookCodes.has(upperBookCode);
}

/**
 * Parse a full passage string (e.g., "JON 1:5-8")
 */
export function parsePassageString(passageStr: string): Passage {
  const parts = passageStr.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error(`Invalid passage format: ${passageStr}`);
  }
  
  const bookCode = parts[0].toUpperCase();
  const refStr = parts.slice(1).join(' ');
  
  if (!validateBookCode(bookCode)) {
    throw new Error(`Invalid book code: ${bookCode}`);
  }
  
  return {
    bookCode,
    ref: parseSimpleRef(refStr)
  };
}

// ============================================================================
// Passage Set Traversal and Manipulation
// ============================================================================

/**
 * Flatten a hierarchical passage set into a linear list
 */
export function flattenPassageSet(passageSet: PassageSet): FlatPassageList {
  const passages: FlatPassageList['passages'] = [];
  
  function traverse(nodes: PassageSetNode[], path: string[] = [], groupIds: string[] = []) {
    for (const node of nodes) {
      const currentPath = [...path, node.label];
      const currentGroupIds = [...groupIds];
      
      if (node.type === 'group') {
        const group = node as PassageGroup;
        currentGroupIds.push(group.id);
        traverse(group.children, currentPath, currentGroupIds);
      } else if (node.type === 'passage') {
        const leaf = node as PassageLeaf;
        for (const passage of leaf.passages) {
          passages.push({
            ...passage,
            path: currentPath,
            groupIds: currentGroupIds
          });
        }
      }
    }
  }
  
  traverse(passageSet.root);
  
  return {
    passages,
    totalCount: passages.length
  };
}

/**
 * Find a specific node in the hierarchy by ID
 */
export function findNodeById(passageSet: PassageSet, nodeId: string): PassageSetNode | null {
  function search(nodes: PassageSetNode[]): PassageSetNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      
      if (node.type === 'group') {
        const found = search((node as PassageGroup).children);
        if (found) return found;
      }
    }
    return null;
  }
  
  return search(passageSet.root);
}

/**
 * Get all passages from a specific group (including nested groups)
 */
export function getPassagesFromGroup(group: PassageGroup): Passage[] {
  const passages: Passage[] = [];
  
  function collect(nodes: PassageSetNode[]) {
    for (const node of nodes) {
      if (node.type === 'group') {
        collect((node as PassageGroup).children);
      } else if (node.type === 'passage') {
        passages.push(...(node as PassageLeaf).passages);
      }
    }
  }
  
  collect(group.children);
  return passages;
}

/**
 * Filter passages based on criteria
 */
export function filterPassages(passageSet: PassageSet, filter: PassageFilter): Passage[] {
  const flattened = flattenPassageSet(passageSet);
  
  return flattened.passages.filter(passage => {
    // Book filter
    if (filter.books && !filter.books.includes(passage.bookCode)) {
      return false;
    }
    
    // Tags filter
    if (filter.tags && passage.metadata?.tags) {
      const hasMatchingTag = filter.tags.some(tag => 
        passage.metadata!.tags!.includes(tag)
      );
      if (!hasMatchingTag) return false;
    }
    
    // Theme filter
    if (filter.themes && passage.metadata?.theme) {
      if (!filter.themes.includes(passage.metadata.theme)) {
        return false;
      }
    }
    
    // Difficulty filter
    if (filter.difficulty && passage.metadata?.difficulty) {
      const { min, max } = filter.difficulty;
      const difficulty = passage.metadata.difficulty;
      if (min !== undefined && difficulty < min) return false;
      if (max !== undefined && difficulty > max) return false;
    }
    
    // Time filter
    if (filter.estimatedTime && passage.metadata?.estimatedTime) {
      const { min, max } = filter.estimatedTime;
      const time = passage.metadata.estimatedTime;
      if (min !== undefined && time < min) return false;
      if (max !== undefined && time > max) return false;
    }
    
    // Text search
    if (filter.textSearch) {
      const searchText = filter.textSearch.toLowerCase();
      const searchableText = [
        passage.label,
        passage.metadata?.title,
        passage.metadata?.description
      ].filter(Boolean).join(' ').toLowerCase();
      
      if (!searchableText.includes(searchText)) {
        return false;
      }
    }
    
    return true;
  });
}

// ============================================================================
// Builder Pattern Implementation
// ============================================================================

export class PassageSetBuilderImpl implements PassageSetBuilder {
  private passageSet: Partial<PassageSet> = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root: []
  };
  
  private groups: Map<string, PassageGroup> = new Map();
  
  setId(id: string): PassageSetBuilder {
    this.passageSet.id = id;
    return this;
  }
  
  setName(name: string): PassageSetBuilder {
    this.passageSet.name = name;
    return this;
  }
  
  setDescription(description: string): PassageSetBuilder {
    this.passageSet.description = description;
    return this;
  }
  
  setMetadata(metadata: PassageMetadata): PassageSetBuilder {
    this.passageSet.metadata = { ...this.passageSet.metadata, ...metadata };
    return this;
  }
  
  addGroup(id: string, label: string, config: Partial<PassageGroup> = {}): PassageSetBuilder {
    const group: PassageGroup = {
      id,
      type: 'group',
      label,
      children: [],
      ...config
    };
    
    this.groups.set(id, group);
    
    // If no parent specified, add to root
    if (!config.order) {
      this.passageSet.root!.push(group);
    }
    
    return this;
  }
  
  addPassage(groupId: string, passage: Passage): PassageSetBuilder {
    return this.addPassages(groupId, [passage]);
  }
  
  addPassages(groupId: string, passages: Passage[]): PassageSetBuilder {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group with id "${groupId}" not found`);
    }
    
    // Create a passage leaf
    const leafId = `${groupId}-passages-${group.children.length}`;
    const leaf: PassageLeaf = {
      id: leafId,
      type: 'passage',
      label: passages.length === 1 ? 
        `${passages[0].bookCode} ${typeof passages[0].ref === 'string' ? passages[0].ref : refRangeToString(passages[0].ref)}` :
        `${passages.length} passages`,
      passages
    };
    
    group.children.push(leaf);
    return this;
  }
  
  build(): PassageSet {
    if (!this.passageSet.id || !this.passageSet.name) {
      throw new Error('PassageSet must have id and name');
    }
    
    // Calculate metadata
    const flattened = flattenPassageSet(this.passageSet as PassageSet);
    this.passageSet.metadata = {
      ...this.passageSet.metadata,
      passageCount: flattened.totalCount,
      totalTime: flattened.passages.reduce((sum, p) => 
        sum + (p.metadata?.estimatedTime || 0), 0
      )
    };
    
    return this.passageSet as PassageSet;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a new passage set builder
 */
export function createPassageSetBuilder(): PassageSetBuilder {
  return new PassageSetBuilderImpl();
}

/**
 * Create a simple passage from a string
 */
export function createPassage(passageStr: string, metadata?: PassageMetadata): Passage {
  const passage = parsePassageString(passageStr);
  if (metadata) {
    passage.metadata = metadata;
  }
  return passage;
}

/**
 * Validate a complete passage set
 */
export function validatePassageSet(passageSet: PassageSet): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic validation
  if (!passageSet.id) errors.push('PassageSet must have an id');
  if (!passageSet.name) errors.push('PassageSet must have a name');
  if (!passageSet.version) errors.push('PassageSet must have a version');
  
  // Validate node structure
  function validateNode(node: PassageSetNode, path: string) {
    if (!node.id) errors.push(`Node at ${path} missing id`);
    if (!node.label) errors.push(`Node at ${path} missing label`);
    
    if (node.type === 'group') {
      const group = node as PassageGroup;
      group.children.forEach((child, index) => 
        validateNode(child, `${path}/children[${index}]`)
      );
    } else if (node.type === 'passage') {
      const leaf = node as PassageLeaf;
      if (!leaf.passages || leaf.passages.length === 0) {
        errors.push(`Passage node at ${path} has no passages`);
      }
      
      leaf.passages.forEach((passage, index) => {
        if (!validateBookCode(passage.bookCode)) {
          errors.push(`Invalid book code "${passage.bookCode}" at ${path}/passages[${index}]`);
        }
      });
    }
  }
  
  passageSet.root.forEach((node, index) => 
    validateNode(node, `root[${index}]`)
  );
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get statistics about a passage set
 */
export function getPassageSetStats(passageSet: PassageSet) {
  const flattened = flattenPassageSet(passageSet);
  const books = new Set(flattened.passages.map(p => p.bookCode));
  const themes = new Set(flattened.passages.map(p => p.metadata?.theme).filter(Boolean));
  const tags = new Set(flattened.passages.flatMap(p => p.metadata?.tags || []));
  
  return {
    totalPassages: flattened.totalCount,
    uniqueBooks: books.size,
    bookList: Array.from(books).sort(),
    themes: Array.from(themes).sort(),
    tags: Array.from(tags).sort(),
    averageDifficulty: flattened.passages
      .map(p => p.metadata?.difficulty)
      .filter(d => d !== undefined)
      .reduce((sum, d, _, arr) => sum + d! / arr.length, 0),
    totalEstimatedTime: flattened.passages
      .reduce((sum, p) => sum + (p.metadata?.estimatedTime || 0), 0)
  };
}

// ============================================================================
// JSON Serialization and Deserialization
// ============================================================================

/**
 * Serialize a passage set to JSON string
 */
export function serializePassageSet(passageSet: PassageSet): string {
  // Convert any RefRange objects to SimpleRef strings for JSON compatibility
  const serializable = normalizePassageSetForSerialization(passageSet);
  return JSON.stringify(serializable, null, 2);
}

/**
 * Deserialize a passage set from JSON string
 */
export function deserializePassageSet(jsonString: string): PassageSet {
  try {
    const parsed = JSON.parse(jsonString);
    return loadPassageSetFromObject(parsed);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load a passage set from a plain JavaScript object (e.g., from JSON.parse)
 */
export function loadPassageSetFromObject(obj: any): PassageSet {
  // Validate basic structure
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid passage set: must be an object');
  }
  
  if (!obj.id || typeof obj.id !== 'string') {
    throw new Error('Invalid passage set: missing or invalid id');
  }
  
  if (!obj.name || typeof obj.name !== 'string') {
    throw new Error('Invalid passage set: missing or invalid name');
  }
  
  if (!obj.version || typeof obj.version !== 'string') {
    throw new Error('Invalid passage set: missing or invalid version');
  }
  
  if (!Array.isArray(obj.root)) {
    throw new Error('Invalid passage set: root must be an array');
  }
  
  // Normalize and validate the structure
  const passageSet: PassageSet = {
    id: obj.id,
    name: obj.name,
    description: obj.description || undefined,
    version: obj.version,
    createdAt: obj.createdAt || new Date().toISOString(),
    updatedAt: obj.updatedAt || new Date().toISOString(),
    metadata: obj.metadata || undefined,
    root: obj.root.map((node: any) => loadPassageSetNode(node))
  };
  
  // Validate the loaded passage set
  const validation = validatePassageSet(passageSet);
  if (!validation.isValid) {
    throw new Error(`Invalid passage set structure: ${validation.errors.join(', ')}`);
  }
  
  return passageSet;
}

/**
 * Load a passage set node from a plain object
 */
function loadPassageSetNode(obj: any): PassageSetNode {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid node: must be an object');
  }
  
  if (!obj.id || typeof obj.id !== 'string') {
    throw new Error('Invalid node: missing or invalid id');
  }
  
  if (!obj.type || !['group', 'passage'].includes(obj.type)) {
    throw new Error('Invalid node: type must be "group" or "passage"');
  }
  
  if (!obj.label || typeof obj.label !== 'string') {
    throw new Error('Invalid node: missing or invalid label');
  }
  
  if (obj.type === 'group') {
    if (!Array.isArray(obj.children)) {
      throw new Error('Invalid group node: children must be an array');
    }
    
    const group: PassageGroup = {
      id: obj.id,
      type: 'group',
      label: obj.label,
      multimediaLabel: obj.multimediaLabel || undefined,
      description: obj.description || undefined,
      metadata: obj.metadata || undefined,
      order: obj.order || undefined,
      children: obj.children.map((child: any) => loadPassageSetNode(child)),
      groupType: obj.groupType || undefined,
      requiresSequentialCompletion: obj.requiresSequentialCompletion || undefined
    };
    
    return group;
  } else {
    if (!Array.isArray(obj.passages)) {
      throw new Error('Invalid passage node: passages must be an array');
    }
    
    const leaf: PassageLeaf = {
      id: obj.id,
      type: 'passage',
      label: obj.label,
      multimediaLabel: obj.multimediaLabel || undefined,
      description: obj.description || undefined,
      metadata: obj.metadata || undefined,
      order: obj.order || undefined,
      passages: obj.passages.map((passage: any) => loadPassage(passage)),
      readTogether: obj.readTogether || undefined
    };
    
    return leaf;
  }
}

/**
 * Load a passage from a plain object
 */
function loadPassage(obj: any): Passage {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid passage: must be an object');
  }
  
  if (!obj.bookCode || typeof obj.bookCode !== 'string') {
    throw new Error('Invalid passage: missing or invalid bookCode');
  }
  
  if (!validateBookCode(obj.bookCode)) {
    throw new Error(`Invalid passage: invalid book code "${obj.bookCode}"`);
  }
  
  if (!obj.ref) {
    throw new Error('Invalid passage: missing ref');
  }
  
  // Handle both string and object ref formats
  let ref: RefRange | SimpleRef;
  if (typeof obj.ref === 'string') {
    ref = obj.ref;
  } else if (typeof obj.ref === 'object') {
    // Validate RefRange object
    if (typeof obj.ref.startChapter !== 'number') {
      throw new Error('Invalid passage ref: startChapter must be a number');
    }
    
    const refRange: RefRange = {
      startChapter: obj.ref.startChapter
    };
    
    if (obj.ref.startVerse !== undefined) {
      if (typeof obj.ref.startVerse !== 'number') {
        throw new Error('Invalid passage ref: startVerse must be a number');
      }
      refRange.startVerse = obj.ref.startVerse;
    }
    
    if (obj.ref.endChapter !== undefined) {
      if (typeof obj.ref.endChapter !== 'number') {
        throw new Error('Invalid passage ref: endChapter must be a number');
      }
      refRange.endChapter = obj.ref.endChapter;
    }
    
    if (obj.ref.endVerse !== undefined) {
      if (typeof obj.ref.endVerse !== 'number') {
        throw new Error('Invalid passage ref: endVerse must be a number');
      }
      refRange.endVerse = obj.ref.endVerse;
    }
    
    ref = refRange;
  } else {
    throw new Error('Invalid passage ref: must be string or RefRange object');
  }
  
  const passage: Passage = {
    bookCode: obj.bookCode,
    ref,
    label: obj.label || undefined,
    multimediaLabel: obj.multimediaLabel || undefined,
    metadata: obj.metadata || undefined
  };
  
  return passage;
}

/**
 * Normalize a passage set for JSON serialization (convert RefRange to strings)
 */
function normalizePassageSetForSerialization(passageSet: PassageSet): PassageSet {
  return {
    ...passageSet,
    root: passageSet.root.map(node => normalizeNodeForSerialization(node))
  };
}

/**
 * Normalize a node for JSON serialization
 */
function normalizeNodeForSerialization(node: PassageSetNode): PassageSetNode {
  if (node.type === 'group') {
    const group = node as PassageGroup;
    return {
      ...group,
      children: group.children.map(child => normalizeNodeForSerialization(child))
    } as PassageGroup;
  } else {
    const leaf = node as PassageLeaf;
    return {
      ...leaf,
      passages: leaf.passages.map(passage => ({
        ...passage,
        ref: typeof passage.ref === 'object' ? refRangeToString(passage.ref) : passage.ref
      }))
    } as PassageLeaf;
  }
}

/**
 * Load a passage set from a URL (browser/fetch)
 */
export async function loadPassageSetFromUrl(url: string): Promise<PassageSet> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const jsonContent = await response.text();
    return deserializePassageSet(jsonContent);
  } catch (error) {
    throw new Error(`Failed to load passage set from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Multimedia Label Utilities
// ============================================================================

/**
 * Create a text-based multimedia label
 */
export function createTextLabel(text: string, options?: {
  alt?: string;
  caption?: string;
  formatting?: TextContent['formatting'];
}): MultimediaLabel {
  const textContent: TextContent = {
    type: 'text',
    text,
    alt: options?.alt,
    caption: options?.caption,
    formatting: options?.formatting
  };
  
  return {
    primary: textContent
  };
}

/**
 * Create an image-based multimedia label
 */
export function createImageLabel(src: string, options?: {
  alt?: string;
  caption?: string;
  dimensions?: ImageContent['dimensions'];
  format?: ImageContent['format'];
  thumbnail?: string;
}): MultimediaLabel {
  const imageContent: ImageContent = {
    type: 'image',
    src,
    alt: options?.alt,
    caption: options?.caption,
    dimensions: options?.dimensions,
    format: options?.format,
    thumbnail: options?.thumbnail
  };
  
  return {
    primary: imageContent
  };
}

/**
 * Create an audio-based multimedia label
 */
export function createAudioLabel(src: string, options?: {
  alt?: string;
  caption?: string;
  duration?: number;
  format?: AudioContent['format'];
  autoPlay?: boolean;
  transcript?: string;
}): MultimediaLabel {
  const audioContent: AudioContent = {
    type: 'audio',
    src,
    alt: options?.alt,
    caption: options?.caption,
    duration: options?.duration,
    format: options?.format,
    autoPlay: options?.autoPlay,
    transcript: options?.transcript
  };
  
  return {
    primary: audioContent
  };
}

/**
 * Create a video-based multimedia label
 */
export function createVideoLabel(src: string, options?: {
  alt?: string;
  caption?: string;
  duration?: number;
  format?: VideoContent['format'];
  poster?: string;
  dimensions?: VideoContent['dimensions'];
}): MultimediaLabel {
  const videoContent: VideoContent = {
    type: 'video',
    src,
    alt: options?.alt,
    caption: options?.caption,
    duration: options?.duration,
    format: options?.format,
    poster: options?.poster,
    dimensions: options?.dimensions
  };
  
  return {
    primary: videoContent
  };
}

/**
 * Create a combined multimedia label with multiple content types
 */
export function createCombinedLabel(
  primary: MediaContentType,
  secondary: MediaContentType[],
  options?: {
    layout?: MultimediaLabel['layout'];
    accessibility?: MultimediaLabel['accessibility'];
  }
): MultimediaLabel {
  return {
    primary,
    secondary,
    layout: options?.layout,
    accessibility: options?.accessibility
  };
}

/**
 * Get the display text from a multimedia label (for fallback/accessibility)
 */
export function getDisplayText(label: MultimediaLabel | string): string {
  if (typeof label === 'string') {
    return label;
  }
  
  // Try primary content first
  if (label.primary.type === 'text') {
    return label.primary.text;
  }
  
  // Use alt text if available
  if (label.primary.alt) {
    return label.primary.alt;
  }
  
  // Try secondary content
  if (label.secondary) {
    for (const content of label.secondary) {
      if (content.type === 'text') {
        return content.text;
      }
      if (content.alt) {
        return content.alt;
      }
    }
  }
  
  // Fallback based on content type
  switch (label.primary.type) {
    case 'image':
      return label.primary.caption || 'Image';
    case 'audio':
      return label.primary.transcript || label.primary.caption || 'Audio';
    case 'video':
      return label.primary.caption || 'Video';
    default:
      return 'Media Content';
  }
}

/**
 * Check if a multimedia label has content of a specific type
 */
export function hasMediaType(label: MultimediaLabel, mediaType: MediaType): boolean {
  if (label.primary.type === mediaType) {
    return true;
  }
  
  if (label.secondary) {
    return label.secondary.some(content => content.type === mediaType);
  }
  
  return false;
}

/**
 * Get all content of a specific type from a multimedia label
 */
export function getMediaContent(label: MultimediaLabel, mediaType: MediaType): MediaContentType[] {
  const results: MediaContentType[] = [];
  
  if (label.primary.type === mediaType) {
    results.push(label.primary);
  }
  
  if (label.secondary) {
    results.push(...label.secondary.filter(content => content.type === mediaType));
  }
  
  return results;
}

/**
 * Validate multimedia content URLs/paths
 */
export function validateMediaContent(content: MediaContentType): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  if (content.type !== 'text' && !('src' in content)) {
    errors.push('Media content must have a src field');
  }
  
  if (content.type === 'text' && !('text' in content)) {
    errors.push('Text content must have a text field');
  }
  
  // Validate URLs/paths
  if ('src' in content && content.src) {
    try {
      // Try to parse as URL
      new URL(content.src);
    } catch {
      // If not a valid URL, check if it looks like a relative path
      if (!content.src.match(/^[./]/) && !content.src.match(/^[a-zA-Z]:/)) {
        errors.push(`Invalid src format: ${content.src}`);
      }
    }
  }
  
  // Validate dimensions
  if ('dimensions' in content && content.dimensions) {
    if (content.dimensions.width !== undefined && content.dimensions.width <= 0) {
      errors.push('Width must be positive');
    }
    if (content.dimensions.height !== undefined && content.dimensions.height <= 0) {
      errors.push('Height must be positive');
    }
  }
  
  // Validate duration
  if ('duration' in content && content.duration !== undefined && content.duration < 0) {
    errors.push('Duration must be non-negative');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Convert a simple text label to a multimedia label
 */
export function textToMultimediaLabel(text: string): MultimediaLabel {
  return createTextLabel(text, { alt: text });
}

/**
 * Get the effective label for display (handles both string and multimedia labels)
 */
export function getEffectiveLabel(node: PassageSetNode | Passage): MultimediaLabel {
  if ('multimediaLabel' in node && node.multimediaLabel) {
    return node.multimediaLabel;
  }
  
  // Convert text label to multimedia label
  const textLabel = 'label' in node ? node.label : '';
  return textToMultimediaLabel(textLabel || 'Untitled');
}