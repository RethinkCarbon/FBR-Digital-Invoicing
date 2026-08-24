'use strict';

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');
const {
  formatPkr,
  formatDisplayDate,
  parseInvoiceDate,
} = require('./invoice-template');
const { qrDataUrlToBuffer } = require('./qrcode');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.png');

/** ISO A4 in PDF points (72 pt/in × 8.27in × 11.69in) */
const A4_WIDTH_PT  = 595.28;
const A4_HEIGHT_PT = 841.89;

const C = {
  teal:     '#0f9ea0',
  rowAlt:   '#ffffff',
  text:     '#111111',
  muted:    '#444444',
  border:   '#c7c7c7',
  white:    '#FFFFFF',
};

const MARGIN     = 40;
const HEADER_H   = 128;
const BOTTOM_H   = 28;

const TABLE_HEADER_H   = 18;
const TABLE_DATA_ROW_H = 38;
const TOTALS_BLOCK_H   = 104;
const FOOTER_BLOCK_H   = 110;

const TABLE_COLS = [
  { label: 'DESCRIPTION', width: 250, headerAlign: 'left',   align: 'left'   },
  { label: 'QTY',         width: 84,  headerAlign: 'center', align: 'center' },
  { label: 'UNIT PRICE',  width: 84,  headerAlign: 'right',  align: 'right'  },
  { label: 'TOTAL (US$)', width: 97,  headerAlign: 'right',  align: 'right'  },
];

function tableWidth(pageW = A4_WIDTH_PT) {
  return pageW - MARGIN * 2;
}

function buildTableColXs(pageW = A4_WIDTH_PT) {
  const xs = [];
  let x = MARGIN;
  for (const col of TABLE_COLS) {
    xs.push(x);
    x += col.width;
  }
  // Keep table aligned to printable width if page width ever differs
  const tw = tableWidth(pageW);
  const colSum = TABLE_COLS.reduce((s, c) => s + c.width, 0);
  if (Math.abs(colSum - tw) > 0.5) {
    const scale = tw / colSum;
    let sx = MARGIN;
    return TABLE_COLS.map(col => {
      const pos = sx;
      sx += col.width * scale;
      return pos;
    });
  }
  return xs;
}

function pageMetrics(doc) {
  const height = doc.page.height;
  const width  = doc.page.width;
  return {
    width,
    height,
    contentWidth: width - MARGIN * 2,
    bottomLimit:  height - BOTTOM_H - MARGIN,
  };
}

function addA4Page(doc) {
  doc.addPage({ size: [A4_WIDTH_PT, A4_HEIGHT_PT], margin: 0 });
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function parseQrBuffer(dataUrl) {
  return qrDataUrlToBuffer(dataUrl);
}

function formatPlainAmount(amount) {
  const v = parseFloat(amount);
  const n = Number.isFinite(v) ? v : 0;
  const rounded = Math.ceil(n);
  const formatted = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return rounded < 0 ? `-${formatted}` : formatted;
}

function formatRate(rate) {
  const v = parseFloat(rate);
  if (!Number.isFinite(v)) return '—';
  const isInt = Math.abs(v - Math.round(v)) < 1e-9;
  return isInt ? String(Math.round(v)) : String(v);
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

function buildBuyerAddress(payload) {
  const parts = [payload.buyerAddress, payload.buyerProvince].filter(Boolean);
  return parts.join(', ') || '—';
}

function buildSellerAddress(payload) {
  const parts = [payload.sellerAddress, payload.sellerProvince].filter(Boolean);
  return parts.join(', ') || '—';
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

function extractInvoiceData(invoice) {
  const payload = invoice.request_payload || {};

  const internalNo = invoice.internal_invoice_no || null;
  const irn        = invoice.fbr_invoice_number
    || invoice.response_payload?.invoiceNumber
    || payload.invoiceNumber
    || null;

  const invoiceNumber = internalNo || irn || '—';
  const invoiceDateRaw = payload.invoiceDate || invoice.invoice_date || null;
  const invoiceDate    = parseInvoiceDate(invoiceDateRaw);
  const dueDate        = invoiceDate ? addDays(invoiceDate, 30) : null;

  const items = Array.isArray(payload.items) ? payload.items : [];

  let subtotal = 0;
  let salesTax = 0;

  const rows = items.map((item, i) => {
    const { qty, salesTax: tax, unitPrice, lineTotal } = lineAmounts(item);
    const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
    subtotal += valueExcl;
    salesTax += tax;
    return {
      description: item.productDescription || '—',
      qty:         qty > 0 ? String(qty) : '—',
      unitPrice:   formatPlainAmount(unitPrice),
      lineTotal:   formatPlainAmount(lineTotal),
      alt:         i % 2 === 1,
    };
  });

  const furtherTax = items.reduce((s, it) => s + (parseFloat(it.furtherTax) || 0), 0);
  const withholdingRate = parseFloat(
    invoice.withholding_rate
    ?? invoice.wht_rate
    ?? payload.withholdingRate
    ?? payload.withholding_rate
    ?? 0
  ) || 0;

  // Apply saved invoice overrides before computing totals
  if (invoice.subtotal != null) subtotal = parseFloat(invoice.subtotal) || subtotal;
  if (invoice.sales_tax != null) salesTax = parseFloat(invoice.sales_tax) || salesTax;

  const totalDue = invoice.total_amount != null
    ? parseFloat(invoice.total_amount)
    : subtotal + salesTax + furtherTax;

  // Screenshot WHT is calculated on TOTAL (including sales tax).
  const withholdingAmount = invoice.withholding_amount != null
    ? parseFloat(invoice.withholding_amount) || 0
    : totalDue * (withholdingRate / 100);

  return {
    payload,
    invoiceNumber,
    dateDisplay: formatDisplayDate(invoiceDate),
    sellerName:    payload.sellerBusinessName || '—',
    sellerNtn:     payload.sellerNTNCNIC || '—',
    sellerStrn:    payload.sellerSTRN || payload.sellerStrn || invoice.seller_strn || null,
    sellerPhone:   payload.sellerPhone || payload.seller_phone || invoice.seller_phone || null,
    sellerAddress: buildSellerAddress(payload),
    buyerName:     payload.buyerBusinessName || invoice.buyer_name || '—',
    buyerAddress:  buildBuyerAddress(payload),
    buyerNtn:      payload.buyerNTNCNIC || invoice.buyer_ntn || '—',
    buyerPhone:    payload.buyerPhone || payload.buyer_phone || invoice.buyer_phone || null,
    rows,
    subtotal,
    salesTax,
    totalDue,
    withholdingRate,
    withholdingAmount,
    netPayable: totalDue - withholdingAmount,
    salesTaxRateLabel: firstTaxRate(items, payload),
    paymentTerms: invoice.payment_terms || invoice.paymentTerms || '—',
    paymentMethod: invoice.payment_method || invoice.paymentMethod || '—',
    sellerLines: compactAddressLines(buildSellerAddress(payload)),
    qrBuffer: parseQrBuffer(invoice.qr_code),
  };
}

function drawHeader(doc, pageW) {
  doc.rect(0, 0, pageW, 10).fill(C.teal);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, MARGIN - 4, 28, { width: 92 });
  }

  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(16)
    .text('PERFORMA SALES TAX INVOICE', 0, 28, { width: pageW, align: 'center' });
  return HEADER_H;
}

function drawBottomBar(doc) {
  const { width: pageW, height: pageH } = pageMetrics(doc);
  const y = pageH - 14;
  doc.rect(0, y, pageW, 10).fill(C.teal);
}

function ensureSpace(doc, y, needed, onNewPage) {
  const { bottomLimit } = pageMetrics(doc);
  if (y + needed <= bottomLimit) return y;
  addA4Page(doc);
  return onNewPage();
}

function drawMetaSection(doc, data, y, pageW) {
  const leftX = MARGIN - 8;
  const rightX = pageW - 170;

  let sy = 70;
  doc.fillColor(C.text).font('Helvetica').fontSize(8.5)
    .text(data.sellerName, leftX, sy);
  sy = doc.y + 2;
  data.sellerLines.forEach(line => {
    doc.text(line, leftX, sy, { width: 170 });
    sy = doc.y + 1;
  });
  if (data.sellerPhone) {
    doc.text(`Tel: ${data.sellerPhone}`, leftX, sy, { width: 170 });
    sy = doc.y + 1;
  }
  if (data.sellerStrn) {
    doc.text(`STRN # ${data.sellerStrn}`, leftX, sy, { width: 170 });
    sy = doc.y + 1;
  }
  doc.text(`NTN # ${data.sellerNtn}`, leftX, sy, { width: 170 });

  const drawMetaLine = (label, value, top) => {
    doc.fillColor(C.text).font('Helvetica').fontSize(8.5)
      .text(label, rightX, top, { width: 60 });
    doc.moveTo(rightX + 48, top + 9).lineTo(pageW - MARGIN, top + 9)
      .strokeColor('#b7b7b7').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(8)
      .text(value, rightX + 52, top + 1, { width: pageW - MARGIN - rightX - 56, align: 'left' });
  };

  drawMetaLine('Date:', data.dateDisplay, 74);
  drawMetaLine('Invoice No.', data.invoiceNumber, 96);

  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8)
    .text('Payment Terms', rightX + 36, 118, { width: 110, align: 'center' });
  doc.text(`Method of Payment: ${data.paymentMethod === '—' ? data.paymentTerms : data.paymentMethod}`, rightX - 10, 130, {
    width: pageW - MARGIN - rightX + 10,
    align: 'center',
  });

  const billX = pageW - 250;
  let by = 168;
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8.5)
    .text('BILL TO', billX, by);
  by += 14;

  const drawBillLine = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(8)
      .text(label, billX, by, { width: 78 });
    doc.moveTo(billX + 82, by + 9).lineTo(pageW - MARGIN, by + 9)
      .strokeColor('#b7b7b7').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(8)
      .text(value, billX + 86, by + 1, { width: pageW - MARGIN - billX - 90 });
    by += 18;
  };

  drawBillLine('Company Name:', data.buyerName);
  drawBillLine('Address:', data.buyerAddress);
  drawBillLine('Phone:', data.buyerPhone || '—');
  drawBillLine('NTN:', data.buyerNtn);

  return by + 8;
}

function drawSectionHeading(doc, y, contentW) {
  return y;
}

function drawTableHeader(doc, y, colXs, rowH, tw) {
  doc.rect(MARGIN, y, tw, rowH).fill(C.teal);

  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8);

  TABLE_COLS.forEach((col, i) => {
    doc.text(col.label, colXs[i], y + 4, {
      width: col.width,
      align: col.headerAlign,
      lineGap: 0,
    });
  });

  return y + rowH;
}

function drawTableRow(doc, row, y, colXs, rowH, tw) {
  doc.rect(MARGIN, y, tw, rowH).fill(C.white);

  doc.strokeColor(C.border).lineWidth(0.5)
    .rect(MARGIN, y, tw, rowH).stroke();

  const values = [
    row.description,
    row.qty,
    row.unitPrice,
    row.lineTotal,
  ];

  doc.fillColor(C.text).font('Helvetica').fontSize(8);
  TABLE_COLS.forEach((col, i) => {
    doc.text(values[i], colXs[i] + 4, y + 6, {
      width: col.width - 8,
      align: col.align,
      ellipsis: true,
    });
  });

  return y + rowH;
}

function drawTotals(doc, data, y, pageW) {
  const labelX = pageW - 255;
  const valueX = pageW - 78;
  const lineH = 16;
  const rows = [
    ['SUBTOTAL (US$)', formatPlainAmount(data.subtotal)],
    [`Sales Tax Rate: ${data.salesTaxRateLabel} add-SALES TAX (US$)`, formatPlainAmount(data.salesTax)],
    ['TOTAL (US$)', formatPlainAmount(data.totalDue)],
    [`WHT Rate : ${formatRate(data.withholdingRate)}%`, ''],
    ['Less- WHT TAX (US$)', formatPlainAmount(data.withholdingAmount)],
    ['NET PAYABLE (US$)', formatPlainAmount(data.netPayable)],
  ];

  doc.fontSize(8);
  rows.forEach(([label, value], idx) => {
    const ly = y + idx * lineH;
    doc.fillColor(C.text).font(idx === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica-Bold')
      .text(label, labelX, ly, { width: 170, align: 'right' });
    if (value) {
      doc.moveTo(valueX - 4, ly + 11).lineTo(pageW - MARGIN, ly + 11)
        .strokeColor('#b7b7b7').lineWidth(0.6).stroke();
      doc.font(idx === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, valueX, ly + 1, { width: 42, align: 'right' });
    }
  });

  return y + rows.length * lineH;
}

function drawFooterRow(doc, data, y, pageW) {
  const bankLines = [
    ['Account Title', 'Planetive (Private) Limited'],
    ['Bank Detail', 'Habib Bank Limited'],
    ['IBAN', '—'],
  ];

  let ly = y;
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8)
    .text('Bank Details :', MARGIN, ly);
  ly += 14;

  bankLines.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(8)
      .text(`${label}:`, MARGIN, ly, { width: 82 });
    doc.font('Helvetica').fontSize(8)
      .text(value, MARGIN + 84, ly, { width: 180 });
    ly += 14;
  });

  if (data.qrBuffer) {
    doc.image(data.qrBuffer, MARGIN, ly + 6, { width: 58, height: 58 });
  }

  const disclaimerY = doc.page.height - 42;
  doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(7)
    .text(
      'This is a computer-generated invoice and does not require authorization/stamp.',
      0,
      disclaimerY,
      { width: pageW, align: 'center' }
    );

  return ly + 64;
}

function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    [A4_WIDTH_PT, A4_HEIGHT_PT],
      margin:  0,
      autoFirstPage: true,
      info: {
        Title:   'FBR Tax Invoice',
        Author:  'Planetive FBR DI',
        Creator: 'Planetive FBR DI',
      },
    });
    const chunks = [];

    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const data = extractInvoiceData(invoice);
    const pageW  = A4_WIDTH_PT;
    const tw     = tableWidth(pageW);
    const colXs  = buildTableColXs(pageW);
    const contentW = pageW - MARGIN * 2;

    const continueAfterBreak = () => MARGIN + 12;

    let y = 0;

    drawHeader(doc, pageW);
    y = drawMetaSection(doc, data, y, pageW);
    y = drawSectionHeading(doc, y, contentW);

    y = drawTableHeader(doc, y, colXs, TABLE_HEADER_H, tw);

    if (!data.rows.length) {
      y = drawTableRow(doc, {
        description: 'No line items',
        qty: '—',
        unitPrice: '—',
        lineTotal: '—',
        alt: false,
      }, y, colXs, TABLE_DATA_ROW_H, tw);
    } else {
      for (const row of data.rows) {
        y = ensureSpace(doc, y, TABLE_DATA_ROW_H + 8, () => {
          const ny = continueAfterBreak();
          return drawTableHeader(doc, ny, colXs, TABLE_HEADER_H, tw);
        });
        y = drawTableRow(doc, row, y, colXs, TABLE_DATA_ROW_H, tw);
      }
    }

    while (data.rows.length < 5 && y < 500) {
      y = drawTableRow(doc, {
        description: '',
        qty: '',
        unitPrice: '',
        lineTotal: '',
        alt: false,
      }, y, colXs, TABLE_DATA_ROW_H, tw);
      data.rows.push({});
    }

    y = ensureSpace(doc, y, TOTALS_BLOCK_H, continueAfterBreak);
    y = drawTotals(doc, data, y, pageW);

    y = ensureSpace(doc, y, FOOTER_BLOCK_H + BOTTOM_H, continueAfterBreak);
    y = drawFooterRow(doc, data, y, pageW);

    drawBottomBar(doc);

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
