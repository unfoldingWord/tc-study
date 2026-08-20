import {
  BookOpenCheck,
  Clapperboard,
  FolderOpen,
  Home,
  Library,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface AppNavItem {
  name: string
  path: string
  icon: LucideIcon
}

/**
 * Primary app navigation. Passage Sets intentionally omitted until
 * @bt-synergy/passage-sets is re-wired (route may still exist for deep links).
 */
export const navItems: AppNavItem[] = [
  { name: 'Read', path: '/read', icon: BookOpenCheck },
  { name: 'Home', path: '/home', icon: Home },
  { name: 'Library', path: '/library', icon: Library },
  { name: 'Collections', path: '/collections', icon: FolderOpen },
  { name: 'Studio', path: '/studio', icon: Clapperboard },
  { name: 'Settings', path: '/settings', icon: Settings },
]
