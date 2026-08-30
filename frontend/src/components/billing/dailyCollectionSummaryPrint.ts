import sereneLogo from '../../assets/serene-logo.png'
import type {
  DailyCollectionAmounts,
  DailyCollectionRow,
  DailyCollectionSummary,
} from '../../services/serviceOrders'

const HEADER = {
  name: 'SERENE PSYCHIATRY HOSPITAL W.L.L',
  address: 'Address: Building 1301,Road 4526,6th Floor,Juffair 345,Bahrain',
  contact: 'Contact No. 17686060,32177363,Fax No. 17686088',
  web: 'www.serenehospital.com',
}

const AMT_KEYS: (keyof DailyCollectionAmounts)[] = [
  'consultation',
  'pharmacy',
  'lab',
  'paid_previous',
  'disc_previous',
  'total_due',
  'cash',
  'cheque',
  'card',
  'bwallet',
  'disc',
  'balance',
]

const ZERO: DailyCollectionAmounts = {
  consultation: 0,
  pharmacy: 0,
  lab: 0,
  cash: 0,
  cheque: 0,
  card: 0,
  bwallet: 0,
  disc: 0,
  balance: 0,
  total_due: 0,
  paid_previous: 0,
  disc_previous: 0,
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fmtAmt(v: number | null | undefined): string {
  return Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

function fmtFilterDate(iso: string): string {
  const parts = (iso || '').split('-')
  if (parts.length !== 3) return iso || ''
  const [y, m, d] = parts
  return `${d}-${m}-${String(y).slice(-2)}`
}

function printedOnLabel(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  const day = d.getDate()
  const year = d.getFullYear()
  let hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${weekday} ${month} ${day} ${year} ${hours}:${minutes} ${ampm}`
}

function amountCells(row: DailyCollectionAmounts): string {
  return AMT_KEYS.map((k) => `<td class="num">${fmtAmt(row[k])}</td>`).join('')
}

function dataRow(row: DailyCollectionRow): string {
  return `<tr>
    <td>${esc(row.visit_no)}</td>
    <td class="nowrap">${esc(row.date)}</td>
    <td>${esc(row.file_no)}</td>
    <td>${esc(row.patient_name)}</td>
    <td>${esc(row.doctor_name)}</td>
    ${amountCells(row)}
  </tr>`
}

function totalRow(label: string, amounts: DailyCollectionAmounts, cls: string): string {
  return `<tr class="${cls}">
    <td colspan="5">${esc(label)}</td>
    ${amountCells(amounts)}
  </tr>`
}

function columnHeaderRow(): string {
  return `<tr class="colh">
    <td>Visit No.</td>
    <td>Date</td>
    <td>File No.</td>
    <td>Patient/Employee Name</td>
    <td>Doctor Name</td>
    <td>Consultation</td>
    <td>Pharmacy</td>
    <td>Lab</td>
    <td>Paid of<br/>Previous</td>
    <td>Disc. of<br/>Previous</td>
    <td>Total Due</td>
    <td>Cash</td>
    <td>Cheque /<br/>Online</td>
    <td>Credit Card</td>
    <td>B-Wallet/<br/>Benefit</td>
    <td>Disc.</td>
    <td>Balance</td>
  </tr>`
}

function patientTypeBlock(
  title: string,
  rows: DailyCollectionRow[],
  total: DailyCollectionAmounts,
): string {
  return `
    <tr class="section"><td colspan="17">${esc(title)}</td></tr>
    ${columnHeaderRow()}
    ${(rows || []).map(dataRow).join('')}
    ${totalRow('Patient Type Total', total || ZERO, 'type-total')}
  `
}

export function buildDailyCollectionSummaryHtml(data: DailyCollectionSummary): string {
  const fromLabel = fmtFilterDate(data.from_date)
  const toLabel = fmtFilterDate(data.to_date)
  const users = data.users?.length
    ? data.users
    : [
        {
          cashier: '',
          cashier_name: '',
          ip: [],
          op: [],
          ip_total: ZERO,
          op_total: ZERO,
          user_total: ZERO,
        },
      ]

  const usersHtml = users
    .map((user) => {
      const name = user.cashier_name || user.cashier || ''
      return `
        ${name ? `<tr class="user"><td colspan="17">${esc(name)}</td></tr>` : ''}
        ${patientTypeBlock('IP Patients', user.ip || [], user.ip_total)}
        ${patientTypeBlock('OP Patients', user.op || [], user.op_total)}
        ${totalRow('User Total', user.user_total || ZERO, 'user-total')}
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Daily Collection Summary</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Helvetica, Arial, sans-serif; font-size: 8px; color: #000; margin: 0; }
    .banner { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .banner td { border: 0; vertical-align: top; padding: 0; }
    .left { width: 34%; }
    .center { width: 32%; text-align: center; padding-top: 4px; }
    .right { width: 34%; text-align: right; }
    .co { border: 1px solid #000; padding: 4px 8px 6px; text-align: left; line-height: 1.35; }
    .co-name { font-weight: 700; font-size: 12px; color: #800000; margin-bottom: 2px; }
    .title {
      font-family: "Times New Roman", Times, serif;
      font-size: 18px; font-weight: 700; color: #800000;
      margin: 0 0 8px; padding-bottom: 2px;
      border-bottom: 2px solid #800000; display: inline-block;
    }
    .meta { color: #800000; font-weight: 700; font-size: 8px; }
    .right img { height: 52px; width: auto; }
    .sub { display: table; width: 100%; margin: 2px 0 6px; }
    .sub > div { display: table-cell; }
    .printed { color: #800000; font-weight: 700; font-size: 8px; }
    .page { color: #800000; font-weight: 700; font-size: 8px; text-align: right; }
    table.grid { width: 100%; border-collapse: collapse; }
    table.grid td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
    tr.colh td {
      background: #d6d6d6; color: #000080; font-size: 8px; font-weight: 700;
      text-align: center; line-height: 1.15;
    }
    td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.nowrap { white-space: nowrap; }
    tr.user td { background: #d6d6d6; color: #800000; font-weight: 700; font-size: 12px; }
    tr.section td { background: #d6d6d6; color: #000080; font-weight: 700; }
    tr.type-total td { color: #000080; font-weight: 700; }
    tr.user-total td { color: #000080; font-weight: 700; }
    tr.report-total td { color: #ff0000; font-weight: 700; }
    tr.report-total td:first-child { color: #000080; }
  </style>
</head>
<body>
  <table class="banner">
    <tr>
      <td class="left">
        <div class="co">
          <div class="co-name">${esc(HEADER.name)}</div>
          <div>${esc(HEADER.address)}</div>
          <div>${esc(HEADER.contact)}</div>
          <div>${esc(HEADER.web)}</div>
          <div>Branch: ${esc(data.branch || 'Serene Hospital')}</div>
        </div>
      </td>
      <td class="center">
        <div class="title">Daily Collection Summary</div>
        <div class="meta">From Date: ${esc(fromLabel)} to ${esc(toLabel)}</div>
      </td>
      <td class="right">
        <img src="${sereneLogo}" alt="SERENE Psychiatry Hospital" />
      </td>
    </tr>
  </table>
  <div class="sub">
    <div class="printed">${esc(printedOnLabel())}</div>
    <div class="page">Page 1 of 1</div>
  </div>
  <table class="grid">
    <tbody>
      ${usersHtml}
      ${totalRow('Report Total', data.report_total || ZERO, 'report-total')}
    </tbody>
  </table>
</body>
</html>`
}

export function openDailyCollectionSummaryPrint(data: DailyCollectionSummary): void {
  const win = window.open('', '_blank', 'width=1400,height=900')
  if (!win) return
  win.document.write(buildDailyCollectionSummaryHtml(data))
  win.document.close()
  win.focus()
  win.print()
}
