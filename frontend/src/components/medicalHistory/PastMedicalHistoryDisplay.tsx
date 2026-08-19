import type { PatientMedicalHistory } from '../../services/patients'
import { ILLNESS_FIELDS, illnessIsChecked } from './pastMedicalHistoryUtils'

interface Props {
  history: PatientMedicalHistory
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
  const illnessChecked = ILLNESS_FIELDS.filter(({ key }) => illnessIsChecked(history[key]))
  const hasStructured =
    illnessChecked.length > 0 ||
    history.other_ongoing_illness?.trim() ||
    history.previous_surgical_history?.trim() ||
    history.current_and_past_medications?.trim() ||
    history.no_known_allergies ||
    history.allergies?.trim() ||
    history.family_history?.trim() ||
    history.addiction ||
    history.smoking

  if (!hasStructured) return null

  return (
    <div className="space-y-5 px-5 py-4">
      {(illnessChecked.length > 0 || history.other_ongoing_illness?.trim()) && (
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Previous and ongoing illness
          </h4>
          {illnessChecked.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 mb-2">
              {illnessChecked.map(({ key, label }) => (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50/80 px-2.5 py-2 text-xs font-medium text-slate-800"
                >
                  <span className="text-green-700" aria-hidden>
                    ✓
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          )}
          <TextBlock label="Other illness" text={history.other_ongoing_illness} />
        </section>
      )}

      <TextBlock label="Previous surgical history" text={history.previous_surgical_history} />
      <TextBlock label="Current and past medications" text={history.current_and_past_medications} />

      {history.no_known_allergies ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-600 mb-0.5">Allergies</p>
          <p className="text-sm text-slate-700">No known allergies</p>
        </div>
      ) : history.allergies?.trim() ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800 mb-1">Allergies</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{history.allergies}</p>
        </div>
      ) : null}

      <TextBlock label="Family history" text={history.family_history} />

      {(history.addiction || history.smoking) && (
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Lifestyle
          </h4>
          <div className="flex flex-wrap gap-2">
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
