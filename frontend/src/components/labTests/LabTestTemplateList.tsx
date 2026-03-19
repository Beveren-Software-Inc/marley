import { useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../../services/apiClient'

interface LabTestTemplateRow {
  name: string
  lab_test_name: string
  department: string
  lab_test_template_type: string
  is_group: number
  is_billable: number
  disabled: number
}

interface LabTestTemplateListProps {
  refreshKey?: number
  onRowClick?: (name: string) => void
}

export const LabTestTemplateList = ({ refreshKey = 0, onRowClick }: LabTestTemplateListProps) => {
  const [rows, setRows] = useState<LabTestTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: unknown[] = []
      if (search.trim()) {
        filters.push(['lab_test_name', 'like', `%${search.trim()}%`])
      }
      const filtersStr = encodeURIComponent(JSON.stringify(filters))
      const fields = encodeURIComponent(JSON.stringify([
        'name', 'lab_test_name', 'department',
        'lab_test_template_type', 'is_group', 'is_billable', 'disabled',
      ]))
      const res = await apiRequest<{ data: LabTestTemplateRow[] }>(
        `/api/resource/Lab%20Test%20Template?fields=${fields}&filters=${filtersStr}&limit_page_length=100&order_by=lab_test_name+asc`
      )
      setRows(res.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [search, refreshKey])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-3">
      <div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-xs rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading && <div className="text-center text-sm text-slate-400 py-4">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-2">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Name</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Department</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Format</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Group</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Billable</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-6">
                    No Lab Test Templates found
                  </td>
                </tr>
              )}
              {rows.map(row => (
                <tr key={row.name}
                  onClick={() => onRowClick?.(row.name)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-3 py-2">
                    <span className="font-medium text-primary">{row.lab_test_name || row.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.department || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.lab_test_template_type || '—'}</td>
                  <td className="px-3 py-2">
                    {row.is_group ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700 font-medium">Group</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.is_billable ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Yes</span>
                    ) : (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">No</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.disabled ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">Disabled</span>
                    ) : (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
