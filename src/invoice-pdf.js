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

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.jpeg');

/** ISO A4 in PDF points (72 pt/in × 8.27in × 11.69in) */
const A4_WIDTH_PT  = 595.28;
const A4_HEIGHT_PT = 841.89;

const C = {
  forest:   '#0A3D2E',
  mint:     '#2ECC8B',
  softMint: '#A8F0D4',
  rowAlt:   '#F5FAF7',
  text:     '#1A1A1A',
  muted:    '#556B5E',
  border:   '#D8E8E0',
  white:    '#FFFFFF',
};

const MARGIN     = 40;
const HEADER_H   = 56;
const BOTTOM_H   = 28;

const TABLE_HEADER_H   = 28;
const TABLE_DATA_ROW_H = 18;
const TOTALS_BLOCK_H   = 72;
const FOOTER_BLOCK_H   = 160;

const TABLE_COLS = [
  { label: '#',               width: 25,  headerAlign: 'left',   align: 'left'   },
  { label: 'DESCRIPTION',     width: 175, headerAlign: 'left',   align: 'left'   },
  { label: 'QTY',             width: 40,  headerAlign: 'center', align: 'center' },
  { label: 'UNIT PRICE\n(PKR)', width: 90, headerAlign: 'right', align: 'right'  },
  { label: 'SALES TAX\n(PKR)', width: 90, headerAlign: 'right', align: 'right'  },
  { label: 'TOTAL (PKR)',     width: 95,  headerAlign: 'right', align: 'right'  },
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
      index:       i + 1,
      description: item.productDescription || '—',
      qty:         qty > 0 ? String(qty) : '—',
      unitPrice:   formatPkr(unitPrice),
      salesTax:    formatPkr(tax),
      lineTotal:   formatPkr(lineTotal),
      alt:         i % 2 === 1,
    };
  });

  const furtherTax = items.reduce((s, it) => s + (parseFloat(it.furtherTax) || 0), 0);
  let totalDue = invoice.total_amount != null
    ? parseFloat(invoice.total_amount)
    : subtotal + salesTax + furtherTax;

  if (invoice.subtotal != null) subtotal = parseFloat(invoice.subtotal) || subtotal;
  if (invoice.sales_tax != null) salesTax = parseFloat(invoice.sales_tax) || salesTax;

  return {
    payload,
    invoiceNumber,
    irnDisplay: irn || '—',
    dateDisplay: formatDisplayDate(invoiceDate),
    dueDisplay:  formatDisplayDate(dueDate),
    sellerName:    payload.sellerBusinessName || '—',
    sellerNtn:     payload.sellerNTNCNIC || '—',
    sellerAddress: buildSellerAddress(payload),
    buyerName:     payload.buyerBusinessName || invoice.buyer_name || '—',
    buyerAddress:  buildBuyerAddress(payload),
    buyerNtn:      payload.buyerNTNCNIC || invoice.buyer_ntn || '—',
    thankYouName:  payload.sellerBusinessName || 'Planetive',
    rows,
    subtotal: formatPkr(subtotal),
    salesTax: formatPkr(salesTax),
    totalDue: formatPkr(totalDue),
    qrBuffer: parseQrBuffer(invoice.qr_code),
  };
}

function drawHeader(doc, pageW) {
  doc.rect(0, 0, pageW, HEADER_H).fill(C.forest);
  doc.rect(0, HEADER_H, pageW, 3).fill(C.mint);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, MARGIN, 8, { height: 40 });
  }

  const textW = pageW - MARGIN * 2;
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16)
    .text('FBR Digital Invoicing', MARGIN, 12, { width: textW, align: 'right' });
  doc.fillColor(C.mint).font('Helvetica').fontSize(9)
    .text('A Planetive Project', MARGIN, 32, { width: textW, align: 'right' });

  return HEADER_H + 3;
}

function drawBottomBar(doc, sellerName) {
  const { width: pageW, height: pageH } = pageMetrics(doc);
  const y = pageH - BOTTOM_H;
  doc.rect(0, y, pageW, BOTTOM_H).fill(C.forest);
  doc.fillColor(C.softMint).font('Helvetica').fontSize(9)
    .text(
      `Thank you for your business — ${sellerName}`,
      MARGIN,
      y + 9,
      { width: pageW - MARGIN * 2, align: 'center' }
    );
}

function ensureSpace(doc, y, needed, onNewPage) {
  const { bottomLimit } = pageMetrics(doc);
  if (y + needed <= bottomLimit) return y;
  addA4Page(doc);
  return onNewPage();
}

function drawMetaSection(doc, data, y, pageW) {
  const midX   = pageW / 2;
  const leftX  = MARGIN;
  const rightX = midX + 10;
  const lineH  = 14;

  const leftLines = [
    ['Invoice Number:', data.invoiceNumber],
    ['Date:', data.dateDisplay],
    ['Due Date:', data.dueDisplay],
  ];

  leftLines.forEach(([label, value], i) => {
    const ly = y + i * lineH;
    doc.fillColor(C.muted).font('Helvetica').fontSize(9)
      .text(label, leftX, ly, { continued: true });
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9)
      .text(` ${value}`);
  });

  let ry = y;
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(9)
    .text('BILL TO:', rightX, ry);
  ry += lineH;

  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10)
    .text(data.buyerName, rightX, ry, { width: pageW - rightX - MARGIN });
  ry = doc.y + 2;

  doc.fillColor(C.muted).font('Helvetica').fontSize(9)
    .text(data.buyerAddress, rightX, ry, { width: pageW - rightX - MARGIN });
  ry = doc.y + 2;

  doc.text(`NTN/CNIC: ${data.buyerNtn}`, rightX, ry, { width: pageW - rightX - MARGIN });

  return Math.max(y + leftLines.length * lineH, doc.y) + 16;
}

function drawSectionHeading(doc, y, contentW) {
  doc.fillColor(C.forest).font('Helvetica-Oblique').fontSize(14)
    .text('Description of Services', MARGIN, y);
  y += 18;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + contentW, y)
    .strokeColor(C.mint).lineWidth(2).stroke();
  return y + 10;
}

function drawTableHeader(doc, y, colXs, rowH, tw) {
  doc.rect(MARGIN, y, tw, rowH).fill(C.forest);

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
  doc.rect(MARGIN, y, tw, rowH).fill(row.alt ? C.rowAlt : C.white);

  doc.strokeColor(C.border).lineWidth(0.5)
    .rect(MARGIN, y, tw, rowH).stroke();

  const values = [
    String(row.index),
    row.description,
    row.qty,
    row.unitPrice,
    row.salesTax,
    row.lineTotal,
  ];

  doc.fillColor(C.text).font('Helvetica').fontSize(8);
  TABLE_COLS.forEach((col, i) => {
    doc.text(values[i], colXs[i], y + 5, {
      width: col.width,
      align: col.align,
      ellipsis: true,
    });
  });

  return y + rowH;
}

function drawTotals(doc, data, y, pageW) {
  const blockW = 180;
  const x      = pageW - MARGIN - blockW;
  const lineH  = 16;

  doc.fillColor(C.muted).font('Helvetica').fontSize(9);
  doc.text('Subtotal:', x, y, { width: 90, align: 'left' });
  doc.fillColor(C.text).font('Helvetica-Bold')
    .text(data.subtotal, x + 90, y, { width: 90, align: 'right' });

  y += lineH;
  doc.fillColor(C.muted).font('Helvetica')
    .text('Sales Tax:', x, y, { width: 90, align: 'left' });
  doc.fillColor(C.text).font('Helvetica-Bold')
    .text(data.salesTax, x + 90, y, { width: 90, align: 'right' });

  y += 8;
  doc.moveTo(x, y + 4).lineTo(x + blockW, y + 4)
    .strokeColor(C.mint).lineWidth(2).stroke();

  y += 12;
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(11)
    .text('Total Amount Due:', x, y, { width: 110, align: 'left' });
  doc.text(data.totalDue, x + 90, y, { width: 90, align: 'right' });

  return y + lineH + 8;
}

function drawFooterRow(doc, data, y, pageW) {
  const midX    = pageW / 2;
  const rightX  = midX + 10;
  const rightW  = pageW - rightX - MARGIN;
  const startY  = y;

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, MARGIN, y, { height: 32 });
  }

  let ly = y + (fs.existsSync(LOGO_PATH) ? 38 : 0);
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(9)
    .text(data.sellerName, MARGIN, ly, { width: midX - MARGIN - 10 });
  ly = doc.y + 2;

  doc.fillColor(C.muted).font('Helvetica').fontSize(8)
    .text(data.sellerAddress, MARGIN, ly, { width: midX - MARGIN - 10 });
  ly = doc.y + 2;
  doc.text(`NTN: ${data.sellerNtn}`, MARGIN, ly, { width: midX - MARGIN - 10 });

  const irnBoxH = 42;
  doc.roundedRect(rightX, startY, rightW, irnBoxH, 4)
    .fillAndStroke(C.softMint, C.forest);

  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7)
    .text('FBR INVOICE NUMBER', rightX + 8, startY + 6, { width: rightW - 16 });
  doc.font('Helvetica-Bold').fontSize(9)
    .text(data.irnDisplay, rightX + 8, startY + 18, { width: rightW - 16 });

  let qrY = startY + irnBoxH + 8;
  if (data.qrBuffer) {
    doc.image(data.qrBuffer, rightX + rightW - 80, qrY, { width: 80, height: 80 });
    doc.fillColor(C.muted).font('Helvetica').fontSize(7)
      .text('Scan to verify', rightX, qrY + 84, { width: rightW, align: 'right' });
    qrY += 96;
  }

  return Math.max(ly, qrY) + 12;
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

    let y = drawHeader(doc, pageW) + 18;

    y = drawMetaSection(doc, data, y, pageW);
    y = drawSectionHeading(doc, y, contentW);

    y = drawTableHeader(doc, y, colXs, TABLE_HEADER_H, tw);

    if (!data.rows.length) {
      y = drawTableRow(doc, {
        index: 1,
        description: 'No line items',
        qty: '—',
        unitPrice: '—',
        salesTax: '—',
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

    y = ensureSpace(doc, y, TOTALS_BLOCK_H, continueAfterBreak);
    y = drawTotals(doc, data, y, pageW);

    y = ensureSpace(doc, y, FOOTER_BLOCK_H + BOTTOM_H, continueAfterBreak);
    y = drawFooterRow(doc, data, y, pageW);

    drawBottomBar(doc, data.thankYouName);

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
