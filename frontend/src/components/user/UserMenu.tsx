import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Moon, Sun, LogOut, LayoutDashboard } from 'lucide-react'

/** Frappe Desk (same origin as the portal). */
const FRAPPE_DESK_URL = '/app'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../providers/AuthProvider'

type UserMenuProps = {
  placement?: 'header' | 'sidebar'
}

export const UserMenu = ({ placement = 'header' }: UserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Generate initials from user's name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(word => word.charAt(0).toUpperCase())
      .join("")
      .substring(0, 2)
  }

  const displayName = user?.name || "Guest User"
  const initials = getInitials(displayName)

  const handleLogout = async () => {
    try {
      setIsOpen(false) // Close dropdown first
      await logout()
      // Use replace to prevent going back to previous page
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Navigate even if logout fails
      navigate('/login', { replace: true })
    }
  }

  const isSidebar = placement === 'sidebar'

  return (
    <div
      className={`relative ${isSidebar ? 'w-full' : 'flex flex-col items-center'}`}
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={
          isSidebar
            ? 'flex w-full items-center gap-3 rounded-md bg-white/10 px-3 py-2.5 text-left hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40'
            : 'w-8 h-8 bg-white rounded-full flex items-center justify-center text-primary hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer'
        }
        aria-label="User menu"
        type="button"
      >
        <span
          className={
            isSidebar
              ? 'w-9 h-9 shrink-0 bg-white rounded-full flex items-center justify-center text-primary text-sm font-medium'
              : 'text-primary text-sm font-medium pointer-events-none'
          }
        >
          {initials}
        </span>
        {isSidebar && (
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-white truncate">{displayName}</span>
            <span className="block text-xs text-white/70 truncate">{user?.role || 'Account'}</span>
          </span>
        )}
      </button>
      {!isSidebar && (
        <div className="text-xs text-white mt-1 text-center max-w-[60px] truncate" title={displayName}>
          {displayName}
        </div>
      )}

      {/* User dropdown menu */}
      {isOpen && (
        <div
          className={`absolute w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-[100] overflow-hidden ${
            isSidebar
              ? 'bottom-full left-0 mb-2'
              : 'top-full right-0 mt-2'
          }`}
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 border border-gray-200">
                <span className="text-primary font-medium text-sm">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.role || 'User'}</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                navigate('/settings')
                setIsOpen(false)
              }}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              type="button"
            >
              <Settings size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                toggleTheme()
                setIsOpen(false)
              }}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              type="button"
            >
              {theme === 'dark' ? (
                <Sun size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              ) : (
                <Moon size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              )}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <a
              href={FRAPPE_DESK_URL}
              onClick={() => setIsOpen(false)}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutDashboard size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              <span>Back to Desk</span>
            </a>

            <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>

            <button
              onClick={() => {
                handleLogout()
                setIsOpen(false)
              }}
              className="flex items-center w-full px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              type="button"
            >
              <LogOut size={16} className="mr-3" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

