// components/suicidal/SuicidalAssessmentList.tsx
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fetchSuicidalAssessments, type SuicidalAssessment } from '../../services/suicidalAssessment'
import { useCareContext } from '../../providers/CareContextProvider'
import { Plus, Eye, FileText, AlertTriangle } from 'lucide-react'
import { StatusPill } from '../ui/StatusPill'
import { SuicidalPatientAssessmentDetailPanel } from './SuicidalPatientAssessmentDetailPanel'

interface SuicidalAssessmentListProps {
  patient?: string
  admission?: string
  onAddNew?: () => void
  onPatientClick?: (patient: string) => void
}

export const SuicidalAssessmentList = ({
  patient,
  admission,
  onAddNew,
  onPatientClick,
}: SuicidalAssessmentListProps) => {
  const { selectedPatient: contextPatient, mode, activeAdmission } = useCareContext()
  const [assessments, setAssessments] = useState<SuicidalAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<SuicidalAssessment | undefined>(undefined)

  const effectivePatient = patient ?? contextPatient
  const effectiveAdmission = mode === 'IP' && activeAdmission ? activeAdmission : admission

  useEffect(() => {
    const loadAssessments = async () => {
      if (!effectivePatient && !effectiveAdmission) {
        setAssessments([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const response = await fetchSuicidalAssessments(effectivePatient, effectiveAdmission)
        setAssessments(response)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch assessments')
      } finally {
        setLoading(false)
      }
    }

    loadAssessments()
  }, [effectivePatient, effectiveAdmission])

  const handleView = (assessment: SuicidalAssessment) => {
    setDetailRow(assessment)
    setDetailName(assessment.name)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  const getRiskIndicator = (assessment: SuicidalAssessment) => {
    if (assessment.active_suicidal_thoughts_plans === 'Yes') {
      return { color: 'danger', text: 'Active Suicidal Thoughts' }
    }
    if (assessment.overwhelmed_thoughts_harming === 'Yes') {
      return { color: 'warning', text: 'Has Thoughts' }
    }
    return { color: 'success', text: 'No Active Thoughts' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Loading assessments...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Suicidal Patient Assessments</h3>
          </div>
          {onAddNew && (
            <button
              onClick={onAddNew}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Assessment
            </button>
          )}
        </div>

        {assessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-slate-400">
            <FileText className="w-12 h-12 mb-2 opacity-30" />
            <p className="text-sm">No suicidal assessments found</p>
            {onAddNew && (
              <button onClick={onAddNew} className="mt-3 text-sm text-primary hover:underline">
                Create first assessment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Assessment Date
                  </th>
                  {!patient && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Patient
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Admission No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Assessed By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Suicidal Thoughts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Current Plan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Previous Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Risk Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[80px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {assessments.map((assessment) => {
                  const risk = getRiskIndicator(assessment)
                  return (
                    <tr
                      key={assessment.name}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleView(assessment)}
                    >
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleView(assessment)
                          }}
                          className="font-medium text-primary hover:underline whitespace-nowrap"
                        >
                          {assessment.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleView(assessment)
                          }}
                          className="font-medium text-primary hover:underline"
                          title="View assessment details"
                        >
                          {formatDate(assessment.assessment_date)}
                        </button>
                      </td>
                      {!patient && (
                        <td
                          className="px-4 py-3 text-sm cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            assessment.patient && onPatientClick?.(assessment.patient)
                          }}
                        >
                          <span className="font-medium text-primary hover:underline">
                            {assessment.patient_name || assessment.patient}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-slate-700">{assessment.admission_no || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {assessment.assessed_by_name || assessment.assessed_by || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {assessment.overwhelmed_thoughts_harming === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Yes
                          </span>
                        ) : assessment.overwhelmed_thoughts_harming === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            No
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {assessment.made_current_plans === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            Has Plan
                          </span>
                        ) : assessment.made_current_plans === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            No Plan
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {assessment.previous_attempts === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                            Yes
                          </span>
                        ) : assessment.previous_attempts === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            No
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={risk.text} color={risk.color} />
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleView(assessment)}
                          className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailName &&
        typeof document !== 'undefined' &&
        createPortal(
          <SuicidalPatientAssessmentDetailPanel
            name={detailName}
            preview={detailRow}
            onClose={() => {
              setDetailName(null)
              setDetailRow(undefined)
            }}
            onPatientClick={onPatientClick}
          />,
          document.body
        )}
    </>
  )
}
