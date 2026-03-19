import { useState, useEffect, useCallback, useRef } from 'react'
import { MoreHorizontal, UserPlus, Eye } from 'lucide-react'
import { fetchInsurancePatientRegisters, linkPatientToInsuranceRegister, type InsurancePatientRegisterRow } from '../../services/common'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Unused: 'bg-slate-100 text-slate-600',
  Exhausted: 'bg-orange-100 text-orange-700',
  Expired: 'bg-red-100 text-red-600',
  Cancelled: 'bg-slate-200 text-slate-500',
}

interface InsurancePatientRegisterListProps {
  refreshKey?: number
  onRowClick?: (row: InsurancePatientRegisterRow) => void
}

export const InsurancePatientRegisterList = ({
  refreshKey = 0,
  onRowClick,
}: InsurancePatientRegisterListProps) => {
  const [rows, setRows] = useState<InsurancePatientRegisterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Three-dot menu — one row open at a time
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Create patient modal (prefilled from register)
  const [createPatientForRegister, setCreatePatientForRegister] = useState<InsurancePatientRegisterRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInsurancePatientRegisters(search || undefined)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records')
    } finally {
      setLoading(false)
    }
  }, [search, refreshKey])

  useEffect(() => { load() }, [load])

  // Close actions menu when clicking outside (ignore portaled menu and the three-dot trigger)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePatientCreated = async (patientName: string) => {
    if (createPatientForRegister) {
      try {
        await linkPatientToInsuranceRegister(createPatientForRegister.name, patientName)
        setCreatePatientForRegister(null)
        load()
      } catch {
        setCreatePatientForRegister(null)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-xs rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading && <div className="text-center text-sm text-slate-400 py-6">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-2">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Register No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Full Name</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">National ID / CPR</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Insurance Provider</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Visits</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Patient</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400 py-8">
                    No insurance patient registers found
                  </td>
                </tr>
              )}
              {rows.map(row => (
                <tr key={row.name}
                  className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onRowClick?.(row)}
                      className="text-primary font-medium hover:underline text-xs"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.full_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{row.national_id_cpr_no || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{row.insurance_provider || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {row.no_of_visits || '—'}
                    {row.approval_validitydays ? <span className="ml-1 text-slate-400">({row.approval_validitydays}d)</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-600'}`}>
                      {row.status || 'Unused'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.patient ? (
                      <span className="text-green-700 font-medium">{row.patient}</span>
                    ) : (
                      <span className="text-slate-400 italic">Not linked</span>
                    )}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end">
                      <div className="relative inline-block" ref={openActionRow === row.name ? menuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name))}
                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <PortalActionsMenu
                          open={openActionRow === row.name}
                          onClose={() => setOpenActionRow(null)}
                          triggerRef={menuRef}
                          minWidth={180}
                        >
                          <button
                            type="button"
                            onClick={() => { onRowClick?.(row); setOpenActionRow(null) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4 text-slate-400" />
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => { setCreatePatientForRegister(row); setOpenActionRow(null) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <UserPlus className="w-4 h-4 text-blue-500" />
                            {row.patient ? 'Reassign Patient' : 'Create Patient'}
                          </button>
                        </PortalActionsMenu>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Patient modal pre-filled from this register */}
      {createPatientForRegister && (
        <CreatePatientModal
          onClose={() => setCreatePatientForRegister(null)}
          onSuccess={handlePatientCreated}
          initialName={createPatientForRegister.full_name}
          initialNationalId={createPatientForRegister.national_id_cpr_no}
          initialInsurance={createPatientForRegister.insurance_provider}
        />
      )}
    </div>
  )
}