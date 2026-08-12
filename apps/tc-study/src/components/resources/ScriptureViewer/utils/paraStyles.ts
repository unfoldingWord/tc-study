/**
 * Tailwind class helpers for USJ layout markers (formatted mode).
 * Keeps visual language close to existing verse-block scripture chrome.
 */

import type { UsjLayoutBlockRole } from '@bt-synergy/scripture-loader'

const INDENT_CLASSES = [
  '', // 0
  'pl-6', // q1
  'pl-10', // q2
  'pl-14', // q3
  'pl-16', // q4
] as const

export function indentClassForLevel(level: number): string {
  if (level <= 0) return ''
  return INDENT_CLASSES[Math.min(level, INDENT_CLASSES.length - 1)] ?? 'pl-16'
}

export function blockClassForMarker(
  marker: string,
  role: UsjLayoutBlockRole,
  indentLevel: number
): string {
  const indent = indentClassForLevel(indentLevel)
  const base = 'leading-relaxed text-lg text-gray-900'

  if (role === 'break' || marker === 'b') {
    return 'h-3'
  }

  if (role === 'heading' || role === 'intro') {
    if (marker === 's2' || marker === 's3' || marker === 's4') {
      return `mt-4 mb-2 text-base italic text-gray-700 text-center ${indent}`
    }
    return `mt-5 mb-3 text-base font-semibold text-gray-800 text-center ${indent}`
  }

  if (marker === 'qc') {
    return `${base} text-center mb-2 ${indent}`
  }
  if (marker === 'qr') {
    return `${base} text-right mb-2 ${indent}`
  }

  // Poetry lines stay as distinct blocks; prose paragraphs get a bit more spacing
  if (indentLevel > 0 || marker.startsWith('q')) {
    return `${base} mb-1 ${indent}`
  }

  return `${base} mb-3 ${indent}`
}
