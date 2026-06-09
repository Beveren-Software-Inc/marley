import { useState, useEffect } from 'react'
import { fetchIOPDays, type IOPDay } from '../../services/iop'
import { CreateIOPDayModal } from './CreateIOPDayModal'

interface IOPDayListProps {
  refreshKey?: string | number
}

export const IOPDayList = ({ refreshKey }: IOPDayListProps) => {
  const [days, setDays] = useState<IOPDay[]>([])
  const [loading, setLoading] = useState(true)

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {days.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                  No IOP days. Create one to schedule sessions.
                </td>
              </tr>
            ) : (
              days.map((d) => (
                <tr key={d.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">{d.posting_date || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{d.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
