/**
 * Unit tests for Door43ApiClient.getOrganizations()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Door43ApiClient } from './Door43ApiClient';

describe('Door43ApiClient.getOrganizations', () => {
  let client: Door43ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    client = new Door43ApiClient();
  });

  it('should fetch organizations successfully', async () => {
    const mockOrgs = [
      {
        id: 1,
        username: 'unfoldingWord',
        full_name: 'unfoldingWord',
        description: 'Biblical content in every language',
        avatar_url: 'https://example.com/avatar1.png',
        website: 'https://unfoldingword.org',
      },
      {
        id: 2,
        username: 'Door43-Catalog',
        full_name: 'Door43 Catalog',
        description: 'Resource catalog',
        avatar_url: 'https://example.com/avatar2.png',
        website: 'https://door43.org',
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockOrgs }),
    });

    const result = await client.getOrganizations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://git.door43.org/api/v1/orgs',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
      })
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '1',
      username: 'unfoldingWord',
      full_name: 'unfoldingWord',
      description: 'Biblical content in every language',
      avatar_url: 'https://example.com/avatar1.png',
      website: 'https://unfoldingword.org',
    });
  });

  it('should return empty array when API returns non-array data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should return empty array on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should handle timeout gracefully', async () => {
    fetchMock.mockImplementationOnce(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject({ name: 'AbortError' }), 100)
      )
    );

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should handle malformed response data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 1 }, { id: 2, username: 'test' }] }),
    });

    const result = await client.getOrganizations();
    expect(result).toHaveLength(2);
    expect(result[0].username).toBeDefined();
    expect(result[1].username).toBe('test');
  });

  it('should map login field to username if username is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        data: [{ id: 1, login: 'testOrg', full_name: 'Test Org' }] 
      }),
    });

    const result = await client.getOrganizations();
    expect(result[0].username).toBe('testOrg');
  });

  it('should handle HTTP error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server error' }),
    });

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should use custom baseUrl if provided', async () => {
    const customClient = new Door43ApiClient({ 
      baseUrl: 'https://custom.door43.org' 
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await customClient.getOrganizations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.door43.org/api/v1/orgs',
      expect.any(Object)
    );
  });
});


 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Door43ApiClient } from './Door43ApiClient';

describe('Door43ApiClient.getOrganizations', () => {
  let client: Door43ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    client = new Door43ApiClient();
  });

  it('should fetch organizations successfully', async () => {
    const mockOrgs = [
      {
        id: 1,
        username: 'unfoldingWord',
        full_name: 'unfoldingWord',
        description: 'Biblical content in every language',
        avatar_url: 'https://example.com/avatar1.png',
        website: 'https://unfoldingword.org',
      },
      {
        id: 2,
        username: 'Door43-Catalog',
        full_name: 'Door43 Catalog',
        description: 'Resource catalog',
        avatar_url: 'https://example.com/avatar2.png',
        website: 'https://door43.org',
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockOrgs }),
    });

    const result = await client.getOrganizations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://git.door43.org/api/v1/orgs',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
      })
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '1',
      username: 'unfoldingWord',
      full_name: 'unfoldingWord',
      description: 'Biblical content in every language',
      avatar_url: 'https://example.com/avatar1.png',
      website: 'https://unfoldingword.org',
    });
  });

  it('should return empty array when API returns non-array data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should return empty array on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should handle timeout gracefully', async () => {
    fetchMock.mockImplementationOnce(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject({ name: 'AbortError' }), 100)
      )
    );

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should handle malformed response data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 1 }, { id: 2, username: 'test' }] }),
    });

    const result = await client.getOrganizations();
    expect(result).toHaveLength(2);
    expect(result[0].username).toBeDefined();
    expect(result[1].username).toBe('test');
  });

  it('should map login field to username if username is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        data: [{ id: 1, login: 'testOrg', full_name: 'Test Org' }] 
      }),
    });

    const result = await client.getOrganizations();
    expect(result[0].username).toBe('testOrg');
  });

  it('should handle HTTP error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server error' }),
    });

    const result = await client.getOrganizations();
    expect(result).toEqual([]);
  });

  it('should use custom baseUrl if provided', async () => {
    const customClient = new Door43ApiClient({ 
      baseUrl: 'https://custom.door43.org' 
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await customClient.getOrganizations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.door43.org/api/v1/orgs',
      expect.any(Object)
    );
  });
});

