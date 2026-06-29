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
  const parts = Math.abs(n).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = `${parts.join('.')}`;
  return n < 0 ? `-PKR ${formatted}` : `PKR ${formatted}`;
}

function lineAmounts(item) {
  const qty       = parseFloat(item.quantity) || 0;
  const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
  const salesTax  = parseFloat(item.salesTaxApplicable) || 0;
  const unitPrice = qty > 0 ? valueExcl / qty : valueExcl;
  const lineTotal = valueExcl + salesTax;
  return { qty, valueExcl, salesTax, unitPrice, lineTotal };
}

function buildBuyerAddress(payload) {
  const parts = [payload.buyerAddress, payload.buyerProvince].filter(Boolean);
  return parts.join(', ') || '—';
}

function buildSellerAddress(payload) {
  const parts = [payload.sellerAddress, payload.sellerProvince].filter(Boolean);
  return parts.join(', ') || '—';
}

function generateInvoiceHTML(data) {
  const payload    = data.requestPayload || data.request_payload || {};
  const internalNo   = data.internalInvoiceNo || data.internal_invoice_no || null;
  const irn          = data.invoiceNumber || data.fbr_invoice_number
    || data.responsePayload?.invoiceNumber
    || data.response_payload?.invoiceNumber
    || null;
  const qrCode       = data.qrCode ?? data.qr_code ?? null;
  const items        = Array.isArray(payload.items) ? payload.items : [];

  const invoiceNumber = internalNo || irn || '—';
  const invoiceDateRaw = payload.invoiceDate || data.invoice_date || null;
  const invoiceDate    = parseInvoiceDate(invoiceDateRaw);
  const dueDate        = invoiceDate ? addDays(invoiceDate, 30) : null;

  const sellerName    = payload.sellerBusinessName || '—';
  const sellerNtn     = payload.sellerNTNCNIC || '—';
  const sellerAddress = buildSellerAddress(payload);

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
          <td class="col-item">${i + 1}</td>
          <td class="col-desc">${escapeHtml(item.productDescription || '—')}</td>
          <td class="col-qty num">${qty > 0 ? qty : '—'}</td>
          <td class="col-unit num">${formatPkr(unitPrice)}</td>
          <td class="col-tax num">${formatPkr(tax)}</td>
          <td class="col-total num">${formatPkr(lineTotal)}</td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="6" class="empty-row">No line items</td></tr>`;

  const furtherTax = items.reduce((s, it) => s + (parseFloat(it.furtherTax) || 0), 0);
  const totalDue     = data.total_amount != null
    ? parseFloat(data.total_amount)
    : subtotal + salesTax + furtherTax;

  if (data.subtotal != null) subtotal = parseFloat(data.subtotal) || subtotal;
  if (data.sales_tax != null) salesTax = parseFloat(data.sales_tax) || salesTax;

  const irnDisplay = irn || '—';
  const thankYouName = sellerName !== '—' ? sellerName : 'Planetive';

  const qrBlock = qrCode
    ? `<img src="${qrCode}" alt="FBR verification QR code" class="qr-image" />
       <p class="qr-label">Scan to verify</p>`
    : `<p class="qr-pending">QR code pending</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice — ${escapeHtml(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital@0;1&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      color: #1A1A1A;
      background: #F5F7F5;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      margin: 0;
    }

    .invoice {
      width: 210mm;
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }

    /* ── 1. Header bar ── */
    .header-bar {
      background: #0A3D2E;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 3px solid #2ECC8B;
    }

    .header-logo { height: 48px; width: auto; display: block; object-fit: contain; }

    .header-brand {
      text-align: right;
    }

    .header-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #FFFFFF;
      line-height: 1.3;
    }

    .header-subtitle {
      font-size: 0.75rem;
      font-weight: 500;
      color: #2ECC8B;
      margin-top: 0.125rem;
    }

    /* ── Body ── */
    .invoice-body {
      padding: 1.75rem 2rem 1.25rem;
      flex: 1;
    }

    /* ── 2. Meta row ── */
    .meta-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 1.75rem;
    }

    .meta-left .meta-line {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
      font-size: 0.875rem;
    }

    .meta-label {
      color: #556B5E;
      font-weight: 500;
      min-width: 7rem;
    }

    .meta-value {
      color: #1A1A1A;
      font-weight: 600;
    }

    .bill-to-heading {
      font-size: 0.875rem;
      font-weight: 600;
      color: #0A3D2E;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.5rem;
    }

    .bill-to-name {
      font-size: 1rem;
      font-weight: 700;
      color: #1A1A1A;
      margin-bottom: 0.25rem;
    }

    .bill-to-line {
      font-size: 0.875rem;
      color: #556B5E;
      margin-bottom: 0.125rem;
    }

    /* ── 3. Section heading ── */
    .section-heading {
      font-family: 'Libre Baskerville', Georgia, 'Times New Roman', serif;
      font-size: 1.125rem;
      font-weight: 400;
      font-style: italic;
      color: #0A3D2E;
      padding-bottom: 0.375rem;
      margin-bottom: 1rem;
      border-bottom: 2px solid #2ECC8B;
    }

    /* ── 4. Items table ── */
    .items-table-wrap {
      border: 1px solid #D8E8E0;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 1.25rem;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }

    table.items thead th {
      background: #0A3D2E;
      color: #FFFFFF;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.625rem 0.75rem;
      text-align: left;
      border: 1px solid #0A3D2E;
    }

    table.items tbody td {
      padding: 0.625rem 0.75rem;
      border: 1px solid #D8E8E0;
      vertical-align: top;
    }

    table.items tbody tr.row-even { background: #FFFFFF; }
    table.items tbody tr.row-odd  { background: #F5FAF7; }

    table.items td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    table.items .col-item { width: 3rem; text-align: center; }
    table.items .col-qty  { width: 4.5rem; }
    table.items .empty-row {
      text-align: center;
      color: #556B5E;
      padding: 1.5rem;
    }

    /* ── 5. Totals ── */
    .totals-block {
      margin-left: auto;
      width: min(100%, 18rem);
      font-size: 0.875rem;
      margin-bottom: 1.75rem;
    }

    .totals-line {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.25rem 0;
      color: #556B5E;
    }

    .totals-line span:last-child {
      font-weight: 600;
      color: #1A1A1A;
      font-variant-numeric: tabular-nums;
    }

    .totals-divider {
      border: none;
      border-top: 2px solid #2ECC8B;
      margin: 0.5rem 0;
    }

    .totals-grand {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding-top: 0.25rem;
      font-size: 1rem;
      font-weight: 700;
      color: #0A3D2E;
    }

    .totals-grand span:last-child {
      font-variant-numeric: tabular-nums;
    }

    /* ── 6. Footer row ── */
    .footer-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #D8E8E0;
      align-items: start;
    }

    .footer-seller-logo { height: 48px; width: auto; display: block; object-fit: contain; margin-bottom: 0.75rem; }

    .footer-seller-name {
      font-size: 0.875rem;
      font-weight: 700;
      color: #0A3D2E;
      margin-bottom: 0.25rem;
    }

    .footer-seller-line {
      font-size: 0.8125rem;
      color: #556B5E;
      margin-bottom: 0.125rem;
    }

    .footer-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.75rem;
    }

    .irn-box {
      background: #A8F0D4;
      border: 1px solid #0A3D2E;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      width: 100%;
      max-width: 16rem;
    }

    .irn-label {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0A3D2E;
      margin-bottom: 0.25rem;
    }

    .irn-value {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #0A3D2E;
      word-break: break-all;
      font-family: ui-monospace, monospace;
    }

    .qr-wrap {
      text-align: center;
    }

    .qr-image {
      width: 120px;
      height: 120px;
      display: block;
      margin: 0 auto;
    }

    .qr-label {
      font-size: 0.6875rem;
      color: #556B5E;
      margin-top: 0.375rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .qr-pending {
      font-size: 0.8125rem;
      color: #556B5E;
      font-style: italic;
    }

    /* ── 7. Bottom bar ── */
    .bottom-bar {
      background: #0A3D2E;
      padding: 0.875rem 2rem;
      text-align: center;
      margin-top: auto;
    }

    .bottom-bar p {
      color: #A8F0D4;
      font-size: 0.85rem;
      font-weight: 500;
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
        min-height: 297mm;
        margin: 0;
        box-shadow: none;
        border: none;
        border-radius: 0;
      }

      .header-bar,
      table.items thead th,
      .bottom-bar {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .items-table-wrap,
      table.items,
      table.items tbody {
        page-break-inside: avoid;
      }

      table.items tr {
        page-break-inside: avoid;
      }

      .footer-row {
        page-break-inside: avoid;
      }
    }

    @media screen {
      body { padding: 1.5rem 1rem 2rem; }
      .invoice {
        box-shadow: 0 2px 12px rgba(10, 61, 46, 0.08);
        border: 1px solid #D8E8E0;
        border-radius: 10px;
        overflow: hidden;
      }
    }
  </style>
</head>
<body>
  <div class="invoice">

    <header class="header-bar">
      <img src="/logo.jpeg" alt="Planetive" class="header-logo" />
      <div class="header-brand">
        <div class="header-title">FBR Digital Invoicing</div>
        <div class="header-subtitle">A Planetive Project</div>
      </div>
    </header>

    <div class="invoice-body">

      <div class="meta-row">
        <div class="meta-left">
          <div class="meta-line">
            <span class="meta-label">Invoice Number:</span>
            <span class="meta-value">${escapeHtml(invoiceNumber)}</span>
          </div>
          <div class="meta-line">
            <span class="meta-label">Date:</span>
            <span class="meta-value">${escapeHtml(formatDisplayDate(invoiceDate))}</span>
          </div>
          <div class="meta-line">
            <span class="meta-label">Due Date:</span>
            <span class="meta-value">${escapeHtml(formatDisplayDate(dueDate))}</span>
          </div>
        </div>
        <div class="meta-right">
          <div class="bill-to-heading">Bill to:</div>
          <div class="bill-to-name">${escapeHtml(buyerName)}</div>
          <div class="bill-to-line">${escapeHtml(buyerAddress)}</div>
          <div class="bill-to-line">NTN/CNIC: ${escapeHtml(buyerNtn)}</div>
          ${buyerPhone ? `<div class="bill-to-line">Phone: ${escapeHtml(buyerPhone)}</div>` : ''}
        </div>
      </div>

      <h2 class="section-heading">Description of Services</h2>

      <div class="items-table-wrap">
        <table class="items">
          <thead>
            <tr>
              <th class="col-item">Item</th>
              <th class="col-desc">Description</th>
              <th class="col-qty">Quantity</th>
              <th class="col-unit">Unit Price (PKR)</th>
              <th class="col-tax">Sales Tax (PKR)</th>
              <th class="col-total">Total (PKR)</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div class="totals-block">
        <div class="totals-line">
          <span>Subtotal:</span>
          <span>${formatPkr(subtotal)}</span>
        </div>
        <div class="totals-line">
          <span>Sales Tax:</span>
          <span>${formatPkr(salesTax)}</span>
        </div>
        <hr class="totals-divider" />
        <div class="totals-grand">
          <span>Total Amount Due:</span>
          <span>${formatPkr(totalDue)}</span>
        </div>
      </div>

      <div class="footer-row">
        <div class="footer-left">
          <img src="/logo.jpeg" alt="Planetive" class="footer-seller-logo" />
          <div class="footer-seller-name">${escapeHtml(sellerName)}</div>
          <div class="footer-seller-line">${escapeHtml(sellerAddress)}</div>
          <div class="footer-seller-line">NTN: ${escapeHtml(sellerNtn)}</div>
        </div>
        <div class="footer-right">
          <div class="irn-box">
            <div class="irn-label">FBR Invoice Number</div>
            <div class="irn-value">${escapeHtml(irnDisplay)}</div>
          </div>
          <div class="qr-wrap">${qrBlock}</div>
        </div>
      </div>

    </div><!-- /invoice-body -->

    <footer class="bottom-bar">
      <p>Thank you for your business — ${escapeHtml(thankYouName)}</p>
    </footer>

  </div>
</body>
</html>`;
}

module.exports = {
  generateInvoiceHTML,
  formatPkr,
  formatDisplayDate,
  parseInvoiceDate,
};
