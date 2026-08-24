'use strict';

const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { parseInvoiceDate } = require('./invoice-template');

function ceilAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.ceil(amount) : 0;
}

const TEMPLATE_PATHS = [
  path.join(__dirname, 'assets', 'invoice-template.xlsx'),
  path.join(__dirname, '..', 'Invoice Template.xlsx'),
];

function summarizeItemStatuses(itemStatuses) {
  if (!Array.isArray(itemStatuses) || !itemStatuses.length) return '';
  return itemStatuses
    .map(s => `#${s.itemSNo || '?'}: ${s.status || '—'}`)
    .join('; ');
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
      subtotal:            inv.subtotal != null ? ceilAmount(inv.subtotal) : '',
      sales_tax:           inv.sales_tax != null ? ceilAmount(inv.sales_tax) : '',
      total_amount:        inv.total_amount != null ? ceilAmount(inv.total_amount) : '',
      scenario_id:         inv.scenario_id ?? '',
      error_message:       inv.error_message ?? '',
      created_at:          inv.created_at ? new Date(inv.created_at).toISOString() : '',
    });
  }

  ['subtotal', 'sales_tax', 'total_amount'].forEach(col => {
    sheet.getColumn(col).numFmt = '#,##0';
  });

  return workbook.xlsx.writeBuffer();
}

function firstTaxRateLabel(items, payload) {
  const raw = (Array.isArray(items) ? items : []).find(item => item?.rate != null && String(item.rate).trim())?.rate
    || payload?.taxRate
    || null;
  if (raw == null || raw === '') return '15%';
  return String(raw).includes('%') ? String(raw) : `${raw}%`;
}

function bankDetails(payload, sellerName) {
  const bank = payload.bankDetails || payload.bank_details || {};
  return {
    accountTitle: bank.accountTitle || sellerName || 'Planetive (Private) Limited',
    bankName:     bank.bankName || 'Habib Bank Limited',
    iban:         bank.iban || 'PK02HABB0008747901430403',
  };
}

function resolveTemplatePath() {
  return TEMPLATE_PATHS.find(p => fs.existsSync(p));
}

function splitSellerAddress(address) {
  const fallback = [
    'Office 910, Floor 9, ISE Tower, ',
    '55B Jinnah Avenue, Islamabad, Pakistan',
  ];
  if (!address || !String(address).trim()) return fallback;
  const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [parts[0] || fallback[0], fallback[1]];
  if (parts.length === 2) return [`${parts[0]}, `, parts[1]];
  const mid = Math.ceil(parts.length / 2);
  return [`${parts.slice(0, mid).join(', ')}, `, parts.slice(mid).join(', ')];
}

function escapeXml(value) {
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function excelSerialDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000
  );
}

function cellPattern(ref) {
  return new RegExp(`<c r="${ref}"(?:\\s[^>/]*)?(?:/>|>[\\s\\S]*?</c>)`);
}

function cellStyleAttr(cellXml) {
  const match = cellXml.match(/\ss="(\d+)"/);
  return match ? ` s="${match[1]}"` : '';
}

function replaceCell(xml, ref, nextXml) {
  const re = cellPattern(ref);
  if (!re.test(xml)) return xml;
  return xml.replace(re, nextXml);
}

function setTextCell(xml, ref, value) {
  const re = cellPattern(ref);
  const match = xml.match(re);
  if (!match) return xml;
  const style = cellStyleAttr(match[0]);
  if (value == null || value === '') {
    return replaceCell(xml, ref, `<c r="${ref}"${style}/>`);
  }
  return replaceCell(
    xml,
    ref,
    `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  );
}

function setNumberCell(xml, ref, value) {
  const re = cellPattern(ref);
  const match = xml.match(re);
  if (!match) return xml;
  const style = cellStyleAttr(match[0]);
  if (value == null || value === '') {
    return replaceCell(xml, ref, `<c r="${ref}"${style}/>`);
  }
  return replaceCell(xml, ref, `<c r="${ref}"${style}><v>${Number(value)}</v></c>`);
}

async function generateSingleInvoiceExcel(invoice) {
  const templatePath = resolveTemplatePath();
  if (!templatePath) {
    throw new Error('Invoice Excel template is missing (src/assets/invoice-template.xlsx).');
  }

  const payload = invoice.request_payload || {};
  const items   = Array.isArray(payload.items) ? payload.items : [];

  const invoiceNumber = invoice.internal_invoice_no || invoice.fbr_invoice_number || '';
  const invoiceDate   = parseInvoiceDate(payload.invoiceDate || invoice.invoice_date);

  const sellerName    = payload.sellerBusinessName || 'Planetive (Private) Limited';
  const sellerNtn     = payload.sellerNTNCNIC || '8568453';
  const sellerStrn    = payload.sellerSTRN || payload.sellerStrn || invoice.seller_strn || '3277876303122';
  const sellerPhone   = payload.sellerPhone || payload.seller_phone || invoice.seller_phone || '051-2287712';
  const [sellerAddr1, sellerAddr2] = splitSellerAddress(payload.sellerAddress);
  const buyerName     = payload.buyerBusinessName || invoice.buyer_name || '';
  const buyerNtn      = payload.buyerNTNCNIC || invoice.buyer_ntn || '';
  const buyerAddress  = [payload.buyerAddress, payload.buyerProvince].filter(Boolean).join(', ') || '';
  const buyerPhone    = payload.buyerPhone || payload.buyer_phone || invoice.buyer_phone || '';
  const paymentMethod = payload.payment_method || payload.paymentMethod || invoice.payment_method || 'IBFT';
  const bank          = bankDetails(payload, sellerName);

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
  const withholdingRate = parseFloat(invoice.withholding_rate ?? payload.withholdingRate ?? 0) || 0;
  const withholdingAmount = invoice.withholding_amount != null
    ? Number(invoice.withholding_amount)
    : Math.round(totalDue * (withholdingRate / 100) * 100) / 100;
  const netPayable = invoice.net_payable != null
    ? Number(invoice.net_payable)
    : Math.round((totalDue - withholdingAmount) * 100) / 100;
  const salesTaxRateLabel = firstTaxRateLabel(items, payload);

  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');

  sheetXml = setTextCell(sheetXml, 'C5', sellerName);
  sheetXml = setTextCell(sheetXml, 'C6', sellerAddr1);
  sheetXml = setTextCell(sheetXml, 'C7', sellerAddr2);
  sheetXml = setTextCell(sheetXml, 'C8', sellerPhone ? `Tel: ${sellerPhone}` : '');
  sheetXml = setTextCell(sheetXml, 'C9', sellerStrn ? `STRN # ${sellerStrn}` : '');
  sheetXml = setTextCell(sheetXml, 'C10', `NTN # ${sellerNtn}`);

  const dateSerial = excelSerialDate(invoiceDate);
  sheetXml = dateSerial != null ? setNumberCell(sheetXml, 'H5', dateSerial) : setTextCell(sheetXml, 'H5', '');
  sheetXml = setTextCell(sheetXml, 'H7', invoiceNumber);
  sheetXml = setTextCell(sheetXml, 'G10', `Method of Payment: ${paymentMethod}`);

  sheetXml = setTextCell(sheetXml, 'G15', buyerName);
  sheetXml = setTextCell(sheetXml, 'G16', buyerAddress);
  sheetXml = setTextCell(sheetXml, 'G18', buyerPhone);
  sheetXml = setTextCell(sheetXml, 'G19', buyerNtn);

  const ITEM_ROWS = 8;
  const firstItemRow = 22;
  for (let i = 0; i < ITEM_ROWS; i++) {
    const r = firstItemRow + i;
    const item = items[i] || null;
    if (item) {
      const qty = parseFloat(item.quantity) || 0;
      const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
      const unitPrice = qty > 0 ? valueExcl / qty : valueExcl;
      sheetXml = setTextCell(sheetXml, `C${r}`, item.productDescription || '');
      sheetXml = setNumberCell(sheetXml, `F${r}`, qty);
      sheetXml = setNumberCell(sheetXml, `G${r}`, ceilAmount(unitPrice));
      sheetXml = setNumberCell(sheetXml, `H${r}`, ceilAmount(valueExcl));
    } else {
      sheetXml = setTextCell(sheetXml, `C${r}`, '');
      sheetXml = setNumberCell(sheetXml, `F${r}`, '');
      sheetXml = setNumberCell(sheetXml, `G${r}`, '');
      sheetXml = setNumberCell(sheetXml, `H${r}`, '');
    }
  }

  sheetXml = setNumberCell(sheetXml, 'H30', ceilAmount(subtotal));
  sheetXml = setTextCell(sheetXml, 'E31', `Sales Tax Rate : ${salesTaxRateLabel}`);
  sheetXml = setTextCell(sheetXml, 'G31', 'Add:SALES TAX (US$)');
  sheetXml = setNumberCell(sheetXml, 'H31', ceilAmount(totalSalesTax));
  sheetXml = setTextCell(sheetXml, 'D32', bank.accountTitle);
  sheetXml = setNumberCell(sheetXml, 'H32', ceilAmount(totalDue));
  sheetXml = setTextCell(sheetXml, 'D33', bank.bankName);
  sheetXml = setTextCell(sheetXml, 'E33', `WHT Rate : ${withholdingRate}%`);
  sheetXml = setTextCell(sheetXml, 'G33', 'Less: WHT TAX (US$)');
  sheetXml = setNumberCell(sheetXml, 'H33', ceilAmount(withholdingAmount));
  sheetXml = setTextCell(sheetXml, 'D34', bank.iban || '');
  sheetXml = setNumberCell(sheetXml, 'H34', ceilAmount(netPayable));

  zip.file('xl/worksheets/sheet1.xml', sheetXml);

  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const rels = await zip.file(relsPath).async('string');
    zip.file(relsPath, rels.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/g, ''));
    const typesPath = '[Content_Types].xml';
    const types = await zip.file(typesPath).async('string');
    zip.file(
      typesPath,
      types.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/g, '')
    );
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

module.exports = { generateInvoicesExcel, generateSingleInvoiceExcel };
