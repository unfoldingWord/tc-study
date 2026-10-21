import { describe, expect, test } from 'bun:test'
import { ObsLoader } from './ObsLoader'

describe('ObsLoader downloadResource skipExisting', () => {
  test('skips network when all story blobs are cached', async () => {
    const storyPayload = {
      content: {
        storyNumber: 1,
        title: 'Story',
        frames: [{ frameNumber: 1, imageUrl: 'x.jpg', text: 't' }],
      },
    }
    const gets: string[] = []
    let fetchCalls = 0
    const loader = new ObsLoader({
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key.startsWith('obs:uw/en/obs:')) return storyPayload
          return null
        },
        set: async () => {},
      },
      catalogAdapter: {
        get: async () => ({
          subject: 'Open Bible Stories',
          resourceId: 'obs',
          contentMetadata: {
            ingredients: [{ identifier: 'obs', path: './content', isDir: true }],
          },
        }),
      },
      door43Client: {
        findRepository: async () => {
          fetchCalls++
          return { release: { tag_name: 'v9' } }
        },
        fetchTextContent: async () => {
          fetchCalls++
          return '# Title\n\n![img](a.jpg)\n\nText\n'
        },
      },
    })

    const progress: string[] = []
    await loader.downloadResource('uw/en/obs', { skipExisting: true }, (p) => {
      if (p.message) progress.push(p.message)
    })

    expect(fetchCalls).toBe(0)
    expect(progress.some((m) => m.includes('Skipped'))).toBe(true)
    expect(gets.some((k) => k.startsWith('obs:uw/en/obs:'))).toBe(true)
  })

  test('fetches only missing stories when partially cached', async () => {
    let fetchText = 0
    const loader = new ObsLoader({
      cacheAdapter: {
        get: async (key: string) => {
          if (key === 'obs:uw/en/obs:01') {
            return {
              content: {
                storyNumber: 1,
                title: 'One',
                frames: [{ frameNumber: 1, imageUrl: 'a.jpg', text: 't' }],
              },
            }
          }
          return null
        },
        set: async () => {},
      },
      catalogAdapter: {
        get: async () => ({
          subject: 'Open Bible Stories',
          resourceId: 'obs',
          contentMetadata: {
            ingredients: [
              { identifier: '1', path: './content/01.md' },
              { identifier: '2', path: './content/02.md' },
            ],
          },
        }),
      },
      door43Client: {
        findRepository: async () => ({ release: { tag_name: 'v9' } }),
        fetchTextContent: async () => {
          fetchText++
          return '# Title\n\n![img](a.jpg)\n\nText\n'
        },
        config: { baseUrl: 'https://git.door43.org' },
      },
    })

    await loader.downloadResource('uw/en/obs', { skipExisting: true })
    expect(fetchText).toBe(1)
  })
})
