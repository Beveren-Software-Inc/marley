/** Print a Hygiene label via hidden iframe (same size as lab: 2.299in × 1.5in).
 * Layout: Serene logo + Open Date / Expiry Date fields (blank for handwriting). */

import sereneLogo from '../assets/serene-logo.png'

const PRINT_FRAME_ID = 'hc-hygiene-barcode-print-frame'

function formatLabelDate(iso: string): string {
  const parts = (iso || '').trim().split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d}-${m}-${y}`
}

function buildLabelHtml(openLabel: string, expiryLabel: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hygiene Label</title>
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 2.299in;
      height: 1.5in;
      overflow: hidden;
      background: #fff;
    }
    @page { size: 2.299in 1.5in; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      @page { size: 2.299in 1.5in; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    *, *::before, *::after { box-sizing: border-box; }
    .hygiene-label {
      width: 2.299in;
      height: 1.5in;
      max-height: 1.5in;
      padding: 0.06in 0.08in 0.07in;
      overflow: hidden;
      background: #fff;
      border: 1px solid #000;
      font-family: "Times New Roman", Times, serif;
      color: #000;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .logo-wrap {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.02in 0 0.04in;
    }
    .logo {
      height: 0.52in;
      max-height: 100%;
      width: auto;
      max-width: 2.05in;
      object-fit: contain;
      display: block;
    }
    .fields {
      flex: 0 0 auto;
      width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
      line-height: 1.1;
    }
    td {
      border: 1px solid #000;
      padding: 0.03in 0.05in;
      vertical-align: middle;
      height: 0.24in;
    }
    td.lbl {
      width: 42%;
      font-weight: 700;
      white-space: nowrap;
    }
    td.val {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="hygiene-label">
    <div class="logo-wrap">
      <img class="logo" src="${sereneLogo}" alt="SERENE" />
    </div>
    <div class="fields">
      <table>
        <tr>
          <td class="lbl">Open Date:</td>
          <td class="val">${openLabel}</td>
        </tr>
        <tr>
          <td class="lbl">Expiry Date:</td>
          <td class="val">${expiryLabel}</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`
}

function printHtmlInPlace(html: string): void {
  const existing = document.getElementById(PRINT_FRAME_ID)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = PRINT_FRAME_ID
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('Unable to prepare print view')
  }

  doc.open()
  doc.write(html)
  doc.close()

  const triggerPrint = () => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(() => {
        iframe.remove()
      }, 1500)
    }
  }

  const images = Array.from(doc.images || [])
  if (!images.length) {
    window.setTimeout(triggerPrint, 80)
    return
  }
  let pending = images.length
  const onReady = () => {
    pending -= 1
    if (pending <= 0) window.setTimeout(triggerPrint, 50)
  }
  for (const img of images) {
    if (img.complete) onReady()
    else {
      img.addEventListener('load', onReady, { once: true })
      img.addEventListener('error', onReady, { once: true })
    }
  }
}

export function openHygieneBarcodePrint(openDate = '', expiryDate = ''): void {
  const openLabel = formatLabelDate(openDate)
  const expiryLabel = formatLabelDate(expiryDate)
  printHtmlInPlace(buildLabelHtml(openLabel, expiryLabel))
}
