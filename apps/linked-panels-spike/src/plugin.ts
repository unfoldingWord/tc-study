/**
 * Plugin for text + dictionary linked panels spike
 */
export const textDictionaryPlugin = {
  id: 'text-dictionary',
  name: 'Text Dictionary',
  version: '1.0.0',
  messageTypes: [
    { type: 'word-click', description: 'Word clicked in text' },
    { type: 'highlighted-words-broadcast', description: 'Highlight words in text' },
  ] as Array<{ type: string; description: string }>,
} as const satisfies { id: string; name: string; version: string; messageTypes: Array<{ type: string; description: string }> }
