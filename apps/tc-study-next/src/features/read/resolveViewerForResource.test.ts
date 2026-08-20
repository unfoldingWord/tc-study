import { describe, expect, test } from 'bun:test'
import type { ResourceInfo } from '../../contexts/types'
import { resolveViewerForResource } from './resolveViewerForResource'

function FakeViewer(_props: Record<string, unknown>) {
  return null
}

function makeResource(partial: Partial<ResourceInfo> & { id: string; type: string }): ResourceInfo {
  return {
    key: partial.id,
    language: 'en',
    owner: 'unfoldingWord',
    category: partial.type,
    ...partial,
  } as ResourceInfo
}

describe('resolveViewerForResource', () => {
  test('uses getViewer result and passes through resource props', () => {
    const resource = makeResource({ id: 'u/en/ult', type: 'scripture' })
    const el = resolveViewerForResource({
      resource,
      resourceKey: resource.id,
      viewerRegistry: {
        getViewer: () => FakeViewer,
        getViewerByType: () => null,
      },
    }) as any

    expect(el.type).toBe(FakeViewer)
    expect(el.props.resourceId).toBe('u/en/ult')
    expect(el.props.resourceKey).toBe('u/en/ult')
    expect(el.props.onEntryLinkClick).toBeUndefined()
  })

  test('falls back to getViewerByType when getViewer misses', () => {
    const resource = makeResource({ id: 'u/en/tn', type: 'notes' })
    const el = resolveViewerForResource({
      resource,
      resourceKey: resource.id,
      viewerRegistry: {
        getViewer: () => null,
        getViewerByType: (type) => (type === 'notes' ? FakeViewer : null),
      },
    }) as any

    expect(el.type).toBe(FakeViewer)
  })

  test('attaches onEntryLinkClick for helps / CombinedHelps types', () => {
    const onEntryLinkClick = () => {}
    for (const type of ['notes', 'words-links', 'combined-helps', 'obs-combined-helps']) {
      const resource = makeResource({ id: `u/en/${type}`, type })
      const el = resolveViewerForResource({
        resource,
        resourceKey: resource.id,
        viewerRegistry: {
          getViewer: () => FakeViewer,
          getViewerByType: () => null,
        },
        onEntryLinkClick,
      }) as any
      expect(el.props.onEntryLinkClick).toBe(onEntryLinkClick)
    }
  })

  test('returns FallbackViewer when registry has no match', () => {
    const resource = makeResource({ id: 'u/en/unknown', type: 'mystery' })
    const el = resolveViewerForResource({
      resource,
      resourceKey: resource.id,
      viewerRegistry: {
        getViewer: () => null,
        getViewerByType: () => null,
      },
    }) as any

    expect(el.props.resourceId).toBe('u/en/unknown')
    expect(el.props.resourceType).toBe('mystery')
  })
})
