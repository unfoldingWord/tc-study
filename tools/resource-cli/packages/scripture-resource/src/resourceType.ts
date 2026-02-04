/**
 * Scripture Resource Type Definition
 */

import { defineResourceType } from '@bt-synergy/resource-types'
import { ScriptureLoader } from './loader'
import { ScriptureViewer } from './viewer/ScriptureViewer'

export const scriptureResourceType = defineResourceType({
  // Identification
  id: 'scripture',
  displayName: 'Scripture',
  description: 'Bible texts in USFM format with verse-level precision',
  
  // Door43 subjects
  subjects: ["Bible","Aligned Bible","Greek New Testament","Hebrew Old Testament"],
  
  // Data layer
  loader: ScriptureLoader,
  
  // UI layer
  viewer: ScriptureViewer,
  
  // Communication (optional)
  communication: {
    metadata: {
      type: 'scripture',
      tags: [], // Add tags for filtering
    },
    handlers: [
      // Define signal handlers here
      // Example:
      // {
      //   signalType: 'verse-navigation',
      //   handler: (signal, context) => {
      //     // Handle signal
      //   }
      // }
    ],
    emits: [
      // List signals this resource emits
      // Example: 'token-click', 'verse-navigation'
    ],
  },
  
  // Features
  features: {
    highlighting: false,
    bookmarking: false,
    search: false,
    navigation: false,
  },
  
  // Metadata
  version: '0.1.0',
  author: 'BT-Synergy Team',
  license: 'MIT',
})
