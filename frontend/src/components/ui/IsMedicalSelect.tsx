/** Category for Material Request.custom_is_medical: Medical (1) or Consumable (0) */

export type IsMedicalChoice = '' | '1' | '0'

interface IsMedicalSelectProps {
  value: IsMedicalChoice
  onChange: (value: IsMedicalChoice) => void
  className?: string
  compact?: boolean
}

export function IsMedicalSelect({ value, onChange, className = '', compact = false }: IsMedicalSelectProps) {
  return (
    <div className={className}>
      <label className={`block font-medium text-slate-700 ${compact ? 'text-xs mb-1' : 'text-sm mb-1'}`}>
        Category <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange('1')}
          className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            value === '1'
              ? 'border-primary bg-primary text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Medical
        </button>
        <button
          type="button"
          onClick={() => onChange('0')}
          className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            value === '0'
              ? 'border-primary bg-primary text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Consumable
        </button>
      </div>
    </div>
  )
}

export function isMedicalChoiceRequired(value: IsMedicalChoice): boolean {
  return value === '1' || value === '0'
}

export function isMedicalPayload(value: IsMedicalChoice): 0 | 1 {
  return value === '1' ? 1 : 0
}
