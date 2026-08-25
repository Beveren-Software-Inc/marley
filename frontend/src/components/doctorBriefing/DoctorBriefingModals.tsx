import { useMemo } from 'react'
import { Beaker, Loader2, X } from 'lucide-react'
import type { DoctorBriefingLabTest, DoctorShiftBriefing } from '../../services/doctorBriefing'
import type { NurseBriefingAdmission } from '../../services/nurseBriefing'
import { NurseAdmissionsBriefingModal } from '../nurseBriefing/NurseBriefingModals'
import { labBriefingChildPreview, labBriefingDisplayRows, labBriefingPatientGroups, labBriefingTestLabel } from '../../utils/labBriefingGroups'

function BriefingModalShell({
  title,
  subtitle,
  onClose,
  children,
  closeLabel = 'Continue',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  closeLabel?: string
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
      <div
        data-healthcare-modal
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white text-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
      {message}
    </div>
  )
}

export function DoctorLabReviewBriefingModal({
  labTests,
  loading,
  onClose,
  onLabTestSelect,
  closeLabel = 'Go to Doctor dashboard',
}: {
  labTests: DoctorBriefingLabTest[]
  loading?: boolean
  onClose: () => void
  onLabTestSelect?: (labTest: DoctorBriefingLabTest) => void
  closeLabel?: string
}) {
  const patients = useMemo(() => labBriefingPatientGroups(labTests), [labTests])

  return (
    <BriefingModalShell
      title="Lab Tests — Pending Review"
      subtitle="Pending review grouped by patient. Open a test to review it."
      onClose={onClose}
      closeLabel={closeLabel}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading lab tests…
        </div>
      ) : labTests.length === 0 ? (
        <EmptyState message="No lab tests pending review." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {patients.map((group) => {
            const rows = labBriefingDisplayRows(group.tests)
            return (
              <div
                key={group.patient}
                className="rounded-lg border border-emerald-300/80 bg-emerald-50/35 p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold tracking-tight text-slate-900">
                      {group.patientName}
                    </p>
                    <p className="text-[11px] text-emerald-800/70">
                      {group.tests.length} test{group.tests.length === 1 ? '' : 's'} pending
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      group.isIp ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {group.isIp ? 'IP' : 'OP'}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {rows.map((row) => {
                    if (row.kind === 'group') {
                      const { representative, tests, label, key } = row
                      const preview = labBriefingChildPreview(tests, 2)
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onLabTestSelect?.(representative)}
                          className={`w-full rounded-md border border-white/80 bg-white/70 px-2 py-1.5 text-left ${
                            onLabTestSelect ? 'cursor-pointer hover:border-emerald-400 hover:bg-white' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Beaker className="h-3 w-3 shrink-0 text-emerald-700/80" />
                            <span className="inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
                              Group
                            </span>
                            <p className="min-w-0 truncate text-[11px] font-medium text-slate-600" title={label}>
                              {label}
                            </p>
                            <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                              {tests.length}
                            </span>
                          </div>
                          {preview ? (
                            <p className="mt-0.5 truncate pl-5 text-[10px] text-slate-400" title={preview}>
                              {preview}
                            </p>
                          ) : null}
                        </button>
                      )
                    }

                    const test = row.test
                    const testLabel = labBriefingTestLabel(test)
                    return (
                      <button
                        key={test.name}
                        type="button"
                        onClick={() => onLabTestSelect?.(test)}
                        className={`w-full rounded-md border border-white/80 bg-white/70 px-2 py-1.5 text-left ${
                          onLabTestSelect ? 'cursor-pointer hover:border-emerald-400 hover:bg-white' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Beaker className="h-3 w-3 shrink-0 text-emerald-700/80" />
                          <p className="min-w-0 truncate text-[11px] font-medium text-slate-600" title={testLabel}>
                            {testLabel}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </BriefingModalShell>
  )
}

export type DoctorBriefingStep = 'admissions' | 'lab_tests'

export function DoctorBriefingModals({
  step,
  briefing,
  loading,
  onAdvance,
  onAdmissionSelect,
  onLabTestSelect,
  admissionsOnly = false,
  labsOnly = false,
}: {
  step: DoctorBriefingStep | null
  briefing: DoctorShiftBriefing | null
  loading: boolean
  onAdvance: () => void
  onAdmissionSelect?: (admission: NurseBriefingAdmission) => void
  onLabTestSelect?: (labTest: DoctorBriefingLabTest) => void
  admissionsOnly?: boolean
  labsOnly?: boolean
}) {
  if (!step) return null

  if (step === 'admissions') {
    return (
      <NurseAdmissionsBriefingModal
        admissions={briefing?.active_admissions ?? []}
        loading={loading}
        onClose={onAdvance}
        onAdmissionSelect={onAdmissionSelect}
        closeLabel={admissionsOnly ? 'Close' : 'Next: Pending lab review'}
        subtitle="Warnings and allergies for admitted patients across all branches."
        emptyMessage="No admitted patients with allergies or clinical warnings."
      />
    )
  }

  return (
    <DoctorLabReviewBriefingModal
      labTests={briefing?.pending_review_lab_tests ?? []}
      loading={loading}
      onClose={onAdvance}
      onLabTestSelect={onLabTestSelect}
      closeLabel={labsOnly ? 'Close' : 'Go to Doctor dashboard'}
    />
  )
}
