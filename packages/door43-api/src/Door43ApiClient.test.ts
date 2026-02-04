/**
 * Door43 API Client Tests
 * 
 * Example tests showing how to test Door43 API calls
 */

import { createDoor43ApiClient, Door43ApiClient } from './Door43ApiClient';

describe('Door43ApiClient', () => {
  let client: Door43ApiClient;

  beforeEach(() => {
    client = createDoor43ApiClient({
      baseUrl: 'https://git.door43.org',
      timeout: 5000,
    });
  });

  describe('Parameter Validation', () => {
    it('should reject invalid language code', async () => {
      await expect(client.getResourcesByLanguage('')).rejects.toThrow('Invalid language code');
      await expect(client.getResourcesByLanguage(null as any)).rejects.toThrow('Invalid language code');
    });

    it('should reject invalid owner', async () => {
      await expect(client.getResourcesByOwnerAndLanguage('', 'en')).rejects.toThrow('Invalid owner');
    });

    it('should reject missing parameters in findResource', async () => {
      await expect(client.findResource('', 'en', 'ult')).rejects.toThrow('Missing required parameters');
      await expect(client.findResource('unfoldingWord', '', 'ult')).rejects.toThrow('Missing required parameters');
      await expect(client.findResource('unfoldingWord', 'en', '')).rejects.toThrow('Missing required parameters');
    });
  });

  describe('Response Validation', () => {
    it('should validate catalog structure', () => {
      const validCatalog = {
        languages: [{ code: 'en', name: 'English', direction: 'ltr' }],
        resources: [],
      };
      expect(client.validateCatalog(validCatalog)).toBe(true);

      const invalidCatalog = { languages: 'not an array' };
      expect(client.validateCatalog(invalidCatalog)).toBe(false);
    });
  });

  describe('API Calls', () => {
    // These tests require mocking fetch or using a test server
    // Example with manual testing:
    
    it.skip('should fetch languages from Door43', async () => {
      const languages = await client.getLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages[0]).toHaveProperty('code');
      expect(languages[0]).toHaveProperty('name');
    });

    it.skip('should fetch resources for English', async () => {
      const resources = await client.getResourcesByLanguage('en');
      expect(Array.isArray(resources)).toBe(true);
      if (resources.length > 0) {
        expect(resources[0]).toHaveProperty('id');
        expect(resources[0]).toHaveProperty('owner');
        expect(resources[0].language).toBe('en');
      }
    });

    it.skip('should find unfoldingWord English ULT', async () => {
      const resource = await client.findResource('unfoldingWord', 'en', 'ult');
      expect(resource).not.toBeNull();
      expect(resource?.id).toBe('ult');
      expect(resource?.language).toBe('en');
      expect(resource?.owner).toBe('unfoldingWord');
    });
  });

  describe('Content Fetching', () => {
    describe('Parameter Validation', () => {
      it('should reject missing parameters in fetchRawContent', async () => {
        await expect(client.fetchRawContent('', 'repo', 'file.txt')).rejects.toThrow('Missing required parameters');
        await expect(client.fetchRawContent('owner', '', 'file.txt')).rejects.toThrow('Missing required parameters');
        await expect(client.fetchRawContent('owner', 'repo', '')).rejects.toThrow('Missing required parameters');
      });
    });

    it.skip('should fetch text content from repository', async () => {
      // Example: Fetch a TSV file from Translation Questions
      const content = await client.fetchTextContent('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      // TSV files typically have tabs
      expect(content).toContain('\t');
    });

    it.skip('should check if file exists', async () => {
      const exists = await client.checkFileExists('unfoldingWord', 'en_tq', 'tq_GEN.tsv');
      expect(exists).toBe(true);

      const notExists = await client.checkFileExists('unfoldingWord', 'en_tq', 'nonexistent-file.txt');
      expect(notExists).toBe(false);
    });

    it('should handle content fetch timeout', async () => {
      const slowClient = createDoor43ApiClient({
        baseUrl: 'https://httpstat.us/200?sleep=10000',
        timeout: 100,
      });
      
      await expect(slowClient.fetchTextContent('owner', 'repo', 'file.txt')).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });
  });

  describe('Repository Search', () => {
    it('should reject empty query', async () => {
      await expect(client.searchRepositories('')).rejects.toThrow('Search query is required');
    });

    it.skip('should search for repositories', async () => {
      const results = await client.searchRepositories('translation', {
        owner: 'unfoldingWord',
        limit: 10
      });
      
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('name');
        expect(results[0]).toHaveProperty('owner');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout', async () => {
      const slowClient = createDoor43ApiClient({
        baseUrl: 'https://httpstat.us/200?sleep=10000',
        timeout: 100,
      });
      
      await expect(slowClient.getCatalog()).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it.skip('should handle network errors', async () => {
      // Skipped: DNS resolution can be slow and unreliable in CI
      const badClient = createDoor43ApiClient({
        baseUrl: 'https://invalid.door43.org',
      });
      
      await expect(badClient.getCatalog()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });
});

