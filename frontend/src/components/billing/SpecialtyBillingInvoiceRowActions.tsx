import { useRef, useState } from 'react'
import { Eye, ExternalLink } from 'lucide-react'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import type { SpecialtyInvoiceRow } from '../../services/billingSpecialty'
import { submitSalesInvoiceDoc, cancelOrDeleteSalesInvoice } from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'

interface SpecialtyBillingInvoiceRowActionsProps {
  row: SpecialtyInvoiceRow
  openMenuRow: string | null
  onOpenMenuRow: (name: string | null) => void
  onViewDetails: () => void
  onRefresh: () => void
}

export function SpecialtyBillingInvoiceRowActions({
  row,
  openMenuRow,
  onOpenMenuRow,
  onViewDetails,
  onRefresh,
}: SpecialtyBillingInvoiceRowActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'submit' | 'cancel' | null>(null)
  const open = openMenuRow === row.name
  const ds = row.docstatus ?? 1
  const deskUrl = `/app/sales-invoice/${encodeURIComponent(row.name)}`

  const closeMenu = () => onOpenMenuRow(null)

  const handleSubmit = async () => {
    try {
      setBusy('submit')
      await submitSalesInvoiceDoc(row.name)
      toast.success('Invoice submitted')
      closeMenu()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async () => {
    const isDraft = ds === 0
    const msg = isDraft
      ? `Discard draft ${row.name}?`
      : `Cancel submitted invoice ${row.name}? This may fail if linked payments exist.`
    if (!window.confirm(msg)) return
    try {
      setBusy('cancel')
      await cancelOrDeleteSalesInvoice(row.name)
      toast.success(isDraft ? 'Draft discarded' : 'Invoice cancelled')
      closeMenu()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setBusy(null)
    }
  }

  const printHref = `/printview?doctype=${encodeURIComponent('Sales Invoice')}&name=${encodeURIComponent(row.name)}&format=Standard&no_letterhead=0&trigger_print=1`

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={onViewDetails}
        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
        title="View details"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <a
        href={deskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
        title={ds === 0 ? 'Edit in Desk' : 'Open in Desk'}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => onOpenMenuRow(open ? null : row.name)}
          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          aria-label="More actions"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        <PortalActionsMenu open={open} onClose={closeMenu} triggerRef={menuRef} minWidth={200}>
          {ds === 0 && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleSubmit()}
              className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 disabled:opacity-50"
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit invoice'}
            </button>
          )}
          {(ds === 0 || ds === 1) && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleCancel()}
              className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'cancel' ? 'Working…' : ds === 0 ? 'Discard draft' : 'Cancel invoice'}
            </button>
          )}
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Print (Standard)
          </a>
        </PortalActionsMenu>
      </div>
    </div>
  )
}
