import { useEffect, useState } from 'react'
import {
  fetchDoctorMedicationPlans,
  type DoctorMedicationPlanRow,
} from '../../services/doctorMedicationPlan'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCareContext } from '../../providers/CareContextProvider'
import { EditDoctorMedicationPlanModal } from './EditDoctorMedicationPlanModal'

const stripHtml = (html: string): string => {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

interface DoctorMedicationPlanListProps {
  patient?: string
  onPatientClick?: (patient: string) => void
}

export const DoctorMedicationPlanList = ({ patient, onPatientClick }: DoctorMedicationPlanListProps) => {
  const { mode, activeVisit } = useCareContext()
  const [rows, setRows] = useState<DoctorMedicationPlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [editPlanName, setEditPlanName] = useState<string | null>(null)
  const [listRefreshTick, setListRefreshTick] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        let referenceDoctype: string | undefined
        let referenceDocument: string | undefined
        if (mode === 'OP' && activeVisit) {
          referenceDoctype = 'Patient Visit'
          referenceDocument = activeVisit
        }
        const data = await fetchDoctorMedicationPlans(
          50,
          0,
          patient,
          referenceDoctype,
          referenceDocument
        )
        setRows(data)
      } catch (err) {
        console.error('Error loading doctor medication plans:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch medication plans'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, mode, activeVisit, listRefreshTick])

  const contextLabel =
    mode === 'OP' && activeVisit
      ? `Showing plans for OP visit: ${activeVisit}`
      : null

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading medication plans...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Medication Plans</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-slate-500 text-center">
          {contextLabel && <p className="text-sm text-slate-600 mb-2">{contextLabel}</p>}
          <p>No doctor medication plans found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      {contextLabel && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          {contextLabel}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Date
              </th>
              {!patient && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Practitioner
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Medical Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Visit
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Plan
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50">
                <td
                  className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                  onClick={() => setDetailName(row.name)}
                >
                  <span className="text-primary hover:underline">
                    {row.posting_date ? new Date(row.posting_date).toLocaleString() : '-'}
                  </span>
                </td>
                {!patient && (
                  <td
                    className="px-4 py-3 text-sm cursor-pointer"
                    onClick={() => row.patient && onPatientClick?.(row.patient)}
                  >
                    <span className="font-medium text-primary hover:underline">{row.patient || '-'}</span>
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-slate-700">{row.practitioner || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.medical_role || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-700 max-w-[140px] truncate">
                  {row.reference_document || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 max-w-md">
                  <div className="truncate" title={row.plan ? stripHtml(row.plan) : ''}>
                    {row.plan
                      ? (() => {
                          const t = stripHtml(row.plan)
                          return t.length > 100 ? `${t.substring(0, 100)}...` : t
                        })()
                      : '-'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 text-center whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-2">
                    <button
                      type="button"
                      title="Edit plan"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditPlanName(row.name)
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <PrintFormatDropdown
                      doctype="Doctor Medication Plan"
                      docName={row.name}
                      noLetterhead={0}
                      triggerPrint={1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editPlanName && (
        <EditDoctorMedicationPlanModal
          planName={editPlanName}
          onClose={() => setEditPlanName(null)}
          onSuccess={() => {
            setListRefreshTick((t) => t + 1)
          }}
        />
      )}

      {detailName && (
        <DetailSlideOver
          title="Doctor Medication Plan"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Doctor Medication Plan" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}
