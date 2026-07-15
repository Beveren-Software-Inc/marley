import { useEffect, useState } from 'react'
import {
  fetchPractitionerUnavailabilities,
  updatePractitionerUnavailability,
  type PractitionerUnavailabilityRow,
} from '../../services/practitionerUnavailability'
import { CreatePractitionerUnavailabilityModal } from './CreatePractitionerUnavailabilityModal'
import { toast } from '../../hooks/useToast'

interface PractitionerUnavailabilityListProps {
  refreshKey?: number | string
  showCreateButton?: boolean
}

export const PractitionerUnavailabilityList = ({
  refreshKey,
  showCreateButton = true,
}: PractitionerUnavailabilityListProps) => {
  const [rows, setRows] = useState<PractitionerUnavailabilityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [includeCancelled, setIncludeCancelled] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await fetchPractitionerUnavailabilities({
          limit: 200,
          include_cancelled: includeCancelled,
        })
        setRows(data)
      } catch (e) {
        // Distinguish a failed load from "no records" so the roster isn't assumed empty.
        setRows([])
        setLoadError(e instanceof Error ? e.message : 'Failed to load practitioner unavailability')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [includeCancelled, refreshKey, localRefresh])

  const handleToggleCancel = async (row: PractitionerUnavailabilityRow) => {
    setToggling(row.name)
    try {
      await updatePractitionerUnavailability(row.name, { is_cancel: row.is_cancel ? 0 : 1 })
      toast.success(row.is_cancel ? 'Hold reactivated' : 'Hold cancelled')
      setLocalRefresh((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div>
      {loadError && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLocalRefresh((k) => k + 1)} className="font-medium underline shrink-0">Retry</button>
        </div>
      )}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show cancelled
        </label>

        {showCreateButton && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ml-auto w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold"
            title="New Practitioner Unavailability"
          >
            +
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Tran No</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Practitioner</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Start</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">End</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Branch</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Remarks</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Status</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400 text-xs">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400 text-xs">
                  NO PRACTITIONER UNAVAILABILITY RECORDS FOUND
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.tran_num || row.name}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.practitioner_name || row.doctor_id}</div>
                    <div className="text-xs text-slate-400">{row.doctor_id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.start_date}</td>
                  <td className="px-3 py-2 text-slate-600">{row.end_date}</td>
                  <td className="px-3 py-2 text-slate-600">{row.branch || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={row.any_remarks || ''}>
                    {row.any_remarks || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        row.is_cancel
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}
                    >
                      {row.is_cancel ? 'Cancelled' : 'Active'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={toggling === row.name}
                      onClick={() => handleToggleCancel(row)}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {toggling === row.name ? '…' : row.is_cancel ? 'Reactivate' : 'Cancel hold'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreatePractitionerUnavailabilityModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            setLocalRefresh((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
