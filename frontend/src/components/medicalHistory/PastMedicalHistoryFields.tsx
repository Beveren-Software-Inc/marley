import type { PastMedicalHistoryFormFields } from './pastMedicalHistoryUtils'
import { ILLNESS_FIELDS } from './pastMedicalHistoryUtils'

interface Props {
  value: PastMedicalHistoryFormFields
  onChange: (next: PastMedicalHistoryFormFields) => void
  disabled?: boolean
}

const yesNoSelectClass =
  'rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary'
const textAreaClass =
  'w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm min-h-[72px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30'

export function PastMedicalHistoryFields({ value, onChange, disabled }: Props) {
  const set = <K extends keyof PastMedicalHistoryFormFields>(
    key: K,
    fieldValue: PastMedicalHistoryFormFields[K]
  ) => {
    onChange({ ...value, [key]: fieldValue })
  }

  return (
    <div className="space-y-5">
      <section>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Previous and ongoing illness
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ILLNESS_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <select
                className={`w-full ${yesNoSelectClass}`}
                value={value[key] || ''}
                disabled={disabled}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">—</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Other illness</label>
          <textarea
            className={textAreaClass}
            rows={2}
            disabled={disabled}
            value={value.other_ongoing_illness || ''}
            onChange={(e) => set('other_ongoing_illness', e.target.value)}
            placeholder="Any other previous or ongoing illness"
          />
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Previous surgical history
        </h4>
        <textarea
          className={textAreaClass}
          rows={3}
          disabled={disabled}
          value={value.previous_surgical_history || ''}
          onChange={(e) => set('previous_surgical_history', e.target.value)}
          placeholder="Previous operations and procedures"
        />
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Current and past medications
        </h4>
        <textarea
          className={textAreaClass}
          rows={3}
          disabled={disabled}
          value={value.current_and_past_medications || ''}
          onChange={(e) => set('current_and_past_medications', e.target.value)}
          placeholder="Medications (current and past)"
        />
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Allergies
        </h4>
        <textarea
          className={textAreaClass}
          rows={2}
          disabled={disabled}
          value={value.allergies || ''}
          onChange={(e) => set('allergies', e.target.value)}
          placeholder="Known allergies"
        />
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Social history
        </h4>
        <textarea
          className={textAreaClass}
          rows={3}
          disabled={disabled}
          value={value.social_history || ''}
          onChange={(e) => set('social_history', e.target.value)}
          placeholder="Social history notes"
        />
        <div className="flex flex-wrap gap-6 mt-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-primary focus:ring-primary"
              checked={!!value.addiction}
              disabled={disabled}
              onChange={(e) => set('addiction', e.target.checked ? 1 : 0)}
            />
            <span>Addiction</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-primary focus:ring-primary"
              checked={!!value.smoking}
              disabled={disabled}
              onChange={(e) => set('smoking', e.target.checked ? 1 : 0)}
            />
            <span>Smoking</span>
          </label>
        </div>
      </section>
    </div>
  )
}
