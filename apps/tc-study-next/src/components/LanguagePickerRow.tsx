/**
 * Compact language card for LanguagePicker (Epic #21 / issue #25).
 * Bible / OBS badges come from cached `availability` — no per-row fetch.
 * Helps badges and listMode filtering are out of scope (A2).
 */

import { BookMarked, BookOpen, Database, Wifi, type LucideIcon } from 'lucide-react'
import type { LanguageAvailabilityFlags } from '../features/read/languageAvailability'
import {
  languageListDisplayName,
  languagePickerA11yLabel,
} from '../features/read/languageListDisplayName'
import type { ListedLanguage } from '../features/read/languagesCache'

export type TextLanguageBadgeKind = 'bible' | 'obs'

export interface TextLanguageAvailabilityBadge {
  kind: TextLanguageBadgeKind
  label: string
}

export const TEXT_LANGUAGE_BADGE_LABELS: Record<TextLanguageBadgeKind, string> = {
  bible: 'Bible',
  obs: 'OBS',
}

const TEXT_LANGUAGE_BADGE_ICONS: Record<TextLanguageBadgeKind, LucideIcon> = {
  bible: BookOpen,
  obs: BookMarked,
}

/**
 * Bible / OBS badges only. Missing or empty availability degrades to no badges
 * (row still renders). Helps flags are ignored.
 */
export function textLanguageAvailabilityBadges(
  availability: LanguageAvailabilityFlags | undefined | null
): TextLanguageAvailabilityBadge[] {
  if (!availability) return []
  const badges: TextLanguageAvailabilityBadge[] = []
  if (availability.bible) {
    badges.push({ kind: 'bible', label: TEXT_LANGUAGE_BADGE_LABELS.bible })
  }
  if (availability.obs) {
    badges.push({ kind: 'obs', label: TEXT_LANGUAGE_BADGE_LABELS.obs })
  }
  return badges
}

export interface LanguagePickerRowProps {
  lang: ListedLanguage
  status: 'cached' | 'online'
  selected?: boolean
  onSelect?: (code: string) => void
}

export function LanguagePickerRow({
  lang,
  status,
  selected = false,
  onSelect,
}: LanguagePickerRowProps) {
  const badges = textLanguageAvailabilityBadges(lang.availability)
  const SourceIcon = status === 'cached' ? Database : Wifi
  const displayName = languageListDisplayName(lang, lang.code)
  const a11yLabel = languagePickerA11yLabel(lang, lang.code)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(lang.code)}
      className={`w-full min-w-0 text-left rounded-md p-content border transition-colors ${
        selected
          ? 'border-accent bg-accent-soft'
          : 'border-border-subtle bg-surface hover:border-accent/50 hover:bg-accent-soft'
      }`}
      title={a11yLabel}
      aria-label={a11yLabel}
    >
      <div className="text-sm font-semibold text-fg truncate">{displayName}</div>
      <div className="mt-chrome-tight flex items-center gap-1 min-w-0">
        <span className="text-caption text-fg-muted font-mono truncate">{lang.code}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <SourceIcon className="w-3 h-3 text-accent" aria-hidden />
          {badges.map((badge) => {
            const Icon = TEXT_LANGUAGE_BADGE_ICONS[badge.kind]
            return (
              <span
                key={badge.kind}
                className="inline-flex items-center justify-center rounded-full bg-accent-soft p-0.5"
                title={badge.label}
                aria-label={badge.label}
              >
                <Icon className="w-3 h-3 text-accent-fg" aria-hidden />
              </span>
            )
          })}
        </span>
      </div>
    </button>
  )
}
