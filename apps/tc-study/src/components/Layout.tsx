import { BookOpen, BookOpenCheck, Clapperboard, FileText, FolderOpen, Home, Library, Menu, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const navItems = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Library', path: '/library', icon: Library },
  { name: 'Collections', path: '/collections', icon: FolderOpen },
  { name: 'Passage Sets', path: '/passage-sets', icon: FileText },
  { name: 'Studio', path: '/studio', icon: Clapperboard },
  { name: 'Read', path: '/read', icon: BookOpenCheck },
  { name: 'Settings', path: '/settings', icon: Settings },
]

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()
  
  // Find current active nav item
  const activeNavItem = navItems.find(item => 
    item.path === '/' 
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  ) || navItems[0]

  // Hide app bar on read page for immersive reading experience
  const isReadPage = location.pathname.startsWith('/read')

  return (
    <div className="flex h-dynamic-screen flex-col bg-gray-50 overflow-hidden">
      {!isReadPage && (
      <header className="flex-shrink-0 border-b border-gray-100 bg-white/80 backdrop-blur-sm relative z-[110]">
        <nav className="flex items-center justify-between px-3 py-1.5">
          {/* App Logo/Name - Compact */}
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-blue-700">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-base font-semibold text-gray-900">
              TC Study
            </span>
          </div>

          {/* Compact Navigation - Icons only */}
          <div className="flex items-center gap-0.5">
            {/* Current Mode Indicator - Icon only */}
            <NavLink
              to={activeNavItem.path}
              className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              title={activeNavItem.name}
              aria-label={activeNavItem.name}
            >
              <activeNavItem.icon className="h-4 w-4" />
            </NavLink>

            {/* Menu Toggle */}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                title={isMenuOpen ? 'Close menu' : 'Open menu'}
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMenuOpen ? (
                  <X className="h-4 w-4 text-gray-600" />
                ) : (
                  <Menu className="h-4 w-4 text-gray-600" />
                )}
              </button>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute top-full right-0 mt-1.5 z-[100] bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-[40px]">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setIsMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-center py-2 transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-700 hover:bg-gray-50'
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
      
      {/* Overlay to close menu when clicking outside */}
      {!isReadPage && isMenuOpen && (
        <div
          className="fixed inset-0 z-[90]"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  )
}
