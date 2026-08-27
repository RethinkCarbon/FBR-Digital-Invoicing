'use strict';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseInvoiceDate(raw) {
  if (!raw) return null;
  const d = new Date(String(raw).slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(raw) {
  const d = raw instanceof Date ? raw : parseInvoiceDate(raw);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function formatPkr(amount) {
  const v = parseFloat(amount);
  const n = Number.isFinite(v) ? v : 0;
  const rounded = Math.round(n);
  const formatted = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return rounded < 0 ? `-PKR ${formatted}` : `PKR ${formatted}`;
}

function formatPlainAmount(amount) {
  const v = parseFloat(amount);
  const n = Number.isFinite(v) ? v : 0;
  const rounded = Math.round(n);
  const formatted = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return rounded < 0 ? `-${formatted}` : formatted;
}

function lineAmounts(item) {
  const qty       = parseFloat(item.quantity) || 0;
  const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
  const salesTax  = parseFloat(item.salesTaxApplicable) || 0;
  const unitPrice = qty > 0 ? valueExcl / qty : valueExcl;
  // Template matches the "TOTAL (US$)" column from the screenshot (excluding sales tax).
  const lineTotal = valueExcl;
  return { qty, valueExcl, salesTax, unitPrice, lineTotal };
}

function formatRate(rate) {
  const v = parseFloat(rate);
  if (!Number.isFinite(v)) return '—';
  const isInt = Math.abs(v - Math.round(v)) < 1e-9;
  return isInt ? String(Math.round(v)) : String(v);
}

function parsePercent(value) {
  if (value == null || value === '') return null;
  const match = String(value).match(/-?[\d.]+/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Prefer a real WHT rate/amount over DB defaults of 0 when the payload still has the value. */
function resolveWithholding(source = {}, payload = {}, totalDue = 0) {
  const rateCandidates = [
    source.withholding_rate,
    source.wht_rate,
    payload.withholdingRate,
    payload.withholding_rate,
  ].map(parsePercent).filter(n => n != null);
  const rate = rateCandidates.find(n => n > 0) ?? rateCandidates[0] ?? 0;

  const amountCandidates = [
    source.withholding_amount,
    payload.withholdingAmount,
    payload.withholding_amount,
  ].map(parsePercent).filter(n => n != null);
  const storedAmount = amountCandidates.find(n => n > 0) ?? amountCandidates[0];
  const withholdingAmount = (storedAmount != null && !(storedAmount === 0 && rate > 0))
    ? storedAmount
    : totalDue * (rate / 100);

  const netCandidates = [
    source.net_payable,
    payload.netPayable,
    payload.net_payable,
  ].map(parsePercent).filter(n => n != null);
  const storedNet = netCandidates.find(n => n !== 0) ?? netCandidates[0];
  const netPayable = (storedNet != null && !(storedAmount === 0 && rate > 0))
    ? storedNet
    : totalDue - withholdingAmount;

  return { withholdingRate: rate, withholdingAmount, netPayable };
}

function buildBuyerAddress(payload) {
  const parts = [payload.buyerAddress, payload.buyerProvince].filter(Boolean);
  return parts.join(', ') || '—';
}

function buildSellerAddress(payload) {
  // Province is shown separately on FBR forms; exclude it from the address line
  return payload.sellerAddress || '—';
}

function compactAddressLines(address) {
  return String(address || '—')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function firstTaxRate(items, payload) {
  const raw = items.find(item => item?.rate != null && String(item.rate).trim())?.rate
    || payload?.taxRate
    || null;
  if (raw == null || raw === '') return '15%';
  return String(raw).includes('%') ? String(raw) : `${raw}%`;
}

function bankDetailLines(data) {
  const bank = data.bankDetails || data.bank_details || {};
  return [
    ['Account Title', bank.accountTitle || 'Planetive (Private) Limited'],
    ['Bank Detail', bank.bankName || 'Habib Bank Limited'],
    ['IBAN', bank.iban || '—'],
  ];
}

function generateInvoiceHTML(data) {
  const payload    = data.requestPayload || data.request_payload || {};
  const internalNo   = data.internalInvoiceNo || data.internal_invoice_no || null;
  const fbrIrn       = data.invoiceNumber || data.fbr_invoice_number
    || data.responsePayload?.invoiceNumber
    || data.response_payload?.invoiceNumber
    || null;
  const qrCode       = data.qrCode ?? data.qr_code ?? null;
  const items        = Array.isArray(payload.items) ? payload.items : [];

  const invoiceNumber = internalNo || fbrIrn || '—';
  const invoiceDateRaw = payload.invoiceDate || data.invoice_date || null;
  const invoiceDate    = parseInvoiceDate(invoiceDateRaw);
  const dueDate        = invoiceDate ? addDays(invoiceDate, 30) : null;

  const sellerName    = payload.sellerBusinessName || '—';
  const sellerNtn     = payload.sellerNTNCNIC || '—';
  const sellerAddress = buildSellerAddress(payload);
  const sellerStrn    = payload.sellerSTRN || payload.sellerStrn || data.seller_strn || null;
  const sellerPhone   = payload.sellerPhone || payload.seller_phone || data.seller_phone || null;

  const buyerName    = payload.buyerBusinessName || data.buyer_name || '—';
  const buyerAddress = buildBuyerAddress(payload);
  const buyerNtn     = payload.buyerNTNCNIC || data.buyer_ntn || '—';
  const buyerPhone   = payload.buyerPhone || payload.buyer_phone || data.buyer_phone || null;

  let subtotal = 0;
  let salesTax = 0;

  const itemRows = items.length
    ? items.map((item, i) => {
      const { qty, salesTax: tax, unitPrice, lineTotal } = lineAmounts(item);
      const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
      subtotal += valueExcl;
      salesTax += tax;

      return `
        <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
          <td class="col-desc">${escapeHtml(item.productDescription || '—')}</td>
          <td class="col-qty num">${qty > 0 ? qty : '—'}</td>
          <td class="col-unit num">${formatPlainAmount(unitPrice)}</td>
          <td class="col-total num">${formatPlainAmount(lineTotal)}</td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="4" class="empty-row">No line items</td></tr>`;

  const fillerRows = Array.from({ length: Math.max(0, 5 - items.length) }, () => `
        <tr class="filler-row">
          <td class="col-desc">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-unit">&nbsp;</td>
          <td class="col-total">&nbsp;</td>
        </tr>`).join('');

  const furtherTax = items.reduce((s, it) => s + (parseFloat(it.furtherTax) || 0), 0);

  // Apply saved invoice overrides before computing totals
  if (data.subtotal != null) subtotal = parseFloat(data.subtotal) || subtotal;
  if (data.sales_tax != null) salesTax = parseFloat(data.sales_tax) || salesTax;

  const totalDue     = data.total_amount != null
    ? parseFloat(data.total_amount)
    : subtotal + salesTax + furtherTax;

  const { withholdingRate, withholdingAmount, netPayable } = resolveWithholding(data, payload, totalDue);
  const salesTaxRateLabel = firstTaxRate(items, payload);
  const sellerLines = compactAddressLines(sellerAddress);
  const bankLines = bankDetailLines(data);
  const paymentTerms = data.payment_terms || data.paymentTerms || '—';
  const paymentMethod = data.payment_method || data.paymentMethod || '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice — ${escapeHtml(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Libre+Baskerville:ital@1&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: #111111;
      background: #f3f5f4;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      margin: 0;
    }

    .invoice {
      width: 210mm;
      max-width: 210mm;
      height: 297mm;
      max-height: 297mm;
      margin: 0 auto;
      background: #FFFFFF;
      padding: 10mm 8mm 0;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .invoice-content {
      flex: 1;
      padding-bottom: 6mm;
      overflow: hidden;
    }

    .top-bar,
    .bottom-bar {
      height: 6mm;
      background: #0f9ea0;
      flex-shrink: 0;
    }

    .top-bar { margin: -10mm -8mm 8mm; }
    .bottom-bar { margin: 0 -8mm; }

    /* ── TOP HEADER: 3-col grid (logo+seller | title | date+meta) ── */
    .header-grid {
      display: grid;
      grid-template-columns: 180px 1fr 155px;
      gap: 4mm;
      align-items: start;
      margin-bottom: 5mm;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2.5mm;
      /* Excel template starts seller details a bit lower under logo */
      padding-top: 1mm;
    }

    .logo {
      width: 130px;
      height: auto;
      display: block;
      border: none;
      outline: none;
      background: transparent;
    }

    .seller-block {
      font-size: 9px;
      line-height: 1.5;
      color: #111111;
      margin-top: 9mm;
    }

    .seller-block div {
      color: #111111 !important;
    }

    .header-center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-top: 5mm;
    }

    .invoice-title {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.06em;
      line-height: 1.2;
      color: #111111;
      text-transform: uppercase;
    }

    .header-right {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      /* Keep right-side meta parallel with seller info block */
      padding-top: 19mm;
      font-size: 9.5px;
      color: #111111;
    }

    .meta-row {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 3mm;
      width: 100%;
    }

    .meta-row span:first-child {
      min-width: 56px;
      white-space: nowrap;
      color: #111111;
    }

    .meta-line-fill {
      flex: 1;
      border-bottom: 1px solid #aaaaaa;
      min-height: 10px;
      padding-bottom: 1px;
    }

    .meta-note {
      font-weight: 700;
      margin-top: 2mm;
      line-height: 1.6;
      font-size: 9.5px;
      text-align: right;
      width: 100%;
      color: #111111;
    }

    .bill-to {
      width: 46%;
      margin-left: auto;
      margin-bottom: 7mm;
      font-size: 10px;
    }

    .bill-to-title {
      font-weight: 700;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }

    .bill-line {
      display: flex;
      gap: 6px;
      margin-bottom: 2mm;
      align-items: baseline;
    }

    .bill-line strong {
      min-width: 78px;
    }

    .bill-fill {
      flex: 1;
      border-bottom: 1px solid #b7b7b7;
      min-height: 10px;
      padding-bottom: 1px;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
      margin-bottom: 6mm;
    }

    table.items th {
      background: #0f9ea0;
      color: #ffffff;
      border: 1px solid #8fa3a3;
      padding: 4px 6px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
    }

    table.items td {
      border: 1px solid #c7c7c7;
      padding: 5px 6px;
      vertical-align: top;
      height: 27px;
    }

    table.items .col-desc { width: 53%; }
    table.items .col-qty { width: 17%; text-align: center; }
    table.items .col-unit,
    table.items .col-total,
    table.items td.num {
      width: 15%;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .empty-row {
      text-align: center;
      color: #666;
      font-style: italic;
    }

    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 6mm;
      align-items: start;
    }

    .bank-block {
      font-size: 10px;
      padding-top: 2mm;
    }

    .bank-title {
      font-weight: 700;
      margin-bottom: 2mm;
      text-decoration: underline;
    }

    .bank-line {
      display: flex;
      gap: 6px;
      margin-bottom: 1.5mm;
    }

    .bank-line strong {
      min-width: 82px;
    }

    .qr-block {
      margin-top: 4mm;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .qr-block img {
      width: 64px;
      height: 64px;
      display: block;
    }

    .qr-label {
      font-size: 8px;
      color: #555;
      font-style: italic;
    }

    .qr-placeholder {
      margin-top: 4mm;
      width: 64px;
      height: 64px;
      border: 1px dashed #9aa3a3;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      color: #666;
      text-align: center;
      line-height: 1.2;
    }

    .totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      table-layout: fixed;
    }

    .totals-table td {
      padding: 2px 0;
      vertical-align: top;
    }

    .totals-table td:first-child {
      text-align: right;
      font-weight: 600;
      padding-right: 8px;
      white-space: nowrap;
    }

    .totals-table td:last-child {
      text-align: right;
      width: 74px;
      font-variant-numeric: tabular-nums;
      border-bottom: 1px solid #bdbdbd;
      white-space: nowrap;
      overflow: hidden;
    }

    .totals-table tr.net td {
      font-weight: 800;
    }

    .disclaimer {
      margin-top: 12mm;
      text-align: center;
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 9px;
      font-style: italic;
      color: #444;
    }

    /* ── Print ── */
    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }

      html, body {
        width: 210mm;
        height: auto;
        margin: 0;
        padding: 0;
        background: #FFFFFF;
      }

      body {
        background: #FFFFFF;
        padding: 0;
        margin: 0;
      }

      .invoice {
        width: 210mm;
        max-width: 210mm;
        height: 297mm;
        max-height: 297mm;
        margin: 0;
        box-shadow: none;
        border: none;
        border-radius: 0;
        overflow: hidden;
      }

      .bottom-bar {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }

    @media screen {
      body { padding: 1.5rem 1rem 2rem; }
      .invoice {
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        border: 1px solid #d9dddd;
        border-radius: 2px;
        overflow: hidden;
      }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="top-bar"></div>
    <div class="invoice-content">

    <div class="header-grid">
      <div class="header-left">
        <img src="/logo.png" alt="Planetive" class="logo" />
        <div class="seller-block">
          <div>${escapeHtml(sellerName)}</div>
          <div>${escapeHtml(sellerAddress)}</div>
          ${sellerPhone ? `<div>Tel: ${escapeHtml(sellerPhone)}</div>` : ''}
          ${sellerStrn ? `<div>STRN # ${escapeHtml(sellerStrn)}</div>` : ''}
          <div>NTN # ${escapeHtml(sellerNtn)}</div>
        </div>
      </div>

      <div class="header-center">
        <div class="invoice-title">Invoice</div>
      </div>

      <div class="header-right">
        <div class="meta-row"><span>Date:</span><span class="meta-line-fill">${escapeHtml(formatDisplayDate(invoiceDate))}</span></div>
        <div class="meta-row"><span>Invoice No.</span><span class="meta-line-fill">${escapeHtml(internalNo || '—')}</span></div>
        <div class="meta-row"><span>FBR IRN</span><span class="meta-line-fill">${escapeHtml(fbrIrn || '—')}</span></div>
        <div class="meta-note">
          <div>Payment Terms</div>
          <div>Method of Payment: ${escapeHtml(paymentMethod === '—' ? paymentTerms : paymentMethod)}</div>
        </div>
      </div>
    </div>

    <div class="bill-to">
      <div class="bill-to-title">BILL TO</div>
      <div class="bill-line"><strong>Company Name:</strong><span class="bill-fill">${escapeHtml(buyerName)}</span></div>
      <div class="bill-line"><strong>Address:</strong><span class="bill-fill">${escapeHtml(buyerAddress)}</span></div>
      <div class="bill-line"><strong>Phone:</strong><span class="bill-fill">${escapeHtml(buyerPhone || '—')}</span></div>
      <div class="bill-line"><strong>NTN:</strong><span class="bill-fill">${escapeHtml(buyerNtn)}</span></div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="col-desc">DESCRIPTION</th>
          <th class="col-qty">QTY</th>
          <th class="col-unit">UNIT PRICE</th>
          <th class="col-total">TOTAL (US$)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${fillerRows}
      </tbody>
    </table>

    <div class="bottom-grid">
      <div class="bank-block">
        <div class="bank-title">Bank Details :</div>
        ${bankLines.map(([label, value]) => `
          <div class="bank-line">
            <strong>${escapeHtml(label)}:</strong>
            <span>${escapeHtml(value)}</span>
          </div>`).join('')}
        ${qrCode ? `
        <div class="qr-block">
          <img src="${qrCode}" alt="FBR QR code" />
          <span class="qr-label">Scan to verify<br/>on FBR portal</span>
        </div>` : '<div class="qr-placeholder">QR appears here after submission</div>'}
      </div>

      <table class="totals-table">
        <tbody>
          <tr><td>SUBTOTAL (US$)</td><td>${formatPlainAmount(subtotal)}</td></tr>
          <tr><td>Sales Tax Rate : ${escapeHtml(salesTaxRateLabel)} &nbsp; Add: SALES TAX (US$)</td><td>${formatPlainAmount(salesTax)}</td></tr>
          <tr><td>TOTAL (US$)</td><td>${formatPlainAmount(totalDue)}</td></tr>
          <tr><td>WHT Rate : ${formatRate(withholdingRate)}% &nbsp; Less: WHT TAX (US$)</td><td>${formatPlainAmount(withholdingAmount)}</td></tr>
          <tr class="net"><td>NET PAYABLE (US$)</td><td>${formatPlainAmount(netPayable)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="disclaimer">This is a computer-generated invoice and does not require authorization/stamp.</div>

    </div><!-- /invoice-content -->
    <div class="bottom-bar"></div>
  </div>
</body>
</html>`;
}

module.exports = {
  generateInvoiceHTML,
  formatPkr,
  formatDisplayDate,
  parseInvoiceDate,
  formatRate,
  resolveWithholding,
};
