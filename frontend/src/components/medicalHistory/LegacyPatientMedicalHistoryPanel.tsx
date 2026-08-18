import { useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import type { PatientLegacyMedicalHistory } from '../../services/patients'

export function hasLegacyPatientHistory(
  legacy?: PatientLegacyMedicalHistory | null
): legacy is PatientLegacyMedicalHistory {
  return Boolean(legacy?.has_data && (legacy.entries?.length || 0) > 0)
}

export function LegacyPatientMedicalHistoryPanel({
  legacy,
  compact = false,
  defaultOpen = true,
}: {
  legacy?: PatientLegacyMedicalHistory | null
  compact?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!hasLegacyPatientHistory(legacy)) return null

  return (
    <div
      className={`border-b ${
        compact ? 'border-amber-100 bg-amber-50/40' : 'border-amber-200 bg-amber-50/50'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
          <span className="text-xs font-semibold text-amber-900">Legacy History</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-amber-700 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {legacy.entries.map((entry) => (
            <div key={entry.key}>
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                {entry.label}
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
