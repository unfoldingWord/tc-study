/**
 * Spike App - Test linked-panels inter-panel communication
 */

import { LinkedPanelsContainer, LinkedPanel, createDefaultPluginRegistry } from 'linked-panels'
import { useMemo } from 'react'
import { textDictionaryPlugin } from './plugin'
import { TextResource } from './resources/TextResource'
import { DictionaryResource } from './resources/DictionaryResource'
import type { LinkedPanelsConfig } from 'linked-panels'

const SAMPLE_TEXT = `Hello world! This is a simple test of the linked-panels communication system. Click any word to see if it has a definition in the dictionary panel.`

export default function App() {
  // Create plugin registry
  const plugins = useMemo(() => {
    const registry = createDefaultPluginRegistry()
    registry.register(textDictionaryPlugin)
    return registry
  }, [])

  // Configure panels
  const config: LinkedPanelsConfig = useMemo(
    () => ({
      // Flat array of all resources
      resources: [
        {
          id: 'text-1',
          title: 'Sample Text',
          description: 'Click words to look them up',
          component: <TextResource text={SAMPLE_TEXT} resourceId="text-1" />,
        },
        {
          id: 'dictionary-1',
          title: 'Dictionary',
          description: 'Shows word definitions',
          component: <DictionaryResource resourceId="dictionary-1" />,
        },
      ],
      // Panel configuration
      panels: {
        'text-panel': {
          resourceIds: ['text-1'],
        },
        'dictionary-panel': {
          resourceIds: ['dictionary-1'],
        },
      },
    }),
    []
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '16px', backgroundColor: '#1f2937', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
          🔗 Linked Panels Spike - Inter-Panel Communication Test
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: '#d1d5db' }}>
          Testing word-click → dictionary lookup with message passing
        </p>
      </header>

      {/* Panels */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <LinkedPanelsContainer config={config} plugins={plugins}>
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Text Panel */}
            <div style={{ flex: 1, borderRight: '2px solid #e5e7eb', overflow: 'auto' }}>
              <LinkedPanel id="text-panel">
                {({ current }) => (
                  <div style={{ height: '100%' }}>
                    <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <h3 style={{ fontWeight: 'bold', color: '#374151' }}>
                        {current.resource?.title || 'Text Panel'}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {current.resource?.description || 'No resource loaded'}
                      </p>
                    </div>
                    <div>{current.resource?.component}</div>
                  </div>
                )}
              </LinkedPanel>
            </div>

            {/* Dictionary Panel */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <LinkedPanel id="dictionary-panel">
                {({ current }) => (
                  <div style={{ height: '100%' }}>
                    <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <h3 style={{ fontWeight: 'bold', color: '#374151' }}>
                        {current.resource?.title || 'Dictionary Panel'}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {current.resource?.description || 'No resource loaded'}
                      </p>
                    </div>
                    <div>{current.resource?.component}</div>
                  </div>
                )}
              </LinkedPanel>
            </div>
          </div>
        </LinkedPanelsContainer>
      </div>

      {/* Footer with instructions */}
      <footer style={{ padding: '16px', backgroundColor: '#f3f4f6', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', fontSize: '14px', color: '#6b7280' }}>
          <strong>How it works:</strong>
          <ol style={{ marginTop: '8px', marginLeft: '20px' }}>
            <li>Click any word in the Text Panel</li>
            <li>TextResource sends a <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '3px' }}>word-click</code> message</li>
            <li>DictionaryResource receives the message and looks up the definition</li>
            <li>DictionaryResource sends a <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '3px' }}>highlighted-words-broadcast</code> message back</li>
            <li>TextResource receives it and highlights the word with a yellow background</li>
          </ol>
          <p style={{ marginTop: '8px', fontStyle: 'italic' }}>
            Open the browser console to see message logs
          </p>
        </div>
      </footer>
    </div>
  )
}
