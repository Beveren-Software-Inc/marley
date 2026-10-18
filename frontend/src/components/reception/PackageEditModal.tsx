import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  CalendarRange,
  Check,
  Layers3,
  Loader2,
  Package as PackageIcon,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  MODAL_SELECT_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { currencyInputStep, formatMoneyAmount, roundMoneyAmount } from '../../utils/currencyFormat'
import {
  saveInpatientPackage,
  searchPackageServiceReferences,
  type InpatientPackageRecord,
  type PackageManagementMeta,
  type PackageReferenceOption,
  type PackageServiceTypeOption,
} from '../../services/inpatientPackages'

type EditableServiceRow = {
  key: string
  service_type: string
  reference: string
  reference_label: string
  quantity_days: string
  is_unlimited: boolean
}

type EditableDurationRow = {
  key: string
  duration_class: string
  duration_name: string
  amount: string
}

type EditablePackageForm = {
  company: string
  package_category: string
  cost_center: string
  no_of_days: string
  package_rate: string
  base_total: string
  is_daily_default: boolean
  active: boolean
  services: EditableServiceRow[]
  duration_pricing: EditableDurationRow[]
}

type PackageEditModalProps = {
  open: boolean
  pkg: InpatientPackageRecord | null
  meta: PackageManagementMeta
  onClose: () => void
  onSaved: (pkg: InpatientPackageRecord) => void
}

let rowSequence = 0

function nextRowKey() {
  rowSequence += 1
  return `package-row-${rowSequence}`
}

function toCheckboxValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildInitialForm(
  pkg: InpatientPackageRecord,
  meta: PackageManagementMeta,
): EditablePackageForm {
  return {
    company: pkg.company || meta.default_company || meta.companies[0]?.value || '',
    package_category: pkg.package_category || '',
    cost_center: pkg.cost_center || '',
    no_of_days: String(pkg.no_of_days ?? 0),
    package_rate: String(pkg.package_rate ?? 0),
    base_total: String(pkg.base_total ?? 0),
    is_daily_default: toCheckboxValue(pkg.is_daily_default),
    active: toCheckboxValue(pkg.active),
    services: (pkg.services || []).map((row) => ({
      key: nextRowKey(),
      service_type: row.service_type || 'Room',
      reference: row.reference || '',
      reference_label: row.reference_label || row.reference || '',
      quantity_days: String(row.quantity_days ?? 0),
      is_unlimited: toCheckboxValue(row.is_unlimited),
    })),
    duration_pricing: (pkg.duration_pricing || []).map((row) => ({
      key: nextRowKey(),
      duration_class: row.duration_class || '',
      duration_name: row.duration_name || row.duration_class || '',
      amount: String(row.amount ?? 0),
    })),
  }
}

function newServiceRow(serviceTypes: PackageServiceTypeOption[]): EditableServiceRow {
  return {
    key: nextRowKey(),
    service_type: serviceTypes[0]?.value || 'Room',
    reference: '',
    reference_label: '',
    quantity_days: '0',
    is_unlimited: false,
  }
}

function ReferencePicker({
  serviceType,
  reference,
  referenceLabel,
  onSelect,
}: {
  serviceType: string
  reference: string
  referenceLabel: string
  onSelect: (value: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PackageReferenceOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => document.removeEventListener('mousedown', onDocumentMouseDown)
  }, [open])

  useEffect(() => {
    if (!open || !serviceType) return
    let cancelled = false
    const timer = window.setTimeout(
      () => {
        setLoading(true)
        setLoadError(false)
        searchPackageServiceReferences(serviceType, query)
          .then((results) => {
            if (!cancelled) setOptions(results)
          })
          .catch(() => {
            if (!cancelled) {
              setOptions([])
              setLoadError(true)
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      query.trim() ? 250 : 0,
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, serviceType])

  const displayValue = open ? query : reference ? referenceLabel || reference : ''

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        className={`${MODAL_FIELD_CLASS} pl-9 pr-9`}
        value={displayValue}
        placeholder={serviceType ? 'Search reference…' : 'Select a service type first'}
        disabled={!serviceType}
        autoComplete="off"
        onFocus={(event) => {
          if (!serviceType) return
          setOpen(true)
          setQuery(reference ? referenceLabel || reference : '')
          setOptions([])
          setLoading(true)
          setLoadError(false)
          if (reference) event.currentTarget.select()
        }}
        onChange={(event) => {
          setOpen(true)
          setQuery(event.target.value)
        }}
      />
      {reference ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={() => {
            onSelect('', '')
            setQuery('')
            setOpen(false)
          }}
          aria-label="Clear reference"
        >
          <X className="h-4 w-4" />
        </button>
      ) : loading ? (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-600" />
      ) : null}
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-emerald-200 bg-white py-1 shadow-xl shadow-emerald-900/10">
          {loading && options.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : loadError ? (
            <div className="px-3 py-2 text-xs text-red-600">Could not load references.</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No matching references.</div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-emerald-50 ${
                  option.value === reference ? 'bg-emerald-50/70' : ''
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option.value, option.label)
                  setQuery('')
                  setOpen(false)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="block truncate text-[11px] text-slate-500">
                      {option.description}
                    </span>
                  ) : null}
                  {option.value !== option.label ? (
                    <span className="block truncate text-[10px] text-slate-400">{option.value}</span>
                  ) : null}
                </span>
                {option.value === reference ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function serviceTypeMeta(
  serviceTypes: PackageServiceTypeOption[],
  value: string,
): PackageServiceTypeOption | undefined {
  return serviceTypes.find((option) => option.value === value)
}

function DayReadonly({ value }: { value: number | null | undefined }) {
  return (
    <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-medium tabular-nums text-slate-600">
      {value == null || value === 0 ? '—' : value}
    </div>
  )
}
function ServiceRowEditor({
  row,
  index,
  serviceTypes,
  onChange,
  onRemove,
}: {
  row: EditableServiceRow
  index: number
  serviceTypes: PackageServiceTypeOption[]
  onChange: (patch: Partial<EditableServiceRow>) => void
  onRemove: () => void
}) {
  const typeMeta = serviceTypeMeta(serviceTypes, row.service_type)

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Service {index + 1}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-2">
          <label className={MODAL_LABEL_CLASS}>Type</label>
          <select
            className={MODAL_SELECT_CLASS}
            value={row.service_type}
            onChange={(event) => {
              onChange({
                service_type: event.target.value,
                reference: '',
                reference_label: '',
              })
            }}
          >
            {serviceTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1 lg:col-span-5">
          <label className={MODAL_LABEL_CLASS}>Reference</label>
          <ReferencePicker
            key={row.service_type}
            serviceType={row.service_type}
            reference={row.reference}
            referenceLabel={row.reference_label}
            onSelect={(value, label) => onChange({ reference: value, reference_label: label })}
          />
          {typeMeta ? <p className="mt-1 text-[11px] text-slate-400">{typeMeta.hint}</p> : null}
        </div>
        <div className="lg:col-span-2">
          <label className={MODAL_LABEL_CLASS}>Days included</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={MODAL_FIELD_CLASS}
            value={row.is_unlimited ? '' : row.quantity_days}
            placeholder={row.is_unlimited ? 'Unlimited' : '0'}
            disabled={row.is_unlimited}
            onChange={(event) => onChange({ quantity_days: event.target.value })}
          />
        </div>
        <div className="lg:col-span-3">
          <label className={MODAL_LABEL_CLASS}>Coverage</label>
          <label className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition hover:border-emerald-300/80">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={row.is_unlimited}
              onChange={(event) =>
                onChange({
                  is_unlimited: event.target.checked,
                  quantity_days: event.target.checked ? '0' : row.quantity_days,
                })
              }
            />
            Unlimited during stay
          </label>
        </div>
      </div>
    </div>
  )
}

function DurationRowEditor({
  row,
  index,
  meta,
  currency,
  onChange,
  onRemove,
}: {
  row: EditableDurationRow
  index: number
  meta: PackageManagementMeta
  currency: string
  onChange: (patch: Partial<EditableDurationRow>) => void
  onRemove: () => void
}) {
  const selected = meta.duration_classes.find((option) => option.value === row.duration_class)

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Slab {index + 1}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="sm:col-span-2 lg:col-span-5">
          <label className={MODAL_LABEL_CLASS}>Duration class</label>
          <select
            className={MODAL_SELECT_CLASS}
            value={row.duration_class}
            onChange={(event) => {
              const option = meta.duration_classes.find(
                (candidate) => candidate.value === event.target.value,
              )
              onChange({
                duration_class: event.target.value,
                duration_name: option?.label || event.target.value,
              })
            }}
          >
            <option value="">Select duration…</option>
            {meta.duration_classes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className={MODAL_LABEL_CLASS}>From day</label>
          <DayReadonly value={selected?.from_day} />
        </div>
        <div className="lg:col-span-2">
          <label className={MODAL_LABEL_CLASS}>To day</label>
          <DayReadonly value={selected?.to_day} />
        </div>
        <div className="lg:col-span-3">
          <label className={MODAL_LABEL_CLASS}>Amount ({currency})</label>
          <input
            type="number"
            min="0"
            step={currencyInputStep(currency)}
            className={MODAL_FIELD_CLASS}
            value={row.amount}
            onChange={(event) => onChange({ amount: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

function formatUpdated(value: string | null | undefined): string {
  if (!value) return 'Changes apply to future admissions.'
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return 'Changes apply to future admissions.'
  return `Last updated ${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function PackageEditModal({
  open,
  pkg,
  meta,
  onClose,
  onSaved,
}: PackageEditModalProps) {
  const [form, setForm] = useState<EditablePackageForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !pkg) {
      setForm(null)
      setError('')
      setSaving(false)
      return
    }
    setForm(buildInitialForm(pkg, meta))
    setError('')
  }, [open, pkg, meta])

  if (!open || !pkg || !form) return null

  const selectedCompany = meta.companies.find((company) => company.value === form.company)
  const currency = selectedCompany?.currency || meta.default_currency || 'BHD'
  const costCenterOptions = meta.cost_centers.filter(
    (costCenter) => !costCenter.company || costCenter.company === form.company,
  )
  const includedDays = Math.max(0, Math.trunc(toNumber(form.no_of_days)))
  const suggestedBaseTotal = roundMoneyAmount(
    toNumber(form.package_rate) * includedDays,
    currency,
  )

  const patchForm = (patch: Partial<EditablePackageForm>) => {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous))
  }

  const updateService = (key: string, patch: Partial<EditableServiceRow>) => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            services: previous.services.map((row) =>
              row.key === key ? { ...row, ...patch } : row,
            ),
          }
        : previous,
    )
  }

  const updateDuration = (key: string, patch: Partial<EditableDurationRow>) => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            duration_pricing: previous.duration_pricing.map((row) =>
              row.key === key ? { ...row, ...patch } : row,
            ),
          }
        : previous,
    )
  }

  const addService = () => {
    setForm((previous) =>
      previous
        ? { ...previous, services: [...previous.services, newServiceRow(meta.service_types)] }
        : previous,
    )
  }

  const addDuration = () => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            duration_pricing: [
              ...previous.duration_pricing,
              { key: nextRowKey(), duration_class: '', duration_name: '', amount: '0' },
            ],
          }
        : previous,
    )
  }

  const requestClose = () => {
    if (!saving) onClose()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form || saving) return

    if (!form.company) {
      setError('Select a company before saving.')
      return
    }
    const missingReference = form.services.findIndex((row) => !row.reference.trim())
    if (missingReference >= 0) {
      setError(`Select a reference for service ${missingReference + 1}, or remove the row.`)
      return
    }
    const usedClasses = new Set<string>()
    for (let index = 0; index < form.duration_pricing.length; index += 1) {
      const durationClass = form.duration_pricing[index].duration_class
      if (!durationClass) {
        setError(`Select a duration class for slab ${index + 1}, or remove the row.`)
        return
      }
      if (usedClasses.has(durationClass)) {
        setError(`The duration class ${durationClass} is used more than once.`)
        return
      }
      usedClasses.add(durationClass)
    }

    setSaving(true)
    setError('')
    try {
      const saved = await saveInpatientPackage({
        name: pkg.name,
        company: form.company,
        package_category: form.package_category || null,
        cost_center: form.cost_center || null,
        no_of_days: includedDays,
        package_rate: toNumber(form.package_rate),
        base_total: toNumber(form.base_total),
        is_daily_default: form.is_daily_default,
        active: form.active,
        services: form.services.map((row) => ({
          service_type: row.service_type,
          reference: row.reference.trim(),
          quantity_days: row.is_unlimited ? 0 : toNumber(row.quantity_days),
          is_unlimited: row.is_unlimited,
        })),
        duration_pricing: form.duration_pricing.map((row) => ({
          duration_class: row.duration_class,
          amount: toNumber(row.amount),
        })),
      })
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the package.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className={CREATE_MODAL_OVERLAY}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        className={createModalShellClass(
          'my-auto max-h-[min(94dvh,calc(100vh-1.5rem))] max-w-5xl overflow-hidden',
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CreateModalHeader
          title={pkg.package_name || pkg.name}
          subtitle={`Edit pricing, included services and duration slabs · ${pkg.name}`}
          icon={<PackageIcon className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={requestClose}
          alert={
            error ? (
              <span className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </span>
            ) : null
          }
        />

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-4 py-4 sm:px-6 sm:py-5`}>
            <div className="space-y-4">
              <section className={MODAL_SECTION_CLASS}>
                <h3 className={MODAL_SECTION_TITLE_CLASS}>
                  <Layers3 className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                  Package details
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Package name</label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                      {pkg.name}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      The record name is fixed because admissions reference it.
                    </p>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Company</label>
                    <select
                      className={MODAL_SELECT_CLASS}
                      value={form.company}
                      onChange={(event) => {
                        const company = event.target.value
                        const validCostCenter = meta.cost_centers.some(
                          (costCenter) =>
                            costCenter.value === form.cost_center &&
                            (!costCenter.company || costCenter.company === company),
                        )
                        patchForm({
                          company,
                          cost_center: validCostCenter ? form.cost_center : '',
                        })
                      }}
                    >
                      {meta.companies.map((company) => (
                        <option key={company.value} value={company.value}>
                          {company.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Cost center</label>
                    <select
                      className={MODAL_SELECT_CLASS}
                      value={form.cost_center}
                      onChange={(event) => patchForm({ cost_center: event.target.value })}
                    >
                      <option value="">No cost center</option>
                      {costCenterOptions.map((costCenter) => (
                        <option key={costCenter.value} value={costCenter.value}>
                          {costCenter.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Room category</label>
                    <select
                      className={MODAL_SELECT_CLASS}
                      value={form.package_category}
                      onChange={(event) => patchForm({ package_category: event.target.value })}
                    >
                      <option value="">All room categories</option>
                      {meta.categories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Leave blank when the package applies to every room category.
                    </p>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Included days</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={MODAL_FIELD_CLASS}
                      value={form.no_of_days}
                      onChange={(event) => patchForm({ no_of_days: event.target.value })}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Use 0 for day-rate packages.
                    </p>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Package rate ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      step={currencyInputStep(currency)}
                      className={MODAL_FIELD_CLASS}
                      value={form.package_rate}
                      onChange={(event) => patchForm({ package_rate: event.target.value })}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Daily rate for this package.</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className={MODAL_LABEL_CLASS}>Base total ({currency})</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step={currencyInputStep(currency)}
                        className={MODAL_FIELD_CLASS}
                        value={form.base_total}
                        onChange={(event) => patchForm({ base_total: event.target.value })}
                      />
                      <button
                        type="button"
                        title={`Set to ${formatMoneyAmount(suggestedBaseTotal, currency)}`}
                        className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={suggestedBaseTotal <= 0}
                        onClick={() => patchForm({ base_total: String(suggestedBaseTotal) })}
                      >
                        Rate × days
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Availability</label>
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-emerald-300/80">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={form.active}
                          onChange={(event) => patchForm({ active: event.target.checked })}
                        />
                        Active for new admissions
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-emerald-300/80">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={form.is_daily_default}
                          onChange={(event) =>
                            patchForm({ is_daily_default: event.target.checked })
                          }
                        />
                        Default day-rate package
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className={MODAL_SECTION_CLASS}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className={`${MODAL_SECTION_TITLE_CLASS} mb-1`}>
                      <Layers3 className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                      Included services
                    </h3>
                    <p className="text-xs text-slate-500">
                      Rooms, services, procedures or items covered by this package.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    onClick={addService}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add service
                  </button>
                </div>
                {form.services.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                    <Layers3 className="mx-auto h-5 w-5 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No services linked</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Add a room, service, procedure or item to this package.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.services.map((row, index) => (
                      <ServiceRowEditor
                        key={row.key}
                        row={row}
                        index={index}
                        serviceTypes={meta.service_types}
                        onChange={(patch) => updateService(row.key, patch)}
                        onRemove={() =>
                          setForm((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  services: previous.services.filter(
                                    (service) => service.key !== row.key,
                                  ),
                                }
                              : previous,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </section>


                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Number of days</label>
              <section className={MODAL_SECTION_CLASS}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className={`${MODAL_SECTION_TITLE_CLASS} mb-1`}>
                      <CalendarRange className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                      Duration pricing
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fixed totals for stay-length ranges. Extra days beyond a slab use the
                      package rate.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    onClick={addDuration}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add slab
                  </button>
                </div>
                {form.duration_pricing.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                    <CalendarRange className="mx-auto h-5 w-5 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No duration slabs</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Pricing falls back to the package rate × days.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.duration_pricing.map((row, index) => (
                      <DurationRowEditor
                        key={row.key}
                        row={row}
                        index={index}
                        meta={meta}
                        currency={currency}
                        onChange={(patch) => updateDuration(row.key, patch)}
                        onRemove={() =>
                          setForm((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  duration_pricing: previous.duration_pricing.filter(
                                    (duration) => duration.key !== row.key,
                                  ),
                                }
                              : previous,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <CreateModalFooter hint={formatUpdated(pkg.modified)}>
            <button
              type="button"
              className={CM_BTN_CANCEL}
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${CM_BTN_PRIMARY} inline-flex items-center gap-2`}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              )}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>,
    document.body,
  )
}

