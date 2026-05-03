import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import type { BillingInvoiceItemInput } from '../../services/serviceOrders'
import { fetchItems, type LinkFieldOption } from '../../services/common'
import {
  linkComboboxDropdownClass,
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface BillingInvoiceItemsEditorProps {
  items: BillingInvoiceItemInput[]
  onChange: (items: BillingInvoiceItemInput[]) => void
  defaultCostCenter: string
  addLabel?: string
}

function BillingItemSearch({
  row,
  rowIndex,
  onPatch,
}: {
  row: BillingInvoiceItemInput
  rowIndex: number
  onPatch: (patch: Partial<BillingInvoiceItemInput>) => void
}) {
  const [display, setDisplay] = useState(() => row.item_name || row.item_code || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [loading, setLoading] = useState(false)
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
            onPatch({ item_name: v, item_code: '' })
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
                onClick={() => {
                  onPatch({
                    item_code: opt.name,
                    item_name: opt.label || opt.name,
                  })
                  setDisplay(opt.label || opt.name)
                  setOpen(false)
                  setOptions([])
                }}
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
}: BillingInvoiceItemsEditorProps) {
  const patchRow = (idx: number, patch: Partial<BillingInvoiceItemInput>) => {
    onChange(items.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/60"
        >
          <div className="md:col-span-5">
            <BillingItemSearch row={item} rowIndex={idx} onPatch={(p) => patchRow(idx, p)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Qty</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Qty"
              type="number"
              min="0"
              value={item.qty}
              onChange={(e) => patchRow(idx, { qty: Number(e.target.value || 0) })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Rate</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Rate"
              type="number"
              min="0"
              value={item.rate}
              onChange={(e) => patchRow(idx, { rate: Number(e.target.value || 0) })}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Cost center</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Cost center"
              value={item.cost_center || defaultCostCenter}
              onChange={(e) => patchRow(idx, { cost_center: e.target.value })}
            />
          </div>
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
        onClick={() => onChange([...items, { item_code: '', item_name: '', description: '', qty: 1, rate: 0 }])}
      >
        + {addLabel}
      </button>
    </div>
  )
}
