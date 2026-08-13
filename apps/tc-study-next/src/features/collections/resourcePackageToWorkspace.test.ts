import { describe, expect, test } from 'bun:test'
import type { ResourcePackage } from '@bt-synergy/package-storage'
import { resourcePackageToWorkspace } from './resourcePackageToWorkspace'

describe('resourcePackageToWorkspace', () => {
  test('maps panels and default active index', () => {
    const pkg = {
      id: 'pkg-1',
      name: 'Demo',
      version: '1.0.0',
      description: 'desc',
      panelLayout: {
        panels: [
          {
            id: 'p1',
            title: 'Left',
            resourceIds: ['uw/en/ult', 'uw/en/tn'],
            defaultResourceId: 'uw/en/tn',
          },
          {
            id: 'p2',
            resourceIds: ['uw/en/tq'],
          },
        ],
      },
    } as ResourcePackage

    const ws = resourcePackageToWorkspace(pkg)
    expect(ws.id).toBe('pkg-1')
    expect(ws.resources.size).toBe(0)
    expect(ws.panels).toHaveLength(2)
    expect(ws.panels[0]).toMatchObject({
      id: 'p1',
      name: 'Left',
      resourceKeys: ['uw/en/ult', 'uw/en/tn'],
      activeIndex: 1,
      position: 0,
    })
    expect(ws.panels[1]).toMatchObject({
      id: 'p2',
      name: 'Panel 2',
      resourceKeys: ['uw/en/tq'],
      activeIndex: 0,
      position: 1,
    })
  })
})
