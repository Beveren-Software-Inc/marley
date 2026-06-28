import { useState, useEffect } from 'react'
import { Loader2, ExternalLink, Receipt } from 'lucide-react'
import {
  fetchSalesInvoiceDetail,
  submitSalesInvoiceDoc,
  cancelOrDeleteSalesInvoice,
  updateSalesInvoiceItems,
  type SalesInvoiceDetail,
} from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { useCareContext } from '../../providers/CareContextProvider'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { PaymentModal } from './PaymentModal'
import { canRecordPaymentAgainstSalesInvoice } from '../../utils/specialtyInvoiceActions'
import {
  DraftSalesInvoiceItemsEditor,
  invoiceDetailToEditableLines,
  newDraftInvoiceLine,
  type DraftInvoiceLineEdit,
} from './DraftSalesInvoiceItemsEditor'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  DetailSlideOver,
  MODAL_ERROR_BOX_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
} from '../ui/CreateModalChrome'

/** API / JSON may send docstatus as string; strict === 0 fails in TS otherwise. */
function normalizeDocstatus(ds: unknown): number | undefined {
  if (ds === null || ds === undefined) return undefined
  if (typeof ds === 'string' && ds.trim() === '') return undefined
  const n = Number(ds)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function docstatusLabel(ds: unknown): string {
  const n = normalizeDocstatus(ds)
  if (n === 0) return 'Draft'
  if (n === 1) return 'Submitted'
  if (n === 2) return 'Cancelled'
  if (n !== undefined) return String(n)
  return '—'
}

function isDraftInvoiceDetail(d: SalesInvoiceDetail): boolean {
  const n = normalizeDocstatus(d.docstatus)
  if (n === 0) return true
  if (n !== undefined) return false
  return String(d.status || '').toLowerCase() === 'draft'
}

function isSubmittedInvoiceDetail(d: SalesInvoiceDetail): boolean {
  return normalizeDocstatus(d.docstatus) === 1
}

function draftLinesEqual(a: DraftInvoiceLineEdit[], b: DraftInvoiceLineEdit[]): boolean {
  if (a.length !== b.length) return false
  return a.every((line, i) => {
    const other = b[i]
    return (
      line.name === other.name &&
      line.item_code === other.item_code &&
      (line.item_name || '') === (other.item_name || '') &&
      (line.description || '') === (other.description || '') &&
      Number(line.qty) === Number(other.qty) &&
      Number(line.rate) === Number(other.rate) &&
      Number(line.discount_amount) === Number(other.discount_amount) &&
      Number(line.discount_percentage) === Number(other.discount_percentage) &&
      line.discount_mode === other.discount_mode &&
      (line.cost_center || '') === (other.cost_center || '') &&
      (line.uom || '') === (other.uom || '')
    )
  })
}

interface SpecialtySalesInvoiceSlideOverProps {
  invoiceName: string | null
  onClose: () => void
  onUpdated?: () => void
  /** Open directly in line-edit mode (draft invoices only). */
  initialEditMode?: boolean
  /** Label for the billed party on invoice details (default: Customer). */
  partyLabel?: string
}

export function SpecialtySalesInvoiceSlideOver({
  invoiceName,
  onClose,
  onUpdated,
  initialEditMode = false,
  partyLabel = 'Customer',
}: SpecialtySalesInvoiceSlideOverProps) {
  const { guardClinicalEdit } = useCareContext()
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const [detail, setDetail] = useState<SalesInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'submit' | 'cancel' | 'save' | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [editing, setEditing] = useState(initialEditMode)
  useRejectEditModeWhenLocked(editing, () => setEditing(false))
  const [editLines, setEditLines] = useState<DraftInvoiceLineEdit[]>([])
  const formatMoney = useFormatMoney(detail?.company ?? null)

  const load = async () => {
    if (!invoiceName) return
    try {
      setLoading(true)
      setError(null)
      setDetail(await fetchSalesInvoiceDetail(invoiceName))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!invoiceName) {
      setDetail(null)
      setError(null)
      setShowPayment(false)
      setEditing(false)
      setEditLines([])
      return
    }
    setEditing(initialEditMode)
    void load()
  }, [invoiceName, initialEditMode])

  useEffect(() => {
    if (detail && editing) {
      setEditLines(invoiceDetailToEditableLines(detail))
    }
  }, [detail, editing])

  const startEditing = () => {
    guardClinicalEdit(() => {
      if (!detail) return
      const lines = invoiceDetailToEditableLines(detail)
      const defaultCc = detail.custom_created_at || detail.cost_center || ''
      setEditLines(lines.length ? lines : [newDraftInvoiceLine(defaultCc)])
      setEditing(true)
    })
  }

  const cancelEditing = () => {
    setEditing(false)
    if (detail) setEditLines(invoiceDetailToEditableLines(detail))
  }

  const handleSaveItems = async () => {
    if (!invoiceName || !editLines.length) return
    try {
      blockIfEditingLocked()
    } catch {
      return
    }
    const invalid = editLines.some((line) => !line.item_code?.trim() || line.qty <= 0)
    if (invalid) {
      toast.error('Each line needs an item and quantity greater than zero')
      return
    }
    try {
      setActionBusy('save')
      const updated = await updateSalesInvoiceItems(
        invoiceName,
        editLines.map((line) => ({
          ...(line.name ? { name: line.name } : {}),
          item_code: line.item_code,
          item_name: line.item_name,
          description: line.description,
          qty: line.qty,
          rate: line.rate,
          ...(line.discount_mode === 'percentage'
            ? { discount_percentage: line.discount_percentage }
            : { discount_amount: line.discount_amount }),
          cost_center: line.cost_center || undefined,
          uom: line.uom,
        })),
      )
      setDetail(updated)
      setEditing(false)
      toast.success('Draft updated')
      onUpdated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setActionBusy(null)
    }
  }

  const savedEditLines = detail ? invoiceDetailToEditableLines(detail) : []
  const hasUnsavedItemEdits =
    editing && detail && isDraftInvoiceDetail(detail) && !draftLinesEqual(editLines, savedEditLines)

  if (!invoiceName) return null

  const deskUrl = `/app/sales-invoice/${encodeURIComponent(invoiceName)}`

  const handleSubmit = async () => {
    try {
      setActionBusy('submit')
      await submitSalesInvoiceDoc(invoiceName)
      toast.success('Invoice submitted')
      await load()
      onUpdated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setActionBusy(null)
    }
  }

  const handleCancel = async () => {
    const isDraft = detail ? isDraftInvoiceDetail(detail) : false
    const msg = isDraft
      ? 'Discard this draft invoice? This cannot be undone.'
      : 'Cancel this submitted invoice? ERPNext may block this if payments exist.'
    if (!window.confirm(msg)) return
    try {
      setActionBusy('cancel')
      await cancelOrDeleteSalesInvoice(invoiceName)
      toast.success(isDraft ? 'Draft discarded' : 'Invoice cancelled')
      onUpdated?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setActionBusy(null)
    }
  }

  const headerActions = (
    <>
      <a
        href={deskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-800 hover:bg-emerald-50"
        title="Open in Desk"
      >
        <ExternalLink className="w-4 h-4" />
      </a>
      <PrintFormatDropdown
        doctype="Sales Invoice"
        docName={invoiceName}
        noLetterhead={0}
        triggerPrint={1}
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-800 hover:bg-emerald-50"
      />
    </>
  )

  const renderDraftFooterActions = (invoice: SalesInvoiceDetail) => (
    <>
      <a
        href={deskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${CM_BTN_CANCEL} inline-flex items-center gap-1.5`}
      >
        <ExternalLink className="w-4 h-4" />
        Open in Desk
      </a>
      {isDraftInvoiceDetail(invoice) && !editing ? (
        <button type="button" onClick={startEditing} className={CM_BTN_CANCEL}>
          Edit items
        </button>
      ) : null}
      {isDraftInvoiceDetail(invoice) ? (
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => void handleSubmit()}
          className={`${CM_BTN_PRIMARY} inline-flex items-center gap-2`}
        >
          {actionBusy === 'submit' && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit
        </button>
      ) : null}
      {isSubmittedInvoiceDetail(invoice) && canRecordPaymentAgainstSalesInvoice(invoice) && (
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => setShowPayment(true)}
          className={CM_BTN_PRIMARY}
        >
          Record payment
        </button>
      )}
      {isDraftInvoiceDetail(invoice) ? (
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => void handleCancel()}
          className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {actionBusy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
          Discard draft
        </button>
      ) : null}
      {isSubmittedInvoiceDetail(invoice) ? (
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => void handleCancel()}
          className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {actionBusy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
          Cancel invoice
        </button>
      ) : null}
    </>
  )

  const footer =
    detail && (isDraftInvoiceDetail(detail) || isSubmittedInvoiceDetail(detail)) ? (
      <div className="flex flex-wrap items-center justify-end gap-2 w-full">
        {isDraftInvoiceDetail(detail) && editing && hasUnsavedItemEdits ? (
          <>
            <button type="button" disabled={!!actionBusy} onClick={cancelEditing} className={CM_BTN_CANCEL}>
              Cancel edit
            </button>
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={() => void handleSaveItems()}
              className={`${CM_BTN_PRIMARY} inline-flex items-center gap-2`}
            >
              {actionBusy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </>
        ) : (
          renderDraftFooterActions(detail)
        )}
      </div>
    ) : null

  return (
    <>
      <DetailSlideOver
        title="Sales Invoice"
        subtitle={<span className="font-mono text-xs">{invoiceName}</span>}
        icon={<Receipt className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
        headerActions={headerActions}
        onClose={onClose}
        footer={footer}
        maxWidthClass="max-w-2xl"
      >
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-emerald-800/70">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading invoice…
          </div>
        )}
        {!loading && error && <div className={MODAL_ERROR_BOX_CLASS}>{error}</div>}
        {!loading && detail && (
          <div className="space-y-4">
            <div className={`${MODAL_SECTION_CLASS} flex flex-wrap items-center gap-2`}>
              <span
                className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  normalizeDocstatus(detail.docstatus) === 0
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80'
                    : normalizeDocstatus(detail.docstatus) === 1
                      ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {docstatusLabel(detail.docstatus)}
              </span>
              <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                {detail.status}
              </span>
            </div>

            <div className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Invoice details</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">{partyLabel}</dt>
                  <dd className="text-emerald-950">{detail.customer_name || detail.customer}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">Company</dt>
                  <dd className="text-emerald-950">{detail.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">Posting / Due</dt>
                  <dd className="text-emerald-950">
                    {detail.posting_date || '—'}
                    {detail.due_date ? ` · Due ${detail.due_date}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">Totals</dt>
                  <dd className="text-emerald-950 font-semibold tabular-nums">
                    {formatMoney(detail.grand_total)}
                    <span className="text-emerald-800/60 font-normal">
                      {' '}
                      · Outst. {formatMoney(detail.outstanding_amount)}
                    </span>
                  </dd>
                </div>
                {(detail.collection_cost_center_name || detail.custom_created_at) && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">Collection branch</dt>
                    <dd className="text-emerald-950">
                      {detail.collection_cost_center_name || detail.custom_created_at}
                    </dd>
                  </div>
                )}
                {(detail.custom_reference_name || detail.patient) && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium text-emerald-800/60 uppercase">Reference / Patient</dt>
                    <dd className="text-emerald-950 text-xs">
                      {detail.custom_reference_type && detail.custom_reference_name
                        ? `${detail.custom_reference_type} ${detail.custom_reference_name}`
                        : '—'}
                      {detail.patient ? ` · Patient: ${detail.patient}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className={MODAL_SECTION_CLASS}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className={MODAL_SECTION_TITLE_CLASS}>Items</h3>
                {isDraftInvoiceDetail(detail) && !editing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                  >
                    Edit items
                  </button>
                ) : null}
              </div>
              {isDraftInvoiceDetail(detail) && editing ? (
                <DraftSalesInvoiceItemsEditor
                  lines={editLines}
                  onChange={setEditLines}
                  company={detail.company}
                  customer={detail.customer}
                  patient={detail.patient || undefined}
                  postingDate={detail.posting_date}
                  defaultCostCenter={detail.custom_created_at || detail.cost_center || ''}
                  disabled={actionBusy === 'save'}
                />
              ) : (
                <div className="rounded-xl border border-emerald-100 overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-emerald-50/80 border-b border-emerald-100">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-emerald-900/80">Item</th>
                        <th className="text-right px-3 py-2 font-medium text-emerald-900/80">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-emerald-900/80">Rate</th>
                        <th className="text-right px-3 py-2 font-medium text-emerald-900/80">Discount</th>
                        <th className="text-right px-3 py-2 font-medium text-emerald-900/80">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-50 bg-white">
                      {detail.items?.length ? (
                        detail.items.map((line, i) => (
                          <tr key={`${line.name || line.item_code}-${i}`} className="hover:bg-emerald-50/30">
                            <td className="px-3 py-2 text-emerald-950">
                              <div className="font-medium">{line.item_name || line.item_code}</div>
                              <div className="text-[10px] font-mono text-emerald-800/50">{line.item_code}</div>
                              {line.description ? (
                                <div className="text-[11px] text-emerald-800/60 mt-0.5">{line.description}</div>
                              ) : null}
                              {line.cost_center ? (
                                <div className="text-[10px] text-emerald-700/60 mt-0.5">Branch: {line.cost_center}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(Number(line.rate || 0))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-800/70">
                              {line.discount_amount ? formatMoney(Number(line.discount_amount)) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatMoney(Number(line.amount ?? line.net_amount ?? 0))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-emerald-800/40">
                            No lines
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailSlideOver>

      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        invoiceName={invoiceName}
        customerName={detail?.customer_name || detail?.customer || ''}
        partyLabel={partyLabel}
        outstandingAmount={detail?.outstanding_amount ?? 0}
        defaultCompany={detail?.company}
        defaultCostCenter={detail?.custom_created_at || undefined}
        onPaymentSuccess={() => {
          setShowPayment(false)
          void load()
          onUpdated?.()
        }}
      />
    </>
  )
}
