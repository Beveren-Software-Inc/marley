import type { ReactNode } from 'react'
import { AlertTriangle, Beaker, Loader2, Package, X } from 'lucide-react'
import type {
  NurseBriefingAdmission,
  NurseBriefingLabTest,
  NurseBriefingLowStockItem,
  NurseShiftBriefing,
} from '../../services/nurseBriefing'
import { StatusPill } from '../ui/StatusPill'
import { labTestStatusColor } from '../labTests/labTestDisplayUtils'

function stripHtml(html: string | undefined): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ')
}

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
  children: ReactNode
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

export function NurseAdmissionsBriefingModal({
  admissions,
  loading,
  onClose,
  onAdmissionSelect,
  closeLabel = 'Next: Lab sample collection',
}: {
  admissions: NurseBriefingAdmission[]
  loading?: boolean
  onClose: () => void
  onAdmissionSelect?: (admission: NurseBriefingAdmission) => void
  closeLabel?: string
}) {
  return (
    <BriefingModalShell
      title="Active Inpatient Admissions"
      subtitle="Review admitted patients, warnings, and allergies before starting your shift."
      onClose={onClose}
      closeLabel={closeLabel}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading admissions…
        </div>
      ) : admissions.length === 0 ? (
        <EmptyState message="No admitted patients with warnings for your branch." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {admissions.map((admission) => {
            const warnings = admission.warnings ?? []
            const hasAllergies = Boolean((admission.allergy_summary || '').trim())
            const hasWarnings = warnings.length > 0
            return (
              <button
                key={admission.name}
                type="button"
                onClick={() => onAdmissionSelect?.(admission)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  onAdmissionSelect
                    ? 'border-slate-200 hover:border-primary/40 hover:bg-primary/5 cursor-pointer'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {admission.patient_name || admission.patient}
                    </p>
                    <p className="text-xs text-slate-500">{admission.name}</p>
                  </div>
                  <StatusPill status={admission.status || 'Admitted'} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  {admission.bed ? <span>Bed: {admission.bed}</span> : null}
                  {admission.medical_department ? (
                    <span>Dept: {admission.medical_department}</span>
                  ) : null}
                  {admission.primary_practitioner_name ? (
                    <span>Dr: {admission.primary_practitioner_name}</span>
                  ) : null}
                </div>
                {(hasAllergies || hasWarnings) && (
                  <div className="mt-3 space-y-2">
                    {hasAllergies ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Allergies
                        </div>
                        <p className="mt-1 text-xs text-amber-800">{admission.allergy_summary}</p>
                      </div>
                    ) : null}
                    {hasWarnings ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-900">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Warnings ({warnings.length})
                        </div>
                        <ul className="mt-1 space-y-1">
                          {warnings.slice(0, 3).map((warning) => (
                            <li key={warning.name} className="text-xs text-red-800 line-clamp-2">
                              {stripHtml(warning.high_risk_text || warning.warning) || warning.name}
                            </li>
                          ))}
                          {warnings.length > 3 ? (
                            <li className="text-xs font-medium text-red-700">
                              +{warnings.length - 3} more
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </BriefingModalShell>
  )
}

export function NurseLabSampleBriefingModal({
  labTests,
  loading,
  onClose,
  onLabTestSelect,
}: {
  labTests: NurseBriefingLabTest[]
  loading?: boolean
  onClose: () => void
  onLabTestSelect?: (labTest: NurseBriefingLabTest) => void
}) {
  return (
    <BriefingModalShell
      title="Lab Tests — Sample Collection"
      subtitle="Requested tests that need sample collection."
      onClose={onClose}
      closeLabel="Next: Low stock"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading lab tests…
        </div>
      ) : labTests.length === 0 ? (
        <EmptyState message="No lab tests pending sample collection." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labTests.map((test) => (
            <button
              key={test.name}
              type="button"
              onClick={() => onLabTestSelect?.(test)}
              className={`rounded-lg border border-slate-200 p-4 text-left ${
                onLabTestSelect ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/60' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <Beaker className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {test.lab_test_name || test.template || test.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    {test.patient_name || test.patient}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{test.name}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill
                  status={test.status || 'Requested'}
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

export function NurseLowStockBriefingModal({
  items,
  loading,
  onClose,
}: {
  items: NurseBriefingLowStockItem[]
  loading?: boolean
  onClose: () => void
}) {
  return (
    <BriefingModalShell
      title="Nursing Inventory — Low Stock"
      subtitle="Items at or below reorder level in the nursing warehouse."
      onClose={onClose}
      closeLabel="Go to Nursing dashboard"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading stock levels…
        </div>
      ) : items.length === 0 ? (
        <EmptyState message="No low-stock items in the nursing inventory." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isOut = item.status === 'out_of_stock'
            return (
              <div
                key={item.item_code}
                className={`rounded-lg border p-4 ${
                  isOut
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Package
                    className={`mt-0.5 h-4 w-4 shrink-0 ${isOut ? 'text-red-600' : 'text-amber-600'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {item.item_name || item.item_code}
                    </p>
                    <p className="text-xs text-slate-500">{item.item_code}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span
                    className={`font-semibold ${isOut ? 'text-red-700' : 'text-amber-800'}`}
                  >
                    {isOut ? 'Out of stock' : 'Low stock'}
                  </span>
                  <span className="text-slate-700">
                    {item.current_stock}
                    {item.uom ? ` ${item.uom}` : ''}
                    <span className="text-slate-400"> / min {item.reorder_level}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </BriefingModalShell>
  )
}

export type NurseBriefingStep = 'admissions' | 'lab_tests' | 'low_stock'

export function NurseBriefingModals({
  step,
  briefing,
  loading,
  onAdvance,
  onAdmissionSelect,
  onLabTestSelect,
}: {
  step: NurseBriefingStep | null
  briefing: NurseShiftBriefing | null
  loading: boolean
  onAdvance: () => void
  onAdmissionSelect?: (admission: NurseBriefingAdmission) => void
  onLabTestSelect?: (labTest: NurseBriefingLabTest) => void
}) {
  if (!step) return null

  if (step === 'admissions') {
    return (
      <NurseAdmissionsBriefingModal
        admissions={briefing?.active_admissions ?? []}
        loading={loading}
        onClose={onAdvance}
        onAdmissionSelect={onAdmissionSelect}
      />
    )
  }

  if (step === 'lab_tests') {
    return (
      <NurseLabSampleBriefingModal
        labTests={briefing?.pending_sample_lab_tests ?? []}
        loading={loading}
        onClose={onAdvance}
        onLabTestSelect={onLabTestSelect}
      />
    )
  }

  return (
    <NurseLowStockBriefingModal
      items={briefing?.low_stock_items ?? []}
      loading={loading}
      onClose={onAdvance}
    />
  )
}
