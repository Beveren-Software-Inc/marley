import type { ServiceOrder } from '../../services/serviceOrders'

export type ServiceOrderLine = {
  item_code?: string
  item_name?: string
  description?: string
  qty?: number
}

export type ServiceOrderWithDisplay = ServiceOrder & {
  order_kind_label?: string
  items?: ServiceOrderLine[]
}

/** Reception-facing service column: consultation, lab, IP service, etc. */
export function ServiceOrderServiceCell({ order }: { order: ServiceOrderWithDisplay }) {
  const kind =
    order.order_kind_label ||
    order.custom_base_reference ||
    order.custom_reference_type ||
    'Billing order'

  const lines = order.items?.length
    ? order.items
    : []

  const refHint =
    order.custom_base_reference === 'Service Request' && order.custom_base_reference_name
      ? order.custom_base_reference_name
      : order.custom_base_reference && order.custom_base_reference_name
        ? `${order.custom_base_reference} ${order.custom_base_reference_name}`
        : null

  return (
    <div className="min-w-0 max-w-[320px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/90">
          {kind}
        </span>
      </div>
      {lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {lines.slice(0, 3).map((line, idx) => (
            <li
              key={`${order.name}-line-${idx}`}
              className="text-xs text-slate-700 truncate"
              title={[line.item_name, line.description].filter(Boolean).join(' — ') || line.item_code}
            >
              {line.item_name || line.description || line.item_code || '—'}
              {line.qty != null && line.qty !== 1 ? ` × ${line.qty}` : ''}
            </li>
          ))}
          {lines.length > 3 ? (
            <li className="text-[11px] text-slate-400">+{lines.length - 3} more line(s)</li>
          ) : null}
        </ul>
      ) : null}
      {refHint ? (
        <p className="text-[10px] font-mono text-slate-400 mt-1 truncate" title={refHint}>
          {refHint}
        </p>
      ) : null}
    </div>
  )
}
