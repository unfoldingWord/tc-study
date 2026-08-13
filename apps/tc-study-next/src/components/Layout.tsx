import { BookOpen, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { navItems } from '../config/navItems'
import { ThemeToggle } from '../features/theme'

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

  const activeNavItem = navItems.find((item) => location.pathname.startsWith(item.path)) || navItems[0]

  // Hide app bar on read page for immersive reading experience
  const isReadPage = location.pathname.startsWith('/read')

  return (
    <div className="flex h-dynamic-screen flex-col bg-canvas overflow-hidden">
      {!isReadPage && (
        <header className="flex-shrink-0 border-b border-border-subtle bg-surface/80 backdrop-blur-sm relative z-[110]">
          <nav className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-hover">
                <BookOpen className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-base font-semibold text-fg">TC Study Next</span>
            </div>

            <div className="flex items-center gap-0.5">
              <ThemeToggle size="sm" />

              <NavLink
                to={activeNavItem.path}
                className="p-1.5 rounded-md bg-accent-soft text-accent hover:opacity-90 transition-colors"
                title={activeNavItem.name}
                aria-label={activeNavItem.name}
              >
                <activeNavItem.icon className="h-4 w-4" />
              </NavLink>

              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title={isMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                >
                  {isMenuOpen ? (
                    <X className="h-4 w-4 text-fg-secondary" />
                  ) : (
                    <Menu className="h-4 w-4 text-fg-secondary" />
                  )}
                </button>

                {isMenuOpen && (
                  <div className="absolute top-full right-0 mt-1.5 z-[100] bg-elevated rounded-lg shadow-xl border border-border py-1 w-[40px]">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-center py-2 transition-colors ${
                            isActive
                              ? 'bg-accent-soft text-accent'
                              : 'text-fg-secondary hover:bg-muted'
                          }`
                        }
                        title={item.name}
                        aria-label={item.name}
                      >
                        <item.icon className="h-4 w-4" />
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </nav>
        </header>
      )}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {!isReadPage && isMenuOpen && (
        <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)} />
      )}
    </div>
  )
}
