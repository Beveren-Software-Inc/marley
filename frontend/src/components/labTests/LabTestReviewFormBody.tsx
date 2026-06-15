import type { ReactNode } from 'react'
import type { DoctorReviewFormOptions } from '../../services/labTests'
import { linkComboboxInputClassCompact } from '../ui/linkComboboxStyles'
import type { ReviewFormValues } from './labTestReviewUtils'

const fieldClass = linkComboboxInputClassCompact

const checkboxClass =
  'mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/25'

const radioClass =
  'mt-1 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/25'

export interface LabTestReviewFormBodyProps {
  options: DoctorReviewFormOptions | null
  values: ReviewFormValues
  onChange: (patch: Partial<ReviewFormValues>) => void
  onToggleFollowUp: (action: string) => void
  meta?: ReactNode
}

export const LabTestReviewFormBody = ({
  options,
  values,
  onChange,
  onToggleFollowUp,
  meta,
}: LabTestReviewFormBodyProps) => (
  <>
    {meta}

    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
      <select
        className={fieldClass}
        value={values.reportType}
        onChange={(e) => onChange({ reportType: e.target.value })}
      >
        {(options?.report_types || ['Pathology']).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>

    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">Result indicator</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(options?.result_indicators || []).map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/60"
          >
            <input
              type="radio"
              name="result_indicator"
              className={radioClass}
              checked={values.resultIndicator === opt}
              onChange={() => onChange({ resultIndicator: opt })}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>

    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">Follow-up action</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(options?.follow_up_actions || []).map((action) => (
          <label
            key={action}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/60"
          >
            <input
              type="checkbox"
              className={checkboxClass}
              checked={values.followUps.has(action)}
              onChange={() => onToggleFollowUp(action)}
            />
            <span>{action}</span>
          </label>
        ))}
      </div>
      {values.followUps.has('Other') && (
        <input
          type="text"
          className={`${fieldClass} mt-2`}
          placeholder="Describe other action…"
          value={values.followUpOther}
          onChange={(e) => onChange({ followUpOther: e.target.value })}
        />
      )}
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Comments / patient message
      </label>
      <textarea
        className={`${fieldClass} min-h-[80px] resize-y`}
        value={values.comments}
        onChange={(e) => onChange({ comments: e.target.value })}
        rows={3}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Message for patient&apos;s next prescription
      </label>
      <textarea
        className={`${fieldClass} min-h-[60px] resize-y`}
        value={values.prescriptionMessage}
        onChange={(e) => onChange({ prescriptionMessage: e.target.value })}
        rows={2}
      />
    </div>

    <div className="flex flex-wrap gap-4 rounded-xl border border-emerald-100/80 bg-white/60 px-4 py-3 text-sm">
      <label className="flex cursor-pointer items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={values.patientInformed}
          onChange={(e) => onChange({ patientInformed: e.target.checked })}
        />
        Patient to be informed of this report
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={values.archiveReport}
          onChange={(e) => onChange({ archiveReport: e.target.checked })}
        />
        Archive report
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={values.createTask}
          onChange={(e) => onChange({ createTask: e.target.checked })}
        />
        Create a task
      </label>
    </div>
  </>
)
