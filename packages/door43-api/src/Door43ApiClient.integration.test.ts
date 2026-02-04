/**
 * Door43 API Client Integration Tests
 * 
 * These tests hit the real Door43 API
 * Run with: bun test Door43ApiClient.integration.test.ts
 * 
 * Note: These tests require internet connectivity
 */

import { createDoor43ApiClient, getDoor43ApiClient } from './Door43ApiClient';

describe('Door43ApiClient Integration Tests', () => {
  let client: ReturnType<typeof getDoor43ApiClient>;

  beforeAll(() => {
    client = createDoor43ApiClient({
      baseUrl: 'https://git.door43.org',
      timeout: 10000, // 10 seconds for real API calls
    });
  });

  describe('Catalog Operations', () => {
    it('should fetch full catalog', async () => {
      const catalog = await client.getCatalog();
      
      expect(catalog).toBeDefined();
      expect(Array.isArray(catalog.languages)).toBe(true);
      expect(Array.isArray(catalog.resources)).toBe(true);
      expect(catalog.languages.length).toBeGreaterThan(0);
      
      console.log(`✅ Found ${catalog.languages.length} languages`);
    });

    it('should fetch all languages', async () => {
      const languages = await client.getLanguages();
      
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      
      // Note: Door43 API language endpoint may return incomplete data
      // Verify we get an array with direction field at minimum
      expect(languages[0]).toHaveProperty('direction');
      
      console.log(`✅ Found ${languages.length} languages`);
      console.log(`   Note: Language list endpoint returns minimal data (direction only)`);
    });

    it('should fetch resources for English', async () => {
      const resources = await client.getResourcesByLanguage('en');
      
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
      
      // All resources should have language 'en'
      resources.forEach(resource => {
        expect(resource.language).toBe('en');
        expect(resource).toHaveProperty('id');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('owner');
      });
      
      console.log(`✅ Found ${resources.length} English resources`);
    });

    it('should fetch resources by owner and language', async () => {
      const uwResources = await client.getResourcesByOwnerAndLanguage('unfoldingWord', 'en');
      
      expect(Array.isArray(uwResources)).toBe(true);
      expect(uwResources.length).toBeGreaterThan(0);
      
      // All resources should belong to unfoldingWord
      uwResources.forEach(resource => {
        expect(resource.owner).toBe('unfoldingWord');
        expect(resource.language).toBe('en');
      });
      
      console.log(`✅ Found ${uwResources.length} unfoldingWord English resources`);
    });

    it('should find specific resource (ULT)', async () => {
      const ult = await client.findResource('unfoldingWord', 'en', 'ult');
      
      expect(ult).not.toBeNull();
      expect(ult?.id).toBe('ult');
      expect(ult?.language).toBe('en');
      expect(ult?.owner).toBe('unfoldingWord');
      expect(ult?.name).toBeDefined();
      expect(ult?.version).toBeDefined();
      
      console.log(`✅ Found ULT:`, {
        id: ult?.id,
        name: ult?.name,
        version: ult?.version,
      });
    });

    it('should find repository by name', async () => {
      const repo = await client.findRepository('unfoldingWord', 'en_ult');
      
      expect(repo).not.toBeNull();
      expect(repo?.name).toBe('en_ult');
      expect(repo?.owner).toBe('unfoldingWord');
      expect(repo?.language).toBe('en');
      
      console.log(`✅ Found repository:`, {
        name: repo?.name,
        owner: repo?.owner,
        version: repo?.version,
      });
    });

    it('should search catalog with filters', async () => {
      const results = await client.searchCatalog({
        owner: 'unfoldingWord',
        language: 'en',
        subject: 'Bible',
        stage: 'prod'
      });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Verify filters worked
      results.forEach(resource => {
        expect(resource.owner).toBe('unfoldingWord');
        expect(resource.language).toBe('en');
      });
      
      console.log(`✅ Found ${results.length} resources matching filters`);
    });
  });

  describe('Content Fetching', () => {
    it('should fetch TSV file content (Translation Questions)', async () => {
      const content = await client.fetchTextContent(
        'unfoldingWord',
        'en_tq',
        'tq_GEN.tsv'
      );
      
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      
      // TSV files should have tabs
      expect(content).toContain('\t');
      
      // Should have headers
      expect(content).toContain('Reference');
      
      console.log(`✅ Fetched TSV content: ${content.length} characters`);
    });

    it('should fetch USFM file content (Genesis)', async () => {
      const content = await client.fetchTextContent(
        'unfoldingWord',
        'en_ult',
        '01-GEN.usfm'
      );
      
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      
      // USFM files should have markers
      expect(content).toContain('\\id');
      expect(content).toContain('GEN');
      
      console.log(`✅ Fetched USFM content: ${content.length} characters`);
    });

    it('should fetch markdown file content (Translation Academy)', async () => {
      const content = await client.fetchTextContent(
        'unfoldingWord',
        'en_ta',
        'translate/translate-unknown/01.md'
      );
      
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      
      console.log(`✅ Fetched markdown content: ${content.length} characters`);
    });

    it('should check file exists (positive)', async () => {
      const exists = await client.checkFileExists(
        'unfoldingWord',
        'en_tq',
        'tq_GEN.tsv'
      );
      
      expect(exists).toBe(true);
      console.log(`✅ File exists check passed`);
    });

    it('should check file exists (negative)', async () => {
      const exists = await client.checkFileExists(
        'unfoldingWord',
        'en_tq',
        'nonexistent-file.txt'
      );
      
      expect(exists).toBe(false);
      console.log(`✅ File not exists check passed`);
    });

    it('should handle different branches', async () => {
      // Most repos use 'master' as default
      const content = await client.fetchTextContent(
        'unfoldingWord',
        'en_tq',
        'tq_GEN.tsv',
        'master'
      );
      
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      
      console.log(`✅ Fetched content from master branch`);
    });
  });

  describe('Repository Search', () => {
    it('should search repositories by query', async () => {
      const results = await client.searchRepositories('translation', {
        owner: 'unfoldingWord',
        limit: 10
      });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);
      
      // Note: Door43 API owner filter may return results from other owners too
      // Just verify we got results and they have owner field
      results.forEach(repo => {
        expect(repo.owner).toBeDefined();
        expect(typeof repo.owner).toBe('string');
      });
      
      console.log(`✅ Found ${results.length} repositories`);
      console.log(`   Owners:`, [...new Set(results.map(r => r.owner))].join(', '));
    });

    it('should search without owner filter', async () => {
      const results = await client.searchRepositories('bible', {
        limit: 5
      });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      console.log(`✅ Found ${results.length} repositories for "bible"`);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent resource', async () => {
      const resource = await client.findResource('nonexistent-owner', 'xx', 'zzz');
      
      expect(resource).toBeNull();
      console.log(`✅ Correctly returned null for non-existent resource`);
    });

    it('should handle non-existent repository', async () => {
      const repo = await client.findRepository('nonexistent-owner', 'xx_zzz');
      
      expect(repo).toBeNull();
      console.log(`✅ Correctly returned null for non-existent repository`);
    });

    it('should handle non-existent file', async () => {
      await expect(
        client.fetchTextContent('unfoldingWord', 'en_tq', 'nonexistent.txt')
      ).rejects.toThrow();
      
      console.log(`✅ Correctly threw error for non-existent file`);
    });
  });

  describe('Performance', () => {
    it('should complete catalog fetch within timeout', async () => {
      const startTime = Date.now();
      
      await client.getCatalog();
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      console.log(`✅ Catalog fetch completed in ${duration}ms`);
    });

    it('should complete content fetch within timeout', async () => {
      const startTime = Date.now();
      
      await client.fetchTextContent('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      console.log(`✅ Content fetch completed in ${duration}ms`);
    });
  });

  describe('Real-World Adapter Use Cases', () => {
    it('should support Translation Questions workflow', async () => {
      // 1. Find the resource
      const repo = await client.findRepository('unfoldingWord', 'en_tq');
      expect(repo).not.toBeNull();
      console.log(`  1. Found TQ repository: ${repo?.name}`);
      
      // 2. Fetch book content
      const content = await client.fetchTextContent('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
      expect(content).toContain('\t');
      console.log(`  2. Fetched Genesis questions: ${content.length} chars`);
      
      // 3. Check another book exists
      const exodusExists = await client.checkFileExists('unfoldingWord', 'en_tq', 'tq_EXO.tsv');
      expect(exodusExists).toBe(true);
      console.log(`  3. Verified Exodus questions exist`);
      
      console.log(`✅ Translation Questions workflow complete`);
    });

    it('should support Translation Notes workflow', async () => {
      // 1. Find the resource
      const repo = await client.findRepository('unfoldingWord', 'en_tn');
      expect(repo).not.toBeNull();
      console.log(`  1. Found TN repository: ${repo?.name}`);
      
      // 2. Fetch book content
      const content = await client.fetchTextContent('unfoldingWord', 'en_tn', 'tn_GEN.tsv');
      expect(content).toContain('\t');
      console.log(`  2. Fetched Genesis notes: ${content.length} chars`);
      
      console.log(`✅ Translation Notes workflow complete`);
    });

    it('should support Scripture (ULT) workflow', async () => {
      // 1. Find the resource
      const repo = await client.findRepository('unfoldingWord', 'en_ult');
      expect(repo).not.toBeNull();
      console.log(`  1. Found ULT repository: ${repo?.name}`);
      
      // 2. Fetch book content
      const content = await client.fetchTextContent('unfoldingWord', 'en_ult', '01-GEN.usfm');
      expect(content).toContain('\\id GEN');
      console.log(`  2. Fetched Genesis USFM: ${content.length} chars`);
      
      console.log(`✅ Scripture (ULT) workflow complete`);
    });

    it('should support Translation Academy workflow', async () => {
      // 1. Find the resource
      const repo = await client.findRepository('unfoldingWord', 'en_ta');
      expect(repo).not.toBeNull();
      console.log(`  1. Found TA repository: ${repo?.name}`);
      
      // 2. Fetch article content
      const content = await client.fetchTextContent(
        'unfoldingWord',
        'en_ta',
        'translate/translate-unknown/01.md'
      );
      expect(content.length).toBeGreaterThan(0);
      console.log(`  2. Fetched article: ${content.length} chars`);
      
      console.log(`✅ Translation Academy workflow complete`);
    });

    it('should support Translation Words workflow', async () => {
      // 1. Find the resource
      const repo = await client.findRepository('unfoldingWord', 'en_tw');
      expect(repo).not.toBeNull();
      console.log(`  1. Found TW repository: ${repo?.name}`);
      
      // 2. Check if a word file exists
      const exists = await client.checkFileExists(
        'unfoldingWord',
        'en_tw',
        'bible/kt/god.md'
      );
      expect(exists).toBe(true);
      console.log(`  2. Verified word entry exists`);
      
      console.log(`✅ Translation Words workflow complete`);
    });

    it('should support resource discovery workflow', async () => {
      // 1. Get available languages
      const languages = await client.getLanguages();
      expect(languages.length).toBeGreaterThan(0);
      console.log(`  1. Found ${languages.length} languages`);
      
      // 2. Get resources for English
      const resources = await client.getResourcesByLanguage('en');
      expect(resources.length).toBeGreaterThan(0);
      console.log(`  2. Found ${resources.length} English resources`);
      
      // 3. Filter by owner
      const uwResources = resources.filter(r => r.owner === 'unfoldingWord');
      expect(uwResources.length).toBeGreaterThan(0);
      console.log(`  3. Found ${uwResources.length} unfoldingWord resources`);
      
      console.log(`✅ Resource discovery workflow complete`);
    });
  });
});

