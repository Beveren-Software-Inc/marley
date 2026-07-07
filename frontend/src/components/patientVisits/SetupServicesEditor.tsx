import { Plus, Trash2 } from 'lucide-react'
import { fetchIOPSessionTypes, type IOPSessionType } from '../../services/iop'
import { IOPSessionTypeSelect } from '../ui/IOPSessionTypeSelect'
import { MODAL_FIELD_CLASS, MODAL_LABEL_CLASS } from '../ui/CreateModalChrome'
import { useEffect, useState } from 'react'

export interface DailyPatientVisitSetupServiceLine {
  name?: string
  session: string
  amount: number
}

interface SetupServicesEditorProps {
  services: DailyPatientVisitSetupServiceLine[]
  onChange: (services: DailyPatientVisitSetupServiceLine[]) => void
  sessionTypes?: IOPSessionType[]
  onSessionTypesUpdated?: (types: IOPSessionType[]) => void
}

const emptyLine = (): DailyPatientVisitSetupServiceLine => ({ session: '', amount: 0 })

export function SetupServicesEditor({
  services,
  onChange,
  sessionTypes: sessionTypesProp,
  onSessionTypesUpdated,
}: SetupServicesEditorProps) {
  const [sessionTypes, setSessionTypes] = useState<IOPSessionType[]>(sessionTypesProp || [])

  useEffect(() => {
    if (sessionTypesProp) {
      setSessionTypes(sessionTypesProp)
      return
    }
    fetchIOPSessionTypes().then(setSessionTypes).catch(() => setSessionTypes([]))
  }, [sessionTypesProp])

  const handleTypesUpdated = (types: IOPSessionType[]) => {
    setSessionTypes(types)
    onSessionTypesUpdated?.(types)
  }

  const lines = services.length ? services : [emptyLine()]
  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)

  const updateLine = (index: number, patch: Partial<DailyPatientVisitSetupServiceLine>) => {
    const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line))
    onChange(next)
  }

  const addLine = () => onChange([...lines, emptyLine()])

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index)
    onChange(next.length ? next : [emptyLine()])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className={MODAL_LABEL_CLASS}>Services</label>
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add service
        </button>
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={line.name || `service-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2 items-end">
            <div>
              {index === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">
                  Session
                </span>
              ) : null}
              <IOPSessionTypeSelect
                value={line.session || ''}
                onChange={(value) => updateLine(index, { session: value })}
                types={sessionTypes}
                onTypesUpdated={handleTypesUpdated}
                placeholder="Search session type..."
              />
            </div>
            <div>
              {index === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">
                  Amount
                </span>
              ) : null}
              <input
                type="number"
                value={line.amount || 0}
                onChange={(e) => updateLine(index, { amount: Number(e.target.value) || 0 })}
                placeholder="0.00"
                min={0}
                step="0.01"
                className={MODAL_FIELD_CLASS}
              />
            </div>
            <button
              type="button"
              onClick={() => removeLine(index)}
              disabled={lines.length <= 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              title="Remove service"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end text-sm font-medium text-emerald-950">
        Total: {total.toFixed(2)}
      </div>
    </div>
  )
}
