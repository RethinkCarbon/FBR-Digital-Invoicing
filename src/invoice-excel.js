'use strict';

const ExcelJS = require('exceljs');
const { parseInvoiceDate, formatDisplayDate } = require('./invoice-template');
const { resolveInvoiceQrBuffer } = require('./qrcode');

const FOREST_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D2E' } };
const MINT_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5FAF7' } };
const ROW_ALT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5FAF7' } };
const COL_COUNT   = 6;

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function formatIsoDate(raw) {
  const d = parseInvoiceDate(raw);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function formatDueDate(raw) {
  const d = parseInvoiceDate(raw);
  if (!d) return '';
  return addDays(d, 30).toISOString().slice(0, 10);
}

function buildAddress(payload, prefix) {
  const parts = [payload[`${prefix}Address`], payload[`${prefix}Province`]].filter(Boolean);
  return parts.join(', ');
}

function lineAmounts(item) {
  const qty       = parseFloat(item.quantity) || 0;
  const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
  const salesTax  = parseFloat(item.salesTaxApplicable) || 0;
  const unitPrice = qty > 0 ? valueExcl / qty : valueExcl;
  const lineTotal = valueExcl + salesTax;
  return { qty, unitPrice, salesTax, lineTotal };
}

function autoFitColumns(sheet) {
  sheet.columns.forEach(column => {
    let max = 12;
    column.eachCell({ includeEmpty: true }, cell => {
      max = Math.max(max, String(cell.value ?? '').length + 2);
    });
    column.width = Math.min(max, 42);
  });
}

function styleInvoiceSheetHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = FOREST_FILL;
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyAlternatingRows(sheet, startRow = 2) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;
    if (rowNumber % 2 === 0) {
      row.fill = ROW_ALT_FILL;
    }
  });
}

function summarizeItemStatuses(itemStatuses) {
  if (!Array.isArray(itemStatuses) || !itemStatuses.length) return '';
  return itemStatuses
    .map(s => `#${s.itemSNo || '?'}: ${s.status || '—'}`)
    .join('; ');
}

function mergeWrite(sheet, r1, c1, r2, c2, value, style = {}) {
  if (r1 !== r2 || c1 !== c2) {
    sheet.mergeCells(r1, c1, r2, c2);
  }
  const cell = sheet.getCell(r1, c1);
  cell.value = value;
  if (style.font) cell.font = { ...cell.font, ...style.font };
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = { ...cell.alignment, ...style.alignment };
  if (style.border) cell.border = style.border;
  return cell;
}

function styleMoneyCells(sheet, row, cols) {
  cols.forEach(col => {
    const cell = sheet.getCell(row, col);
    cell.numFmt = '#,##0.00';
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
}

function setupInvoiceSheetColumns(sheet) {
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 11;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 16;
}

async function generateInvoicesExcel(invoices) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Planetive FBR DI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice History');

  sheet.columns = [
    { header: 'Internal Invoice No.', key: 'internal_invoice_no', width: 20 },
    { header: 'FBR IRN',             key: 'fbr_invoice_number',  width: 28 },
    { header: 'Workflow Status',     key: 'workflow_status',     width: 14 },
    { header: 'FBR Status',          key: 'fbr_status',          width: 22 },
    { header: 'Item FBR Statuses',   key: 'item_statuses_summary', width: 36 },
    { header: 'Environment',         key: 'environment',       width: 12 },
    { header: 'Action',              key: 'action',            width: 10 },
    { header: 'Invoice Date',        key: 'invoice_date',      width: 14 },
    { header: 'Buyer Name',          key: 'buyer_name',        width: 28 },
    { header: 'Buyer NTN/CNIC',      key: 'buyer_ntn',         width: 16 },
    { header: 'Subtotal',            key: 'subtotal',          width: 12 },
    { header: 'Sales Tax',           key: 'sales_tax',         width: 12 },
    { header: 'Total',               key: 'total_amount',      width: 12 },
    { header: 'Scenario',            key: 'scenario_id',       width: 10 },
    { header: 'Error',               key: 'error_message',     width: 36 },
    { header: 'Created At',          key: 'created_at',        width: 20 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F0F8' },
  };

  for (const inv of invoices) {
    sheet.addRow({
      internal_invoice_no: inv.internal_invoice_no ?? '',
      fbr_invoice_number:  inv.fbr_invoice_number ?? '',
      workflow_status:     inv.workflow_status ?? '',
      fbr_status:          inv.fbr_status ?? '',
      item_statuses_summary: summarizeItemStatuses(inv.item_statuses),
      environment:         inv.environment ?? '',
      action:              inv.action ?? '',
      invoice_date:        inv.invoice_date ?? '',
      buyer_name:          inv.buyer_name ?? '',
      buyer_ntn:           inv.buyer_ntn ?? '',
      subtotal:            inv.subtotal != null ? Number(inv.subtotal) : '',
      sales_tax:           inv.sales_tax != null ? Number(inv.sales_tax) : '',
      total_amount:        inv.total_amount != null ? Number(inv.total_amount) : '',
      scenario_id:         inv.scenario_id ?? '',
      error_message:       inv.error_message ?? '',
      created_at:          inv.created_at ? new Date(inv.created_at).toISOString() : '',
    });
  }

  ['subtotal', 'sales_tax', 'total_amount'].forEach(col => {
    sheet.getColumn(col).numFmt = '#,##0.00';
  });

  return workbook.xlsx.writeBuffer();
}

async function generateSingleInvoiceExcel(invoice) {
  const payload = invoice.request_payload || {};
  const items   = Array.isArray(payload.items) ? payload.items : [];

  const invoiceNumber = invoice.internal_invoice_no || invoice.fbr_invoice_number || '';
  const invoiceDateRaw = payload.invoiceDate || invoice.invoice_date;
  const invoiceDate    = parseInvoiceDate(invoiceDateRaw);
  const dueDate        = invoiceDate ? addDays(invoiceDate, 30) : null;

  const sellerName    = payload.sellerBusinessName || '';
  const sellerNtn     = payload.sellerNTNCNIC || '';
  const sellerAddress = buildAddress(payload, 'seller');
  const buyerName     = payload.buyerBusinessName || invoice.buyer_name || '';
  const buyerNtn      = payload.buyerNTNCNIC || invoice.buyer_ntn || '';
  const buyerAddress  = buildAddress(payload, 'buyer') || invoice.buyer_address || '';
  const fbrIrn        = invoice.fbr_invoice_number || payload.invoiceNumber || '';
  const workflow      = invoice.workflow_status || '';
  const fbrStatus     = invoice.fbr_status || '';
  const invoiceType   = payload.invoiceType || 'Sale Invoice';

  const subtotal = invoice.subtotal != null
    ? Number(invoice.subtotal)
    : items.reduce((s, it) => s + (parseFloat(it.valueSalesExcludingST) || 0), 0);
  const totalSalesTax = invoice.sales_tax != null
    ? Number(invoice.sales_tax)
    : items.reduce((s, it) => s + (parseFloat(it.salesTaxApplicable) || 0), 0);
  const furtherTax = items.reduce((s, it) => s + (parseFloat(it.furtherTax) || 0), 0);
  const totalDue = invoice.total_amount != null
    ? Number(invoice.total_amount)
    : subtotal + totalSalesTax + furtherTax;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Planetive FBR DI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice', {
    pageSetup: {
      paperSize:   9,
      orientation: 'portrait',
      fitToPage:   true,
      fitToWidth:  1,
      fitToHeight: 0,
    },
    properties: { defaultRowHeight: 18 },
  });

  setupInvoiceSheetColumns(sheet);

  let row = 1;

  // ── Header bar (like PDF) ─────────────────────────────────────────────────
  mergeWrite(sheet, row, 1, row, COL_COUNT, 'PLANETIVE — FBR DIGITAL INVOICING', {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: FOREST_FILL,
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  sheet.getRow(row).height = 30;
  row++;

  mergeWrite(sheet, row, 1, row, COL_COUNT, 'A Planetive Project · Tax Invoice', {
    font: { size: 10, color: { argb: 'FF0A3D2E' } },
    fill: MINT_FILL,
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  sheet.getRow(row).height = 22;
  row += 2;

  // ── Invoice meta + Bill To ────────────────────────────────────────────────
  const metaLines = [
    `Invoice Number:  ${invoiceNumber || '—'}`,
    `Invoice Type:    ${invoiceType}`,
    `Date:            ${formatDisplayDate(invoiceDate)}`,
    `Due Date:        ${formatDisplayDate(dueDate)}`,
    `FBR IRN:         ${fbrIrn || '—'}`,
    `Workflow:        ${workflow || '—'}`,
    fbrStatus ? `FBR Status:      ${fbrStatus}` : null,
  ].filter(Boolean).join('\n');

  const billLines = [
    'BILL TO:',
    buyerName || '—',
    buyerAddress || '—',
    `NTN/CNIC: ${buyerNtn || '—'}`,
  ].join('\n');

  mergeWrite(sheet, row, 1, row + 5, 3, metaLines, {
    font: { size: 10 },
    alignment: { vertical: 'top', wrapText: true },
  });

  mergeWrite(sheet, row, 4, row + 5, COL_COUNT, billLines, {
    font: { size: 10, bold: false },
    alignment: { vertical: 'top', wrapText: true },
  });
  sheet.getCell(row, 4).font = { bold: true, size: 10, color: { argb: 'FF0A3D2E' } };
  row += 7;

  // ── Seller (From) ─────────────────────────────────────────────────────────
  mergeWrite(sheet, row, 1, row, COL_COUNT,
    `FROM: ${sellerName}${sellerNtn ? ` · NTN: ${sellerNtn}` : ''}${sellerAddress ? ` · ${sellerAddress}` : ''}`, {
      font: { size: 9, color: { argb: 'FF556B5E' } },
      fill: MINT_FILL,
      alignment: { vertical: 'middle', wrapText: true, indent: 1 },
    });
  sheet.getRow(row).height = 22;
  row += 2;

  // ── Section heading ───────────────────────────────────────────────────────
  mergeWrite(sheet, row, 1, row, COL_COUNT, 'Description of Services', {
    font: { bold: true, italic: true, size: 11, color: { argb: 'FF0A3D2E' } },
    alignment: { vertical: 'middle' },
    border: { bottom: { style: 'medium', color: { argb: 'FF2ECC8B' } } },
  });
  sheet.getRow(row).height = 24;
  row++;

  // ── Line items header ─────────────────────────────────────────────────────
  const headers = ['Item', 'Description', 'Quantity', 'Unit Price (PKR)', 'Sales Tax (PKR)', 'Total (PKR)'];
  headers.forEach((label, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = FOREST_FILL;
    cell.alignment = {
      vertical: 'middle',
      horizontal: i >= 2 ? 'right' : 'left',
      wrapText: true,
    };
  });
  sheet.getRow(row).height = 22;
  const itemsHeaderRow = row;
  row++;

  // ── Line items ────────────────────────────────────────────────────────────
  const lineItems = items.length ? items : [null];

  lineItems.forEach((item, index) => {
    const r = sheet.getRow(row);

    if (!item) {
      mergeWrite(sheet, row, 1, row, COL_COUNT, 'No line items', {
        font: { italic: true, color: { argb: 'FF556B5E' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
    } else {
      const { qty, unitPrice, salesTax, lineTotal } = lineAmounts(item);
      r.getCell(1).value = index + 1;
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(2).value = item.productDescription || '—';
      r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      r.getCell(3).value = qty > 0 ? qty : '—';
      r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).value = unitPrice;
      r.getCell(5).value = salesTax;
      r.getCell(6).value = lineTotal;
      styleMoneyCells(sheet, row, [4, 5, 6]);

      if (index % 2 === 1) {
        for (let c = 1; c <= COL_COUNT; c++) {
          r.getCell(c).fill = ROW_ALT_FILL;
        }
      }

      for (let c = 1; c <= COL_COUNT; c++) {
        r.getCell(c).border = {
          top:    { style: 'thin', color: { argb: 'FFD8E8E0' } },
          bottom: { style: 'thin', color: { argb: 'FFD8E8E0' } },
          left:   { style: 'thin', color: { argb: 'FFD8E8E0' } },
          right:  { style: 'thin', color: { argb: 'FFD8E8E0' } },
        };
      }
    }

    row++;
  });

  row++;

  // ── Totals (right-aligned like PDF) ───────────────────────────────────────
  const totals = [
    ['Subtotal:', subtotal, false],
    ['Sales Tax:', totalSalesTax, false],
    ['Total Amount Due:', totalDue, true],
  ];

  totals.forEach(([label, amount, grand]) => {
    mergeWrite(sheet, row, 1, row, 3, '', {});
    mergeWrite(sheet, row, 4, row, 5, label, {
      font: { bold: grand, size: grand ? 11 : 10, color: { argb: 'FF556B5E' } },
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    const amountCell = sheet.getCell(row, 6);
    amountCell.value = amount;
    amountCell.numFmt = '#,##0.00';
    amountCell.alignment = { horizontal: 'right', vertical: 'middle' };
    if (grand) {
      amountCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      amountCell.fill = FOREST_FILL;
      sheet.getCell(row, 4).font = { bold: true, size: 11, color: { argb: 'FF0A3D2E' } };
    }
    row++;
  });

  row++;

  // ── Footer: seller + FBR IRN + QR ─────────────────────────────────────────
  const footerStart = row;
  const sellerProvince = payload.sellerProvince || '';
  const sellerFooterLines = [
    sellerName || 'Planetive',
    sellerAddress || '',
    sellerProvince ? `Province: ${sellerProvince}` : '',
    sellerNtn ? `NTN: ${sellerNtn}` : '',
  ].filter(Boolean);

  mergeWrite(sheet, footerStart, 1, footerStart + 4, 3, sellerFooterLines.join('\n'), {
    font: { size: 9 },
    alignment: { vertical: 'top', wrapText: true },
  });

  mergeWrite(sheet, footerStart, 4, footerStart + 1, 5, [
    'FBR INVOICE NUMBER',
    fbrIrn || 'Pending',
  ].join('\n'), {
    font: { size: 9, bold: true, color: { argb: 'FF0A3D2E' } },
    fill: MINT_FILL,
    alignment: { vertical: 'top', wrapText: true },
  });

  mergeWrite(sheet, footerStart + 2, 4, footerStart + 4, 5, 'Thank you for your business', {
    font: { size: 9, italic: true, color: { argb: 'FF556B5E' } },
    alignment: { vertical: 'top', wrapText: true },
  });

  const qrBuffer = await resolveInvoiceQrBuffer(invoice);
  if (qrBuffer) {
    const imageId = workbook.addImage({
      buffer: qrBuffer,
      extension: 'png',
    });
    sheet.addImage(imageId, {
      tl: { col: 5, row: footerStart - 1 },
      ext: { width: 88, height: 88 },
    });
    const scanCell = sheet.getCell(footerStart + 4, 6);
    scanCell.value = 'Scan to verify';
    scanCell.font = { size: 8, color: { argb: 'FF556B5E' } };
    scanCell.alignment = { horizontal: 'center', vertical: 'top' };
  } else {
    mergeWrite(sheet, footerStart, 6, footerStart + 4, 6, 'QR code pending\n(submit invoice to FBR)', {
      font: { size: 8, italic: true, color: { argb: 'FF556B5E' } },
      fill: MINT_FILL,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
  }

  for (let i = 0; i < 5; i++) {
    sheet.getRow(footerStart + i).height = i < 3 ? 20 : 24;
  }

  row = footerStart + 5;

  // Print area & repeat header row for items table
  sheet.pageSetup.printArea = `A1:F${row}`;
  sheet.pageSetup.printTitlesRow = `${itemsHeaderRow}:${itemsHeaderRow}`;

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateInvoicesExcel, generateSingleInvoiceExcel };
