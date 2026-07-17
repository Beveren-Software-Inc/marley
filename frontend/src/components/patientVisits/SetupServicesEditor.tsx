import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  getHealthcareServiceTemplates,
  type HealthcareServiceTemplateOption,
} from '../../services/sessionSchedule'
import { MODAL_FIELD_CLASS, MODAL_LABEL_CLASS } from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'

export interface DailyPatientVisitSetupServiceLine {
  name?: string
  session: string
  amount: number
}

interface SetupServicesEditorProps {
  services: DailyPatientVisitSetupServiceLine[]
  onChange: (services: DailyPatientVisitSetupServiceLine[]) => void
}

const emptyLine = (): DailyPatientVisitSetupServiceLine => ({ session: '', amount: 0 })

function formatBhd(amount: number): string {
  return (Number(amount) || 0).toFixed(3)
}

function ServiceTemplateCombobox({
  value,
  onSelect,
}: {
  value: string
  onSelect: (template: HealthcareServiceTemplateOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<HealthcareServiceTemplateOption[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) {
      setQuery('')
      return
    }
    const match = options.find((t) => t.name === value)
    if (match) {
      setQuery(match.service_name || match.name)
      return
    }
    // Resolve label for an already-saved value
    getHealthcareServiceTemplates(value, 20)
      .then((list) => {
        const found = list.find((t) => t.name === value)
        setQuery(found?.service_name || found?.name || value)
      })
      .catch(() => setQuery(value))
  }, [value])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      getHealthcareServiceTemplates(query || undefined, 100)
        .then((list) => {
          if (!cancelled) setOptions(list)
        })
        .catch(() => {
          if (!cancelled) setOptions([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, query.trim() ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search any service template..."
        className={linkComboboxInputClass}
        autoComplete="off"
      />
      {open && (
        <div className={linkComboboxDropdownClassShort}>
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No templates found</div>
          ) : (
            options.map((t) => (
              <button
                key={t.name}
                type="button"
                className={linkComboboxOptionClass}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(t)
                  setQuery(t.service_name || t.name)
                  setOpen(false)
                }}
              >
                <span className="block truncate">{t.service_name || t.name}</span>
                {t.service_name && t.service_name !== t.name ? (
                  <span className="block truncate text-[11px] text-slate-500">{t.name}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function SetupServicesEditor({ services, onChange }: SetupServicesEditorProps) {
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
          <div
            key={line.name || `service-${index}`}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2 items-end"
          >
            <div>
              {index === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">
                  Service template
                </span>
              ) : null}
              <ServiceTemplateCombobox
                value={line.session || ''}
                onSelect={(template) => {
                  const patch: Partial<DailyPatientVisitSetupServiceLine> = {
                    session: template.name,
                  }
                  if (!line.amount && template.rate != null && Number(template.rate) > 0) {
                    patch.amount = Number(template.rate)
                  }
                  updateLine(index, patch)
                }}
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
                placeholder="0.000"
                min={0}
                step="0.001"
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
        Total: {formatBhd(total)}
      </div>
    </div>
  )
}
