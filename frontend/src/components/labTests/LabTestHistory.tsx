// LabTestHistory.tsx

import { useState, useEffect } from 'react'
import { fetchLabTests, type LabTest } from '../../services/labTests'
import { Search, X, ChevronDown } from 'lucide-react'
import { StatusPill } from '../ui/StatusPill'

interface LabTestHistoryProps {
  patientId?: string
  /** Custom className for styling */
  className?: string
  /** Max lab tests to fetch from API */
  limit?: number
  /** When true, only rows with status Completed are shown */
  showOnlyCompleted?: boolean
}

interface Filters {
  status: string
  fromDate: string
  toDate: string
  testName: string
}

const STATUS_OPTIONS = [
  'Draft', 'Requested', 'Awaiting sample collection', 'Sample Collection in Progress',
  'Sample Collected', 'Testing in progress', 'Completed', 'Pending Review',
  'Reviewed', 'Rejected', 'Cancelled',
] as const

const statusColors: Record<string, string> = {
  'Reviewed': 'success', 'Rejected': 'danger', 'Completed': 'success',
  'Pending Review': 'warning', 'Submitted': 'info', 'Cancelled': 'default',
  'Draft': 'warning', 'Pending': 'warning', 'Requested': 'info',
  'Awaiting sample collection': 'warning', 'Sample Collection in Progress': 'info',
  'Sample Collected': 'info', 'Testing in progress': 'info',
}

const makeEmptyFilters = (): Filters => ({
  status: '', fromDate: '', toDate: '', testName: '',
})

// Filter Bar Component
const FilterBar = ({ filters, onChange, onClear, activeCount }: {
  filters: Filters
  onChange: (f: Filters) => void
  onClear: () => void
  activeCount: number
}) => {
  const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-white border-b border-slate-200">
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
        <div className="relative">
          <select 
            value={filters.status} 
            onChange={(e) => set('status', e.target.value)}
            className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Date</label>
        <input 
          type="date" 
          value={filters.fromDate} 
          onChange={(e) => set('fromDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary" 
        />
      </div>

      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To Date</label>
        <input 
          type="date" 
          value={filters.toDate} 
          onChange={(e) => set('toDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary" 
        />
      </div>

      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Test Name</label>
        <input 
          type="text" 
          value={filters.testName} 
          onChange={(e) => set('testName', e.target.value)}
          placeholder="Search by test name..."
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary" 
        />
      </div>

      {activeCount > 0 && (
        <button 
          type="button" 
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors self-end"
        >
          <X className="w-3.5 h-3.5" />Clear
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">{activeCount}</span>
        </button>
      )}
    </div>
  )
}

// Helper to get result flag color classes
const getResultFlagClasses = (flag?: string) => {
  switch (flag) {
    case 'Normal': return 'bg-green-100 text-green-700'
    case 'High': return 'bg-orange-100 text-orange-700'
    case 'Low': return 'bg-orange-100 text-orange-700'
    case 'Critically High': return 'bg-red-100 text-red-700 font-bold'
    case 'Critically Low': return 'bg-red-100 text-red-700 font-bold'
    default: return 'bg-slate-100 text-slate-500'
  }
}

// Helper to format date
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

export const LabTestHistory = ({
  patientId,
  className = '',
  limit = 100,
  showOnlyCompleted = false,
}: LabTestHistoryProps) => {
  const [labTests, setLabTests] = useState<LabTest[]>([])
  const [filteredTests, setFilteredTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(makeEmptyFilters())

  // Load lab tests
  useEffect(() => {
    if (!patientId) {
      setLoading(false)
      return
    }

    const loadLabTests = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const result = await fetchLabTests(
          limit,
          0,
          patientId,
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false
        )

        let sortedTests = [...result.data].sort((a, b) => {
          const dateA = a.result_date || a.submitted_date || a.date || ''
          const dateB = b.result_date || b.submitted_date || b.date || ''
          return dateB.localeCompare(dateA)
        })

        if (showOnlyCompleted) {
          sortedTests = sortedTests.filter((t) => t.status === 'Completed')
        }

        setLabTests(sortedTests)
        setFilteredTests(sortedTests)
      } catch (err) {
        console.error('Failed to load lab test history:', err)
        setError(err instanceof Error ? err.message : 'Failed to load lab test history')
      } finally {
        setLoading(false)
      }
    }

    loadLabTests()
  }, [patientId, limit, showOnlyCompleted])

  // Apply filters
  useEffect(() => {
    let filtered = [...labTests]

    // Filter by status
    if (filters.status) {
      filtered = filtered.filter(test => test.status === filters.status)
    }

    // Filter by date range
    if (filters.fromDate) {
      filtered = filtered.filter(test => {
        const testDate = test.result_date || test.submitted_date || test.date
        return testDate && testDate >= filters.fromDate
      })
    }

    if (filters.toDate) {
      filtered = filtered.filter(test => {
        const testDate = test.result_date || test.submitted_date || test.date
        return testDate && testDate <= filters.toDate
      })
    }

    // Filter by test name
    if (filters.testName) {
      const searchTerm = filters.testName.toLowerCase()
      filtered = filtered.filter(test => 
        (test.lab_test_name || '').toLowerCase().includes(searchTerm) ||
        (test.template || '').toLowerCase().includes(searchTerm) ||
        test.name.toLowerCase().includes(searchTerm)
      )
    }

    setFilteredTests(filtered)
  }, [labTests, filters])

  const activeCount = [filters.status, filters.fromDate, filters.toDate, filters.testName].filter(Boolean).length

  const handleClearFilters = () => {
    setFilters(makeEmptyFilters())
  }

  if (!patientId) {
    return (
      <div className={`text-center py-12 text-slate-400 ${className}`}>
        <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Select a patient to view lab test history</p>
        <p className="text-xs mt-1 text-slate-400">Lab test results will appear here</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading lab test history...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <p className="text-red-700 text-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-3 text-xs text-red-600 hover:text-red-800 font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col min-w-full ${className}`}>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={handleClearFilters}
        activeCount={activeCount}
      />

      {filteredTests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">
            {activeCount > 0 
              ? 'No lab tests match the current filters.' 
              : 'No lab test history found for this patient.'}
          </p>
          {activeCount > 0 && (
            <button 
              onClick={handleClearFilters} 
              className="mt-3 text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Test Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Result Flag</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Test ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTests.map((test) => (
                <tr key={test.name} className="hover:bg-slate-50 transition-colors">
                  {/* Test Name */}
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {test.lab_test_name || test.template || test.name}
                  </td>
                  
                  {/* Result */}
                  <td className="px-4 py-3 text-sm text-slate-700 max-w-[250px]">
                    <div className="truncate" title={test.custom_result || test.results || '—'}>
                      {test.custom_result || test.results || '—'}
                    </div>
                  </td>
                  
                  {/* Result Flag */}
                  <td className="px-4 py-3">
                    {test.result_flag ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getResultFlagClasses(test.result_flag)}`}>
                        {test.result_flag}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  
                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusPill 
                      status={test.status || 'Draft'} 
                      color={statusColors[test.status || 'Draft'] || 'default'} 
                    />
                  </td>
                  
                  {/* Date */}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatDate(test.result_date || test.submitted_date || test.date)}
                  </td>
                  
                  {/* Practitioner */}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {test.practitioner_name || test.practitioner || '—'}
                  </td>
                  
                  {/* Test ID */}
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                    {test.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Footer with count */}
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            Showing {filteredTests.length} of {labTests.length} lab test{labTests.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}