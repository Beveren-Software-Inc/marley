import type { PatientMedicalHistory } from '../../services/patients'
import { ILLNESS_FIELDS, yesNoBadgeClass } from './pastMedicalHistoryUtils'

interface Props {
  history: PatientMedicalHistory
}

function YesNoBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-400">—</span>
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${yesNoBadgeClass(value)}`}
    >
      {value}
    </span>
  )
}

function TextBlock({ label, text }: { label: string; text?: string }) {
  if (!text?.trim()) return null
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>
      <p className="text-sm text-slate-800 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

export function PastMedicalHistoryDisplay({ history }: Props) {
  const hasIllness = ILLNESS_FIELDS.some(({ key }) => history[key])
  const hasStructured =
    hasIllness ||
    history.other_ongoing_illness?.trim() ||
    history.previous_surgical_history?.trim() ||
    history.current_and_past_medications?.trim() ||
    history.allergies?.trim() ||
    history.social_history?.trim() ||
    history.addiction ||
    history.smoking

  if (!hasStructured) return null

  return (
    <div className="space-y-5 px-5 py-4">
      {(hasIllness || history.other_ongoing_illness?.trim()) && (
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Previous and ongoing illness
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {ILLNESS_FIELDS.map(({ key, label }) =>
              history[key] ? (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 border ${
                    history[key] === 'Yes'
                      ? 'border-green-200 bg-green-50/80'
                      : 'border-slate-100 bg-slate-50/50'
                  }`}
                >
                  <span className="text-xs font-medium text-slate-700">{label}</span>
                  <YesNoBadge value={history[key]} />
                </div>
              ) : null
            )}
          </div>
          <TextBlock label="Other illness" text={history.other_ongoing_illness} />
        </section>
      )}

      <TextBlock label="Previous surgical history" text={history.previous_surgical_history} />
      <TextBlock label="Current and past medications" text={history.current_and_past_medications} />
      {history.allergies?.trim() && (
        <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800 mb-1">Allergies</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{history.allergies}</p>
        </div>
      )}
      {(history.social_history?.trim() || history.addiction || history.smoking) && (
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Social history
          </h4>
          <TextBlock label="" text={history.social_history} />
          <div className="flex flex-wrap gap-2 mt-2">
            {history.addiction ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                Addiction
              </span>
            ) : null}
            {history.smoking ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                Smoking
              </span>
            ) : null}
          </div>
        </section>
      )}
    </div>
  )
}
