import { useState, useEffect } from 'react'
import { fetchDischarges, type Discharge } from '../../services/discharges'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { useCareContext } from '../../providers/CareContextProvider'

const statusColors: Record<string, string> = {
  'Draft': 'warning',
  'Submitted': 'success',
  'Cancelled': 'danger'
}

interface DischargeListProps {
  patient?: string
  admission?: string
}

export const DischargeList = ({ patient, admission }: DischargeListProps) => {
  const { mode, activeAdmission, selectedPatient: contextPatient } = useCareContext()

  // When IP mode has a specific admission, scope discharges to that admission.
  // Otherwise fall through to the prop, then context patient.
  const effectiveAdmission = (mode === 'IP' && activeAdmission) ? activeAdmission : admission
  const effectivePatient = patient ?? (contextPatient || undefined)

  const [discharges, setDischarges] = useState<Discharge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [admissionFilter, setAdmissionFilter] = useState<string>('')
  const [dischargeIdFilter, setDischargeIdFilter] = useState<string>('')

  // Discharge ID — searchable dropdown (link to Discharge)
  const [dischargeIdQuery, setDischargeIdQuery] = useState('')
  const [dischargeIdOptions, setDischargeIdOptions] = useState<{ value: string; label: string }[]>([])
  const [dischargeIdOpen, setDischargeIdOpen] = useState(false)
  const [selectedDischargeIdOpt, setSelectedDischargeIdOpt] = useState<{ value: string; label: string } | null>(null)

  // IP Admission — searchable dropdown (like Admission list Case No)
  const [admissionNoQuery, setAdmissionNoQuery] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [selectedAdmissionOpt, setSelectedAdmissionOpt] = useState<{ value: string; label: string } | null>(null)

  useEffect(() => {
    const loadDischarges = async () => {
      try {
        setLoading(true)
        setError(null)
        const resolvedAdmission = dischargeIdFilter ? undefined : (admissionFilter || effectiveAdmission)
        const search = dischargeIdFilter || undefined
        const response = await fetchDischarges(50, 0, effectivePatient, resolvedAdmission, search)
        setDischarges(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch discharges'))
      } finally {
        setLoading(false)
      }
    }

    loadDischarges()
  }, [effectivePatient, effectiveAdmission, admissionFilter, dischargeIdFilter])

  // Load discharge ID options when dropdown is open (searchable list of discharges)
  useEffect(() => {
    if (!dischargeIdOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchDischarges(30, 0, effectivePatient, undefined, dischargeIdQuery || undefined)
        setDischargeIdOptions(
          results.map((d) => ({
            value: d.name,
            label: `${d.name}${d.patient_name ? ` - ${d.patient_name}` : ''}`,
          }))
        )
      } catch (err) {
        setDischargeIdOptions([])
      }
    }, dischargeIdQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [dischargeIdQuery, dischargeIdOpen, effectivePatient])

  // Load admission options when dropdown is open (searchable list of inpatient admissions)
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchInpatientRecords(
          undefined,
          admissionNoQuery || undefined,
          effectivePatient,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(
          results.slice(0, 30).map((r) => ({
            value: r.name,
            label: `${r.name}${r.patient_name ? ` - ${r.patient_name}` : ''}`,
          }))
        )
      } catch (err) {
        setAdmissionOptions([])
      }
    }, admissionNoQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionNoQuery, admissionOpen, effectivePatient])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-discharge-filter-dropdown]')) {
        setDischargeIdOpen(false)
        setAdmissionOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDischargeIdSelect = (opt: { value: string; label: string }) => {
    setSelectedDischargeIdOpt(opt)
    setDischargeIdFilter(opt.value)
    setDischargeIdQuery('')
    setDischargeIdOpen(false)
  }

  const handleAdmissionSelect = (opt: { value: string; label: string }) => {
    setSelectedAdmissionOpt(opt)
    setAdmissionFilter(opt.value)
    setAdmissionNoQuery('')
    setAdmissionOpen(false)
  }

  const handleClearFilters = () => {
    setDischargeIdFilter('')
    setDischargeIdQuery('')
    setSelectedDischargeIdOpt(null)
    setDischargeIdOpen(false)
    setAdmissionFilter('')
    setAdmissionNoQuery('')
    setSelectedAdmissionOpt(null)
    setStatusFilter('')
    setTypeFilter('')
    setAdmissionOpen(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading discharges...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Discharges</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (discharges.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No discharges found</div>
      </div>
    )
  }

  const getDocStatus = (docstatus?: number): string => {
    if (docstatus === 0) return 'Draft'
    if (docstatus === 1) return 'Submitted'
    if (docstatus === 2) return 'Cancelled'
    return 'Draft'
  }

  const filtered = discharges.filter((d) => {
    const status = getDocStatus(d.docstatus)
    if (dischargeIdFilter && d.name !== dischargeIdFilter) return false
    if (statusFilter && status !== statusFilter) return false
    if (typeFilter && d.discharge_type !== typeFilter) return false
    return true
  })

  const statusOptions = ['Draft', 'Submitted', 'Cancelled']
  const dischargeTypeOptions = ['Home', 'Dama', 'Refer To Another Hospital']
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      {/* Global-context active admission banner */}
      {effectiveAdmission && mode === 'IP' && activeAdmission && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-t-lg bg-blue-50 border-b border-blue-200 text-blue-800 text-xs">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtered by active admission: <span className="font-semibold ml-1">{effectiveAdmission}</span>
        </div>
      )}

      {/* Filters — same layout and styling as Admission page */}
      <div className="flex flex-wrap gap-3 mb-4 items-end px-4 pt-3 pb-2 border-b border-slate-200">
        {/* Discharge ID — searchable dropdown (link to Discharge) */}
        <div data-discharge-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Discharge ID</label>
          <input
            type="text"
            value={selectedDischargeIdOpt ? selectedDischargeIdOpt.value : dischargeIdQuery}
            onChange={(e) => {
              setDischargeIdQuery(e.target.value)
              setSelectedDischargeIdOpt(null)
              setDischargeIdFilter('')
              setDischargeIdOpen(true)
            }}
            onFocus={() => setDischargeIdOpen(true)}
            placeholder="Search discharge..."
            className={`${inputClass} w-44`}
          />
          {dischargeIdOpen && dischargeIdOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {dischargeIdOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleDischargeIdSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{opt.value}</div>
                  {opt.label !== opt.value && (
                    <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* IP Admission — searchable dropdown */}
        <div data-discharge-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">IP Admission</label>
          <input
            type="text"
            value={selectedAdmissionOpt ? selectedAdmissionOpt.value : admissionNoQuery}
            onChange={(e) => {
              setAdmissionNoQuery(e.target.value)
              setSelectedAdmissionOpt(null)
              setAdmissionFilter('')
              setAdmissionOpen(true)
            }}
            onFocus={() => setAdmissionOpen(true)}
            placeholder="Search admission..."
            className={`${inputClass} w-44`}
          />
          {admissionOpen && admissionOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {admissionOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleAdmissionSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{opt.value}</div>
                  {opt.label !== opt.value && (
                    <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Discharge Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">All</option>
            {dischargeTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {(dischargeIdFilter || admissionFilter || statusFilter || typeFilter) && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-3 py-2 text-sm text-slate-500 border border-slate-300 rounded-md hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Admission No
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharged By
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {filtered.map((discharge) => (
            <tr key={discharge.name} className="hover:bg-slate-50">
              <td
                className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                onClick={() => setDetailName(discharge.name)}
              >
                {discharge.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.patient_name || discharge.file_no || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.admission || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_date 
                  ? new Date(discharge.discharge_date).toLocaleString() 
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_type || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharged_by_user_name || discharge.discharged_by_user || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={getDocStatus(discharge.docstatus)}
                  color={statusColors[getDocStatus(discharge.docstatus)] || 'default'}
                />
              </td>
              <td className="px-4 py-2 align-middle">
                <PrintFormatDropdown
                  doctype="Discharge"
                  docName={discharge.name}
                  noLetterhead={0}
                  triggerPrint={1}
                />
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {detailName && (
        <DetailSlideOver
          title="Discharge"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Discharge" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}





