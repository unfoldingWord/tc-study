/**
 * Text-language row for LanguagePicker (Epic #21 / issue #25).
 * Bible / OBS badges come from cached `availability` — no per-row fetch.
 * Helps badges and listMode filtering are out of scope (A2).
 */

import { BookMarked, BookOpen, Database, Wifi, type LucideIcon } from 'lucide-react'
import type { LanguageAvailabilityFlags } from '../features/read/languageAvailability'
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
}

export function LanguagePickerRow({ lang, status }: LanguagePickerRowProps) {
  const badges = textLanguageAvailabilityBadges(lang.availability)
  const SourceIcon = status === 'cached' ? Database : Wifi

  return (
    <>
      <div className="font-semibold text-fg mb-0.5">{lang.name}</div>
      <div className="text-sm text-fg-muted">{lang.code}</div>
      <div className="flex items-center gap-1 mt-1.5">
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
      </div>
    </>
  )
}
