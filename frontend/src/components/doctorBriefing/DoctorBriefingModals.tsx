import { Beaker, Loader2, X } from 'lucide-react'
import type { DoctorBriefingLabTest, DoctorShiftBriefing } from '../../services/doctorBriefing'
import type { NurseBriefingAdmission } from '../../services/nurseBriefing'
import { NurseAdmissionsBriefingModal } from '../nurseBriefing/NurseBriefingModals'
import { StatusPill } from '../ui/StatusPill'
import { labTestStatusColor } from '../labTests/labTestDisplayUtils'

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
}: {
  labTests: DoctorBriefingLabTest[]
  loading?: boolean
  onClose: () => void
  onLabTestSelect?: (labTest: DoctorBriefingLabTest) => void
}) {
  return (
    <BriefingModalShell
      title="Lab Tests — Pending Review"
      subtitle="Results awaiting your review."
      onClose={onClose}
      closeLabel="Go to Doctor dashboard"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading lab tests…
        </div>
      ) : labTests.length === 0 ? (
        <EmptyState message="No lab tests pending review." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labTests.map((test) => (
            <button
              key={test.name}
              type="button"
              onClick={() => onLabTestSelect?.(test)}
              className={`rounded-lg border border-slate-200 p-4 text-left ${
                onLabTestSelect ? 'cursor-pointer hover:border-amber-300 hover:bg-amber-50/60' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <Beaker className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {test.lab_test_name || test.template || test.name}
                  </p>
                  <p className="text-xs text-slate-600">{test.patient_name || test.patient}</p>
                  <p className="mt-1 text-xs text-slate-500">{test.name}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill
                  status={test.status || 'Pending Review'}
                  color={labTestStatusColor(test.status)}
                />
                {test.department ? (
                  <span className="text-xs text-slate-500">{test.department}</span>
                ) : null}
              </div>
            </button>
          ))}
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
}: {
  step: DoctorBriefingStep | null
  briefing: DoctorShiftBriefing | null
  loading: boolean
  onAdvance: () => void
  onAdmissionSelect?: (admission: NurseBriefingAdmission) => void
  onLabTestSelect?: (labTest: DoctorBriefingLabTest) => void
}) {
  if (!step) return null

  if (step === 'admissions') {
    return (
      <NurseAdmissionsBriefingModal
        admissions={briefing?.active_admissions ?? []}
        loading={loading}
        onClose={onAdvance}
        onAdmissionSelect={onAdmissionSelect}
        closeLabel="Next: Pending lab review"
      />
    )
  }

  return (
    <DoctorLabReviewBriefingModal
      labTests={briefing?.pending_review_lab_tests ?? []}
      loading={loading}
      onClose={onAdvance}
      onLabTestSelect={onLabTestSelect}
    />
  )
}
