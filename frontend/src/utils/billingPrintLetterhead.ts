export type LetterHeadHtml = { content?: string; footer?: string }

const LETTERHEAD_FALLBACK = {
  name: 'SERENE PSYCHIATRY HOSPITAL W.L.L',
  address: 'Building 2093, Road 94, Block 960, Jau Bahrain',
  contact: 'Contact No. 13384444, 38853666',
  web: 'www.serenehospital.com',
}

export function letterHeadBlocks(letterHead?: LetterHeadHtml | null) {
  const content = String(letterHead?.content || '').trim()
  const footer = String(letterHead?.footer || '').trim()
  return {
    top: content ? `<div class="letter-head-top">${content}</div>` : '',
    footer: footer ? `<div class="letter-head-footer">${footer}</div>` : '',
  }
}

export function buildBillingPrintLetterhead(reportTitle: string, meta: string, letterHead?: LetterHeadHtml | null) {
  const { top } = letterHeadBlocks(letterHead)
  return `
    ${top}
    <div class="lh${top ? ' lh-cc' : ''}">
      ${
        top
          ? ''
          : `<div class="lh-box">
        <div class="lh-name">${LETTERHEAD_FALLBACK.name}</div>
        <div>${LETTERHEAD_FALLBACK.address}</div>
        <div>${LETTERHEAD_FALLBACK.contact}</div>
        <div>${LETTERHEAD_FALLBACK.web}</div>
      </div>`
      }
      <div class="lh-title">
        <h1>${reportTitle}</h1>
        <div class="lh-meta">${meta}</div>
        <div class="lh-meta">Printed on: ${new Date().toLocaleString('en-GB')}</div>
      </div>
    </div>`
}

export const BILLING_PRINT_LETTERHEAD_STYLES = `
  body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #0f172a; margin: 0; padding: 20px 24px; }
  .lh { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
  .lh.lh-cc { display: block; text-align: center; }
  .lh-box { line-height: 1.35; }
  .lh-name { font-weight: 700; font-size: 13px; color: #800000; margin-bottom: 2px; }
  .lh-title { text-align: center; flex: 1; }
  .lh-title h1 { color: #800000; font-size: 18px; margin: 0 0 6px; }
  .lh-meta { color: #800000; font-size: 11px; }
  .letter-head-top { margin-bottom: 10px; }
  .letter-head-top img, .letter-head-footer img { max-width: 100%; height: auto; }
  .letter-head-footer { margin-top: 16px; page-break-inside: avoid; }
  .letter-head-top table, .letter-head-footer table { border: none; margin-bottom: 0; width: 100%; }
  .letter-head-top td, .letter-head-footer td, .letter-head-top th, .letter-head-footer th {
    border: none; background: transparent;
  }
  table.data { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table.data th, table.data td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  table.data th { background: #f8fafc; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  table.data td.num, table.data th.num { text-align: right; }
`
