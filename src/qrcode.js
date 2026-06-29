'use strict';

const QRCode = require('qrcode');

function buildQrPayload(data) {
  // Extend later (e.g. JSON or combined fields) without changing generation logic.
  return data.invoiceNumber;
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

async function generateInvoiceQR(invoiceNumber) {
  try {
    const payload = buildQrPayload({ invoiceNumber });
    return await QRCode.toDataURL(payload);
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

  if (!irn) return null;

  const dataUrl = await generateInvoiceQR(irn);
  return qrDataUrlToBuffer(dataUrl);
}

module.exports = {
  buildQrPayload,
  qrDataUrlToBuffer,
  generateInvoiceQR,
  resolveInvoiceQrBuffer,
};
