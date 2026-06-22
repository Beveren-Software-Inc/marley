import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Moon, Sun, LogOut, LayoutDashboard, DoorClosed } from 'lucide-react'

/** Frappe Desk (same origin as the portal). */
const FRAPPE_DESK_URL = '/app'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../providers/AuthProvider'
import { useReceptionistShift } from '../../providers/ReceptionistShiftProvider'

type UserMenuProps = {
  placement?: 'header' | 'sidebar'
}

export const UserMenu = ({ placement = 'header' }: UserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [closingNotes, setClosingNotes] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const shift = useReceptionistShift()
  const shiftOpen = Boolean(shift?.shiftRequired && shift.context?.open_shift?.status === 'Open')

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

  const handleCloseShift = async () => {
    if (!shift?.closeShift) return
    try {
      await shift.closeShift(closingNotes)
      setShowCloseShiftModal(false)
      setClosingNotes('')
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('Close shift error:', error)
    }
  }

  const openCloseShiftModal = () => {
    setIsOpen(false)
    setClosingNotes('')
    setShowCloseShiftModal(true)
  }

  const isSidebar = placement === 'sidebar'

  return (
    <div
      className={`relative ${isSidebar ? 'w-full' : 'flex items-center gap-2 shrink-0'}`}
      ref={dropdownRef}
    >
      {!isSidebar && shiftOpen && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap"
          title="Reception shift is open"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
          Open
        </span>
      )}
      <div className={isSidebar ? 'w-full' : 'flex flex-col items-center'}>
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
            <span className="block text-xs text-white/70 truncate">
              {shiftOpen ? 'Shift open' : user?.role || 'Account'}
            </span>
          </span>
        )}
      </button>
      {!isSidebar && (
        <div className="text-xs text-white mt-1 text-center max-w-[60px] truncate" title={displayName}>
          {displayName}
        </div>
      )}
      </div>

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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {shiftOpen ? 'Shift open' : user?.role || 'User'}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {shiftOpen && (
              <button
                onClick={openCloseShiftModal}
                disabled={shift?.submitting}
                className="flex items-center w-full px-4 py-3 text-sm text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                type="button"
              >
                <DoorClosed size={16} className="mr-3 shrink-0" />
                <span>Close Shift</span>
              </button>
            )}

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
      {showCloseShiftModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
          <div
            data-healthcare-modal
            className="w-full max-w-md rounded-lg bg-white text-slate-900 shadow-2xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Close Reception Shift</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add any handover notes, then close your shift. You will be logged out automatically.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Closing Notes (optional)
              </label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Handover notes, cash float, etc."
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowCloseShiftModal(false)
                  setClosingNotes('')
                }}
                disabled={shift?.submitting}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCloseShift()}
                disabled={shift?.submitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {shift?.submitting ? 'Closing…' : 'Close Shift & Logout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
