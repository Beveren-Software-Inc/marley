import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import type { BillingInvoiceItemInput } from '../../services/serviceOrders'
import { fetchSalesItemPricingForBilling } from '../../services/serviceOrders'
import { fetchItems, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import {
  linkComboboxDropdownClass,
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface BillingInvoiceItemsEditorProps {
  items: BillingInvoiceItemInput[]
  onChange: Dispatch<SetStateAction<BillingInvoiceItemInput[]>>
  defaultCostCenter: string
  addLabel?: string
  /** When set, picking an item loads rate/UOM via ERPNext + healthcare service templates + patient category multiplier for services. */
  company?: string
  customer?: string
  postingDate?: string
  /** Patient docname — enables Healthcare Settings patient-category multiplier on service lines */
  patient?: string
}

function mergePricingIntoRow(
  p: Awaited<ReturnType<typeof fetchSalesItemPricingForBilling>>,
  itemNameFallback: string
): Partial<BillingInvoiceItemInput> {
  const mult = p.multiplier ?? 1
  const base = p.base_rate ?? p.rate
  return {
    rate: Number(p.rate) || 0,
    uom: p.uom || undefined,
    stock_uom: p.stock_uom || undefined,
    item_name: (p.item_name as string) || itemNameFallback,
    uom_options: Array.isArray(p.uom_options) ? p.uom_options : undefined,
    billing_price_meta: {
      base_rate: Number(base) || 0,
      multiplier: mult,
      patient_category: p.patient_category ?? null,
      pricing_source: p.pricing_source ?? null,
    },
  }
}

function BillingItemSearch({
  row,
  rowIndex,
  company,
  customer,
  postingDate,
  patient,
  onPatch,
}: {
  row: BillingInvoiceItemInput
  rowIndex: number
  company?: string
  customer?: string
  postingDate?: string
  patient?: string
  onPatch: (patch: Partial<BillingInvoiceItemInput>) => void
}) {
  const [display, setDisplay] = useState(() => row.item_name || row.item_code || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [loading, setLoading] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDisplay(row.item_name || row.item_code || '')
  }, [row.item_code, row.item_name])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!open) return
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
  }, [display, open])

  const loadOnFocus = async () => {
    setOpen(true)
    setLoading(true)
    try {
      setOptions(await fetchItems(display.trim() || undefined))
    } finally {
      setLoading(false)
    }
  }

  const loadPricingForItem = useCallback(
    async (itemCode: string, label: string, uomOverride?: string) => {
      if (!company?.trim()) return
      setPricingLoading(true)
      try {
        const p = await fetchSalesItemPricingForBilling({
          item_code: itemCode,
          company: company.trim(),
          customer: customer?.trim() || undefined,
          patient: patient?.trim() || undefined,
          qty: row.qty > 0 ? row.qty : 1,
          posting_date: postingDate?.trim() || undefined,
          uom: uomOverride?.trim() || row.uom?.trim() || undefined,
        })
        onPatch(mergePricingIntoRow(p, label))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load item price'
        toast.error(msg)
      } finally {
        setPricingLoading(false)
      }
    },
    [company, customer, patient, postingDate, row.qty, row.uom, onPatch]
  )

  const applyItemSelection = async (opt: LinkFieldOption) => {
    const label = opt.label || opt.name
    onPatch({
      item_code: opt.name,
      item_name: label,
      uom: undefined,
      stock_uom: undefined,
      uom_options: undefined,
      billing_price_meta: undefined,
    })
    setDisplay(label)
    setOpen(false)
    setOptions([])
    await loadPricingForItem(opt.name, label)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-xs font-medium text-slate-500 mb-1.5">Item (search)</label>
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          className={`${linkComboboxInputClassCompact} pr-8`}
          placeholder="Search item code or name…"
          value={display}
          onChange={(e) => {
            const v = e.target.value
            setDisplay(v)
            setOpen(true)
            onPatch({
              item_name: v,
              item_code: '',
              uom: undefined,
              stock_uom: undefined,
              uom_options: undefined,
              billing_price_meta: undefined,
            })
          }}
          onFocus={() => void loadOnFocus()}
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
      {row.item_code ? (
        <p className="text-[10px] font-mono text-slate-500 mt-1 truncate" title={row.item_code}>
          Code: {row.item_code}
        </p>
      ) : null}
      {pricingLoading ? (
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          Loading price…
        </div>
      ) : null}
      {open && (
        <div className={linkComboboxDropdownClass}>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Searching items…
            </div>
          ) : options.length > 0 ? (
            options.map((opt) => (
              <button
                key={`${rowIndex}-${opt.name}`}
                type="button"
                className={`${linkComboboxOptionClassCompact} border-b border-slate-50 last:border-0`}
                onClick={() => void applyItemSelection(opt)}
              >
                <span className="font-medium text-slate-800">{opt.label || opt.name}</span>
                <span className="block text-[11px] font-mono text-slate-500">{opt.name}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">No items — keep typing or check spelling.</div>
          )}
        </div>
      )}
    </div>
  )
}

export function BillingInvoiceItemsEditor({
  items,
  onChange,
  defaultCostCenter,
  addLabel = 'Add row',
  company,
  customer,
  postingDate,
  patient,
}: BillingInvoiceItemsEditorProps) {
  const itemsRef = useRef(items)
  itemsRef.current = items
  const formatBase = useFormatMoney(company || null)

  const patchRow = (idx: number, patch: Partial<BillingInvoiceItemInput>) => {
    onChange((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const refetchRowPricing = useCallback(
    async (idx: number, uomOverride?: string) => {
      const row = itemsRef.current[idx]
      if (!row?.item_code?.trim() || !company?.trim()) return
      try {
        const p = await fetchSalesItemPricingForBilling({
          item_code: row.item_code.trim(),
          company: company.trim(),
          customer: customer?.trim() || undefined,
          patient: patient?.trim() || undefined,
          qty: row.qty > 0 ? row.qty : 1,
          posting_date: postingDate?.trim() || undefined,
          uom: uomOverride?.trim() || row.uom?.trim() || undefined,
        })
        onChange((prev) =>
          prev.map((r, i) =>
            i === idx ? { ...r, ...mergePricingIntoRow(p, row.item_name || row.item_code) } : r
          )
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not refresh price'
        toast.error(msg)
      }
    },
    [company, customer, patient, postingDate, onChange]
  )

  // When patient / company / posting date changes, refresh rates for lines that already have an item.
  useEffect(() => {
    if (!company?.trim()) return
    let cancelled = false
    const t = window.setTimeout(async () => {
      const snapshot = itemsRef.current
      const patches: Array<{ idx: number; patch: Partial<BillingInvoiceItemInput> }> = []
      for (let idx = 0; idx < snapshot.length; idx++) {
        const row = snapshot[idx]
        if (!row.item_code?.trim()) continue
        try {
          const p = await fetchSalesItemPricingForBilling({
            item_code: row.item_code.trim(),
            company: company.trim(),
            customer: customer?.trim() || undefined,
            patient: patient?.trim() || undefined,
            qty: row.qty > 0 ? row.qty : 1,
            posting_date: postingDate?.trim() || undefined,
            uom: row.uom?.trim() || undefined,
          })
          patches.push({ idx, patch: mergePricingIntoRow(p, row.item_name || row.item_code) })
        } catch {
          /* ignore batch errors */
        }
      }
      if (cancelled || !patches.length) return
      onChange((prev) => {
        let next = prev
        for (const { idx, patch } of patches) {
          next = next.map((r, i) => (i === idx ? { ...r, ...patch } : r))
        }
        return next
      })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [patient, company, postingDate, customer, onChange])

  const uomChoicesForRow = (row: BillingInvoiceItemInput): string[] => {
    const fromApi = row.uom_options?.filter(Boolean) ?? []
    if (fromApi.length) return fromApi
    const fall: string[] = []
    if (row.stock_uom) fall.push(row.stock_uom)
    if (row.uom && !fall.includes(row.uom)) fall.push(row.uom)
    return fall.length ? fall : row.uom ? [row.uom] : []
  }

  return (
    <div className="space-y-2">
      {company?.trim() ? null : (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Choose <strong>Company</strong> on the Details tab to auto-fill <strong>rate</strong> and{' '}
          <strong>UOM</strong> from Item Price / healthcare service templates / valuation, and apply{' '}
          <strong>patient category multiplier</strong> for service items when a patient is set.
        </p>
      )}
      {patient?.trim() ? (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          Patient <span className="font-mono font-medium">{patient.trim()}</span> — service lines use
          Healthcare Settings category multipliers (same as Service Request).
        </p>
      ) : (
        <p className="text-xs text-slate-500 border border-dashed border-slate-200 rounded-md px-3 py-2">
          Optional: set <strong>Patient</strong> on Details so service-item rates include the category multiplier.
        </p>
      )}
      {items.map((item, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/60"
        >
          <div className="md:col-span-5">
            <BillingItemSearch
              row={item}
              rowIndex={idx}
              company={company}
              customer={customer}
              postingDate={postingDate}
              patient={patient}
              onPatch={(p) => patchRow(idx, p)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Qty{item.uom ? ` (${item.uom})` : ''}
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Qty"
              type="number"
              min="0"
              value={item.qty}
              onChange={(e) => {
                patchRow(idx, { qty: Number(e.target.value || 0) })
              }}
              onBlur={() => {
                if (item.item_code?.trim()) void refetchRowPricing(idx)
              }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Rate{item.uom ? ` / ${item.uom}` : ''}
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Rate"
              type="number"
              min="0"
              step="any"
              value={item.rate}
              onChange={(e) => patchRow(idx, { rate: Number(e.target.value || 0) })}
            />
            {item.billing_price_meta && item.billing_price_meta.multiplier !== 1 ? (
              <p className="text-[10px] text-slate-600 mt-1">
                Base {formatBase(item.billing_price_meta.base_rate)} × {item.billing_price_meta.multiplier}
                {item.billing_price_meta.patient_category
                  ? ` (${item.billing_price_meta.patient_category})`
                  : ''}
              </p>
            ) : null}
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Line UOM</label>
            {uomChoicesForRow(item).length > 0 ? (
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                value={item.uom || uomChoicesForRow(item)[0] || ''}
                onChange={(e) => {
                  const v = e.target.value
                  patchRow(idx, { uom: v })
                  void refetchRowPricing(idx, v)
                }}
              >
                {uomChoicesForRow(item).map((u) => (
                  <option key={u} value={u}>
                    {u}
                    {u === item.stock_uom ? ' — stock' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500"
                readOnly
                placeholder="Pick item first"
                value={item.uom || ''}
              />
            )}
          </div>
          <div className="md:col-span-12">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Branch</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Branch"
              value={item.cost_center || defaultCostCenter}
              onChange={(e) => patchRow(idx, { cost_center: e.target.value })}
            />
          </div>
          {item.item_code && (item.uom || item.stock_uom) ? (
            <div className="md:col-span-12 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold text-slate-800">UOM: </span>
              {item.uom ? (
                <>
                  Line UOM <span className="font-mono font-medium">{item.uom}</span>
                  {item.stock_uom && item.stock_uom !== item.uom ? (
                    <>
                      {' '}
                      · Stock UOM <span className="font-mono font-medium">{item.stock_uom}</span>
                    </>
                  ) : null}
                  {item.stock_uom && item.stock_uom === item.uom ? (
                    <span className="text-slate-500"> (same as stock UOM)</span>
                  ) : null}
                </>
              ) : item.stock_uom ? (
                <>
                  Stock UOM <span className="font-mono font-medium">{item.stock_uom}</span>
                </>
              ) : null}
              {item.billing_price_meta?.pricing_source ? (
                <span className="block text-[10px] text-slate-500 mt-1">
                  Source: {item.billing_price_meta.pricing_source.replace(/_/g, ' ')}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="md:col-span-12">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Description (optional)</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Description"
              value={item.description || ''}
              onChange={(e) => patchRow(idx, { description: e.target.value })}
            />
          </div>
          <div className="md:col-span-12 flex justify-end">
            <button
              className="text-xs text-red-600 border border-red-200 rounded-md px-3 py-1.5 hover:bg-red-50"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              type="button"
            >
              Remove line
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="w-full md:w-auto text-xs font-medium text-primary border border-dashed border-primary/35 rounded-lg px-3 py-2 hover:bg-primary/5"
        onClick={() =>
          onChange([
            ...items,
            { item_code: '', item_name: '', description: '', qty: 1, rate: 0 },
          ])
        }
      >
        + {addLabel}
      </button>
    </div>
  )
}
