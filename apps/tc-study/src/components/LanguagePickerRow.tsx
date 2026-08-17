/**
 * Compact language card for LanguagePicker (Epic #21 / issue #25).
 * Bible / OBS badges come from cached `availability` — no per-row fetch.
 * Helps badges and listMode filtering are out of scope (A2).
 */

import { BookMarked, BookOpen, Database, Wifi, type LucideIcon } from 'lucide-react'
import type { LanguageAvailabilityFlags } from '../features/read/languageAvailability'
import type { LanguagePickerCardRole } from '../features/read/languagePickerCardRole'
import {
  languageListDisplayName,
  languagePickerA11yLabel,
} from '../features/read/languageListDisplayName'
import type { ListedLanguage } from '../features/read/languagesCache'

/** This pane: existing selected accent. Other pane: same hue, lower opacity. */
export const LANGUAGE_PICKER_CURRENT_CARD_CLASS = 'border-accent bg-accent-soft'
export const LANGUAGE_PICKER_OTHER_CARD_CLASS = 'border-accent/40 bg-accent-soft/30'
export const LANGUAGE_PICKER_IDLE_CARD_CLASS =
  'border-border-subtle bg-surface hover:border-accent/50 hover:bg-accent-soft'

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
  cardRole?: LanguagePickerCardRole
  onSelect?: (code: string) => void
}

export function LanguagePickerRow({
  lang,
  status,
  selected = false,
  cardRole,
  onSelect,
}: LanguagePickerRowProps) {
  const badges = textLanguageAvailabilityBadges(lang.availability)
  const SourceIcon = status === 'cached' ? Database : Wifi
  const displayName = languageListDisplayName(lang, lang.code)
  const a11yLabel = languagePickerA11yLabel(lang, lang.code)
  const role = cardRole ?? (selected ? 'current' : undefined)
  const isCurrent = role === 'current'
  const isOther = role === 'other'
  const label = isOther ? displayName : a11yLabel
  const cardClass = isCurrent
    ? LANGUAGE_PICKER_CURRENT_CARD_CLASS
    : isOther
      ? LANGUAGE_PICKER_OTHER_CARD_CLASS
      : LANGUAGE_PICKER_IDLE_CARD_CLASS

  return (
    <button
      type="button"
      onClick={() => onSelect?.(lang.code)}
      className={`w-full min-w-0 text-left rounded-md p-content border transition-colors ${cardClass}`}
      title={label}
      aria-label={label}
      aria-current={isCurrent ? 'true' : undefined}
      aria-pressed={isOther ? true : undefined}
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
