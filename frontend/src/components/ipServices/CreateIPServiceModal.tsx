import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import {
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import {
  createIPService,
  fetchIPServiceType,
  fetchIPServiceTypes,
  type CreateIPServiceInput,
  type IPServiceLineInput,
} from '../../services/ipServices'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchPatientDisplayName } from '../../services/patients'

interface CreateIPServiceModalProps {
  onClose: () => void
  onSuccess: (ipServiceName: string) => void
  initialPatient?: string
  openInNewTab?: boolean
}

interface ItemRow {
  id: string
  service_type: string
  template_label: string
  amount: string
  note: string
}

function nextId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyItemRow(): ItemRow {
  return { id: nextId(), service_type: '', template_label: '', amount: '', note: '' }
}

export const CreateIPServiceModal = ({
  onClose,
  onSuccess,
  initialPatient,
  openInNewTab = true,
}: CreateIPServiceModalProps) => {
  const { mode, activeAdmission, activeVisit, selectedPatient: contextPatient } = useCareContext()

  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  const hasCareContext = isIPMode || isOPMode

  const effectivePatient = initialPatient || contextPatient || ''
  const effectiveAdmission = isIPMode ? (activeAdmission || '') : ''
  const effectiveVisit = isOPMode ? (activeVisit || '') : ''

  const [patientName, setPatientName] = useState('')
  const [admissionLabel, setAdmissionLabel] = useState('')
  const [visitLabel, setVisitLabel] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItemRow()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!effectivePatient) {
      setPatientName('')
      return
    }
    fetchPatientDisplayName(effectivePatient)
      .then((row) => setPatientName(row.patient_name || row.name || effectivePatient))
      .catch(() => setPatientName(effectivePatient))
  }, [effectivePatient])

  useEffect(() => {
    if (!effectiveAdmission) {
      setAdmissionLabel('')
      return
    }
    fetchInpatientRecords(undefined, effectiveAdmission, effectivePatient, undefined, undefined, undefined)
      .then((response) => {
        const row = response.data.find((a) => a.name === effectiveAdmission) || response.data[0]
        if (row) {
          setAdmissionLabel(
            `${row.name}${row.patient_name ? ` – ${row.patient_name}` : ''}`
          )
        } else {
          setAdmissionLabel(effectiveAdmission)
        }
      })
      .catch(() => setAdmissionLabel(effectiveAdmission))
  }, [effectiveAdmission, effectivePatient])

  useEffect(() => {
    if (!effectiveVisit) {
      setVisitLabel('')
      return
    }
    setVisitLabel(effectiveVisit)
  }, [effectiveVisit])

  const addItemRow = () => {
    setItems((prev) => [...prev, emptyItemRow()])
  }

  const removeItemRow = (id: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  const updateItemRow = (id: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!hasCareContext) {
      setError('Select IP or OP mode from the navbar before creating a service.')
      return
    }
    if (isIPMode && !effectiveAdmission) {
      setError('Select an inpatient admission in IP mode.')
      return
    }
    if (isOPMode && !effectiveVisit) {
      setError('Select a patient visit in OP mode.')
      return
    }

    const validItems = items.filter(
      (r) => r.service_type.trim() && r.amount.trim() && !Number.isNaN(parseFloat(r.amount))
    )
    if (validItems.length === 0) {
      setError('Add at least one Healthcare Service Template with an amount.')
      return
    }

    try {
      setSubmitting(true)
      const serviceLines: IPServiceLineInput[] = []
      for (const row of validItems) {
        const template = await fetchIPServiceType(row.service_type)
        serviceLines.push({
          service_type: row.service_type.trim(),
          service_code: template?.item_code,
          amount: parseFloat(row.amount),
          note: row.note.trim() || undefined,
        })
      }

      const input: CreateIPServiceInput = {
        category: 'Medical Service',
        services: serviceLines,
      }
      if (isIPMode && effectiveAdmission) {
        input.admission_no = effectiveAdmission
      }
      if (isOPMode && effectiveVisit) {
        input.patient_visit = effectiveVisit
      }

      const { name, sales_order } = await createIPService(input)
      toast.success(
        sales_order
          ? `ECT Chart ${name} created. Sales Order ${sales_order} created.`
          : `ECT Chart ${name} created.`
      )
      onSuccess(name)
      onClose()
      if (openInNewTab) {
        window.open(`/app/ip-service/${encodeURIComponent(name)}`, '_blank')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ECT Chart')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full min-h-[34rem] max-h-[92vh]')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Create ECT Chart</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add Healthcare Service Template lines for the current patient context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-visible p-4 space-y-4 min-h-[20rem]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Patient</label>
                <input
                  type="text"
                  readOnly
                  value={patientName || effectivePatient || '—'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Care context</label>
                <input
                  type="text"
                  readOnly
                  value={
                    isIPMode
                      ? `IP${admissionLabel ? ` · ${admissionLabel}` : effectiveAdmission ? ` · ${effectiveAdmission}` : ''}`
                      : isOPMode
                        ? `OP${visitLabel ? ` · ${visitLabel}` : ''}`
                        : 'Select IP or OP mode'
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <input
                  type="text"
                  readOnly
                  value="Medical Service"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Service items</p>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  + Add row
                </button>
              </div>

              <div className="overflow-x-auto overflow-visible border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Healthcare Service Template</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 w-28">Amount</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Note</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <TemplateRowEditor
                        key={row.id}
                        row={row}
                        onUpdate={(patch) => updateItemRow(row.id, patch)}
                        onRemove={() => removeItemRow(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !hasCareContext}
              className={CM_BTN_PRIMARY}
            >
              {submitting ? 'Creating…' : 'Create ECT Chart'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface TemplateRowEditorProps {
  row: ItemRow
  onUpdate: (patch: Partial<ItemRow>) => void
  onRemove: () => void
}

function TemplateRowEditor({ row, onUpdate, onRemove }: TemplateRowEditorProps) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<{ name: string; service_name: string; rate?: number }[]>([])
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const displayValue = row.template_label || row.service_type

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetchIPServiceTypes(search || undefined, 50, true)
        .then(setOptions)
        .catch(() => setOptions([]))
    }, search.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [open, search])

  const updateDropdownPosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const maxHeight = Math.min(224, Math.max(openUp ? spaceAbove : spaceBelow, 120))

    setDropdownStyle({
      position: 'fixed',
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: rect.left,
      width: Math.max(rect.width, 220),
      maxHeight,
      zIndex: 10000,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(null)
      return
    }
    const id = requestAnimationFrame(updateDropdownPosition)
    const onScrollOrResize = () => updateDropdownPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, options.length, updateDropdownPosition])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      const inWrap = wrapRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inWrap && !inDropdown) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selectTemplate = async (name: string, label: string) => {
    onUpdate({ service_type: name, template_label: label })
    setSearch('')
    setOpen(false)
    try {
      const template = await fetchIPServiceType(name)
      if (template?.rate != null && !row.amount) {
        onUpdate({ service_type: name, template_label: label, amount: String(template.rate) })
      }
    } catch {
      // keep manual amount entry
    }
  }

  const dropdownPanel =
    open && dropdownStyle ? (
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40"
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-500">No ECT templates found.</div>
        ) : (
          options.map((opt) => (
            <button
              key={opt.name}
              type="button"
              className={`block w-full ${linkComboboxOptionClassCompact} px-2 text-left`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void selectTemplate(opt.name, opt.service_name || opt.name)}
            >
              {opt.service_name || opt.name}
              {opt.rate != null ? ` · ${opt.rate}` : ''}
            </button>
          ))
        )}
      </div>
    ) : null

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2">
        <div ref={wrapRef} className="relative min-w-[220px]">
          <input
            ref={inputRef}
            type="text"
            value={open ? search : displayValue}
            onChange={(e) => {
              setSearch(e.target.value)
              if (!open) setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            className={linkComboboxInputClassCompact}
            placeholder="Search template..."
          />
        </div>
        {typeof document !== 'undefined' && dropdownPanel
          ? createPortal(dropdownPanel, document.body)
          : null}
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          step={0.01}
          value={row.amount}
          onChange={(e) => onUpdate({ amount: e.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={row.note}
          onChange={(e) => onUpdate({ note: e.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Note"
        />
      </td>
      <td className="px-1 py-2">
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
          aria-label="Remove row"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  )
}
