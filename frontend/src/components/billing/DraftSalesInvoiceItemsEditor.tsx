import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { fetchCostCenters, fetchItems, type LinkFieldOption } from '../../services/common'
import { fetchSalesItemPricingForBilling } from '../../services/serviceOrders'
import type { SalesInvoiceDetail } from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

const DROPDOWN_MAX_HEIGHT = 224
const DROPDOWN_GAP = 6
const DROPDOWN_Z_INDEX = 10000

const portaledDropdownClass =
  'overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40'

export type DraftInvoiceLineEdit = {
  name: string
  item_code: string
  item_name?: string
  description?: string
  qty: number
  rate: number
  discount_amount: number
  cost_center: string
  uom?: string
}

export function invoiceDetailToEditableLines(detail: SalesInvoiceDetail): DraftInvoiceLineEdit[] {
  const defaultCc = detail.custom_created_at || detail.cost_center || ''
  return (detail.items || []).map((line) => ({
    name: line.name || '',
    item_code: line.item_code,
    item_name: line.item_name,
    description: line.description,
    qty: Number(line.qty || 0),
    rate: Number(line.rate || 0),
    discount_amount: Number(line.discount_amount || 0),
    cost_center: line.cost_center || defaultCc,
  }))
}

export function newDraftInvoiceLine(defaultCostCenter = ''): DraftInvoiceLineEdit {
  return {
    name: '',
    item_code: '',
    item_name: '',
    description: '',
    qty: 1,
    rate: 0,
    discount_amount: 0,
    cost_center: defaultCostCenter,
  }
}

interface DraftSalesInvoiceItemsEditorProps {
  lines: DraftInvoiceLineEdit[]
  onChange: (lines: DraftInvoiceLineEdit[]) => void
  company?: string
  customer?: string
  patient?: string
  postingDate?: string
  defaultCostCenter?: string
  disabled?: boolean
}

function DraftInvoiceItemSearch({
  line,
  rowIndex,
  company,
  customer,
  patient,
  postingDate,
  disabled,
  onPatch,
}: {
  line: DraftInvoiceLineEdit
  rowIndex: number
  company?: string
  customer?: string
  patient?: string
  postingDate?: string
  disabled?: boolean
  onPatch: (patch: Partial<DraftInvoiceLineEdit>) => void
}) {
  const [display, setDisplay] = useState(() => line.item_name || line.item_code || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [loading, setLoading] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)

  const updateDropdownPosition = useCallback(() => {
    const el = inputRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 220)
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP
    const spaceAbove = rect.top - DROPDOWN_GAP
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, Math.max(120, openUp ? spaceAbove : spaceBelow))

    if (openUp) {
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width,
        bottom: window.innerHeight - rect.top + DROPDOWN_GAP,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      })
    } else {
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width,
        top: rect.bottom + DROPDOWN_GAP,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      })
    }
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
  }, [open, updateDropdownPosition])

  useEffect(() => {
    setDisplay(line.item_name || line.item_code || '')
  }, [line.item_code, line.item_name])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (inputRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open || disabled) return
    const q = display.trim()
    const t = window.setTimeout(async () => {
      setLoading(true)
      try {
        setOptions(await fetchItems(q || undefined))
      } finally {
        setLoading(false)
      }
    }, q === '' ? 0 : 280)
    return () => window.clearTimeout(t)
  }, [display, open, disabled])

  const loadPricing = useCallback(
    async (itemCode: string, label: string) => {
      if (!company?.trim()) return
      setPricingLoading(true)
      try {
        const p = await fetchSalesItemPricingForBilling({
          item_code: itemCode,
          company: company.trim(),
          customer: customer?.trim() || undefined,
          patient: patient?.trim() || undefined,
          qty: line.qty > 0 ? line.qty : 1,
          posting_date: postingDate?.trim() || undefined,
          uom: line.uom?.trim() || undefined,
        })
        onPatch({
          item_code: itemCode,
          item_name: (p.item_name as string) || label,
          rate: Number(p.rate) || 0,
          uom: p.uom || undefined,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not load item price')
      } finally {
        setPricingLoading(false)
      }
    },
    [company, customer, patient, postingDate, line.qty, line.uom, onPatch]
  )

  const applyItem = async (opt: LinkFieldOption) => {
    const label = opt.label || opt.name
    setDisplay(label)
    setOpen(false)
    setOptions([])
    await loadPricing(opt.name, label)
  }

  return (
    <div className="relative min-w-[140px]">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        disabled={disabled}
        className={`${linkComboboxInputClassCompact} pr-8 text-sm`}
        placeholder="Search service / item…"
        value={display}
        onChange={(e) => {
          const v = e.target.value
          setDisplay(v)
          setOpen(true)
          onPatch({ item_name: v, item_code: '', rate: 0 })
        }}
        onFocus={() => setOpen(true)}
      />
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      {pricingLoading ? (
        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading price…
        </div>
      ) : null}
      {open && !disabled && dropdownStyle && typeof document !== 'undefined'
        ? createPortal(
            <div ref={dropdownRef} className={portaledDropdownClass} style={dropdownStyle}>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching…
                </div>
              ) : options.length > 0 ? (
                options.map((opt) => (
                  <button
                    key={`${rowIndex}-${opt.name}`}
                    type="button"
                    className={`${linkComboboxOptionClassCompact} border-b border-slate-50 last:border-0`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyItem(opt)}
                  >
                    <span className="font-medium text-slate-800">{opt.label || opt.name}</span>
                    <span className="block text-[11px] font-mono text-slate-500">{opt.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500">No items found.</div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function DraftSalesInvoiceItemsEditor({
  lines,
  onChange,
  company,
  customer,
  patient,
  postingDate,
  defaultCostCenter = '',
  disabled = false,
}: DraftSalesInvoiceItemsEditorProps) {
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [ccLoading, setCcLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCcLoading(true)
    fetchCostCenters(company)
      .then((rows) => {
        if (!cancelled) setCostCenters(rows)
      })
      .catch(() => {
        if (!cancelled) setCostCenters([])
      })
      .finally(() => {
        if (!cancelled) setCcLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [company])

  const patchLine = (idx: number, patch: Partial<DraftInvoiceLineEdit>) => {
    onChange(lines.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const addLine = () => {
    onChange([...lines, newDraftInvoiceLine(defaultCostCenter)])
  }

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx))
  }

  return (
    <div className="rounded-xl border border-emerald-100 overflow-hidden bg-white">
      <div className="px-3 py-2 bg-emerald-50/90 border-b border-emerald-100 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-emerald-900">Edit invoice lines</span>
        <button
          type="button"
          disabled={disabled}
          onClick={addLine}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add service
        </button>
      </div>
      {!company?.trim() ? (
        <p className="mx-3 mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          Invoice company is required to auto-fill rates when adding services.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-emerald-50/60 border-b border-emerald-100">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-emerald-900/80 min-w-[180px]">Item</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-20">Qty</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-24">Rate</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-24">Discount</th>
              <th className="text-left px-2 py-2 font-medium text-emerald-900/80 min-w-[140px]">Branch</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, idx) => (
              <tr key={line.name || `new-${idx}-${line.item_code}`}>
                <td className="px-3 py-2 text-slate-800 align-top">
                  {line.name ? (
                    <>
                      <div className="font-medium">{line.item_name || line.item_code}</div>
                      <div className="text-[10px] font-mono text-slate-500">{line.item_code}</div>
                    </>
                  ) : (
                    <DraftInvoiceItemSearch
                      line={line}
                      rowIndex={idx}
                      company={company}
                      customer={customer}
                      patient={patient}
                      postingDate={postingDate}
                      disabled={disabled}
                      onPatch={(patch) => patchLine(idx, patch)}
                    />
                  )}
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.qty}
                    onChange={(e) => patchLine(idx, { qty: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.rate}
                    onChange={(e) => patchLine(idx, { rate: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.discount_amount}
                    onChange={(e) => patchLine(idx, { discount_amount: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="text"
                    list={`invoice-cc-${idx}`}
                    disabled={disabled}
                    value={line.cost_center}
                    onChange={(e) => patchLine(idx, { cost_center: e.target.value })}
                    placeholder="Cost center"
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                  <datalist id={`invoice-cc-${idx}`}>
                    {costCenters.map((cc) => (
                      <option key={cc.name} value={cc.name}>
                        {cc.label || cc.name}
                      </option>
                    ))}
                  </datalist>
                  {ccLoading ? (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Branches…
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2 align-top">
                  <button
                    type="button"
                    disabled={disabled || lines.length <= 1}
                    onClick={() => removeLine(idx)}
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-30"
                    title="Remove line"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-slate-500">
          No lines yet.{' '}
          <button type="button" className="text-emerald-700 font-medium hover:underline" onClick={addLine}>
            Add a service
          </button>
        </div>
      ) : null}
    </div>
  )
}
