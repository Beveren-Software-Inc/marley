import { useEffect, useMemo, useState } from 'react'
import { DateFilterInput } from '../ui/DateFilterInput'
import {
  fetchInpatientAdmissionOptions,
  fetchPatientVisits,
  type LinkFieldOption,
} from '../../services/common'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { resolveAdmissionDateTime } from '../../utils/admissionDateTime'

type ReportId = 'receipts' | 'ip-payments' | 'soa' | 'soa-op'

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayInputDate(): string {
  return toInputDate(new Date())
}

const LETTERHEAD = {
  name: 'SERENE PSYCHIATRY HOSPITAL W.L.L',
  address: 'Building 2093, Road 94, Block 960, Jau Bahrain',
  contact: 'Contact No. 13384444, 38853666',
  web: 'www.serenehospital.com',
}

const fmtAmt = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const RECEIPT_COLS = [
  ['rv_no', 'RV No.'], ['rv_date', 'RV Date'], ['payment_type', 'Payment Type'],
  ['file_no', 'File No.'], ['patient_name', 'Patient Name'], ['chq_num', 'Chq Num'],
  ['chq_date', 'Chq Date'], ['case_no', 'Visit/Case No.'], ['visit_booked_by', 'Visit Booked By'],
  ['received_by', 'Received By'], ['received_date', 'Received Date'], ['amount', 'Amount'],
] as const

const PD_COLS = [
  ['rv_no', 'RV No.'], ['rv_date', 'RV Date'], ['payment_type', 'Payment Type'],
  ['chq_num', 'Cheque No.'], ['chq_date', 'Cheque Date'], ['user', 'User'],
  ['entry_date', 'Entry Date'], ['amount', 'Amount'],
] as const

function sectionTable(title: string, rows: any[], cols: readonly (readonly [string, string])[], total?: number) {
  const head = cols.map(([, l]) => `<th>${l}</th>`).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${cols
          .map(([k]) => `<td${k === 'amount' ? ' class="num"' : ''}>${k === 'amount' ? fmtAmt(r[k]) : r[k] ?? ''}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  const totalRow =
    total !== undefined
      ? `<tr class="total"><td colspan="${cols.length - 1}">Total</td><td class="num">${fmtAmt(total)}</td></tr>`
      : ''
  return `<h3>${title}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`
}

function buildLetterhead(reportTitle: string, meta: string) {
  return `
    <div class="lh">
      <div>
        <div class="lh-name">${LETTERHEAD.name}</div>
        <div>${LETTERHEAD.address}</div>
        <div>${LETTERHEAD.contact} · ${LETTERHEAD.web}</div>
      </div>
      <div class="lh-title">
        <h1>${reportTitle}</h1>
        <div>${meta}</div>
        <div>Printed on: ${new Date().toLocaleString('en-GB')}</div>
      </div>
    </div><hr/>`
}

function soaCategoryRows(cats: Record<string, any[]>) {
  return Object.entries(cats)
    .map(([cat, rows]) =>
      rows
        .map((r, i) => {
          const lineDisc = Number(r.discount_amount || 0)
          const discPct = Number(r.discount_percentage || 0)
          const discCell =
            lineDisc > 0
              ? `${fmtAmt(lineDisc)}${discPct > 0 ? ` (${discPct}%)` : ''}`
              : ''
          return `<tr>${i === 0 ? `<td rowspan="${rows.length}">${cat}</td>` : ''}<td>${r.item_code ?? ''}</td><td>${r.item_name ?? ''}</td><td class="num">${fmtAmt(r.rate)}</td><td class="num">${discCell}</td><td class="num">${r.qty}</td><td class="num">${r.frequency}</td><td class="num">${fmtAmt(r.amount)}</td></tr>`
        })
        .join(''),
    )
    .join('')
}

function soaTotalsFooter(data: any) {
  return `<tr class="total"><td colspan="7">Total Bill Amount</td><td class="num">${fmtAmt(data.bill_total)}</td></tr>
      <tr class="total"><td colspan="7">Discount Amount</td><td class="num">(${fmtAmt(data.discount_total)})</td></tr>
      <tr class="total"><td colspan="7">Paid Amount</td><td class="num">(${fmtAmt(data.paid_total)})</td></tr>
      <tr class="total"><td colspan="7">Net Bill Amount</td><td class="num">${fmtAmt(data.net_total)}</td></tr>
      <tr class="total"><td colspan="7">Balance Amount</td><td class="num">${fmtAmt(data.balance)}</td></tr>`
}

function docCss(orientation: 'portrait' | 'landscape' = 'landscape') {
  return `
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 16px; }
  .lh { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .lh-name { font-size: 15px; font-weight: bold; }
  .lh-title h1 { font-size: 16px; margin: 0 0 4px; text-align: right; text-decoration: underline; }
  .lh-title { text-align: right; }
  h3 { margin: 14px 0 4px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #333; padding: 3px 5px; text-align: left; }
  th { background: #f1f5f9; }
  td.num, th.num { text-align: right; }
  tr.total td { font-weight: bold; background: #f8fafc; }
  @page { size: A4 ${orientation}; margin: 10mm; }
`
}

function openDocument(
  html: string,
  mode: 'pdf' | 'excel',
  filename: string,
  orientation: 'portrait' | 'landscape' = 'landscape',
) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${docCss(orientation)}</style></head><body>${html}</body></html>`
  if (mode === 'pdf') {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(doc + '<script>window.onload = () => window.print()</'.concat('script>'))
    win.document.close()
  } else {
    const blob = new Blob([doc], { type: 'application/vnd.ms-excel' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${filename}.xls`
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

export function ReceptionReports() {
  const { activeAdmission, activeVisit, selectedPatient } = useCareContext()
  const [report, setReport] = useState<ReportId>('receipts')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [admission, setAdmission] = useState('')
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [visit, setVisit] = useState('')
  const [visitQuery, setVisitQuery] = useState('')
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [chargingPackage, setChargingPackage] = useState(false)
  const [data, setData] = useState<any>(null)

  const needsAdmission = report === 'ip-payments' || report === 'soa'
  const isSoaOp = report === 'soa-op'
  const resolvedAdmission = (activeAdmission || admission || '').trim()
  // Visit is optional for OP SOA — do not force the header active visit.
  const resolvedVisit = (visit || '').trim()

  const headerCaseLabel = useMemo(() => {
    if (!activeAdmission) return ''
    try {
      return localStorage.getItem('patientSearch_activeAdmissionLabel') || activeAdmission
    } catch {
      return activeAdmission
    }
  }, [activeAdmission])

  const headerVisitLabel = useMemo(() => {
    if (!activeVisit) return ''
    try {
      return localStorage.getItem('patientSearch_activeVisitLabel') || activeVisit
    } catch {
      return activeVisit
    }
  }, [activeVisit])

  useEffect(() => {
    if (!activeAdmission) return
    setAdmission(activeAdmission)
    setAdmissionQuery(headerCaseLabel || activeAdmission)
  }, [activeAdmission, headerCaseLabel])

  // Prefill visit from care context when the active visit changes; user can still clear it.
  useEffect(() => {
    if (!activeVisit) return
    setVisit(activeVisit)
    setVisitQuery(headerVisitLabel || activeVisit)
  }, [activeVisit, headerVisitLabel])

  // SOA (IP): From Date = admission date, To Date = today
  useEffect(() => {
    if (report !== 'soa') return

    setToDate(todayInputDate())

    if (!resolvedAdmission) return

    let cancelled = false
    ;(async () => {
      try {
        const fields = JSON.stringify([
          'scheduled_date',
          'admitted_datetime',
          'admission_date',
          'admission_time',
        ])
        const row = await apiRequest<{
          scheduled_date?: string
          admitted_datetime?: string
          admission_date?: string
          admission_time?: string
        }>(
          `/api/resource/Inpatient%20Admission/${encodeURIComponent(resolvedAdmission)}?fields=${encodeURIComponent(fields)}`,
        )
        if (cancelled || !row) return
        // Match SOA report's admission_date (scheduled_date), then fall back to admitted datetime.
        const scheduled = (row.scheduled_date || '').toString().slice(0, 10)
        if (scheduled) {
          setFromDate(scheduled)
          return
        }
        const dt = resolveAdmissionDateTime(row)
        if (dt) setFromDate(toInputDate(dt))
      } catch {
        /* leave From Date unchanged if admission cannot be loaded */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [report, resolvedAdmission])

  const run = async () => {
    if (report === 'receipts' && (!fromDate || !toDate)) {
      toast.error('Select From Date and To Date')
      return
    }
    if (needsAdmission && !resolvedAdmission) {
      toast.error('Select a case at the top (patient / admission), then run the report')
      return
    }
    if (isSoaOp) {
      if (!resolvedVisit) {
        if (!selectedPatient) {
          toast.error('Select a patient at the top, or pick a Patient Visit')
          return
        }
        if (!fromDate || !toDate) {
          toast.error('Select From Date and To Date when Visit is blank')
          return
        }
      }
    }
    setLoading(true)
    setData(null)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.append('from_date', fromDate)
      if (toDate) params.append('to_date', toDate)
      if (needsAdmission) params.append('admission', resolvedAdmission)
      if (isSoaOp) {
        if (resolvedVisit) params.append('visit', resolvedVisit)
        if (selectedPatient) params.append('patient', selectedPatient)
      }
      const method =
        report === 'receipts'
          ? 'get_patient_receipts_summary'
          : report === 'ip-payments'
            ? 'get_ip_payment_discounts'
            : report === 'soa-op'
              ? 'get_op_statement_of_account'
              : 'get_ip_statement_of_account'
      const res = await apiRequest<any>(
        `/api/method/healthcare.api.reception_reports.${method}?${params.toString()}`,
      )
      setData(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const chargePackageToToday = async () => {
    if (report !== 'soa') return
    if (!resolvedAdmission) {
      toast.error('Select an admission / case first')
      return
    }
    setChargingPackage(true)
    try {
      const preview = await apiRequest<any>(
        `/api/method/healthcare.api.package_charge_to_today.preview_package_charge_to_today?admission=${encodeURIComponent(resolvedAdmission)}`,
      )
      if (!preview?.can_charge) {
        toast.error(
          `No unbilled package days. Elapsed ${preview?.days_elapsed ?? 0}, already billed ${preview?.days_already_billed ?? 0}, package ${preview?.program_days ?? '—'} days.`,
        )
        return
      }
      const ok = window.confirm(
        [
          `Charge package up to today for ${preview.package_name || preview.package}?`,
          '',
          `Package days: ${preview.program_days ?? '—'}`,
          `Days elapsed: ${preview.days_elapsed}`,
          `Already billed: ${preview.days_already_billed}`,
          `Days to charge now: ${preview.days_to_charge}`,
          `Amount / day: ${fmtAmt(preview.amount_per_day)}`,
          `Charge amount: ${fmtAmt(preview.amount)}`,
          `Remaining after charge: ${preview.remaining_days_after ?? '—'}`,
          '',
          'This creates a Quotation and submits it to a Sales Order.',
        ].join('\n'),
      )
      if (!ok) return

      const result = await apiRequest<any>(
        '/api/method/healthcare.api.package_charge_to_today.charge_package_to_today',
        {
          method: 'POST',
          body: JSON.stringify({ admission: resolvedAdmission }),
        },
      )
      toast.success(
        result?.message ||
          `Charged ${result?.days_charged || 0} day(s). Remaining ${result?.remaining_days ?? '—'}.`,
      )
      // Refresh SOA so the new Sales Order lines appear
      await run()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to charge package')
    } finally {
      setChargingPackage(false)
    }
  }

  const buildHtml = (): { html: string; filename: string } | null => {
    if (!data) return null
    const range = fromDate && toDate ? `From Date: ${fromDate} to ${toDate}` : ''
    if (report === 'receipts') {
      let html = buildLetterhead('Patient Receipts Summary', range)
      html += sectionTable('OP', data.op || [], RECEIPT_COLS, data.totals?.op)
      html += sectionTable('Payment Only', data.payment_only || [], RECEIPT_COLS, data.totals?.payment_only)
      html += sectionTable('IP', data.ip || [], RECEIPT_COLS, data.totals?.ip)
      const rows = Object.entries(data.summary || {})
        .map(([k, v]) => `<tr><td>${k}</td><td class="num">${fmtAmt(v as number)}</td></tr>`)
        .join('')
      html += `<h3>Summary</h3><table style="width:340px"><tbody>${rows}<tr class="total"><td>Grand Total</td><td class="num">${fmtAmt(data.grand_total)}</td></tr></tbody></table>`
      return { html, filename: `patient-receipts-${fromDate}-${toDate}` }
    }
    if (report === 'ip-payments') {
      let html = buildLetterhead('IP Payments and Discounts', `${range}${range ? ' · ' : ''}Case No. ${resolvedAdmission}`)
      html += sectionTable('DISCOUNT', data.discounts || [], PD_COLS, data.discount_total)
      html += sectionTable('PAID', data.paid || [], PD_COLS, data.paid_total)
      html += `<table style="width:340px"><tbody><tr class="total"><td>Gross Total</td><td class="num">${fmtAmt(data.gross_total)}</td></tr></tbody></table>`
      return { html, filename: `ip-payments-discounts-${resolvedAdmission}` }
    }
    if (report === 'soa-op') {
      const visitMeta = resolvedVisit
        ? `Visit No. ${data.case_no || data.visit}`
        : `Patient ${data.patient_name || selectedPatient || ''} · All OP visits`
      let html = buildLetterhead('Statement of Account (OP)', `${visitMeta}${range ? ` · ${range}` : ''}`)
      html += `<table style="margin-bottom:10px"><tbody>
        <tr><td><b>Visit No.</b></td><td>${data.visit ?? (resolvedVisit ? resolvedVisit : 'Multiple visits')}</td><td><b>Patient File No.</b></td><td>${data.file_no ?? ''}</td></tr>
        <tr><td><b>Visit Date</b></td><td>${data.visit_date ?? ''}</td><td><b>Patient Name</b></td><td>${data.patient_name ?? ''}</td></tr>
        <tr><td><b>Visit Type</b></td><td>${data.visit_type ?? (resolvedVisit ? '' : 'All OP')}</td><td><b>Doctor Name</b></td><td>${data.doctor_name ?? ''}</td></tr>
        <tr><td><b>Status</b></td><td>${data.status ?? ''}</td><td><b>Branch</b></td><td>${data.branch ?? ''}</td></tr>
      </tbody></table>`
      html += `<table><thead><tr><th>Service Category</th><th>Service Code</th><th>Service Name</th><th class="num">Rate (BHD)</th><th class="num">Discount (BHD)</th><th class="num">Qty</th><th class="num">Frequency</th><th class="num">Total Amount (BHD)</th></tr></thead><tbody>${soaCategoryRows(data.categories || {})}
        ${soaTotalsFooter(data)}
      </tbody></table>
      <p style="margin-top:10px">This is not an invoice, all charges are inclusive of VAT.</p>`
      return { html, filename: `soa-op-${data.case_no || data.visit || selectedPatient || 'patient'}` }
    }
    // SOA IP
    let html = buildLetterhead('Statement of Account (IP)', `Case No. ${data.case_no} · ${range}`)
    html += `<table style="margin-bottom:10px"><tbody>
      <tr><td><b>Admission No.</b></td><td>${data.admission}</td><td><b>Patient File No.</b></td><td>${data.file_no ?? ''}</td></tr>
      <tr><td><b>Admission Date</b></td><td>${data.admission_date ?? ''}</td><td><b>Patient Name</b></td><td>${data.patient_name ?? ''}</td></tr>
      <tr><td><b>Discharge Date</b></td><td>${data.discharge_date ?? ''}</td><td><b>Doctor Name</b></td><td>${data.doctor_name ?? ''}</td></tr>
      <tr><td><b>Days Charged</b></td><td>${data.days_charged ?? ''}</td><td><b>Case Branch</b></td><td>${data.branch ?? ''}</td></tr>
    </tbody></table>`
    html += `<table><thead><tr><th>Service Category</th><th>Service Code</th><th>Service Name</th><th class="num">Rate (BHD)</th><th class="num">Discount (BHD)</th><th class="num">Qty</th><th class="num">Frequency</th><th class="num">Total Amount (BHD)</th></tr></thead><tbody>${soaCategoryRows(data.categories || {})}
      ${soaTotalsFooter(data)}
    </tbody></table>
    <p style="margin-top:10px">This is not an invoice, all charges are inclusive of VAT.</p>`
    return { html, filename: `soa-${data.case_no || resolvedAdmission}` }
  }

  const doExport = (mode: 'pdf' | 'excel') => {
    const built = buildHtml()
    if (!built) {
      toast.error('Run the report first')
      return
    }
    const orientation = report === 'soa' || report === 'soa-op' ? 'portrait' : 'landscape'
    openDocument(built.html, mode, built.filename, orientation)
  }

  const searchAdmissions = async (q: string) => {
    try {
      setAdmissionOptions(await fetchInpatientAdmissionOptions(q || undefined))
    } catch {
      setAdmissionOptions([])
    }
  }

  const searchVisits = async (q: string) => {
    try {
      setVisitOptions(await fetchPatientVisits(selectedPatient || undefined, q || undefined))
    } catch {
      setVisitOptions([])
    }
  }

  const rowsCount =
    !data ? null
    : report === 'receipts' ? (data.op?.length || 0) + (data.payment_only?.length || 0) + (data.ip?.length || 0)
    : report === 'ip-payments' ? (data.discounts?.length || 0) + (data.paid?.length || 0)
    : Object.values(data.categories || {}).reduce((s: number, v: any) => s + v.length, 0)

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['receipts', 'Patient Receipts Summary'],
            ['ip-payments', 'IP Payments & Discounts'],
            ['soa', 'Statement of Account (IP)'],
            ['soa-op', 'Statement of Account (OP)'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setReport(id)
              setData(null)
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
              report === id
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-4 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From Date</label>
          <DateFilterInput value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To Date</label>
          <DateFilterInput value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white" />
        </div>
        {needsAdmission && activeAdmission ? (
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-slate-500">Case</label>
            <div className="h-[30px] flex items-center rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 truncate" title={headerCaseLabel}>
              {activeAdmission}
            </div>
          </div>
        ) : needsAdmission ? (
          <div className="relative flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-slate-500">Admission / Case</label>
            <input
              type="text"
              value={admission ? admissionQuery || admission : admissionQuery}
              onChange={(e) => {
                setAdmissionQuery(e.target.value)
                setAdmission('')
                setAdmissionOpen(true)
                void searchAdmissions(e.target.value)
              }}
              onFocus={() => {
                setAdmissionOpen(true)
                void searchAdmissions(admissionQuery)
              }}
              onBlur={() => setTimeout(() => setAdmissionOpen(false), 150)}
              placeholder="Search admission…"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
            {admissionOpen && admissionOptions.length > 0 && (
              <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {admissionOptions.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onMouseDown={() => {
                      setAdmission(o.name)
                      setAdmissionQuery(o.label || o.name)
                      setAdmissionOpen(false)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    {o.label || o.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {isSoaOp ? (
          <div className="relative flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-slate-500">
              Patient Visit <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={visit ? visitQuery || visit : visitQuery}
                onChange={(e) => {
                  setVisitQuery(e.target.value)
                  setVisit('')
                  setVisitOpen(true)
                  void searchVisits(e.target.value)
                }}
                onFocus={() => {
                  setVisitOpen(true)
                  void searchVisits(visitQuery)
                }}
                onBlur={() => setTimeout(() => setVisitOpen(false), 150)}
                placeholder={selectedPatient ? 'All visits for patient (leave blank)' : 'Search visit…'}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-7 text-sm bg-white"
              />
              {(visit || visitQuery) && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-1 my-auto h-6 w-6 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title="Clear visit"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setVisit('')
                    setVisitQuery('')
                    setVisitOpen(false)
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {visitOpen && visitOptions.length > 0 && (
              <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {visitOptions.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onMouseDown={() => {
                      setVisit(o.name)
                      setVisitQuery(o.label || o.name)
                      setVisitOpen(false)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    {o.label || o.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="h-[30px] self-end rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Run Report'}
        </button>
        {report === 'soa' ? (
          <button
            type="button"
            onClick={() => void chargePackageToToday()}
            disabled={chargingPackage || !resolvedAdmission}
            className="h-[30px] self-end rounded-md border border-emerald-600 bg-white px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            title="Create Quotation / Sales Order for unbilled package days up to today"
          >
            {chargingPackage ? 'Charging…' : 'Charge Package to Today'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => doExport('pdf')}
          disabled={!data}
          className="h-[30px] self-end rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => doExport('excel')}
          disabled={!data}
          className="h-[30px] self-end rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export Excel
        </button>
      </div>

      {data ? (
        <div className="rr-doc dense-listing overflow-x-auto">
          <style>{`
            .rr-doc table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            .rr-doc th, .rr-doc td { border: 1px solid #cbd5e1; padding: 3px 6px; text-align: left; font-size: 12px; }
            .rr-doc th { background: #f1f5f9; }
            .rr-doc td.num, .rr-doc th.num { text-align: right; }
            .rr-doc tr.total td { font-weight: 600; background: #f8fafc; }
            .rr-doc h3 { font-weight: 600; margin: 12px 0 4px; }
            .rr-doc .lh { display: flex; justify-content: space-between; gap: 16px; }
            .rr-doc .lh-name { font-weight: 700; }
            .rr-doc .lh-title { text-align: right; }
            .rr-doc .lh-title h1 { font-weight: 700; text-decoration: underline; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: buildHtml()?.html || '' }} />
        </div>
      ) : (
        <p className="py-10 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          {loading ? 'Loading…' : 'Set the filters and run the report'}
        </p>
      )}
      {rowsCount !== null && rowsCount === 0 && (
        <p className="py-4 text-center text-xs text-slate-400">NO RECORDS FOUND FOR THE SELECTED FILTERS</p>
      )}
    </section>
  )
}
