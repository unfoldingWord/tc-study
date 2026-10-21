import { BookMarked, BookOpen, type LucideIcon } from 'lucide-react'

export type TextKindIconKey = 'bible' | 'obs'

/** Shared Bible / OBS glyphs — language picker chips are the source of truth. */
export const TEXT_KIND_ICONS: Record<TextKindIconKey, LucideIcon> = {
  bible: BookOpen,
  obs: BookMarked,
}

export function textKindIconForNavScope(scope: 'scripture' | 'obs'): LucideIcon {
  return TEXT_KIND_ICONS[scope === 'obs' ? 'obs' : 'bible']
}
