import { describe, expect, test } from 'bun:test'
import { createResourceMetadata, type Door43Resource } from './ResourceMetadataFactory'

const hit: Door43Resource = {
  id: 'tn',
  name: 'es-419_tn',
  owner: 'es-419_gl',
  language: 'es-419',
  subject: 'TSV Translation Notes',
  version: 'v66',
  release: {
    tag_name: 'v66',
    zipball_url: 'https://git.door43.org/es-419_gl/es-419_tn/archive/v66.zip',
    published_at: '2026-01-01T00:00:00Z',
  },
  ingredients: [{ identifier: 'rut', title: 'Ruth', path: './tn_RUT.tsv', categories: ['bible-ot'] }],
}

describe('createResourceMetadata', () => {
  test('regenerating a row keeps the book blobs a download recorded', async () => {
    const existing = {
      resourceKey: 'es-419_gl/es-419/tn',
      contentMetadata: {
        ingredients: [{ identifier: 'rut', title: 'Ruth', path: './tn_RUT.tsv', categories: [] }],
        bookBlobs: { rut: '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7' },
        bookBlobsRef: 'v66',
      },
    }
    const catalogAdapter = { get: async () => existing as any }

    const row = await createResourceMetadata(hit, { includeEnrichment: false, catalogAdapter })

    expect(row.contentMetadata?.bookBlobs).toEqual({ rut: '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7' })
    expect(row.contentMetadata?.bookBlobsRef).toBe('v66')
    expect(row.contentMetadata?.books).toEqual(['rut'])
  })

  test('a row with no recorded blobs stays without them', async () => {
    const row = await createResourceMetadata(hit, { includeEnrichment: false })
    expect(row.contentMetadata).not.toHaveProperty('bookBlobs')
    expect(row.contentMetadata).not.toHaveProperty('bookBlobsRef')
  })
})
