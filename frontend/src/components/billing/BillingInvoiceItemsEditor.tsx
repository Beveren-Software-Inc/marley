import type { BillingInvoiceItemInput } from '../../services/serviceOrders'

interface BillingInvoiceItemsEditorProps {
  items: BillingInvoiceItemInput[]
  onChange: (items: BillingInvoiceItemInput[]) => void
  defaultCostCenter: string
  addLabel?: string
}

export function BillingInvoiceItemsEditor({
  items,
  onChange,
  defaultCostCenter,
  addLabel = 'Add row',
}: BillingInvoiceItemsEditorProps) {
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/60"
        >
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Item code</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Item code"
              value={item.item_code}
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, item_code: e.target.value } : r)))}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Item name</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Item name"
              value={item.item_name || ''}
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, item_name: e.target.value } : r)))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Qty</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Qty"
              type="number"
              min="0"
              value={item.qty}
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, qty: Number(e.target.value || 0) } : r)))}
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
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, rate: Number(e.target.value || 0) } : r)))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Cost center</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Cost center"
              value={item.cost_center || defaultCostCenter}
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, cost_center: e.target.value } : r)))}
            />
          </div>
          <div className="md:col-span-12">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Description (optional)</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Description"
              value={item.description || ''}
              onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
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
