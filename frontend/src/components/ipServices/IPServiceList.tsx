import { useState, useEffect, useRef } from 'react'
import { fetchIPServices, deleteIPService, type IPServiceRow } from '../../services/ipServices'
import { toast } from '../../hooks/useToast'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { IPServiceDetailView } from './IPServiceDetailView'

interface IPServiceListProps {
  patient?: string
  admission_no?: string
  refreshKey?: number | string
  category?: 'Medical Service' | 'Other Service'
  onPatientClick?: (patient: string) => void
  /** Nurse ECT view — hide amounts; show therapy names only in detail. */
  hidePricing?: boolean
}

const normalizeCategory = (category?: string) => (category || '').trim()

export const IPServiceList = ({
  patient,
  admission_no,
  refreshKey,
  category,
  onPatientClick,
  hidePricing = false,
}: IPServiceListProps) => {
  const [list, setList] = useState<IPServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  // Close action menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    fetchIPServices(50, 0, patient, admission_no)
      .then((data) => {
        if (!cancelled) {
          let filtered = data
          if (category === 'Other Service') {
            filtered = data.filter((row) => normalizeCategory(row.category) === 'Other Service')
          } else if (category === 'Medical Service') {
            filtered = data.filter((row) => {
              const cat = normalizeCategory(row.category)
              return !cat || cat === 'Medical Service'
            })
          }
          setList(filtered)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to fetch ECT Services'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient, admission_no, refreshKey, category])

  const handleView = (name: string) => {
    setDetailName(name)
    setOpenActionRow(null)
  }

  const handleEdit = (name: string) => {
    window.open(`/app/ip-service/${encodeURIComponent(name)}`, '_blank')
    setOpenActionRow(null)
  }

  const handleDelete = async (name: string) => {
    setOpenActionRow(null)
    if (!window.confirm(`Delete ECT Service ${name}? This cannot be undone.`)) {
      return
    }
    try {
      setDeletingName(name)
      const result = await deleteIPService(name)
      setList((prev) => prev.filter((row) => row.name !== name))
      if (detailName === name) {
        setDetailName(null)
      }
      const soMsg =
        result.sales_orders && result.sales_orders.length > 0
          ? ` Linked sales order(s) removed.`
          : ''
      toast.success(`ECT Service ${name} deleted.${soMsg}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete ECT Service')
    } finally {
      setDeletingName(null)
    }
  }

  const doRefetch = () => {
    fetchIPServices(50, 0, patient, admission_no)
      .then((data) => {
        let filtered = data
        if (category === 'Other Service') {
          filtered = data.filter((row) => normalizeCategory(row.category) === 'Other Service')
        } else if (category === 'Medical Service') {
          filtered = data.filter((row) => {
            const cat = normalizeCategory(row.category)
            return !cat || cat === 'Medical Service'
          })
        }
        setList(filtered)
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch ECT Services'))
      })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-sm">
        Loading ECT Services…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        {error.message}
      </div>
    )
  }

  if (list.length === 0) {
    const emptyMessage = category === 'Other Service'
      ? 'No Other Services found. Create one with the + button.'
      : 'No ECT Services found. Create one with the + button.'
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600 font-medium">
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Admission</th>
              {!patient && (
                <th className="py-2 pr-2">Patient</th>
              )}
              <th className="py-2 pr-2">Service</th>
              {!hidePricing ? (
                <th className="py-2 pr-2 text-right">Total</th>
              ) : null}
              <th className="py-2 pr-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50">
                <td 
                  className="py-2 pr-2 font-medium text-primary cursor-pointer hover:underline"
                  onClick={() => handleView(row.name)}
                >
                  {row.name}
                </td>
                <td 
                  className="py-2 pr-2 cursor-pointer"
                  onClick={() => handleView(row.name)}
                >
                  {row.admission_no ?? '–'}
                </td>
                {!patient && (
                  <td
                    className="py-2 pr-2 cursor-pointer"
                    onClick={() => row.file_number && onPatientClick?.(row.file_number)}
                  >
                    <span className="font-medium text-primary hover:underline">{row.patient_full_name ?? row.file_number ?? '–'}</span>
                  </td>
                )}
                <td 
                  className="py-2 pr-2 cursor-pointer"
                  onClick={() => handleView(row.name)}
                >
                  {row.first_service ?? '–'}
                </td>
                {!hidePricing ? (
                  <td 
                    className="py-2 pr-2 text-right cursor-pointer"
                    onClick={() => handleView(row.name)}
                  >
                    {row.total_amount != null ? Number(row.total_amount).toLocaleString() : '–'}
                  </td>
                ) : null}
                
                {/* Actions column with both three-dot menu and print button */}
                <td className="py-2 pr-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Three-dot actions menu */}
                    <div className="relative inline-block" ref={openActionRow === row.name ? actionMenuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name))}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === row.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={actionMenuRef}
                        minWidth={160}
                      >
                        <button
                          type="button"
                          onClick={() => handleView(row.name)}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(row.name)}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.name)}
                          disabled={deletingName === row.name}
                          className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingName === row.name ? 'Deleting…' : 'Delete'}
                        </button>
                      </PortalActionsMenu>
                    </div>

                    {/* Print button */}
                    <PrintFormatDropdown 
                      doctype="IP Service" 
                      docName={row.name} 
                      noLetterhead={0} 
                      triggerPrint={1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Slide Over */}
      {detailName && (
        <DetailSlideOver
          title="ECT Service"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <IPServiceDetailView name={detailName} onUpdate={doRefetch} hidePricing={hidePricing} />
        </DetailSlideOver>
      )}
    </>
  )
}