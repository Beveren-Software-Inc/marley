import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_OVERLAY_STACK,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import { fetchUoms, fetchServiceRequestTemplates, type LinkFieldOption } from '../../services/common'

interface MultipleResultRow {
  test_unit: string
  uom: string
  male_min_range: string
  male_max_range: string
  female_min_range: string
  female_max_range: string
  use_status: boolean
  status: string
}

interface CreateLabTestTemplateModalProps {
  onClose: () => void
  onSuccess?: (created: { name: string; lab_test_name: string; department?: string }) => void
  templateName?: string
}

const STATUS_BAND_OPTIONS = [
  '',
  'Deficiency  <10',
  'Insufficiency 10 - 30',
  'Sufficiency  30 – 100',
  'Toxicity  >100',
]

const emptyMultipleRow = (): MultipleResultRow => ({
  test_unit: '',
  uom: '',
  male_min_range: '',
  male_max_range: '',
  female_min_range: '',
  female_max_range: '',
  use_status: false,
  status: '',
})

/** Lab Test UOM combobox (healthcare Lab Test UOM doctype — not ERPNext UOM). */
function LabTestUomCombobox({
  label,
  value,
  onChange,
  onCreateClick,
  compact = false,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  onCreateClick?: () => void
  compact?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetchUoms(query || undefined)
        .then(setOptions)
        .catch(() => setOptions([]))
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, open])

  return (
    <div>
      {label ? (
        <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      ) : null}
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) onChange('')
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search UOM…"
          className={`w-full rounded border border-slate-300 pr-8 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
            compact ? 'py-1' : 'py-1.5'
          }`}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              onChange('')
              setOpen(false)
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        ) : onCreateClick ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-white text-sm leading-none text-primary hover:bg-primary/5"
            title="Create UOM"
          >
            +
          </button>
        ) : null}
        {open && options.length > 0 && (
          <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
            {options.map((o) => (
              <button
                key={o.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQuery(o.label || o.name)
                  onChange(o.name)
                  setOpen(false)
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              >
                {o.label || o.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CreateUomMiniModal({
  saving,
  onClose,
  onSave,
}: {
  saving: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className={CREATE_MODAL_OVERLAY_STACK} onClick={onClose}>
      <div className={createModalShellClass('w-full max-w-sm p-6')} onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-semibold text-slate-900">Create UOM</h3>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            UOM Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (value.trim()) onSave(value.trim())
              }
            }}
            placeholder="e.g. mL, mg, Units"
            autoFocus
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (value.trim()) onSave(value.trim())
            }}
            disabled={saving || !value.trim()}
            className={CM_BTN_PRIMARY}
          >
            {saving ? 'Creating…' : 'Create UOM'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Parent group picker — Lab Test Templates with is_group = 1. */
function LabGroupCombobox({
  value,
  onChange,
  excludeName,
}: {
  value: string
  onChange: (v: string) => void
  excludeName?: string
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) {
      setQuery('')
      return
    }
    let cancelled = false
    fetchServiceRequestTemplates('Lab Test Template', value, undefined, 1)
      .then((opts) => {
        if (cancelled) return
        const match = opts.find((o) => o.name === value)
        setQuery(match?.label || value)
      })
      .catch(() => {
        if (!cancelled) setQuery(value)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetchServiceRequestTemplates('Lab Test Template', query || undefined, undefined, 1)
        .then((opts) =>
          setOptions(excludeName ? opts.filter((o) => o.name !== excludeName) : opts)
        )
        .catch(() => setOptions([]))
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, open, excludeName])

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">Group</label>
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) onChange('')
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search group templates…"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              onChange('')
              setOpen(false)
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        ) : null}
        {open && options.length > 0 && (
          <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
            {options.map((o) => (
              <button
                key={o.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQuery(o.label || o.name)
                  onChange(o.name)
                  setOpen(false)
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              >
                {o.label || o.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-slate-600">
      {children}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </label>
  )
}

export function CreateLabTestTemplateModal({
  onClose,
  onSuccess,
  templateName,
}: CreateLabTestTemplateModalProps) {
  const isEdit = Boolean(templateName)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [labTestCode, setLabTestCode] = useState('')
  const [labTestName, setLabTestName] = useState('')
  const [labGroup, setLabGroup] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [isMultiple, setIsMultiple] = useState(false)
  const [isBillable, setIsBillable] = useState(true)

  const [labTestUom, setLabTestUom] = useState('')
  const [minRange, setMinRange] = useState('')
  const [maxRange, setMaxRange] = useState('')
  const [maleMinRange, setMaleMinRange] = useState('')
  const [maleMaxRange, setMaleMaxRange] = useState('')
  const [femaleMinRange, setFemaleMinRange] = useState('')
  const [femaleMaxRange, setFemaleMaxRange] = useState('')

  const [ipRate, setIpRate] = useState('')
  const [opRate, setOpRate] = useState('')

  const [multipleRows, setMultipleRows] = useState<MultipleResultRow[]>([emptyMultipleRow()])
  const [showCreateUom, setShowCreateUom] = useState(false)
  const [creatingUom, setCreatingUom] = useState(false)
  const [uomTarget, setUomTarget] = useState<'parent' | number | null>(null)

  useEffect(() => {
    if (!isEdit || !templateName) return
    let cancelled = false
    setLoading(true)
    apiRequest<Record<string, unknown>>(
      `/api/resource/Lab%20Test%20Template/${encodeURIComponent(templateName)}`
    )
      .then((doc) => {
        if (cancelled) return
        setLabTestCode((doc.lab_test_code as string) || (doc.no as string) || (doc.name as string) || '')
        setLabTestName((doc.lab_test_name as string) || '')
        setLabGroup((doc.lab_group as string) || '')
        setIsGroup(Boolean(doc.is_group))
        setDisabled(Boolean(doc.disabled))
        setIsMultiple(Boolean(doc.is_multiple))
        setIsBillable(doc.is_billable !== 0)
        setLabTestUom((doc.lab_test_uom as string) || '')
        setMinRange(doc.min_range != null && doc.min_range !== '' ? String(doc.min_range) : '')
        setMaxRange(doc.max_range != null && doc.max_range !== '' ? String(doc.max_range) : '')
        setMaleMinRange(doc.male_min_range != null && doc.male_min_range !== '' ? String(doc.male_min_range) : '')
        setMaleMaxRange(doc.male_max_range != null && doc.male_max_range !== '' ? String(doc.male_max_range) : '')
        setFemaleMinRange(
          doc.female_min_range != null && doc.female_min_range !== '' ? String(doc.female_min_range) : ''
        )
        setFemaleMaxRange(
          doc.female_max_range != null && doc.female_max_range !== '' ? String(doc.female_max_range) : ''
        )
        setIpRate(doc.lab_test_rate != null && doc.lab_test_rate !== '' ? String(doc.lab_test_rate) : '')
        setOpRate(doc.op_rate != null && doc.op_rate !== '' ? String(doc.op_rate) : '')
        const rows = (doc.multiple_result_type as Array<Record<string, unknown>>) || []
        setMultipleRows(
          rows.length
            ? rows.map((r) => ({
                test_unit: String(r.test_unit || ''),
                uom: String(r.uom || ''),
                male_min_range: r.male_min_range != null ? String(r.male_min_range) : '',
                male_max_range: r.male_max_range != null ? String(r.male_max_range) : '',
                female_min_range: r.female_min_range != null ? String(r.female_min_range) : '',
                female_max_range: r.female_max_range != null ? String(r.female_max_range) : '',
                use_status: Boolean(r.use_status),
                status: String(r.status || ''),
              }))
            : [emptyMultipleRow()]
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load template')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, templateName])

  const updateMultipleRow = useCallback(
    (index: number, key: keyof MultipleResultRow, value: string | boolean) => {
      setMultipleRows((rows) =>
        rows.map((row, i) => (i === index ? { ...row, [key]: value } : row))
      )
    },
    []
  )

  const openCreateUom = (target: 'parent' | number) => {
    setUomTarget(target)
    setShowCreateUom(true)
  }

  const handleCreateUom = async (name: string) => {
    setCreatingUom(true)
    try {
      const params = new URLSearchParams()
      params.set('uom_name', name)
      const res = await fetch(`/api/method/healthcare.api.common.create_uom?${params.toString()}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.message || 'Failed to create UOM')
        return
      }
      const createdName = (data.message?.name as string) || name
      if (uomTarget === 'parent') setLabTestUom(createdName)
      else if (typeof uomTarget === 'number') updateMultipleRow(uomTarget, 'uom', createdName)
      setShowCreateUom(false)
      setUomTarget(null)
    } finally {
      setCreatingUom(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = labTestCode.trim()
    const name = labTestName.trim()
    if (!code) {
      setError('Lab Test Code is required')
      return
    }
    if (!name) {
      setError('Lab Test Template name is required')
      return
    }

    const parseNum = (v: string) => {
      const t = v.trim()
      if (!t) return null
      const n = parseFloat(t)
      return Number.isFinite(n) ? n : t
    }

    const body: Record<string, unknown> = {
      lab_test_name: name,
      lab_test_code: code,
      is_group: isGroup ? 1 : 0,
      lab_group: isGroup ? null : labGroup.trim() || null,
      disabled: disabled ? 1 : 0,
      is_multiple: isMultiple ? 1 : 0,
      is_billable: isBillable ? 1 : 0,
      lab_test_uom: labTestUom.trim() || null,
      min_range: parseNum(minRange),
      max_range: parseNum(maxRange),
      male_min_range: maleMinRange.trim() || null,
      male_max_range: maleMaxRange.trim() || null,
      female_min_range: femaleMinRange.trim() || null,
      female_max_range: femaleMaxRange.trim() || null,
      lab_test_rate: ipRate.trim() === '' ? null : parseFloat(ipRate),
      op_rate: opRate.trim() === '' ? null : parseFloat(opRate),
      // Keep a sensible default; Result Format UI was removed.
      lab_test_template_type: isGroup ? 'Grouped' : 'Single',
    }

    if (!isEdit) {
      body.no = code
    }

    if (isMultiple) {
      body.multiple_result_type = multipleRows
        .filter((r) => r.test_unit.trim() || r.uom.trim())
        .map((r) => ({
          test_unit: r.test_unit.trim() || null,
          uom: r.uom.trim() || null,
          male_min_range: r.male_min_range.trim() || null,
          male_max_range: r.male_max_range.trim() || null,
          female_min_range: r.female_min_range.trim() || null,
          female_max_range: r.female_max_range.trim() || null,
          use_status: r.use_status ? 1 : 0,
          status: r.use_status ? r.status || null : null,
        }))
    } else {
      body.multiple_result_type = []
    }

    try {
      setSaving(true)
      setError(null)
      let created: { name: string; lab_test_name: string; department?: string }
      if (isEdit) {
        created = await apiRequest(
          `/api/resource/Lab%20Test%20Template/${encodeURIComponent(templateName!)}`,
          { method: 'PUT', body: JSON.stringify(body) }
        )
      } else {
        created = await apiRequest('/api/resource/Lab%20Test%20Template', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      }
      onSuccess?.(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className={CREATE_MODAL_OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className={createModalShellClass('w-full max-w-3xl flex flex-col max-h-[90vh]')}
        onClick={(e) => e.stopPropagation()}
        data-healthcare-modal
      >
        <div className="relative flex shrink-0 items-center justify-between border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">
            {isEdit ? 'Edit Lab Test Template' : 'Create Lab Test Template'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="py-10 text-center text-sm text-slate-500">Loading template…</div>
            ) : (
              <>
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <section className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel required>Lab Test Code</FieldLabel>
                      <input
                        type="text"
                        value={labTestCode}
                        onChange={(e) => setLabTestCode(e.target.value)}
                        disabled={isEdit}
                        placeholder="e.g. LAB-001"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <FieldLabel required>Lab Test Template</FieldLabel>
                      <input
                        type="text"
                        value={labTestName}
                        onChange={(e) => setLabTestName(e.target.value)}
                        placeholder="e.g. CBC, Vitamin D 25-OH"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {!isGroup ? (
                      <LabGroupCombobox
                        value={labGroup}
                        onChange={setLabGroup}
                        excludeName={templateName}
                      />
                    ) : null}
                    {!isMultiple ? (
                      <LabTestUomCombobox
                        label="UOM"
                        value={labTestUom}
                        onChange={setLabTestUom}
                        onCreateClick={() => openCreateUom('parent')}
                      />
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={isGroup}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setIsGroup(checked)
                          if (checked) setLabGroup('')
                        }}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Is Group
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={disabled}
                        onChange={(e) => setDisabled(e.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Disabled
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={isMultiple}
                        onChange={(e) => {
                          setIsMultiple(e.target.checked)
                          if (e.target.checked && multipleRows.length === 0) {
                            setMultipleRows([emptyMultipleRow()])
                          }
                        }}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Is Multiple
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={isBillable}
                        onChange={(e) => setIsBillable(e.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Is Billable
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">Billing</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>IP Rate</FieldLabel>
                      <input
                        type="number"
                        step="any"
                        value={ipRate}
                        onChange={(e) => setIpRate(e.target.value)}
                        placeholder="0.000"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <FieldLabel>OP Rate</FieldLabel>
                      <input
                        type="number"
                        step="any"
                        value={opRate}
                        onChange={(e) => setOpRate(e.target.value)}
                        placeholder="0.000"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </section>

                {!isMultiple ? (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800">Reference Ranges</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Min Range</FieldLabel>
                        <input
                          type="text"
                          value={minRange}
                          onChange={(e) => setMinRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <FieldLabel>Max Range</FieldLabel>
                        <input
                          type="text"
                          value={maxRange}
                          onChange={(e) => setMaxRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <FieldLabel>Male Min</FieldLabel>
                        <input
                          type="text"
                          value={maleMinRange}
                          onChange={(e) => setMaleMinRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <FieldLabel>Male Max</FieldLabel>
                        <input
                          type="text"
                          value={maleMaxRange}
                          onChange={(e) => setMaleMaxRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <FieldLabel>Female Min</FieldLabel>
                        <input
                          type="text"
                          value={femaleMinRange}
                          onChange={(e) => setFemaleMinRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <FieldLabel>Female Max</FieldLabel>
                        <input
                          type="text"
                          value={femaleMaxRange}
                          onChange={(e) => setFemaleMaxRange(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Multiple Result Units</h3>
                        <p className="text-xs text-slate-500">
                          Like Vitamin D — one row per unit (ng/mL, nmol/L) with gendered ranges
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMultipleRows((rows) => [...rows, emptyMultipleRow()])}
                        className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add unit
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          <tr>
                            <th className="px-2 py-2">Test Unit</th>
                            <th className="px-2 py-2">Male Min</th>
                            <th className="px-2 py-2">Male Max</th>
                            <th className="px-2 py-2">Female Min</th>
                            <th className="px-2 py-2">Female Max</th>
                            <th className="px-2 py-2">Use Status</th>
                            <th className="px-2 py-2">Status band</th>
                            <th className="px-2 py-2">UOM</th>
                            <th className="px-2 py-2 w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {multipleRows.map((row, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.test_unit}
                                  onChange={(e) => updateMultipleRow(idx, 'test_unit', e.target.value)}
                                  placeholder="ng/mL"
                                  className="w-full min-w-[5rem] rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.male_min_range}
                                  onChange={(e) => updateMultipleRow(idx, 'male_min_range', e.target.value)}
                                  className="w-full min-w-[4rem] rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.male_max_range}
                                  onChange={(e) => updateMultipleRow(idx, 'male_max_range', e.target.value)}
                                  className="w-full min-w-[4rem] rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.female_min_range}
                                  onChange={(e) => updateMultipleRow(idx, 'female_min_range', e.target.value)}
                                  className="w-full min-w-[4rem] rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.female_max_range}
                                  onChange={(e) => updateMultipleRow(idx, 'female_max_range', e.target.value)}
                                  className="w-full min-w-[4rem] rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.use_status}
                                  onChange={(e) => updateMultipleRow(idx, 'use_status', e.target.checked)}
                                  className="rounded border-slate-300 text-primary"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={row.status}
                                  disabled={!row.use_status}
                                  onChange={(e) => updateMultipleRow(idx, 'status', e.target.value)}
                                  className="w-full min-w-[8rem] rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                                >
                                  {STATUS_BAND_OPTIONS.map((opt) => (
                                    <option key={opt || 'blank'} value={opt}>
                                      {opt || '—'}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="min-w-[7rem] px-2 py-1.5">
                                <LabTestUomCombobox
                                  compact
                                  value={row.uom}
                                  onChange={(v) => updateMultipleRow(idx, 'uom', v)}
                                  onCreateClick={() => openCreateUom(idx)}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  title="Remove row"
                                  disabled={multipleRows.length <= 1}
                                  onClick={() =>
                                    setMultipleRows((rows) => rows.filter((_, i) => i !== idx))
                                  }
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={CM_BTN_PRIMARY} disabled={saving || loading}>
              {saving ? 'Saving…' : isEdit ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showCreateUom ? (
      <CreateUomMiniModal
        saving={creatingUom}
        onClose={() => {
          setShowCreateUom(false)
          setUomTarget(null)
        }}
        onSave={(name) => void handleCreateUom(name)}
      />
    ) : null}
    </>
  )
}
