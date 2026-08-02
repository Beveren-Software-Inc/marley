import { useState, useEffect, useRef } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createPortal } from 'react-dom'
import {
  getMaterialRequestOptions,
  createMaterialRequest,
  searchItemOrBatch,
  type ItemBatchSearchRow
} from '../../services/pharmacy'
import { X } from 'lucide-react'
import {
  IsMedicalSelect,
  isMedicalChoiceRequired,
  isMedicalPayload,
  type IsMedicalChoice,
} from '../ui/IsMedicalSelect'

const MATERIAL_REQUEST_TYPES = [
  'Purchase',
  'Material Transfer',
  'Material Issue',
  'Manufacture',
  'Subcontracting',
  'Customer Provided'
]

interface ItemRow {
  item_code: string
  item_name?: string
  qty: number
  warehouse: string
}

// Item code field: same behaviour as the Pharmacy header "Search item or batch" – type, see list, pick.
// Dropdown is rendered in a portal so it is not clipped by the modal overflow.
function ItemCodeDropdown({
  value,
  displayValue,
  onChange,
  placeholder = 'Item code'
}: {
  value: string
  displayValue?: string
  onChange: (itemCode: string, itemName?: string) => void
  placeholder?: string
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ItemBatchSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Same as ItemSearch: search when dropdown is open and query changes (300ms debounce)
  useEffect(() => {
    if (!dropdownOpen) return
    const trimmed = query.trim()
    if (!trimmed) {
      setSuggestions([])
      setLoading(false)
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      searchItemOrBatch(trimmed, 20)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query, dropdownOpen])

  const handleFocus = () => {
    setDropdownOpen(true)
    const display = (displayValue || value || '').trim()
    if (display) setQuery(display)
    else setQuery('')
  }

  const handleBlur = () => {
    setTimeout(() => setDropdownOpen(false), 200)
  }

  const handleSelect = (itemCode: string, itemName?: string) => {
    onChange(itemCode, itemName)
    setDropdownOpen(false)
    setQuery('')
  }

  const display = (displayValue || value || '').trim() || ''
  const inputValue = dropdownOpen ? query : display

  const dropdownEl =
    dropdownOpen && inputRef.current ? (
      (() => {
        const el = inputRef.current
        if (!el) return null
        const rect = el.getBoundingClientRect()
        const style: React.CSSProperties = {
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 220),
          zIndex: 10000,
          maxHeight: 280,
          overflow: 'auto',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
        }
        return (
          <div style={style}>
            {loading ? (
              <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
            ) : suggestions.length > 0 ? (
              suggestions.map((row, i) => (
                <button
                  key={`${row.item_code}-${row.batch || ''}-${i}`}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(row.item_code, row.item_name ?? undefined)}
                >
                  <div className="font-medium">{row.item_name || row.item_code}</div>
                  {(row.batch || row.expiry_date) && (
                    <div className="text-xs text-slate-500">
                      {[row.batch, row.expiry_date].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500">
                {query.trim() ? 'No items or batches match your search.' : 'Type to search item or batch.'}
              </div>
            )}
          </div>
        )
      })()
    ) : null

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setQuery(e.target.value)
          setDropdownOpen(true)
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded border border-slate-300 px-2 py-1 text-slate-800"
      />
      {dropdownEl && createPortal(dropdownEl, document.body)}
    </div>
  )
}

interface CreateMaterialRequestModalProps {
  onClose: () => void
  onSuccess?: (name: string) => void
  defaultWarehouse?: string
}

export const CreateMaterialRequestModal = ({
  onClose,
  onSuccess,
  defaultWarehouse: initialWarehouse,
}: CreateMaterialRequestModalProps) => {
  const [company, setCompany] = useState('')
  const [materialRequestType, setMaterialRequestType] = useState('Purchase')
  const [defaultWarehouse, setDefaultWarehouse] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [items, setItems] = useState<ItemRow[]>([{ item_code: '', qty: 0, warehouse: '' }])
  const [companies, setCompanies] = useState<string[]>([])
  const [warehouses, setWarehouses] = useState<string[]>([])
  const [costCenters, setCostCenters] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMedical, setIsMedical] = useState<IsMedicalChoice>('')

  useEffect(() => {
    getMaterialRequestOptions()
      .then((opts) => {
        setCompanies(opts.companies)
        setWarehouses(opts.warehouses)
        setCostCenters(opts.cost_centers ?? [])
        if (opts.companies.length && !company) setCompany(opts.companies[0])
        const preferred =
          initialWarehouse || opts.default_warehouse || opts.warehouses[0] || ''
        if (preferred) {
          setDefaultWarehouse(preferred)
          setItems([{ item_code: '', qty: 0, warehouse: preferred }])
        }
      })
      .finally(() => setOptionsLoading(false))
  }, [initialWarehouse])

  const addRow = () => {
    setItems((prev) => [...prev, { item_code: '', qty: 0, warehouse: defaultWarehouse }])
  }

  const updateRowItem = (index: number, itemCode: string, itemName?: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], item_code: itemCode, item_name: itemName ?? next[index].item_name }
      return next
    })
  }

  const removeRow = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!company) {
      setError('Company is required')
      return
    }
    const validItems = items.filter((r) => (r.item_code || '').trim() && (r.qty || 0) > 0)
    if (!validItems.length) {
      setError('Add at least one item with quantity')
      return
    }
    if (!isMedicalChoiceRequired(isMedical)) {
      setError('Please select a category (Medical or Consumable)')
      return
    }
    try {
      setLoading(true)
      const res = await createMaterialRequest({
        company,
        material_request_type: materialRequestType,
        schedule_date: scheduleDate || undefined,
        set_warehouse: defaultWarehouse.trim() || undefined,
        cost_center: costCenter.trim() || undefined,
        is_medical: isMedicalPayload(isMedical),
        items: validItems.map((r) => ({
          item_code: r.item_code.trim(),
          qty: Number(r.qty),
          warehouse: (r.warehouse || '').trim() || defaultWarehouse.trim() || undefined
        }))
      })
      onSuccess?.(res.name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Material Request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[95vh] min-h-[80vh]')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Create Material Request</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white"
                  disabled={optionsLoading}
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
                <select
                  value={materialRequestType}
                  onChange={(e) => setMaterialRequestType(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white"
                >
                  {MATERIAL_REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse</label>
                <select
                  value={defaultWarehouse}
                  onChange={(e) => setDefaultWarehouse(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white"
                  disabled={optionsLoading}
                >
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                <select
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white"
                  disabled={optionsLoading}
                >
                  <option value="">Select branch</option>
                  {costCenters.map((cc) => (
                    <option key={cc} value={cc}>
                      {cc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Required By</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
            </div>

            <IsMedicalSelect value={isMedical} onChange={setIsMedical} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Items</label>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-sm text-primary hover:underline"
                >
                  + Add row
                </button>
              </div>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3 font-medium">Item Code</th>
                      <th className="py-2 px-3 font-medium w-24">Qty</th>
                      <th className="py-2 px-3 font-medium">Warehouse</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 px-3">
                          <ItemCodeDropdown
                            value={row.item_code}
                            displayValue={row.item_name || row.item_code}
                            onChange={(itemCode, itemName) => updateRowItem(i, itemCode, itemName)}
                            placeholder="Item code"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={row.qty || ''}
                            onChange={(e) => updateRow(i, 'qty', e.target.value ? parseFloat(e.target.value) : 0)}
                            placeholder="0"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-slate-800"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <select
                            value={row.warehouse}
                            onChange={(e) => updateRow(i, 'warehouse', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-slate-800 bg-white text-sm"
                          >
                            <option value="">—</option>
                            {warehouses.map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 px-1">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            disabled={items.length <= 1}
                            className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isMedicalChoiceRequired(isMedical)}
              className="px-4 py-2 rounded bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
