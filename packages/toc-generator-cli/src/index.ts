/**
 * TOC Generator CLI - Main entry point
 */

export { generateToken, getAuthConfig, getAuthToken, saveTokenToEnv } from './auth.js';
export type { AuthConfig, AuthResult } from './auth.js';
export { getAllGenerators, getGenerator, getGeneratorIds, hasGenerator } from './generators/index.js';
export type { GeneratorInfo } from './generators/index.js';
export { TranslationWordsTocBuilder } from './generators/translation-words.js';
export { TranslationAcademyTocBuilder } from './generators/translation-academy.js';
export { extractMarkdownTitle } from './generators/utils.js';
export { TocGenerator } from './toc-generator.js';
export type { TocBuilder, TocBuilderConfig, TocGeneratorOptions, TocGeneratorResult, TocIngredient } from './types.js';

