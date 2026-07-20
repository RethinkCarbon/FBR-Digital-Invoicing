'use strict';

const QRCode = require('qrcode');

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return !Number.isNaN(value);
  return String(value).trim() !== '';
}

/**
 * Build a minified JSON string for the invoice QR.
 * Accepts an invoice row (and optional overrides such as fbr invoice number).
 */
function buildQrPayload(invoice = {}) {
  const payload = invoice.request_payload || invoice.requestPayload || {};
  const irn = invoice.fbr_invoice_number
    || invoice.invoiceNumber
    || invoice.response_payload?.invoiceNumber
    || invoice.responsePayload?.invoiceNumber
    || null;

  const fields = {
    irn,
    seller_ntn:  payload.sellerNTNCNIC ?? invoice.seller_ntn ?? null,
    seller_name: payload.sellerBusinessName ?? invoice.seller_name ?? null,
    buyer_ntn:   payload.buyerNTNCNIC ?? invoice.buyer_ntn ?? null,
    buyer_name:  payload.buyerBusinessName ?? invoice.buyer_name ?? null,
    date:        invoice.invoice_date ?? payload.invoiceDate ?? null,
    total:       invoice.total_amount != null ? String(invoice.total_amount) : null,
    tax:         invoice.sales_tax != null ? String(invoice.sales_tax) : null,
    currency:    'PKR',
    verified:    true,
  };

  const compact = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!isPresent(value)) continue;
    compact[key] = typeof value === 'string' ? value.trim() : value;
  }

  return JSON.stringify(compact);
}

function qrDataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null;
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;
    return Buffer.from(match[2], 'base64');
  }
  return Buffer.from(dataUrl, 'base64');
}

/**
 * Generate a QR data URL from a full invoice row object.
 * Legacy string IRN argument is still accepted for compatibility.
 */
async function generateInvoiceQR(invoiceOrIrn) {
  try {
    const invoice = typeof invoiceOrIrn === 'string'
      ? { fbr_invoice_number: invoiceOrIrn }
      : (invoiceOrIrn || {});

    const text = buildQrPayload(invoice);
    if (!text || text === '{}') return null;

    return await QRCode.toDataURL(text, { errorCorrectionLevel: 'M' });
  } catch (err) {
    console.error('QR code generation failed:', err.message);
    return null;
  }
}

async function resolveInvoiceQrBuffer(invoice) {
  if (invoice?.qr_code) {
    const buf = qrDataUrlToBuffer(invoice.qr_code);
    if (buf) return buf;
  }

  const irn = invoice?.fbr_invoice_number
    || invoice?.request_payload?.invoiceNumber
    || invoice?.response_payload?.invoiceNumber;

  if (!irn && !invoice?.request_payload) return null;

  const dataUrl = await generateInvoiceQR(invoice);
  return qrDataUrlToBuffer(dataUrl);
}

module.exports = {
  buildQrPayload,
  qrDataUrlToBuffer,
  generateInvoiceQR,
  resolveInvoiceQrBuffer,
};
