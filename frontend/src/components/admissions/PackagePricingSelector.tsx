import type { RoomPricingMode } from '../../services/inpatientRecords'

export function PackagePricingSelector({ modes, value, onChange, disabled = false }: {
  modes: RoomPricingMode[]; value?: RoomPricingMode; onChange: (mode: RoomPricingMode) => void; disabled?: boolean
}) {
  return <label className="block text-sm font-medium text-slate-700 mb-3">
    Package Pricing
    <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value as RoomPricingMode)}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
      {modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
    </select>
  </label>
}
