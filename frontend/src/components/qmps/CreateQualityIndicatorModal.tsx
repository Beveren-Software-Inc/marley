import { useState, useEffect, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  MODAL_ERROR_BOX_CLASS,
} from '../ui/CreateModalChrome'
import { createQualityIndicator, fetchPortalDoctypes, type PortalDoctypeOption } from '../../services/qualityIndicators'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { X } from 'lucide-react'

const CATEGORIES = [
  'Patient Safety',
  'Clinical Effectiveness',
  'Patient Experience',
  'Timeliness & Access',
  'Documentation & Compliance',
]

const UNITS = ['Percentage', 'Rate per 1000', 'Count', 'Hours', 'Days']
const FREQUENCIES = ['Monthly', 'Quarterly', 'Annual']

interface CreateQualityIndicatorModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export const CreateQualityIndicatorModal = ({ onClose, onSuccess }: CreateQualityIndicatorModalProps) => {
  const [form, setForm] = useState({
    indicator_name: '',
    indicator_code: '',
    category: 'Patient Safety',
    description: '',
    frequency: 'Monthly',
    is_active: true,
    numerator_doctype: '',
    numerator_filters: '',
    numerator_date_field: 'creation',
    denominator_doctype: '',
    denominator_filters: '',
    denominator_date_field: 'creation',
    unit: 'Percentage',
    target_value: '',
    target_direction: 'Lower is better',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Numerator DocType combobox state
  const [numDtQuery, setNumDtQuery] = useState('')
  const [numDtOptions, setNumDtOptions] = useState<PortalDoctypeOption[]>([])
  const [numDtOpen, setNumDtOpen] = useState(false)
  const [numDtSelected, setNumDtSelected] = useState<PortalDoctypeOption | null>(null)
  const numDtRef = useRef<HTMLDivElement>(null)

  // Denominator DocType combobox state
  const [denDtQuery, setDenDtQuery] = useState('')
  const [denDtOptions, setDenDtOptions] = useState<PortalDoctypeOption[]>([])
  const [denDtOpen, setDenDtOpen] = useState(false)
  const [denDtSelected, setDenDtSelected] = useState<PortalDoctypeOption | null>(null)
  const denDtRef = useRef<HTMLDivElement>(null)

  // Search DocTypes
  useEffect(() => {
    if (!numDtOpen) return
    const t = setTimeout(async () => {
      const opts = await fetchPortalDoctypes(numDtQuery || undefined)
      setNumDtOptions(opts)
    }, numDtQuery ? 300 : 0)
    return () => clearTimeout(t)
  }, [numDtQuery, numDtOpen])

  useEffect(() => {
    if (!denDtOpen) return
    const t = setTimeout(async () => {
      const opts = await fetchPortalDoctypes(denDtQuery || undefined)
      setDenDtOptions(opts)
    }, denDtQuery ? 300 : 0)
    return () => clearTimeout(t)
  }, [denDtQuery, denDtOpen])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (numDtRef.current && !numDtRef.current.contains(e.target as Node)) setNumDtOpen(false)
      if (denDtRef.current && !denDtRef.current.contains(e.target as Node)) setDenDtOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleNumDtSelect = (opt: PortalDoctypeOption) => {
    setNumDtSelected(opt)
    setNumDtQuery('')
    setForm((prev) => ({ ...prev, numerator_doctype: opt.name }))
    setNumDtOpen(false)
  }

  const clearNumDt = () => {
    setNumDtSelected(null)
    setNumDtQuery('')
    setForm((prev) => ({ ...prev, numerator_doctype: '' }))
    setNumDtOpen(false)
  }

  const handleDenDtSelect = (opt: PortalDoctypeOption) => {
    setDenDtSelected(opt)
    setDenDtQuery('')
    setForm((prev) => ({ ...prev, denominator_doctype: opt.name }))
    setDenDtOpen(false)
  }

  const clearDenDt = () => {
    setDenDtSelected(null)
    setDenDtQuery('')
    setForm((prev) => ({ ...prev, denominator_doctype: '' }))
    setDenDtOpen(false)
  }

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.indicator_name.trim()) {
      setError('Indicator Name is required')
      return
    }
    if (!form.category) {
      setError('Category is required')
      return
    }
    if (!form.numerator_doctype.trim()) {
      setError('Numerator DocType is required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await createQualityIndicator({
        indicator_name: form.indicator_name.trim(),
        indicator_code: form.indicator_code.trim() || undefined,
        category: form.category,
        description: form.description.trim() || undefined,
        frequency: form.frequency,
        is_active: form.is_active,
        numerator_doctype: form.numerator_doctype.trim(),
        numerator_filters: form.numerator_filters.trim() || undefined,
        numerator_date_field: form.numerator_date_field.trim() || 'creation',
        denominator_doctype: form.denominator_doctype.trim() || undefined,
        denominator_filters: form.denominator_filters.trim() || undefined,
        denominator_date_field: form.denominator_date_field.trim() || 'creation',
        unit: form.unit,
        target_value: form.target_value ? Number(form.target_value) : undefined,
        target_direction: form.target_direction,
      })
      toast.success('Quality indicator created')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quality indicator')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh]')}>
        <CreateModalHeader title="New Quality Indicator" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1">
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Indicator Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.indicator_name}
                  onChange={(e) => handleChange('indicator_name', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. Medication Error Rate"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Indicator Code</label>
                <input
                  type="text"
                  value={form.indicator_code}
                  onChange={(e) => handleChange('indicator_code', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. PSE-01"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Category <span className="text-red-500">*</span></label>
                <select
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Reporting Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => handleChange('frequency', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    className="h-4 w-4"
                  />
                  Active
                </label>
              </div>
            </div>

            {/* Description */}
            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className={MODAL_FIELD_CLASS}
                placeholder="Short description of this indicator"
              />
            </div>

            {/* Definition */}
            <div className={`${MODAL_SECTION_CLASS} mt-4`}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Definition</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Numerator DocType — searchable dropdown */}
                <div ref={numDtRef}>
                  <label className={MODAL_LABEL_CLASS}>Numerator DocType <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      value={numDtSelected ? numDtSelected.label : numDtQuery}
                      onChange={(e) => {
                        setNumDtQuery(e.target.value)
                        setNumDtOpen(true)
                        if (numDtSelected) { setNumDtSelected(null); setForm((prev) => ({ ...prev, numerator_doctype: '' })) }
                      }}
                      onFocus={() => setNumDtOpen(true)}
                      placeholder="Search DocType..."
                      className={`${linkComboboxInputWithClearClass} pr-9`}
                    />
                    {numDtSelected ? (
                      <button
                        type="button"
                        onClick={clearNumDt}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                    {numDtOpen && numDtOptions.length > 0 && (
                      <div className={linkComboboxDropdownClassShort}>
                        {numDtOptions.map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => handleNumDtSelect(opt)}
                            className={`${linkComboboxOptionClassCompact} text-slate-900`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Numerator Date Field</label>
                  <input
                    type="text"
                    value={form.numerator_date_field}
                    onChange={(e) => handleChange('numerator_date_field', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder="e.g. creation, event_datetime"
                  />
                </div>
                <div className="col-span-2">
                  <label className={MODAL_LABEL_CLASS}>Numerator Filters (JSON)</label>
                  <input
                    type="text"
                    value={form.numerator_filters}
                    onChange={(e) => handleChange('numerator_filters', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder='e.g. {"status": "Open"}'
                  />
                </div>
                {/* Denominator DocType — searchable dropdown */}
                <div ref={denDtRef}>
                  <label className={MODAL_LABEL_CLASS}>Denominator DocType</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={denDtSelected ? denDtSelected.label : denDtQuery}
                      onChange={(e) => {
                        setDenDtQuery(e.target.value)
                        setDenDtOpen(true)
                        if (denDtSelected) { setDenDtSelected(null); setForm((prev) => ({ ...prev, denominator_doctype: '' })) }
                      }}
                      onFocus={() => setDenDtOpen(true)}
                      placeholder="Search DocType..."
                      className={`${linkComboboxInputWithClearClass} pr-9`}
                    />
                    {denDtSelected ? (
                      <button
                        type="button"
                        onClick={clearDenDt}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                    {denDtOpen && denDtOptions.length > 0 && (
                      <div className={linkComboboxDropdownClassShort}>
                        {denDtOptions.map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => handleDenDtSelect(opt)}
                            className={`${linkComboboxOptionClassCompact} text-slate-900`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Denominator Date Field</label>
                  <input
                    type="text"
                    value={form.denominator_date_field}
                    onChange={(e) => handleChange('denominator_date_field', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder="e.g. creation"
                  />
                </div>
                <div className="col-span-2">
                  <label className={MODAL_LABEL_CLASS}>Denominator Filters (JSON)</label>
                  <input
                    type="text"
                    value={form.denominator_filters}
                    onChange={(e) => handleChange('denominator_filters', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder='e.g. {"status": "Completed"}'
                  />
                </div>
              </div>
            </div>

            {/* Target */}
            <div className={`${MODAL_SECTION_CLASS} mt-4`}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Target</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={MODAL_LABEL_CLASS}>Unit</label>
                  <select
                    value={form.unit}
                    onChange={(e) => handleChange('unit', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Target Value</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.target_value}
                    onChange={(e) => handleChange('target_value', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder="e.g. 95"
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Target Direction</label>
                  <select
                    value={form.target_direction}
                    onChange={(e) => handleChange('target_direction', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="Lower is better">Lower is better</option>
                    <option value="Higher is better">Higher is better</option>
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className={`${MODAL_ERROR_BOX_CLASS} mt-4`}>{error}</div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3 bg-white">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Indicator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}