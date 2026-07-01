'use strict';

/** Mirrors src/services/tax-calculator.js */
function parseTaxRate(rateStr) {
  if (rateStr === null || rateStr === undefined || rateStr === '') return 0;
  const match = String(rateStr).match(/([\d.]+)\s*%?/);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

function calculateSalesTax(valueExclST, rateStr) {
  const base = parseFloat(valueExclST) || 0;
  const tax  = base * parseTaxRate(rateStr);
  return Math.round(tax * 100) / 100;
}

function isFedInStModeSaleType(saleType) {
  return String(saleType || '').trim().toLowerCase() === 'services (fed in st mode)';
}

function calculateLineTotal(valueExclST, rateStr, furtherTax = 0, fedPayable = 0, discount = 0) {
  const valueExcl = parseFloat(valueExclST) || 0;
  const stOrFed   = calculateSalesTax(valueExcl, rateStr);
  const further   = parseFloat(furtherTax) || 0;
  const fed       = parseFloat(fedPayable) || 0;
  const disc      = parseFloat(discount) || 0;
  return Math.round((valueExcl + stOrFed + further + fed - disc) * 100) / 100;
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
}
