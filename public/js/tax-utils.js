'use strict';

/** Mirrors src/services/tax-calculator.js */
function parseTaxRate(rateStr) {
  if (rateStr === null || rateStr === undefined || rateStr === '') return 0;
  const match = String(rateStr).match(/([\d.]+)\s*%?/);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

function roundMoney(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function calculateSalesTax(valueExclST, rateStr) {
  const base = parseFloat(valueExclST) || 0;
  const tax  = base * parseTaxRate(rateStr);
  return roundMoney(tax);
}

function parseWithholdingRate(rate) {
  const v = parseFloat(rate);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function calculateWithholding(grossTotal, ratePercent) {
  const gross = roundMoney(grossTotal);
  const rate  = parseWithholdingRate(ratePercent);
  const amount = roundMoney(gross * (rate / 100));
  return {
    withholdingRate:   rate,
    withholdingAmount: amount,
    netPayable:        roundMoney(gross - amount),
  };
}

function formatMoneyDisplay(n) {
  return roundMoney(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateInvoiceTotals() {
  const subtotalEl = document.getElementById('tot-subtotal');
  if (!subtotalEl) return;

  let subtotal = 0;
  let salesTax = 0;
  let furtherTax = 0;

  document.querySelectorAll('#items-body .item-card, #items-body .item-row').forEach(row => {
    const idx = row.id.replace(/^item-(?:card|row)-/, '');
    const valueEl = row.querySelector(`[name="valueSalesExcludingST_${idx}"]`);
    const taxEl   = row.querySelector(`[name="salesTaxApplicable_${idx}"]`);
    const furtherEl = row.querySelector(`[name="furtherTax_${idx}"]`);
    subtotal   += parseFloat(valueEl?.value) || 0;
    salesTax   += parseFloat(taxEl?.value) || 0;
    furtherTax += parseFloat(furtherEl?.value) || 0;
  });

  const gross = roundMoney(subtotal + salesTax + furtherTax);
  const rate  = document.getElementById('withholdingRate')?.value;
  const wht   = calculateWithholding(gross, rate);

  subtotalEl.textContent = formatMoneyDisplay(subtotal);
  const stEl = document.getElementById('tot-sales-tax');
  const grossEl = document.getElementById('tot-gross');
  const whtEl = document.getElementById('tot-wht');
  const netEl = document.getElementById('tot-net');
  if (stEl) stEl.textContent = formatMoneyDisplay(salesTax);
  if (grossEl) grossEl.textContent = formatMoneyDisplay(gross);
  if (whtEl) whtEl.textContent = formatMoneyDisplay(wht.withholdingAmount);
  if (netEl) netEl.textContent = formatMoneyDisplay(wht.netPayable);
}

function calculateFurtherTax(valueExclST) {
  const base = parseFloat(valueExclST) || 0;
  return Math.round(base * 0.03 * 100) / 100;
}

function isFedInStModeSaleType(saleType) {
  return String(saleType || '').trim().toLowerCase() === 'services (fed in st mode)';
}

function isBuyerUnregistered() {
  return document.getElementById('buyerRegistrationType')?.value === 'Unregistered';
}

function setCalculatedFieldStyle(el, isCalculated) {
  if (!el) return;
  el.readOnly = Boolean(isCalculated);
  el.classList.toggle('tax-readonly', Boolean(isCalculated));
  if (isCalculated) {
    el.title = el.title || 'Auto-calculated';
  } else if (el.title === 'Auto-calculated' || el.title === 'Auto-calculated from value × rate') {
    el.removeAttribute('title');
  }
}

function calculateLineTotal(valueExclST, rateStr, furtherTax = 0, fedPayable = 0, discount = 0) {
  const valueExcl = parseFloat(valueExclST) || 0;
  const stOrFed   = calculateSalesTax(valueExcl, rateStr);
  const further   = parseFloat(furtherTax) || 0;
  const fed       = parseFloat(fedPayable) || 0;
  const disc      = parseFloat(discount) || 0;
  return Math.round((valueExcl + stOrFed + further + fed - disc) * 100) / 100;
}

/**
 * When buyer is Unregistered: furtherTax = valueExcl × 3%, field readonly.
 * When Registered: furtherTax = 0, field editable.
 */
function applyFurtherTaxForRow(row, { expandAdvanced = true } = {}) {
  if (!row) return;
  const idx = row.id.replace('item-row-', '');
  const valueEl   = row.querySelector(`[name="valueSalesExcludingST_${idx}"]`);
  const furtherEl = row.querySelector(`[name="furtherTax_${idx}"]`);
  if (!furtherEl) return;

  if (isBuyerUnregistered()) {
    furtherEl.value = calculateFurtherTax(valueEl?.value);
    setCalculatedFieldStyle(furtherEl, true);
    furtherEl.title = 'Auto-calculated: 3% of Value Excl. ST (Unregistered buyer)';
    if (expandAdvanced && typeof expandItemAdvancedFields === 'function') {
      expandItemAdvancedFields(row);
    }
  } else {
    furtherEl.value = 0;
    setCalculatedFieldStyle(furtherEl, false);
    furtherEl.removeAttribute('title');
  }
}

function syncFurtherTaxAllRows(opts = {}) {
  document.querySelectorAll('#items-body .item-card').forEach(row => {
    applyFurtherTaxForRow(row, opts);
    recalcRowTaxFromDom(row);
  });
}

function recalcRowTaxFromDom(row) {
  const idx = row.id.replace('item-row-', '');
  const valueEl  = row.querySelector(`[name="valueSalesExcludingST_${idx}"]`);
  const rateEl   = row.querySelector(`[name="rate_${idx}"]`);
  const taxEl    = row.querySelector(`[name="salesTaxApplicable_${idx}"]`);
  const totalEl  = row.querySelector(`[name="totalValues_${idx}"]`);
  const furtherEl = row.querySelector(`[name="furtherTax_${idx}"]`);
  const fedEl    = row.querySelector(`[name="fedPayable_${idx}"]`);
  const discountEl = row.querySelector(`[name="discount_${idx}"]`);
  const saleEl   = row.querySelector(`[name="saleType_${idx}"]`);

  if (!valueEl || !rateEl || !taxEl) return;

  const stOrFed = calculateSalesTax(valueEl.value, rateEl.value);
  taxEl.value = stOrFed;

  if (totalEl) {
    totalEl.value = calculateLineTotal(
      valueEl.value,
      rateEl.value,
      furtherEl?.value,
      fedEl?.value,
      discountEl?.value
    );
  }

  if (fedEl && saleEl && isFedInStModeSaleType(saleEl.value)) {
    fedEl.closest('.item-field')?.classList.toggle('fed-field-highlight', false);
  }

  if (typeof updateInvoiceTotals === 'function') updateInvoiceTotals();
}
