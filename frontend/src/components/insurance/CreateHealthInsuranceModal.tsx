import { useState, useEffect, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_OVERLAY_STACK,
  CreateModalHeader,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
import {
  fetchInsuranceCompanies, createHealthInsurance, createInsuranceCompany,
  fetchModeOfPayments, fetchItemCodes, fetchItemGroups,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface Props {
  onClose: () => void
  onSuccess: (name: string) => void
}

interface FormState {
  insurance_company: string
  policy_no: string
  insurance_no: string
  outpatient_discount: string
  inpatient_discount: string
  insurance_coverage_: string
  mode_of_payment: string
  special_note: string
}

type ModalTab = 'basic' | 'inclusive' | 'exclusive' | 'groups'

const INITIAL: FormState = {
  insurance_company: '',
  policy_no: '',
  insurance_no: '',
  outpatient_discount: '',
  inpatient_discount: '',
  insurance_coverage_: '',
  mode_of_payment: '',
  special_note: '',
}

// ── Reusable searchable link input ────────────────────────────────────────────
interface LinkInputProps {
  value: string
  label: string
  placeholder?: string
  fetchFn: (q?: string) => Promise<LinkFieldOption[]>
  onChange: (val: string) => void
  showCreate?: boolean
  onCreateClick?: () => void
}

function LinkInput({ value, label, placeholder, fetchFn, onChange, showCreate, onCreateClick }: LinkInputProps) {
  const [query, setQuery] = useState(value || '')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<LinkFieldOption | null>(value ? { name: value, label: value } : null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const opts = await fetchFn(query || undefined)
      setOptions(opts)
    }, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [query, open, fetchFn])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (opt: LinkFieldOption) => {
    setSelected(opt)
    setQuery('')
    onChange(opt.name)
    setOpen(false)
  }

  const clear = () => {
    setSelected(null)
    setQuery('')
    onChange('')
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={selected ? selected.label : query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
            if (selected) { setSelected(null); onChange('') }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || `Search ${label}…`}
          className={`${linkComboboxInputWithClearClass} pr-9`}
        />
        {selected ? (
          <button type="button" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        ) : showCreate ? (
          <button type="button" onClick={onCreateClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
            title="Create new">
            +
          </button>
        ) : null}
        {open && options.length > 0 && (
          <div className={linkComboboxDropdownClassShort}>
            {options.map(opt => (
              <button key={opt.name} type="button" onClick={() => select(opt)}
                className={`${linkComboboxOptionClassCompact} text-slate-900`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Item row picker ───────────────────────────────────────────────────────────
interface ItemRowPickerProps {
  items: string[]
  onChange: (items: string[]) => void
  fetchFn: (q?: string) => Promise<LinkFieldOption[]>
  placeholder: string
  emptyMsg: string
  tagColor: string
}

function ItemRowPicker({ items, onChange, fetchFn, placeholder, emptyMsg, tagColor }: ItemRowPickerProps) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const opts = await fetchFn(query || undefined)
      setOptions(opts.filter(o => !items.includes(o.name)))
    }, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [query, open, items, fetchFn])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const add = (opt: LinkFieldOption) => {
    if (!items.includes(opt.name)) onChange([...items, opt.name])
    setQuery('')
    setOpen(false)
  }

  const remove = (name: string) => onChange(items.filter(i => i !== name))

  return (
    <div className="space-y-3">
      {/* Added items */}
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{emptyMsg}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <span key={item} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${tagColor}`}>
              {item}
              <button type="button" onClick={() => remove(item)} className="hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + add */}
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {options.map(opt => (
              <button key={opt.name} type="button" onClick={() => add(opt)}
                className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-100">
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export const CreateHealthInsuranceModal = ({ onClose, onSuccess }: Props) => {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [activeTab, setActiveTab] = useState<ModalTab>('basic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Child table state
  const [inclusiveItems, setInclusiveItems] = useState<string[]>([])
  const [exclusiveItems, setExclusiveItems] = useState<string[]>([])
  const [exclusiveGroups, setExclusiveGroups] = useState<string[]>([])

  // Create insurance company inline
  const [showCreateCompany, setShowCreateCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)

  // Track selected company name for display (used by LinkInput via onChange)
  const [companyValue, setCompanyValue] = useState('')

  const handleChange = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return
    setCreatingCompany(true)
    try {
      const res = await createInsuranceCompany(newCompanyName.trim())
      setCompanyValue(res.name)
      handleChange('insurance_company', res.name)
      setShowCreateCompany(false)
      setNewCompanyName('')
      toast.success('Insurance company created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create company')
    } finally {
      setCreatingCompany(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.insurance_company) {
      setError('Insurance Company is required')
      setActiveTab('basic')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload: Record<string, any> = {}
      Object.entries(form).forEach(([k, v]) => { if (v !== '') payload[k] = v })

      // Child tables
      if (inclusiveItems.length) {
        payload.inclusive_item = inclusiveItems.map(item_code => ({ item_code }))
      }
      if (exclusiveItems.length) {
        payload.exclusive_item = exclusiveItems.map(item_code => ({ item_code }))
      }
      if (exclusiveGroups.length) {
        payload.exclusive_item_group = exclusiveGroups.map(item_group => ({ item_group }))
      }

      const res = await createHealthInsurance(payload)
      toast.success('Health Insurance created')
      onSuccess(res.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setLoading(false)
    }
  }

  const TABS: { id: ModalTab; label: string; badge?: number }[] = [
    { id: 'basic', label: 'Basic Details' },
    { id: 'inclusive', label: 'Inclusive Items', badge: inclusiveItems.length || undefined },
    { id: 'exclusive', label: 'Exclusive Items', badge: exclusiveItems.length || undefined },
    { id: 'groups', label: 'Exclusive Groups', badge: exclusiveGroups.length || undefined },
  ]

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-xl max-h-[90vh]')}>

        <CreateModalHeader title="New Health Insurance" onClose={onClose}>
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={createModalTabButtonClass(activeTab === tab.id)}
              >
                {tab.label}
                {tab.badge !== undefined ? (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${
                    activeTab === tab.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </CreateModalHeader>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1 min-h-[400px]">

            {/* ── Basic Details ── */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Insurance Company — full width with + button */}
                  <div className="col-span-2">
                    <LinkInput
                      label="Insurance Company *"
                      value={companyValue}
                      placeholder="Search insurance company…"
                      fetchFn={fetchInsuranceCompanies}
                      onChange={v => { setCompanyValue(v); handleChange('insurance_company', v) }}
                      showCreate
                      onCreateClick={() => setShowCreateCompany(true)}
                    />
                  </div>

                  {/* Policy No */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Policy No</label>
                    <input type="text" value={form.policy_no} onChange={e => handleChange('policy_no', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Insurance No */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Insurance No</label>
                    <input type="text" value={form.insurance_no} onChange={e => handleChange('insurance_no', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                {/* Discounts row: OP + IP side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Outpatient Discount %</label>
                    <input type="number" min="0" max="100" step="0.01"
                      value={form.outpatient_discount} onChange={e => handleChange('outpatient_discount', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Inpatient Discount %</label>
                    <input type="number" min="0" max="100" step="0.01"
                      value={form.inpatient_discount} onChange={e => handleChange('inpatient_discount', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                {/* Coverage + Default Mode of Payment row — UPDATED */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Coverage %</label>
                    <input type="number" min="0" max="100" step="0.01"
                      value={form.insurance_coverage_} onChange={e => handleChange('insurance_coverage_', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <LinkInput
                      label="Default Mode of Payment"
                      value={form.mode_of_payment}
                      placeholder="Search mode of payment…"
                      fetchFn={fetchModeOfPayments}
                      onChange={v => handleChange('mode_of_payment', v)}
                    />
                  </div>
                </div>

                {/* Special Note */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Special Note</label>
                  <textarea value={form.special_note} onChange={e => handleChange('special_note', e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                </div>
              </div>
            )}

            {/* ── Inclusive Items ── */}
            {activeTab === 'inclusive' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Items listed here receive the insurance discount. If empty, the discount applies to all items (unless excluded).
                </p>
                <ItemRowPicker
                  items={inclusiveItems}
                  onChange={setInclusiveItems}
                  fetchFn={fetchItemCodes}
                  placeholder="Search and add item…"
                  emptyMsg="No inclusive items — discount applies to all items."
                  tagColor="bg-slate-100 text-slate-700 border-slate-200"
                />
              </div>
            )}

            {/* ── Exclusive Items ── */}
            {activeTab === 'exclusive' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Items listed here are <strong>excluded</strong> from the insurance discount — full price applies.
                </p>
                <ItemRowPicker
                  items={exclusiveItems}
                  onChange={setExclusiveItems}
                  fetchFn={fetchItemCodes}
                  placeholder="Search and add item…"
                  emptyMsg="No exclusive items defined."
                  tagColor="bg-amber-50 text-amber-700 border-amber-200"
                />
              </div>
            )}

            {/* ── Exclusive Groups ── */}
            {activeTab === 'groups' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Item groups listed here are <strong>excluded</strong> from the insurance discount.
                </p>
                <ItemRowPicker
                  items={exclusiveGroups}
                  onChange={setExclusiveGroups}
                  fetchFn={fetchItemGroups}
                  placeholder="Search and add item group…"
                  emptyMsg="No exclusive item groups defined."
                  tagColor="bg-orange-50 text-orange-700 border-orange-200"
                />
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end gap-3`}>
            <button type="button" onClick={onClose}
              className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Insurance'}
            </button>
          </div>
        </form>
      </div>

      {/* Inline create company modal */}
      {showCreateCompany && (
        <div className={CREATE_MODAL_OVERLAY_STACK}>
          <div className={createModalShellClass('w-full max-w-sm p-6')}>
            <h3 className="text-base font-semibold text-slate-900 mb-4">New Insurance Company</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <input autoFocus type="text" value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCompany() } }}
                placeholder="Enter company name…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowCreateCompany(false); setNewCompanyName('') }}
                className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" disabled={!newCompanyName.trim() || creatingCompany}
                onClick={handleCreateCompany}
                className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {creatingCompany ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}