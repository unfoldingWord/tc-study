/**
 * Generator Registry
 * 
 * Central registry for all TOC builders.
 * Add new generators here to make them available.
 */

import type { TocBuilder } from '../types.js';
import { TranslationWordsTocBuilder } from './translation-words.js';
import { TranslationAcademyTocBuilder } from './translation-academy.js';

export interface GeneratorInfo {
  id: string;
  name: string;
  description: string;
  builder: TocBuilder;
}

/**
 * Registry of all available generators
 */
export const GENERATORS: Record<string, GeneratorInfo> = {
  'tw': {
    id: 'tw',
    name: 'Translation Words',
    description: 'Generates TOC for Translation Words resources (scans bible/ directory)',
    builder: new TranslationWordsTocBuilder(),
  },
  'ta': {
    id: 'ta',
    name: 'Translation Academy',
    description: 'Generates TOC for Translation Academy resources (scans manual directories)',
    builder: new TranslationAcademyTocBuilder(),
  },
  // Add more generators here:
  // 'tn': {
  //   id: 'tn',
  //   name: 'Translation Notes',
  //   description: 'Generates TOC for Translation Notes resources',
  //   builder: new TranslationNotesTocBuilder(),
  // },
};

/**
 * Get a generator by ID
 */
export function getGenerator(id: string): GeneratorInfo | undefined {
  return GENERATORS[id];
}

/**
 * Get all available generators
 */
export function getAllGenerators(): GeneratorInfo[] {
  return Object.values(GENERATORS);
}

/**
 * Get generator IDs as array
 */
export function getGeneratorIds(): string[] {
  return Object.keys(GENERATORS);
}

/**
 * Check if a generator exists
 */
export function hasGenerator(id: string): boolean {
  return id in GENERATORS;
}
