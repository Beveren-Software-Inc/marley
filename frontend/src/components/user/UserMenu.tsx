import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Moon, Sun, LogOut, LayoutDashboard, DoorClosed, CalendarDays, PenLine } from 'lucide-react'

/** Frappe Desk (same origin as the portal). */
const FRAPPE_DESK_URL = '/app'
/** HRMS shift roster (same origin as the portal). */
const HR_ROSTER_URL = '/hr/roster'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { useReceptionistShift } from '../../providers/ReceptionistShiftProvider'
import { apiRequest } from '../../services/apiClient'
import { fetchDoc, fetchHealthcarePractitioners, getCurrentUserPractitionerOption, type LinkFieldOption } from '../../services/common'
import { uploadPatientFile } from '../../services/patients'
import { SignaturePad, attachFileDisplayUrl } from '../ui/SignaturePad'
import { toast } from '../../hooks/useToast'

type UserMenuProps = {
  placement?: 'header' | 'sidebar'
}

type UploadSignatureModalProps = {
  onClose: () => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary'

const UploadSignatureModal = ({ onClose }: UploadSignatureModalProps) => {
  const [practitioner, setPractitioner] = useState<LinkFieldOption | null>(null)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const comboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getCurrentUserPractitionerOption().then((opt) => {
      if (!opt) return
      setPractitioner(opt)
      setPractitionerQuery(opt.label)
    })
  }, [])

  const loadExistingSignature = useCallback(async (practitionerName: string) => {
    try {
      setLoadingExisting(true)
      const doc = await fetchDoc('Healthcare Practitioner', practitionerName)
      const existingSignature = typeof doc.signature === 'string' ? doc.signature : ''
      setSignatureUrl(existingSignature || null)
    } catch (err) {
      console.error('Failed to load practitioner signature:', err)
      setSignatureUrl(null)
    } finally {
      setLoadingExisting(false)
    }
  }, [])

  useEffect(() => {
    if (!practitioner?.name) {
      setSignatureUrl(null)
      return
    }
    void loadExistingSignature(practitioner.name)
  }, [practitioner, loadExistingSignature])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        setLoadingOptions(true)
        setOptions(await fetchHealthcarePractitioners(practitionerQuery || undefined))
      } catch {
        setOptions([])
      } finally {
        setLoadingOptions(false)
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, open])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDrawSave = async (file: File) => {
    setSignatureUploading(true)
    setError(null)
    try {
      const fileUrl = await uploadPatientFile(file)
      if (!fileUrl) throw new Error('No URL returned from signature upload')
      setSignatureUrl(fileUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSignatureUploading(false)
    }
  }

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    setAttachmentUploading(true)
    setError(null)
    try {
      const fileUrl = await uploadPatientFile(file)
      if (!fileUrl) throw new Error('No URL returned from upload')
      setSignatureUrl(fileUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature file upload failed')
    } finally {
      setAttachmentUploading(false)
    }
  }

  const handleSave = async () => {
    if (!practitioner?.name) {
      setError('Practitioner is required')
      return
    }
    if (!signatureUrl) {
      setError('Please draw or upload a signature first')
      return
    }

    try {
      setSaving(true)
      setError(null)
      // Update only the signature Attach field (avoids rewriting unrelated practitioner fields).
      await apiRequest('/api/method/frappe.client.set_value', {
        method: 'POST',
        body: JSON.stringify({
          doctype: 'Healthcare Practitioner',
          name: practitioner.name,
          fieldname: 'signature',
          value: signatureUrl,
        }),
      })
      toast.success('Practitioner signature saved')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
      <div data-healthcare-modal className="w-full max-w-2xl rounded-lg bg-white text-slate-900 shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Upload Signature</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose the practitioner, then draw or upload a signature to save into `Healthcare Practitioner.signature`.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div ref={comboRef} className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">Practitioner</label>
            <input
              type="text"
              value={practitionerQuery}
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitioner(null)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search practitioner..."
              className={inputClass}
            />
            {open && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {options.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">
                    {loadingOptions ? 'Searching…' : 'No practitioners found'}
                  </div>
                ) : (
                  options.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        setPractitioner(opt)
                        setPractitionerQuery(opt.label)
                        setOpen(false)
                      }}
                    >
                      <div className="font-medium text-slate-800">{opt.label}</div>
                      {opt.label !== opt.name ? (
                        <div className="text-xs text-slate-400">{opt.name}</div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-3 flex items-center gap-1.5">
                <PenLine className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">Draw signature</span>
              </div>
              <SignaturePad
                onSave={handleDrawSave}
                onClear={() => setSignatureUrl(null)}
                existingUrl={attachFileDisplayUrl(signatureUrl)}
                uploading={signatureUploading || attachmentUploading || loadingExisting}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-600">Upload signature file</span>
              <p className="mt-1 text-xs text-slate-500">
                You can upload an image or PDF instead of drawing.
              </p>
              <input
                type="file"
                accept="image/*,.pdf"
                disabled={attachmentUploading || signatureUploading || loadingExisting}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  void handleFileUpload(file)
                  e.currentTarget.value = ''
                }}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {signatureUrl ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-600">Current signature</div>
                  <a
                    href={attachFileDisplayUrl(signatureUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-primary hover:underline"
                  >
                    {signatureUrl.split('/').pop() || 'View signature'}
                  </a>
                </div>
              ) : null}
              {loadingExisting ? (
                <p className="mt-3 text-xs text-slate-500">Loading existing signature…</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !practitioner?.name || !signatureUrl}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const UserMenu = ({ placement = 'header' }: UserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [showUploadSignatureModal, setShowUploadSignatureModal] = useState(false)
  const [closingNotes, setClosingNotes] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const { lockEditingData } = useCareContext()
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

  const fullName = user?.full_name || user?.name || "Guest User"
  const userId = user?.name || user?.email || ""
  const initials = getInitials(fullName)

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
      {!isSidebar && lockEditingData && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap"
          title="You can create new records but cannot modify existing data"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Editing locked
        </span>
      )}
      <div className={isSidebar ? 'w-full' : 'flex items-center'}>
      {isSidebar && lockEditingData && (
        <span
          className="mb-2 inline-flex w-full items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100"
          title="You can create new records but cannot modify existing data"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
          Editing locked
        </span>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={
          isSidebar
            ? 'flex w-full items-center gap-3 rounded-md bg-white/10 px-3 py-2.5 text-left hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40'
            : 'flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer'
        }
        aria-label="User menu"
        title={userId ? `${fullName} · ${userId}` : fullName}
        type="button"
      >
        <span
          className={`${isSidebar ? 'h-9 w-9' : 'h-8 w-8'} shrink-0 overflow-hidden rounded-full bg-white flex items-center justify-center text-primary text-sm font-medium`}
        >
          {user?.user_image ? (
            <img src={user.user_image} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className={`min-w-0 ${isSidebar ? 'flex-1' : 'max-w-[180px]'}`}>
          <span className="block text-sm font-bold text-white leading-tight break-words">{fullName}</span>
          {userId && (
            <span className="mt-0.5 block text-xs text-white/70 leading-tight [overflow-wrap:anywhere]">{userId}</span>
          )}
        </span>
      </button>
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

            <a
              href={HR_ROSTER_URL}
              onClick={() => setIsOpen(false)}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <CalendarDays size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              <span>Go to Roster</span>
            </a>

            <button
              onClick={() => {
                setShowUploadSignatureModal(true)
                setIsOpen(false)
              }}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              type="button"
            >
              <PenLine size={16} className="mr-3 text-gray-500 dark:text-gray-400" />
              <span>Upload Signature</span>
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
      {showUploadSignatureModal && (
        <UploadSignatureModal onClose={() => setShowUploadSignatureModal(false)} />
      )}
    </div>
  )
}
