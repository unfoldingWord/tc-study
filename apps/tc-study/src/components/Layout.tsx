import { Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BRAND_SHORT } from '../config/brand'
import { navItems } from '../config/navItems'
import { ThemeToggle } from '../features/theme'
import { OCEAN_BAR_BG, OCEAN_BAR_SECTION_SHORTCUT } from '../styles/oceanBarChrome'
import { Card } from './ui/Card'
import { IconButton } from './ui/IconButton'

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

  const activeNavItem = navItems.find((item) => location.pathname.startsWith(item.path)) || navItems[0]

  const isReadPage = location.pathname.startsWith('/read')

  return (
    <div className="flex h-dynamic-screen flex-col bg-canvas overflow-hidden">
      {!isReadPage && (
        <header
          className={clsx(
            'flex-shrink-0 relative z-[110] h-14 border-b border-accent-fill-fg/15',
            OCEAN_BAR_BG
          )}
        >
          <nav className="flex h-full items-center justify-between px-3">
            <div className="flex items-center">
              <span className="font-extrabold text-[15.5px] text-accent-fill-fg">{BRAND_SHORT}</span>
            </div>

            <div className="flex items-center gap-0.5">
              <ThemeToggle size="sm" variant="ocean" />

              <NavLink
                to={activeNavItem.path}
                className={clsx(
                  'inline-flex items-center justify-center rounded-md p-1.5 transition-colors',
                  OCEAN_BAR_SECTION_SHORTCUT
                )}
                title={activeNavItem.name}
                aria-label={activeNavItem.name}
              >
                <activeNavItem.icon className="h-4 w-4" />
              </NavLink>

              <div className="relative">
                <IconButton
                  label={isMenuOpen ? 'Close menu' : 'Open menu'}
                  size="sm"
                  tone="onOcean"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </IconButton>

                {isMenuOpen && (
                  <Card
                    padded={false}
                    className="absolute top-full right-0 z-[100] mt-1.5 w-[52px] border-border-subtle py-1 shadow-xl"
                  >
                    {navItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMenuOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center justify-center py-2 transition-colors',
                            isActive
                              ? 'bg-accent-soft text-accent'
                              : 'text-fg-secondary hover:bg-muted'
                          )
                        }
                        title={item.name}
                        aria-label={item.name}
                      >
                        <item.icon className="h-4 w-4" />
                      </NavLink>
                    ))}
                  </Card>
                )}
              </div>
            </div>
          </nav>
        </header>
      )}
      <main className={`flex-1 min-h-0 ${isReadPage ? 'overflow-hidden' : 'overflow-auto'}`}>
        <Outlet />
      </main>

      {!isReadPage && isMenuOpen && (
        <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)} />
      )}
    </div>
  )
}
