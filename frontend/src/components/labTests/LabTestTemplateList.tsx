import { useState, useEffect, useCallback, useRef } from 'react'
import { MoreHorizontal, FlaskConical, Pencil } from 'lucide-react'
import { fetchLabTestTemplateList, type LabTestTemplateListRow } from '../../services/common'
import { CreateServiceRequestModal } from '../serviceRequests/CreateServiceRequestModal'
import { LabTestTemplateDetailPanel } from './LabTestTemplateDetailPanel'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface LabTestTemplateListProps {
  refreshKey?: number
  /** Called when user chooses Edit from the action menu */
  onEditClick?: (name: string) => void
  selectedPatient?: string
}

export const LabTestTemplateList = ({ refreshKey = 0, onEditClick, selectedPatient }: LabTestTemplateListProps) => {
  const [rows, setRows] = useState<LabTestTemplateListRow[]>([])
  const [allRows, setAllRows] = useState<LabTestTemplateListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dropdown search state
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // 3-dot action menu
  const [openMenuRow, setOpenMenuRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Detail panel
  const [detailTemplate, setDetailTemplate] = useState<LabTestTemplateListRow | null>(null)

  // Service request modal
  const [requestTemplate, setRequestTemplate] = useState<LabTestTemplateListRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLabTestTemplateList()
      setAllRows(data)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [refreshKey])

  useEffect(() => { load() }, [load])

  // Filter rows when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setRows(allRows)
    } else {
      const q = searchQuery.toLowerCase()
      setRows(allRows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.lab_test_name || '').toLowerCase().includes(q) ||
        (r.lab_test_code || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q) ||
        (r.lab_test_template_type || '').toLowerCase().includes(q)
      ))
    }
  }, [searchQuery, allRows])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Suggestions shown in the dropdown (max 8)
  const suggestions = searchQuery.trim()
    ? allRows.filter((r) => {
        const q = searchQuery.toLowerCase()
        return (
          r.name.toLowerCase().includes(q) ||
          (r.lab_test_name || '').toLowerCase().includes(q) ||
          (r.lab_test_code || '').toLowerCase().includes(q)
        )
      }).slice(0, 8)
    : allRows.slice(0, 8)

  const handleSuggestionClick = (row: LabTestTemplateListRow) => {
    setSearchQuery(row.lab_test_name || row.name)
    setDropdownOpen(false)
    setRows([row])
  }

  const handleSearchClear = () => {
    setSearchQuery('')
    setRows(allRows)
    setDropdownOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Dropdown search */}
      <div ref={searchRef} className="relative w-full max-w-xs">
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setDropdownOpen(true) }}
          onFocus={() => setDropdownOpen(true)}
          placeholder="Search templates…"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-7"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleSearchClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          >
            ✕
          </button>
        )}
        {dropdownOpen && suggestions.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {suggestions.map(s => (
              <button
                key={s.name}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2"
              >
                <span className="font-medium text-slate-800">{s.lab_test_name || s.name}</span>
                {s.department && <span className="text-xs text-slate-400 shrink-0">{s.department}</span>}
              </button>
            ))}
          </div>
        )}
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
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">F-Min</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">F-Max</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">M-Min</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">M-Max</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Unit</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">G-Min</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">G-Max</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Rate</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Group</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Billable</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Status</th>
                <th className="px-2 py-2 w-8">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-6">
                    {searchQuery ? 'No templates match your search' : 'NO LAB TEST TEMPLATES FOUND'}
                  </td>
                </tr>
              )}
              {rows.map(row => (
                <tr
                  key={row.name}
                  className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  {/* Clicking the name opens the detail panel */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailTemplate(row)}
                      className="font-medium text-primary hover:underline text-left"
                    >
                      {row.lab_test_name || row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.department || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.lab_test_template_type || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.female_min_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.female_max_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.male_min_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.male_max_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.lab_test_uom || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.min_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.max_range || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.lab_test_rate || '—'}</td>

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

                  {/* Three-dot action menu */}
                  <td
                    className="px-2 py-2 relative"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenMenuRow(openMenuRow === row.name ? null : row.name)}
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {openMenuRow === row.name && (
                      <div ref={menuRef} className="absolute right-0 top-8 z-30 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[180px] py-1">
                        <button
                          type="button"
                          onClick={() => {
                            onEditClick?.(row.name)
                            setOpenMenuRow(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="w-4 h-4 text-slate-400" />
                          Edit Template
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRequestTemplate(row); setOpenMenuRow(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <FlaskConical className="w-4 h-4 text-primary" />
                          Request Lab Test
                        </button>
                      </div>
                    )}
                    <PrintFormatDropdown
                        doctype="Lab Test Template"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-side detail panel */}
      {detailTemplate && (
        <LabTestTemplateDetailPanel
          templateName={detailTemplate.name}
          onClose={() => setDetailTemplate(null)}
          onEdit={() => {
            onEditClick?.(detailTemplate.name)
            setDetailTemplate(null)
          }}
          onRequestLabTest={() => {
            setRequestTemplate(detailTemplate)
            setDetailTemplate(null)
          }}
        />
      )}

      {/* Service Request modal pre-filled with this template */}
      {requestTemplate && (
        <CreateServiceRequestModal
          onClose={() => setRequestTemplate(null)}
          onSuccess={() => setRequestTemplate(null)}
          initialTemplate={requestTemplate.name}
          initialPatient={selectedPatient}
          labTestTemplateOnly
        />
      )}
    </div>
  )
}
