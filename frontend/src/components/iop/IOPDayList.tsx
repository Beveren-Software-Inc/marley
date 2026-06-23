import { useState, useEffect, useRef } from 'react'
import { fetchIOPDays, deleteIOPDay, type IOPDay } from '../../services/iop'
import { CreateIOPDayModal } from './CreateIOPDayModal'
import { EditIOPDayModal } from './EditIOPDayModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { toast } from '../../hooks/useToast'

interface IOPDayListProps {
  refreshKey?: string | number
}

export const IOPDayList = ({ refreshKey }: IOPDayListProps) => {
  const [days, setDays] = useState<IOPDay[]>([])
  const [loading, setLoading] = useState(true)
  const [editDayName, setEditDayName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = () => {
    setLoading(true)
    fetchIOPDays(50, 0)
      .then(setDays)
      .catch(() => setDays([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenActionRow(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDelete = async (day: IOPDay) => {
    setOpenActionRow(null)
    if (
      !window.confirm(
        `Delete IOP Day ${day.posting_date || day.name}? This cannot be undone. Enrollments must be removed first.`
      )
    ) {
      return
    }
    try {
      setDeletingName(day.name)
      const result = await deleteIOPDay(day.name)
      toast.success(result.message || 'IOP Day deleted')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete IOP Day')
    } finally {
      setDeletingName(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-600">
        Loading IOP days…
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">IOP Day</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[4.5rem]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {days.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No IOP days. Create one to schedule sessions.
                </td>
              </tr>
            ) : (
              days.map((d) => (
                <tr key={d.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">{d.posting_date || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{d.name}</td>
                  <td className="px-4 py-2 align-middle">
                    <div className="relative" ref={openActionRow === d.name ? menuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow((prev) => (prev === d.name ? null : d.name))}
                        disabled={deletingName === d.name}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === d.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={140}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditDayName(d.name)
                            setOpenActionRow(null)
                          }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(d)}
                          className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </PortalActionsMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editDayName && (
        <EditIOPDayModal
          iopDayName={editDayName}
          onClose={() => setEditDayName(null)}
          onSuccess={() => {
            setEditDayName(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export function IOPDayListWithHeader({ refreshKey: externalRefreshKey }: IOPDayListProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const refreshKey = `${externalRefreshKey ?? ''}-${localRefreshKey}`
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[360px]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="font-semibold text-slate-900">IOP Days</h3>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold"
          title="New IOP Day"
        >
          +
        </button>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <IOPDayList refreshKey={refreshKey} />
      </div>
      {showCreate && (
        <CreateIOPDayModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setLocalRefreshKey((k) => k + 1)
          }}
        />
      )}
    </section>
  )
}
