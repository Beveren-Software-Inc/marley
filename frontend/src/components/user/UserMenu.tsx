import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Moon, Sun, LogOut } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../providers/AuthProvider'

export const UserMenu = () => {
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

  return (
    <div className="relative flex flex-col items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
        aria-label="User menu"
        type="button"
      >
        <span className="text-white text-sm font-medium pointer-events-none">{initials}</span>
      </button>
      <div className="text-xs text-white mt-1 text-center max-w-[60px] truncate" title={displayName}>
        {displayName}
      </div>

      {/* User dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-[100] overflow-hidden">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-medium text-sm">{initials}</span>
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

