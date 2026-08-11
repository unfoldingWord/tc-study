import type { LucideIcon } from 'lucide-react'
import {
  Book,
  BookMarked,
  BookOpen,
  BookText,
  GraduationCap,
  Layers,
  LifeBuoy,
  Link,
  MessageCircleQuestion,
} from 'lucide-react'

/**
 * Allowlisted Lucide icons for panel tabs.
 * Add a name here when a plugin registers `icon: 'SomeName'`.
 */
export const LUCIDE_ICON_REGISTRY: Record<string, LucideIcon> = {
  Book,
  BookMarked,
  BookOpen,
  BookText,
  GraduationCap,
  Layers,
  LifeBuoy,
  Link,
  MessageCircleQuestion,
}

export function resolveLucideIconName(name: string | undefined | null): LucideIcon | null {
  if (!name) return null
  return LUCIDE_ICON_REGISTRY[name] ?? null
}
